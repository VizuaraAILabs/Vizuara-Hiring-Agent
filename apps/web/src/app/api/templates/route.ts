import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { TEMPLATES } from '@/lib/templates';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(TEMPLATES);
  } catch (error) {
    console.error('Error listing templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
