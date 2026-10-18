
import {
  createRemoteJWKSet,
  jwtVerify,
  decodeProtectedHeader,
} from 'jose';

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

    const tokenHeader = decodeProtectedHeader(token);
    const requestPath = new URL(request.url).pathname;

console.log('[AUTH TRACE]', {
  path: requestPath,
  algorithm: tokenHeader.alg,
  keyId: tokenHeader.kid ?? null,
});

console.log('[JWT INCOMING HEADER]', {
  algorithm: tokenHeader.alg,
  keyId: tokenHeader.kid,
});

    const jwtHeader = decodeProtectedHeader(token);

console.log('[JWT HEADER]', {
  algorithm: jwtHeader.alg,
  keyId: jwtHeader.kid,
});
console.log('[IRONINBOX AUTH VERSION]', 'auth-trace-v5');
console.log('[IRONINBOX AUTH REQUEST]', {
  path: new URL(request.url).pathname,
  algorithm: tokenHeader.alg,
  keyId: tokenHeader.kid ?? null,
});
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
  new Error(
    `AUTH-V5: path=${new URL(request.url).pathname}; ` +
    `tokenAlg=${tokenHeader.alg}; ` +
    `keyId=${tokenHeader.kid ?? 'none'}; ` +
    `error=${error?.code ?? error?.name}`
  ),
  { status: 401 }
);
    }
  };
}
