import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const [company] = await sql`
    SELECT name, contact_name, contact_title
    FROM companies
    WHERE id = ${user.sub}
  `;

  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    name: company.name as string,
    contactName: (company.contact_name ?? '') as string,
    contactTitle: (company.contact_title ?? '') as string,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim() : null;
  const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : null;
  const contactTitle = typeof body.contactTitle === 'string' ? body.contactTitle.trim() : null;

  if (name !== null && name.length === 0) {
    return NextResponse.json({ error: 'Company name cannot be empty' }, { status: 400 });
  }

  await sql`
    UPDATE companies
    SET
      name         = COALESCE(${name}, name),
      contact_name = ${contactName},
      contact_title = ${contactTitle}
    WHERE id = ${user.sub}
  `;

  return NextResponse.json({ ok: true });
}
