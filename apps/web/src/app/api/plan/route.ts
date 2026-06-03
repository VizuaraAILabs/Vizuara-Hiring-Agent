import { getAuthUser } from '@/lib/auth';
import { checkEnrollmentStatus } from '@/lib/enrollment';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const status = await checkEnrollmentStatus(user.companyId);
    return NextResponse.json(status);
  } catch (err) {
    console.error('Error fetching plan status:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
