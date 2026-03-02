import { NextResponse } from 'next/server';
import { getAuthUser, isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getAuthUser();
    return NextResponse.json({
      user: user ? { ...user, isAdmin: isAdmin(user.email) } : null,
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
