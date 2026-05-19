# Feedback System — Implementation Specification

This document is a complete, agent-readable specification for rebuilding the Vizuara feedback system in another Next.js + Supabase app. Follow each section in order.

---

## Overview

The feedback system has five distinct mechanisms:

| Mechanism | When shown | What it captures |
|---|---|---|
| **Floating tab** | All pages, always | Free-text + category (bug/suggestion/content/other) |
| **Inline emoji rating** | Bottom of articles and notebooks | Satisfaction score 1–5 |
| **Inline thumbs rating** | Bottom of articles and notebooks | 👍/👎 + optional tags |
| **NPS prompt** | Pod/course completion pages | Likelihood to recommend 1–10 + optional comment |
| **Completion survey** | Pod/course completion pages | 3 structured multiple-choice questions |

All feedback requires an authenticated user. Unauthenticated users see nothing.

---

## 1. Database Schema (Supabase / PostgreSQL)

Create these two tables. This is the exact SQL from the working implementation.

```sql
-- Feedback table: stores all feedback types
create table public.feedback (
  id text primary key,
  user_id text not null references public.users(id),
  type text not null check (type in ('emoji', 'nps', 'thumbs', 'survey', 'general')),
  course_slug text,
  pod_slug text,
  content_type text check (content_type in ('article', 'notebook', 'case-study', 'pod', 'course')),
  notebook_order integer,
  rating integer,
  comment text,
  survey_data jsonb,
  category text check (category in ('bug', 'suggestion', 'content', 'other')),
  page_url text,
  created_at timestamptz not null default now()
);

-- Unique index prevents duplicate emoji/nps/thumbs ratings per user per content item.
-- "general" and "survey" are allowed to be submitted multiple times (no unique constraint).
create unique index feedback_unique_per_content
  on public.feedback (user_id, type, course_slug, pod_slug, content_type, notebook_order)
  where type in ('emoji', 'nps', 'thumbs');

-- Performance indexes for admin queries
create index feedback_created_at_idx on public.feedback (created_at desc);
create index feedback_type_idx on public.feedback (type);
create index feedback_course_idx on public.feedback (course_slug);

-- Tags table: only used by thumbs feedback, supports multiple tags per entry
create table public.feedback_tags (
  id text primary key,
  feedback_id text not null references public.feedback(id) on delete cascade,
  tag text not null check (tag in ('too_easy', 'too_hard', 'great_examples', 'needs_more_code', 'confusing'))
);

create index feedback_tags_feedback_id_idx on public.feedback_tags (feedback_id);

-- Enable RLS (service role key bypasses RLS in API routes)
alter table public.feedback enable row level security;
alter table public.feedback_tags enable row level security;
```

**Notes:**
- `id` is a text primary key — generate it server-side (e.g., `crypto.randomUUID()` or `nanoid()`).
- `users` table must exist and have `id`, `full_name`, `email` columns (used in admin join).
- The unique index uses a partial index (`where type in (...)`) so `survey` and `general` types can have multiple rows from the same user for the same content.

---

## 2. TypeScript Types

Put these in `src/types/feedback.ts`. All components and API routes import from here.

```typescript
export type FeedbackType = 'emoji' | 'nps' | 'thumbs' | 'survey' | 'general';

export type ContentType = 'article' | 'notebook' | 'case-study' | 'pod' | 'course';

export type FeedbackTag = 'too_easy' | 'too_hard' | 'great_examples' | 'needs_more_code' | 'confusing';

export type FeedbackCategory = 'bug' | 'suggestion' | 'content' | 'other';

// Shape sent from client → POST /api/feedback
export interface FeedbackSubmission {
  type: FeedbackType;
  courseSlug?: string;
  podSlug?: string;
  contentType?: ContentType;
  notebookOrder?: number;
  rating?: number;
  comment?: string;
  tags?: FeedbackTag[];
  surveyData?: Record<string, string | number>;
  category?: FeedbackCategory;
  pageUrl?: string;
}

// Shape returned from GET /api/feedback and admin routes
export interface FeedbackRecord {
  id: string;
  userId: string;
  type: FeedbackType;
  courseSlug: string | null;
  podSlug: string | null;
  contentType: ContentType | null;
  notebookOrder: number | null;
  rating: number | null;
  comment: string | null;
  surveyData: Record<string, string | number> | null;
  category: FeedbackCategory | null;
  pageUrl: string | null;
  createdAt: string;
  tags?: FeedbackTag[];
  userName?: string;   // only in admin responses
  userEmail?: string;  // only in admin responses
}

// Shape returned in the stats block from GET /api/admin/feedback
export interface FeedbackStats {
  totalCount: number;
  avgNps: number | null;
  avgEmoji: number | null;
  thumbsUpPercent: number | null;
  last7DaysCount: number;
  npsDistribution: Record<number, number>; // keys 1–10
  tagBreakdown: Record<string, number>;
}
```

---

## 3. Custom Hook: `useFeedback`

Put this in `src/hooks/useFeedback.ts`. This is the only abstraction shared across all feedback components — they all call `submit()` and `checkExisting()` from this hook.

```typescript
'use client';

import { useState, useCallback } from 'react';
import type { FeedbackSubmission, FeedbackRecord } from '@/types/feedback';

export function useFeedback() {
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<FeedbackRecord | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // POST /api/feedback — creates or updates a feedback record
  const submit = useCallback(async (data: FeedbackSubmission) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to submit feedback');
      }
      setSubmitted(true);
      return await res.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  // GET /api/feedback — checks if the current user already submitted this feedback type
  // Returns the existing record or null. Used on mount by emoji/nps/thumbs/survey components.
  const checkExisting = useCallback(async (params: {
    type: string;
    courseSlug?: string;
    podSlug?: string;
    contentType?: string;
    notebookOrder?: number;
  }) => {
    try {
      const query = new URLSearchParams();
      query.set('type', params.type);
      if (params.courseSlug) query.set('courseSlug', params.courseSlug);
      if (params.podSlug) query.set('podSlug', params.podSlug);
      if (params.contentType) query.set('contentType', params.contentType);
      if (params.notebookOrder !== undefined) query.set('notebookOrder', String(params.notebookOrder));

      const res = await fetch(`/api/feedback?${query}`);
      if (res.ok) {
        const body = await res.json();
        if (body.feedback) {
          setExisting(body.feedback);
          return body.feedback as FeedbackRecord;
        }
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setSubmitted(false);
    setError(null);
    setExisting(null);
  }, []);

  return { submit, checkExisting, submitting, existing, submitted, error, reset };
}
```

---

## 4. API Routes

### 4a. `POST /api/feedback` and `GET /api/feedback`

File: `src/app/api/feedback/route.ts`

**POST** — Creates or upserts a feedback record.
- Requires authenticated user (return 401 if not).
- For types `emoji`, `nps`, `thumbs`: check if a record already exists for this user+type+content combination. If yes, update it (upsert). If no, insert.
- For `thumbs` type: also manage tags in `feedback_tags` (delete existing, re-insert new ones on every update).
- For `survey` and `general` types: always insert a new row (no dedup).

**GET** — Returns the current user's existing feedback for a specific type+content combination.
- Query params: `type` (required), `courseSlug`, `podSlug`, `contentType`, `notebookOrder`.
- Match ALL provided params exactly. Match `IS NULL` for any param not provided.
- For `thumbs` type: also fetch and include associated tags from `feedback_tags`.
- Returns `{ feedback: FeedbackRecord | null }`.

```typescript
// src/app/api/feedback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, generateId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import type { FeedbackSubmission } from '@/types/feedback';

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body: FeedbackSubmission = await req.json();
  if (!body.type) return NextResponse.json({ error: 'Missing feedback type' }, { status: 400 });

  const db = getDb();
  const feedbackId = generateId();

  // Upsert logic for emoji/nps/thumbs only
  if (['emoji', 'nps', 'thumbs'].includes(body.type)) {
    let query = db
      .from('feedback')
      .select('id')
      .eq('user_id', user.id)
      .eq('type', body.type);

    // Match exact values or NULL for each context field
    if (body.courseSlug) query = query.eq('course_slug', body.courseSlug);
    else query = query.is('course_slug', null);

    if (body.podSlug) query = query.eq('pod_slug', body.podSlug);
    else query = query.is('pod_slug', null);

    if (body.contentType) query = query.eq('content_type', body.contentType);
    else query = query.is('content_type', null);

    if (body.notebookOrder !== undefined) query = query.eq('notebook_order', body.notebookOrder);
    else query = query.is('notebook_order', null);

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      await db.from('feedback').update({ rating: body.rating, comment: body.comment }).eq('id', existing.id);

      if (body.type === 'thumbs' && body.tags) {
        await db.from('feedback_tags').delete().eq('feedback_id', existing.id);
        if (body.tags.length > 0) {
          await db.from('feedback_tags').insert(
            body.tags.map(tag => ({ id: generateId(), feedback_id: existing.id, tag }))
          );
        }
      }
      return NextResponse.json({ id: existing.id, updated: true });
    }
  }

  // Insert new record
  await db.from('feedback').insert({
    id: feedbackId,
    user_id: user.id,
    type: body.type,
    course_slug: body.courseSlug || null,
    pod_slug: body.podSlug || null,
    content_type: body.contentType || null,
    notebook_order: body.notebookOrder ?? null,
    rating: body.rating ?? null,
    comment: body.comment || null,
    survey_data: body.surveyData || null,
    category: body.category || null,
    page_url: body.pageUrl || null,
  });

  if (body.type === 'thumbs' && body.tags && body.tags.length > 0) {
    await db.from('feedback_tags').insert(
      body.tags.map(tag => ({ id: generateId(), feedback_id: feedbackId, tag }))
    );
  }

  return NextResponse.json({ id: feedbackId, updated: false });
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const type = searchParams.get('type');
  if (!type) return NextResponse.json({ error: 'Missing type parameter' }, { status: 400 });

  const courseSlug = searchParams.get('courseSlug');
  const podSlug = searchParams.get('podSlug');
  const contentType = searchParams.get('contentType');
  const notebookOrder = searchParams.get('notebookOrder');

  const db = getDb();
  let query = db.from('feedback').select('*').eq('user_id', user.id).eq('type', type);

  if (courseSlug) query = query.eq('course_slug', courseSlug);
  else query = query.is('course_slug', null);

  if (podSlug) query = query.eq('pod_slug', podSlug);
  else query = query.is('pod_slug', null);

  if (contentType) query = query.eq('content_type', contentType);
  else query = query.is('content_type', null);

  if (notebookOrder) query = query.eq('notebook_order', parseInt(notebookOrder));
  else query = query.is('notebook_order', null);

  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 });
  if (!data) return NextResponse.json({ feedback: null });

  let tags: string[] = [];
  if (data.type === 'thumbs') {
    const { data: tagRows } = await db.from('feedback_tags').select('tag').eq('feedback_id', data.id);
    tags = (tagRows ?? []).map((r: { tag: string }) => r.tag);
  }

  return NextResponse.json({
    feedback: {
      id: data.id,
      userId: data.user_id,
      type: data.type,
      courseSlug: data.course_slug,
      podSlug: data.pod_slug,
      contentType: data.content_type,
      notebookOrder: data.notebook_order,
      rating: data.rating,
      comment: data.comment,
      surveyData: data.survey_data,
      category: data.category,
      pageUrl: data.page_url,
      createdAt: data.created_at,
      tags,
    },
  });
}
```

---

### 4b. `GET /api/admin/feedback`

File: `src/app/api/admin/feedback/route.ts`

Admin-only. Requires an `isAdmin()` check (implement based on your auth system — e.g., check a role field on the user).

Returns:
- Paginated list of all feedback (20 per page), with user name/email via join, and tags resolved for thumbs entries.
- Aggregate stats block computed over ALL feedback (unfiltered), regardless of which page/filter is active.

**Query params:** `page` (default 1), `type`, `courseSlug`, `dateFrom`, `dateTo`.

```typescript
// src/app/api/admin/feedback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;
  const type = searchParams.get('type');
  const courseSlug = searchParams.get('courseSlug');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const db = getDb();

  let query = db
    .from('feedback')
    .select('*, users!inner(full_name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) query = query.eq('type', type);
  if (courseSlug) query = query.eq('course_slug', courseSlug);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z');

  const { data: rows, count, error } = await query;
  if (error) return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 });

  // Resolve tags for thumbs entries in this page
  const thumbsIds = (rows ?? []).filter(r => r.type === 'thumbs').map(r => r.id);
  let tagsMap: Record<string, string[]> = {};
  if (thumbsIds.length > 0) {
    const { data: tagRows } = await db.from('feedback_tags').select('feedback_id, tag').in('feedback_id', thumbsIds);
    for (const row of tagRows ?? []) {
      if (!tagsMap[row.feedback_id]) tagsMap[row.feedback_id] = [];
      tagsMap[row.feedback_id].push(row.tag);
    }
  }

  const feedback = (rows ?? []).map(r => ({
    id: r.id,
    userId: r.user_id,
    type: r.type,
    courseSlug: r.course_slug,
    podSlug: r.pod_slug,
    contentType: r.content_type,
    notebookOrder: r.notebook_order,
    rating: r.rating,
    comment: r.comment,
    surveyData: r.survey_data,
    category: r.category,
    pageUrl: r.page_url,
    createdAt: r.created_at,
    tags: tagsMap[r.id] || [],
    userName: r.users?.full_name,
    userEmail: r.users?.email,
  }));

  // Compute global stats (always over ALL rows, not the current filter)
  const { data: allFeedback } = await db.from('feedback').select('type, rating, created_at');
  const all = allFeedback ?? [];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const emojiRatings = all.filter(r => r.type === 'emoji' && r.rating != null).map(r => r.rating as number);
  const npsRatings = all.filter(r => r.type === 'nps' && r.rating != null).map(r => r.rating as number);
  const thumbsRatings = all.filter(r => r.type === 'thumbs' && r.rating != null).map(r => r.rating as number);

  const npsDistribution: Record<number, number> = {};
  for (let i = 1; i <= 10; i++) npsDistribution[i] = 0;
  for (const r of npsRatings) npsDistribution[r] = (npsDistribution[r] || 0) + 1;

  const { data: allTags } = await db.from('feedback_tags').select('tag');
  const tagBreakdown: Record<string, number> = {};
  for (const t of allTags ?? []) tagBreakdown[t.tag] = (tagBreakdown[t.tag] || 0) + 1;

  const stats = {
    totalCount: all.length,
    avgNps: avg(npsRatings),
    avgEmoji: avg(emojiRatings),
    thumbsUpPercent: thumbsRatings.length > 0
      ? (thumbsRatings.filter(r => r === 1).length / thumbsRatings.length) * 100
      : null,
    last7DaysCount: all.filter(r => r.created_at >= weekAgo).length,
    npsDistribution,
    tagBreakdown,
  };

  return NextResponse.json({ feedback, stats, total: count ?? 0, page, totalPages: Math.ceil((count ?? 0) / limit) });
}
```

---

### 4c. `GET /api/admin/feedback/export`

File: `src/app/api/admin/feedback/export/route.ts`

Admin-only. Same filters as the list endpoint (`type`, `courseSlug`, `dateFrom`, `dateTo`) but returns ALL matching rows as a CSV download. Tags are fetched in batches of 100.

CSV columns: `Date, User, Email, Type, Course, Pod, Content Type, Notebook #, Rating, Comment, Tags, Category, Survey Data, Page URL`

```typescript
// src/app/api/admin/feedback/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const type = searchParams.get('type');
  const courseSlug = searchParams.get('courseSlug');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const db = getDb();
  let query = db.from('feedback').select('*, users!inner(full_name, email)').order('created_at', { ascending: false });

  if (type) query = query.eq('type', type);
  if (courseSlug) query = query.eq('course_slug', courseSlug);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z');

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: 'Failed to export' }, { status: 500 });

  // Fetch all tags in batches of 100
  const allIds = (rows ?? []).map(r => r.id);
  let tagsMap: Record<string, string[]> = {};
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    const { data: tagRows } = await db.from('feedback_tags').select('feedback_id, tag').in('feedback_id', batch);
    for (const row of tagRows ?? []) {
      if (!tagsMap[row.feedback_id]) tagsMap[row.feedback_id] = [];
      tagsMap[row.feedback_id].push(row.tag);
    }
  }

  const headers = ['Date', 'User', 'Email', 'Type', 'Course', 'Pod', 'Content Type', 'Notebook #', 'Rating', 'Comment', 'Tags', 'Category', 'Survey Data', 'Page URL'];
  const csvRows = [headers.join(',')];

  for (const r of rows ?? []) {
    csvRows.push([
      r.created_at,
      `"${(r.users?.full_name || '').replace(/"/g, '""')}"`,
      r.users?.email || '',
      r.type,
      r.course_slug || '',
      r.pod_slug || '',
      r.content_type || '',
      r.notebook_order ?? '',
      r.rating ?? '',
      `"${(r.comment || '').replace(/"/g, '""')}"`,
      (tagsMap[r.id] || []).join(';'),
      r.category || '',
      r.survey_data ? `"${JSON.stringify(r.survey_data).replace(/"/g, '""')}"` : '',
      r.page_url || '',
    ].join(','));
  }

  return new NextResponse(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="feedback-export-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
```

---

## 5. UI Components

All components are `'use client'` and require `useAuth()` to get the current user. If the user is not authenticated, return `null` (render nothing).

All components use the `useFeedback` hook internally.

---

### 5a. `EmojiRating`

**Location:** Bottom of article and notebook pages.
**Props:** `courseSlug`, `podSlug`, `contentType: 'article' | 'notebook'`, `notebookOrder?: number`

On mount, calls `checkExisting({ type: 'emoji', ... })` and pre-selects the stored rating.

On click, immediately calls `submit()` with the selected value.

Emoji scale: `{ value: 1, emoji: '😕', label: 'Confused' }`, `{ value: 2, emoji: '😐', label: 'Meh' }`, `{ value: 3, emoji: '🙂', label: 'Okay' }`, `{ value: 4, emoji: '😊', label: 'Good' }`, `{ value: 5, emoji: '🤩', label: 'Amazing' }`

Selected state: highlight with amber background and scale up (`scale-110`). Unselected: 60% opacity, full opacity on hover.

---

### 5b. `ThumbsRating`

**Location:** Bottom of article and notebook pages (alongside `EmojiRating`).
**Props:** `courseSlug`, `podSlug`, `contentType: 'article' | 'notebook'`, `notebookOrder?: number`

On mount, calls `checkExisting({ type: 'thumbs', ... })` and restores both the thumb selection and any saved tags.

**Behavior:**
1. User clicks 👍 (rating=1) or 👎 (rating=0) → immediately calls `submit()`, then reveals tag chips.
2. User can toggle tag chips. Each toggle re-calls `submit()` with the full updated tag list.
3. Tags are submitted together with the rating on every call (no separate tag endpoint).

Tag options: `great_examples`, `needs_more_code`, `too_easy`, `too_hard`, `confusing`

Selected thumb: 👍 gets green background; 👎 gets red background. Tags: selected = blue pill, unselected = gray border pill.

---

### 5c. `InlineFeedback`

**Location:** Bottom of article and notebook pages. This is the wrapper that renders `EmojiRating` and `ThumbsRating` side by side.
**Props:** Same as above — passed through to both child components.

```tsx
// Renders this layout:
<div> {/* card border, rounded, padding */}
  <p>How was this article? / How was this notebook?</p>
  <div> {/* flex row on sm+ */}
    <EmojiRating ... />
    <div /> {/* vertical divider, hidden on mobile */}
    <ThumbsRating ... />
  </div>
</div>
```

Gates on `user` from `useAuth()` — returns null if not logged in.

---

### 5d. `NpsPrompt`

**Location:** Pod and course completion/certificate pages.
**Props:** `courseSlug`, `podSlug?: string`, `contentType: 'pod' | 'course'`

On mount, calls `checkExisting({ type: 'nps', ... })`. If already submitted, pre-fills the score, shows the comment textarea (disabled), and sets `done = true`.

**Behavior:**
1. Renders buttons 1–10 in a row.
2. On click → calls `submit()` immediately, reveals optional comment textarea.
3. User can add a comment and click "Submit" → calls `submit()` again with the comment, sets `done = true`.
4. When `done`, textarea is read-only and shows "Thank you for your feedback!".

Color coding for the selected button:
- 1–6: red (`bg-red-500`)
- 7–8: amber
- 9–10: green

Label row below buttons: "Not likely" on left, "Very likely" on right.

---

### 5e. `CompletionSurvey`

**Location:** Pod and course completion/certificate pages (alongside `NpsPrompt`).
**Props:** `courseSlug`, `podSlug?: string`, `contentType: 'pod' | 'course'`

On mount, calls `checkExisting({ type: 'survey', ... })`. If already submitted, restores `answers` and sets `done = true` (buttons become disabled/read-only).

Three fixed questions (hardcoded, not fetched from DB):

```
Q1: "How clear were the explanations?"
    Options: "Very clear", "Mostly clear", "Somewhat unclear", "Very confusing"

Q2: "How were the practice notebooks?"
    Options: "Excellent", "Good", "Could be better", "Not helpful"

Q3: "How was the pace of the content?"
    Options: "Too fast", "Just right", "Too slow"
```

"Submit Survey" button is disabled until all three questions are answered. On submit, calls `submit()` with `type: 'survey'` and `surveyData: { clarity: "...", notebooks: "...", pace: "..." }`. Sets `done = true` on success.

Survey data is stored as JSONB in the `feedback.survey_data` column.

---

### 5f. `FeedbackTab`

**Location:** Global — inject into your root layout so it appears on every page.

A fixed vertical tab anchored to the right edge of the screen, centered vertically. Text reads "Feedback" rotated 90°.

**Behavior:**
1. Click tab → slide-out panel opens from the right (full height, max-width ~384px), with a backdrop overlay.
2. Panel has a category selector (pill buttons): `Bug Report`, `Suggestion`, `Content Issue`, `Other`. Default: `Suggestion`.
3. Free-text `<textarea>` for feedback content.
4. Submit button calls `submit()` with `type: 'general'`, `category`, `comment`, and `pageUrl: window.location.href`.
5. On success: show a thank-you state for 2 seconds, then auto-close the panel and reset form.

Gates on `user` from `useAuth()` — returns null (hides the tab) if not logged in.

---

## 6. Integration — Where to Mount Each Component

| Component | Where to add it |
|---|---|
| `<FeedbackTab />` | Root layout (`src/app/layout.tsx`) — renders on every page |
| `<InlineFeedback courseSlug={...} podSlug={...} contentType="article" />` | Bottom of each article page |
| `<InlineFeedback courseSlug={...} podSlug={...} contentType="notebook" notebookOrder={n} />` | Bottom of each notebook view |
| `<NpsPrompt courseSlug={...} podSlug={...} contentType="pod" />` | Pod completion / certificate page |
| `<CompletionSurvey courseSlug={...} podSlug={...} contentType="pod" />` | Pod completion / certificate page |
| `<NpsPrompt courseSlug={...} contentType="course" />` | Course completion page |
| `<CompletionSurvey courseSlug={...} contentType="course" />` | Course completion page |

---

## 7. Admin Dashboard

File: `src/app/admin/feedback/AdminFeedbackDashboard.tsx`

Client component. Fetches from `GET /api/admin/feedback` on mount and on filter change.

**Stats panel** (top row, 5 stat cards):
- Total Feedback (all types)
- Avg NPS (1–10 scale, shown to 1 decimal)
- Avg Emoji (1–5 scale, shown to 1 decimal)
- Thumbs Up % (shown as "X%")
- Last 7 Days count

**NPS Distribution chart:**
- Horizontal bar chart, keys 1–10.
- Color bands: 1–6 red, 7–8 amber, 9–10 green.
- Bar width proportional to max count in the distribution.

**Tag Breakdown section:**
- Shows count for each of the 5 tags: `great_examples`, `needs_more_code`, `too_easy`, `too_hard`, `confusing`.

**Filters (above the table):**
- Type dropdown: All / emoji / nps / thumbs / survey / general
- Course slug text input
- Date from / date to date inputs
- "Export CSV" button → triggers GET `/api/admin/feedback/export` with the same filter params.

**Table columns:** Date, User (name + email), Type (colored badge), Course/Pod slugs, Rating, Details (comment, tags, survey answers, category, page URL)

**Pagination:** 20 rows per page. Show page X of Y with prev/next buttons.

**Type badge colors:**
- `emoji` → amber
- `nps` → blue
- `thumbs` → green
- `survey` → purple
- `general` → gray

---

## 8. Admin Reply-via-Email System (Brevo)

Admins can compose replies to individual feedback items and send them to users via transactional email using [Brevo](https://www.brevo.com/).

### Additional database table: `feedback_replies`

```sql
create table public.feedback_replies (
  id text primary key,                    -- e.g. reply_{timestamp}_{random6}
  feedback_id text not null references public.feedback(id) on delete cascade,
  reply_text text not null,
  replied_by text not null,               -- admin display name
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,                    -- null until email is sent
  created_at timestamptz not null default now()
);

create index feedback_replies_feedback_id_idx on public.feedback_replies (feedback_id);
alter table public.feedback_replies enable row level security;
```

### Additional TypeScript type (add to `feedback.ts`)

```typescript
export interface FeedbackReply {
  id: string;
  feedbackId: string;
  replyText: string;
  repliedBy: string;
  status: 'draft' | 'sent';
  sentAt: string | null;
  createdAt: string;
}
```

Also add `replies?: FeedbackReply[]` to `FeedbackRecord`.

### Update `GET /api/admin/feedback` to include replies

After resolving tags, fetch replies for all feedback IDs in the current page and include them in each record:

```typescript
const feedbackIds = (rows ?? []).map(r => r.id);
let repliesMap: Record<string, FeedbackReply[]> = {};
if (feedbackIds.length > 0) {
  const { data: replyRows } = await db
    .from('feedback_replies')
    .select('*')
    .in('feedback_id', feedbackIds)
    .order('created_at', { ascending: true });
  for (const row of replyRows ?? []) {
    if (!repliesMap[row.feedback_id]) repliesMap[row.feedback_id] = [];
    repliesMap[row.feedback_id].push({
      id: row.id,
      feedbackId: row.feedback_id,
      replyText: row.reply_text,
      repliedBy: row.replied_by,
      status: row.status,
      sentAt: row.sent_at,
      createdAt: row.created_at,
    });
  }
}
// Then add replies: repliesMap[r.id] || [] to each mapped feedback record
```

### Environment variable

```env
BREVO_API_KEY=your_brevo_transactional_api_key
```

### Package dependency

```bash
npm install @getbrevo/brevo
```

### Email utility (`src/lib/email.ts`)

```typescript
import { BrevoClient } from '@getbrevo/brevo';

interface SendReplyEmailParams {
  to: string;
  toName: string;
  subject: string;
  html: string;
}

export async function sendReplyEmail({ to, toName, subject, html }: SendReplyEmailParams) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('Missing BREVO_API_KEY environment variable');

  const client = new BrevoClient({ apiKey });

  return client.transactionalEmails.sendTransacEmail({
    subject,
    htmlContent: html,
    sender: { name: 'YOUR_BRAND', email: 'hello@yourdomain.com' },  // must be a verified Brevo sender
    to: [{ email: to, name: toName }],
  });
}
```

### Reply API routes (`src/app/api/admin/feedback/[feedbackId]/reply/route.ts`)

**`POST`** — Save a draft reply (no email sent)

Body: `{ replyText: string }`

Steps:
1. Admin auth check (`isAdmin()`).
2. Validate `replyText` is a non-empty string.
3. Get admin name from `getAdminUser()`.
4. Insert into `feedback_replies` with `status: 'draft'`.
5. Return the created reply object.

```typescript
export async function POST(req, { params }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { feedbackId } = await params;
  const { replyText } = await req.json();
  if (!replyText || typeof replyText !== 'string')
    return NextResponse.json({ error: 'replyText is required' }, { status: 400 });

  const admin = await getAdminUser();
  const db = getDb();
  const id = `reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const { data, error } = await db
    .from('feedback_replies')
    .insert({ id, feedback_id: feedbackId, reply_text: replyText, replied_by: admin?.fullName || 'Admin', status: 'draft' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to save reply' }, { status: 500 });

  return NextResponse.json({
    id: data.id, feedbackId: data.feedback_id, replyText: data.reply_text,
    repliedBy: data.replied_by, status: data.status, sentAt: data.sent_at, createdAt: data.created_at,
  });
}
```

**`PUT`** — Send a draft reply via email

Body: `{ replyId: string }`

Steps:
1. Admin auth check.
2. Fetch the reply from `feedback_replies` (match `replyId` + `feedbackId`).
3. Fetch the feedback record joined with `users` to get `email` and `full_name`.
4. Validate `userEmail` exists.
5. Build HTML email (see template below) and call `sendReplyEmail(...)`.
6. On success, update `feedback_replies` set `status = 'sent'`, `sent_at = now()`.

```typescript
export async function PUT(req, { params }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { feedbackId } = await params;
  const { replyId } = await req.json();
  if (!replyId) return NextResponse.json({ error: 'replyId is required' }, { status: 400 });

  const db = getDb();

  const { data: reply, error: replyErr } = await db
    .from('feedback_replies').select('*').eq('id', replyId).eq('feedback_id', feedbackId).single();
  if (replyErr || !reply) return NextResponse.json({ error: 'Reply not found' }, { status: 404 });

  const { data: feedback, error: fbErr } = await db
    .from('feedback').select('*, users!inner(full_name, email)').eq('id', feedbackId).single();
  if (fbErr || !feedback) return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });

  const userEmail = feedback.users?.email;
  const userName = feedback.users?.full_name || 'Student';
  if (!userEmail) return NextResponse.json({ error: 'No email found for this user' }, { status: 400 });

  const subject = `Re: Your feedback on YOUR_APP_NAME`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <p>Hi ${userName},</p>
      <p>Thank you for your feedback on YOUR_APP_NAME. Here's our response:</p>
      <div style="background: #f8f9fa; border-left: 4px solid #4f46e5; padding: 16px; margin: 16px 0; border-radius: 4px;">
        ${reply.reply_text.replace(/\n/g, '<br>')}
      </div>
      <p>If you have any more questions, feel free to reply to this email.</p>
      <p>Best,<br>The YOUR_TEAM_NAME Team</p>
    </div>
  `;

  try {
    await sendReplyEmail({ to: userEmail, toName: userName, subject, html });
  } catch (err) {
    console.error('Failed to send reply email:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }

  const { error: updateErr } = await db
    .from('feedback_replies').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', replyId);

  if (updateErr) return NextResponse.json({ error: 'Email sent but failed to update status' }, { status: 500 });

  return NextResponse.json({ success: true });
}
```

### Admin dashboard UI additions for replies

Extend the feedback table row detail panel to include:

1. **Replies list** — show each reply with its status chip (`draft` / `sent`) and `sentAt` timestamp.
2. **Compose area** — `<textarea>` + "Save Draft" button → calls `POST /api/admin/feedback/[id]/reply`.
3. **Send button** — next to each draft reply → calls `PUT /api/admin/feedback/[id]/reply` with `replyId`, then flips the status chip to `sent`.

### ID generation for replies

```typescript
const id = `reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
```

---

## 9. Dependencies and Assumptions

- **Auth:** The system uses `getAuthUser()` server-side (returns `{ id, ... }` or null) and `useAuth()` client-side (returns `{ user }`). Replace with your auth implementation.
- **DB client:** `getDb()` returns a Supabase client. The query patterns use Supabase's JS SDK. If using a different ORM/client, translate accordingly.
- **Admin check:** `isAdmin()` is a server-side function that checks if the current session user has admin privileges. Implement based on your auth model (e.g., check a `role` column in the users table).
- **ID generation:** `generateId()` returns a unique string ID. Use `crypto.randomUUID()` or `nanoid()`.
- **The `users` table:** Must have `id`, `full_name`, `email` columns for the admin join (`users!inner(full_name, email)`).
- **Context domain:** The `courseSlug` / `podSlug` / `contentType` / `notebookOrder` fields are specific to this app's content model. Adapt them to your app's content hierarchy. At minimum you need some way to uniquely identify "what piece of content" the user is rating.
