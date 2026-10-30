
export async function checkSupabaseConnection(env, fetcher = fetch) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return { configured: false, connected: false };
  }

  try {
    const response = await fetcher(
      `${url.replace(/\/$/, '')}/auth/v1/health`,
      {
        headers: { apikey: key },
        signal: AbortSignal.timeout(10000),
      }
    );

    return {
  configured: true,
  connected: response.ok,
  status: response.status,
  urlFormatValid: /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url),
  urlHasWhitespace: url !== url.trim(),
  keyHasWhitespace: key !== key.trim(),
  keyFormat: key.startsWith('sb_publishable_')
    ? 'publishable'
    : key.startsWith('eyJ')
      ? 'legacy-jwt'
      : 'unrecognized',
};
  } catch (error) {
    return {
      configured: true,
      connected: false,
      errorType: error?.name || 'UnknownError',
    };
  }
}
