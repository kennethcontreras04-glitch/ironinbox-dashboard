
import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader } from 'jose';

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

    const jwtHeader = decodeProtectedHeader(token);

console.log('[JWT HEADER]', {
  algorithm: jwtHeader.alg,
  keyId: jwtHeader.kid,
});
console.log('[IRONINBOX AUTH VERSION]', 'es256-check-v2');
    try {
      const { payload } = await jwtVerify(token, jwks, {
  issuer,
  audience: 'authenticated',
  algorithms: ['ES256'],
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
console.error('[JWT DIAGNOSTIC]', {
  code: error?.code,
  name: error?.name,
  message: error?.message,
  stack: error?.stack,
});
  throw Object.assign(
  new Error(`AUTH-V2: ${error?.code || error?.name || 'unknown'}`),
  { status: 401 }
);
    }
  };
}
