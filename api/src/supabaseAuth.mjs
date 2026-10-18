
import { createRemoteJWKSet, jwtVerify } from 'jose';

export function createSupabaseAuth(env) {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, '');

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not configured.');
  }

  const issuer = `${supabaseUrl}/auth/v1`;
  const jwks = createRemoteJWKSet(
    new URL(`${issuer}/.well-known/jwks.json`)
  );

  return async function verifySupabaseUser(request) {
    const authorization = request.headers.get('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      throw Object.assign(
        new Error('Authentication required.'),
        { status: 401 }
      );
    }

    const token = authorization.slice(7);

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'],
      });

      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        payload.role !== 'authenticated'
      ) {
        throw new Error('Invalid user identity.');
      }

      return {
        uid: payload.sub,
        email: typeof payload.email === 'string'
          ? payload.email
          : '',
      };
    
} catch (error) {
  console.error('[SUPABASE JWT VERIFY]', {
  code: error?.code,
  name: error?.name,
  message: error?.message,
  cause: error?.cause?.message,
});

  throw Object.assign(
  new Error(
    `JWT verification failed: ${error?.code || error?.name || 'unknown'}`
  ),
  { status: 401 }
);
    }
  };
}
