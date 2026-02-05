import { createCookieSessionStorage, redirect } from '@remix-run/node';
import type { AuthUser } from '~/types/auth';

const sessionSecret = process.env.SESSION_SECRET || 'dev-session-secret-change-me';

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__session',
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === 'production',
  },
});

export async function getSession(request: Request) {
  const cookie = request.headers.get('Cookie');
  return sessionStorage.getSession(cookie);
}

export async function getAuthToken(request: Request) {
  const session = await getSession(request);
  const token = session.get('token');
  if (!token || typeof token !== 'string') return null;
  return token;
}

export async function requireAuthToken(request: Request) {
  const session = await getSession(request);
  const token = session.get('token');
  if (!token || typeof token !== 'string') {
    const url = new URL(request.url);
    throw redirect(`/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return { session, token };
}

export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const session = await getSession(request);
  const user = session.get('user');
  if (!user || typeof user !== 'object') return null;

  const u = user as Partial<AuthUser>;
  if (!u.id || !u.email) return null;

  return {
    id: String(u.id),
    email: String(u.email),
    first_name: u.first_name ? String(u.first_name) : undefined,
    last_name: u.last_name ? String(u.last_name) : undefined,
  };
}
