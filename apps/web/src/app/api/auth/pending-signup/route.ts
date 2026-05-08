import { getAdminAuth } from '@/lib/firebase-admin';
import sql from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token : null;
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    if (!companyName) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const email = decoded.email || '';

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const [existingCompany] = await sql<{ id: string }[]>`
      SELECT id FROM companies WHERE firebase_uid = ${decoded.uid} OR email = ${email}
      LIMIT 1
    `;

    if (existingCompany) {
      return NextResponse.json({ ok: true, alreadyExists: true });
    }

    await sql`
      INSERT INTO pending_signups (firebase_uid, email, company_name, updated_at)
      VALUES (${decoded.uid}, ${email}, ${companyName}, NOW())
      ON CONFLICT (email) DO UPDATE SET
        firebase_uid = EXCLUDED.firebase_uid,
        company_name = EXCLUDED.company_name,
        updated_at = NOW()
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Pending signup error:', error);
    return NextResponse.json({ error: 'Unable to save pending signup' }, { status: 500 });
  }
}
