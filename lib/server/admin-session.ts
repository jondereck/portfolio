import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminSettings } from '@/lib/server/admin-settings';

export const ADMIN_SESSION_COOKIE = 'admin_session';
export const ADMIN_ACCESS_GRANT_COOKIE = 'admin_access_grant';
const ACCESS_GRANT_TTL_SECONDS = 10 * 60;

const textEncoder = new TextEncoder();

const base64UrlEncode = (value: string) => Buffer.from(value).toString('base64url');
const base64UrlDecode = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

const getSessionSecret = () => {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_API_KEY || '';
};

const safeEqual = (left: string, right: string): boolean => {
  const leftBytes = textEncoder.encode(left);
  const rightBytes = textEncoder.encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
};

const signPayload = (payload: string, secret: string) => {
  return createHmac('sha256', secret).update(payload).digest('base64url');
};

const parseCookies = (request: Request) => {
  const raw = request.headers.get('cookie');
  if (!raw) {
    return {};
  }

  return raw.split(';').reduce<Record<string, string>>((acc, entry) => {
    const [key, ...rest] = entry.split('=');
    if (!key || rest.length === 0) {
      return acc;
    }

    acc[key.trim()] = decodeURIComponent(rest.join('=').trim());
    return acc;
  }, {});
};

export async function createAdminSessionToken(): Promise<string | null> {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

  const settings = await getAdminSettings();
  const sessionTtlSeconds = settings.security.sessionTtlHours * 60 * 60;
  const payload = base64UrlEncode(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + sessionTtlSeconds,
      v: settings.security.sessionVersion,
    }),
  );
  const signature = signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export async function isValidAdminSessionToken(token: string): Promise<boolean> {
  const secret = getSessionSecret();
  if (!secret || !token) {
    return false;
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = signPayload(payload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { exp?: number; v?: number };
    if (typeof decoded.exp !== 'number') {
      return false;
    }

    if (decoded.exp <= Math.floor(Date.now() / 1000)) {
      return false;
    }

    const settings = await getAdminSettings();
    const tokenVersion = typeof decoded.v === 'number' ? decoded.v : 1;
    return tokenVersion === settings.security.sessionVersion;
  } catch {
    return false;
  }
}

async function readAdminSessionToken(request?: Request): Promise<string | null> {
  if (request) {
    const fromRequest = parseCookies(request)[ADMIN_SESSION_COOKIE];
    if (typeof fromRequest === 'string' && fromRequest) {
      return fromRequest;
    }
  }

  try {
    const jar = await cookies();
    const value = jar.get(ADMIN_SESSION_COOKIE)?.value;
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}

export async function hasValidAdminSession(request?: Request): Promise<boolean> {
  const token = await readAdminSessionToken(request);
  if (!token) {
    return false;
  }

  return isValidAdminSessionToken(token);
}

/** Policy cookie used for Session TTL + Force Logout across legacy, Neon, and Google admin access. */
export async function hasValidAdminAccessPolicy(request?: Request): Promise<boolean> {
  return hasValidAdminSession(request);
}

function preserveAndSetCookie(
  response: NextResponse,
  cookie: {
    name: string;
    value: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    maxAge?: number;
  },
) {
  const existingSetCookies = response.headers.getSetCookie();
  response.cookies.set(cookie);
  const targetName = cookie.name;
  for (const raw of existingSetCookies) {
    const name = raw.split('=')[0]?.trim();
    if (name && name !== targetName) {
      response.headers.append('set-cookie', raw);
    }
  }
}

export async function setAdminSessionCookie(response: NextResponse, token: string) {
  const settings = await getAdminSettings();
  const sessionTtlSeconds = settings.security.sessionTtlHours * 60 * 60;

  preserveAndSetCookie(response, {
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: sessionTtlSeconds,
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  preserveAndSetCookie(response, {
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function issueAdminAccessCookie(response: NextResponse): Promise<boolean> {
  const token = await createAdminSessionToken();
  if (!token) {
    return false;
  }

  await setAdminSessionCookie(response, token);
  return true;
}

export async function createAdminAccessGrantToken(): Promise<string | null> {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

  const settings = await getAdminSettings();
  const payload = base64UrlEncode(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + ACCESS_GRANT_TTL_SECONDS,
      v: settings.security.sessionVersion,
      purpose: 'admin-access-grant',
    }),
  );
  return `${payload}.${signPayload(payload, secret)}`;
}

export async function isValidAdminAccessGrantToken(token: string): Promise<boolean> {
  const secret = getSessionSecret();
  if (!secret || !token) {
    return false;
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = signPayload(payload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { exp?: number; v?: number; purpose?: string };
    if (decoded.purpose !== 'admin-access-grant' || typeof decoded.exp !== 'number') {
      return false;
    }
    if (decoded.exp <= Math.floor(Date.now() / 1000)) {
      return false;
    }

    const settings = await getAdminSettings();
    const tokenVersion = typeof decoded.v === 'number' ? decoded.v : 1;
    return tokenVersion === settings.security.sessionVersion;
  } catch {
    return false;
  }
}

export async function setAdminAccessGrantCookie(response: NextResponse): Promise<boolean> {
  const token = await createAdminAccessGrantToken();
  if (!token) {
    return false;
  }

  preserveAndSetCookie(response, {
    name: ADMIN_ACCESS_GRANT_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_GRANT_TTL_SECONDS,
  });
  return true;
}

export function clearAdminAccessGrantCookie(response: NextResponse) {
  preserveAndSetCookie(response, {
    name: ADMIN_ACCESS_GRANT_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function consumeAdminAccessGrant(request: Request, response: NextResponse): Promise<boolean> {
  const grant = parseCookies(request)[ADMIN_ACCESS_GRANT_COOKIE];
  clearAdminAccessGrantCookie(response);
  if (!grant || !(await isValidAdminAccessGrantToken(grant))) {
    return false;
  }

  return issueAdminAccessCookie(response);
}
