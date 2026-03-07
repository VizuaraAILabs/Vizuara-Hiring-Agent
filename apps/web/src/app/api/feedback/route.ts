import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import type { FeedbackSubmission } from '@/types/feedback';

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body: FeedbackSubmission = await req.json();
  if (!body.type) return NextResponse.json({ error: 'Missing feedback type' }, { status: 400 });

  const feedbackId = uuidv4();
  const courseSlug = body.courseSlug ?? null;
  const podSlug = body.podSlug ?? null;
  const contentType = body.contentType ?? null;
  const notebookOrder = body.notebookOrder ?? null;

  // Upsert logic for emoji/nps/thumbs only
  if (['emoji', 'nps', 'thumbs'].includes(body.type)) {
    const [existing] = await sql`
      SELECT id FROM feedback
      WHERE company_id = ${user.sub}
        AND type = ${body.type}
        AND course_slug IS NOT DISTINCT FROM ${courseSlug}
        AND pod_slug IS NOT DISTINCT FROM ${podSlug}
        AND content_type IS NOT DISTINCT FROM ${contentType}
        AND notebook_order IS NOT DISTINCT FROM ${notebookOrder}
      LIMIT 1
    `;

    if (existing) {
      await sql`
        UPDATE feedback
        SET rating = ${body.rating ?? null}, comment = ${body.comment ?? null}
        WHERE id = ${existing.id}
      `;

      if (body.type === 'thumbs' && body.tags) {
        await sql`DELETE FROM feedback_tags WHERE feedback_id = ${existing.id}`;
        if (body.tags.length > 0) {
          await sql`
            INSERT INTO feedback_tags (id, feedback_id, tag)
            VALUES ${sql(body.tags.map(tag => ({ id: uuidv4(), feedback_id: existing.id, tag })))}
          `;
        }
      }
      return NextResponse.json({ id: existing.id, updated: true });
    }
  }

  // Insert new record
  await sql`
    INSERT INTO feedback (id, company_id, type, course_slug, pod_slug, content_type, notebook_order, rating, comment, survey_data, category, page_url)
    VALUES (
      ${feedbackId},
      ${user.sub},
      ${body.type},
      ${courseSlug},
      ${podSlug},
      ${contentType},
      ${notebookOrder},
      ${body.rating ?? null},
      ${body.comment ?? null},
      ${body.surveyData ? sql.json(body.surveyData) : null},
      ${body.category ?? null},
      ${body.pageUrl ?? null}
    )
  `;

  if (body.type === 'thumbs' && body.tags && body.tags.length > 0) {
    await sql`
      INSERT INTO feedback_tags (id, feedback_id, tag)
      VALUES ${sql(body.tags.map(tag => ({ id: uuidv4(), feedback_id: feedbackId, tag })))}
    `;
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
  const notebookOrderRaw = searchParams.get('notebookOrder');
  const notebookOrder = notebookOrderRaw !== null ? parseInt(notebookOrderRaw) : null;

  const [row] = await sql`
    SELECT * FROM feedback
    WHERE company_id = ${user.sub}
      AND type = ${type}
      AND course_slug IS NOT DISTINCT FROM ${courseSlug}
      AND pod_slug IS NOT DISTINCT FROM ${podSlug}
      AND content_type IS NOT DISTINCT FROM ${contentType}
      AND notebook_order IS NOT DISTINCT FROM ${notebookOrder}
    LIMIT 1
  `;

  if (!row) return NextResponse.json({ feedback: null });

  let tags: string[] = [];
  if (row.type === 'thumbs') {
    const tagRows = await sql`SELECT tag FROM feedback_tags WHERE feedback_id = ${row.id}`;
    tags = tagRows.map((r) => r.tag as string);
  }

  return NextResponse.json({
    feedback: {
      id: row.id,
      userId: row.company_id,
      type: row.type,
      courseSlug: row.course_slug,
      podSlug: row.pod_slug,
      contentType: row.content_type,
      notebookOrder: row.notebook_order,
      rating: row.rating,
      comment: row.comment,
      surveyData: row.survey_data,
      category: row.category,
      pageUrl: row.page_url,
      createdAt: row.created_at,
      tags,
    },
  });
}
