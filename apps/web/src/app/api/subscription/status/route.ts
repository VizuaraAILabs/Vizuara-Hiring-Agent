import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getAdminFirestore } from '@/lib/firebase-admin';
import sql from '@/lib/db';

export const dynamic = 'force-dynamic';

const ENROLLMENT_ID = process.env.ARCEVAL_ENROLLMENT_ID || '';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ enrolled: false, status: null, enrollment: null });
    }

    // Get the firebase_uid for this company
    const [company] = await sql<{ firebase_uid: string | null }[]>`
      SELECT firebase_uid FROM companies WHERE id = ${user.sub}
    `;

    if (!company?.firebase_uid) {
      return NextResponse.json({ enrolled: false, status: null, enrollment: null });
    }

    const db = getAdminFirestore();
    const docRef = db.collection('Enrollments').doc(`${company.firebase_uid}_${ENROLLMENT_ID}`);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ enrolled: false, status: null, enrollment: null });
    }

    const data = doc.data()!;
    const isActive = data.status === 'ACTIVE' || data.status === 'COMPLETED';

    return NextResponse.json({
      enrolled: isActive,
      status: data.status,
      enrollment: {
        uid: company.firebase_uid,
        courseId: ENROLLMENT_ID,
        status: data.status,
        enrolledAt: data.enrollmentDate?.toDate?.()?.toISOString?.() ?? data.enrollmentDate ?? null,
      },
    });
  } catch {
    return NextResponse.json({ enrolled: false, status: null, enrollment: null });
  }
}
