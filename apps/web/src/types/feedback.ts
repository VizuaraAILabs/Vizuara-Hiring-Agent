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
