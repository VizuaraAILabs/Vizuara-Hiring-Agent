import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;
  const type = searchParams.get('type');
  const courseSlug = searchParams.get('courseSlug');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  try {
    // Paginated feedback list with company info
    const rows = await sql`
      SELECT
        f.*,
        c.name AS company_name,
        c.email AS company_email,
        COUNT(*) OVER() AS total_count
      FROM feedback f
      LEFT JOIN companies c ON c.id = f.company_id
      WHERE 1=1
        ${type ? sql`AND f.type = ${type}` : sql``}
        ${courseSlug ? sql`AND f.course_slug = ${courseSlug}` : sql``}
        ${dateFrom ? sql`AND f.created_at >= ${dateFrom}::timestamptz` : sql``}
        ${dateTo ? sql`AND f.created_at <= ${dateTo + 'T23:59:59Z'}::timestamptz` : sql``}
      ORDER BY f.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const totalCount = rows.length > 0 ? parseInt(rows[0].total_count) : 0;

    // Resolve tags for thumbs entries on this page
    const thumbsIds = rows.filter((r) => r.type === 'thumbs').map((r) => r.id as string);
    const tagsMap: Record<string, string[]> = {};
    if (thumbsIds.length > 0) {
      const tagRows = await sql`
        SELECT feedback_id, tag FROM feedback_tags WHERE feedback_id = ANY(${thumbsIds})
      `;
      for (const row of tagRows) {
        if (!tagsMap[row.feedback_id]) tagsMap[row.feedback_id] = [];
        tagsMap[row.feedback_id].push(row.tag);
      }
    }

    const feedback = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      userId: r.company_id,
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
      tags: tagsMap[r.id as string] || [],
      userName: r.company_name,
      userEmail: r.company_email,
    }));

    // Global stats (always over ALL rows, unfiltered)
    const [statsRow] = await sql`
      SELECT
        COUNT(*)::int AS total_count,
        AVG(CASE WHEN type = 'nps' THEN rating END) AS avg_nps,
        AVG(CASE WHEN type = 'emoji' THEN rating END) AS avg_emoji,
        COUNT(CASE WHEN type = 'thumbs' AND rating = 1 THEN 1 END)::float
          / NULLIF(COUNT(CASE WHEN type = 'thumbs' THEN 1 END), 0) * 100 AS thumbs_up_percent,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END)::int AS last7days_count
      FROM feedback
    `;

    const npsDistRows = await sql`
      SELECT rating, COUNT(*)::int AS count
      FROM feedback
      WHERE type = 'nps' AND rating IS NOT NULL
      GROUP BY rating
    `;
    const npsDistribution: Record<number, number> = {};
    for (let i = 1; i <= 10; i++) npsDistribution[i] = 0;
    for (const row of npsDistRows) npsDistribution[row.rating] = row.count;

    const tagBreakdownRows = await sql`SELECT tag, COUNT(*)::int AS count FROM feedback_tags GROUP BY tag`;
    const tagBreakdown: Record<string, number> = {};
    for (const row of tagBreakdownRows) tagBreakdown[row.tag] = row.count;

    const stats = {
      totalCount: statsRow.total_count,
      avgNps: statsRow.avg_nps !== null ? parseFloat(statsRow.avg_nps) : null,
      avgEmoji: statsRow.avg_emoji !== null ? parseFloat(statsRow.avg_emoji) : null,
      thumbsUpPercent: statsRow.thumbs_up_percent !== null ? parseFloat(statsRow.thumbs_up_percent) : null,
      last7DaysCount: statsRow.last7days_count,
      npsDistribution,
      tagBreakdown,
    };

    return NextResponse.json({
      feedback,
      stats,
      total: totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error('Admin feedback error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
