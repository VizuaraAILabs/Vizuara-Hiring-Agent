import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { signToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    const [existing] = await sql`SELECT id FROM companies WHERE email = ${email}`;
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await sql`INSERT INTO companies (id, name, email, password_hash) VALUES (${id}, ${name}, ${email}, ${passwordHash})`;

    const token = await signToken({ sub: id, email, name });

    const response = NextResponse.json({ id, name, email });
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
