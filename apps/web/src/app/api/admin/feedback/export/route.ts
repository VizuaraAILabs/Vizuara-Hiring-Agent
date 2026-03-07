import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const type = searchParams.get('type');
  const courseSlug = searchParams.get('courseSlug');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  try {
    const rows = await sql`
      SELECT
        f.*,
        c.name AS company_name,
        c.email AS company_email
      FROM feedback f
      LEFT JOIN companies c ON c.id = f.company_id
      WHERE 1=1
        ${type ? sql`AND f.type = ${type}` : sql``}
        ${courseSlug ? sql`AND f.course_slug = ${courseSlug}` : sql``}
        ${dateFrom ? sql`AND f.created_at >= ${dateFrom}::timestamptz` : sql``}
        ${dateTo ? sql`AND f.created_at <= ${dateTo + 'T23:59:59Z'}::timestamptz` : sql``}
      ORDER BY f.created_at DESC
    `;

    // Fetch all tags in batches of 100
    const allIds = rows.map((r) => r.id as string);
    const tagsMap: Record<string, string[]> = {};
    for (let i = 0; i < allIds.length; i += 100) {
      const batch = allIds.slice(i, i + 100);
      if (batch.length === 0) break;
      const tagRows = await sql`
        SELECT feedback_id, tag FROM feedback_tags WHERE feedback_id = ANY(${batch})
      `;
      for (const row of tagRows) {
        if (!tagsMap[row.feedback_id]) tagsMap[row.feedback_id] = [];
        tagsMap[row.feedback_id].push(row.tag);
      }
    }

    const headers = [
      'Date', 'User', 'Email', 'Type', 'Course', 'Pod',
      'Content Type', 'Notebook #', 'Rating', 'Comment',
      'Tags', 'Category', 'Survey Data', 'Page URL',
    ];
    const csvRows = [headers.join(',')];

    for (const r of rows) {
      csvRows.push([
        r.created_at,
        `"${(r.company_name || '').replace(/"/g, '""')}"`,
        r.company_email || '',
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
  } catch (error) {
    console.error('Feedback export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
