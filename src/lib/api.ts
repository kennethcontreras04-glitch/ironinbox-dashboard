
import { supabase } from './supabase';

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  const { data: userData, error: userError } =
  await supabase.auth.getUser();

console.log('[SUPABASE SESSION CHECK]', {
  sessionExists: !!session,
  accessTokenExists: !!session?.access_token,
  userVerified: !!userData.user,
  error: userError?.message ?? null,
});

if (session?.access_token) {
  const decode = (part: string) => {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '=')));
  };

  const [header, payload] = session.access_token.split('.');

  console.log('[JWT DEBUG]', {
    algorithm: decode(header).alg,
    issuer: decode(payload).iss,
    audience: decode(payload).aud,
    role: decode(payload).role,
    expiresAt: new Date(decode(payload).exp * 1000).toISOString(),
  });
}


  if (error || !session?.access_token) {
    throw new Error('Please sign in again.');
  }

  const headers = new Headers(options.headers);

  headers.set(
  'X-Supabase-Authorization',
  `Bearer ${session.access_token}`
);

  return fetch(path, {
    ...options,
    headers,
  });
}
