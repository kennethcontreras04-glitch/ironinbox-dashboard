
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
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      errorType: error?.name || 'UnknownError',
    };
  }
}
