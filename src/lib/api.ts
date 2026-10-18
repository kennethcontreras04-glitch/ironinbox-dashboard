
import { supabase } from './supabase';

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error('Please sign in again.');
  }

  const headers = new Headers(options.headers);

  headers.set(
    'Authorization',
    `Bearer ${session.access_token}`
  );

  return fetch(path, {
    ...options,
    headers,
  });
}
