
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAuth } from '../src/supabaseAuth.mjs';

test('Supabase authentication is disabled when configuration is missing', () => {
  assert.equal(createSupabaseAuth({}), null);

  assert.equal(
    createSupabaseAuth({
      SUPABASE_URL: 'https://example.supabase.co',
    }),
    null
  );

  assert.equal(
    createSupabaseAuth({
      SUPABASE_PUBLISHABLE_KEY: 'test-key',
    }),
    null
  );
});

test('Supabase registration sends user metadata and detects email confirmation', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      const body = JSON.parse(init.body);

      requests.push({ url, body });

      return new Response(JSON.stringify({
        id: 'test-user-123',
        email: 'student@example.com',
        identities: [{ id: 'identity-123' }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const auth = createSupabaseAuth({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    });

    const result = await auth.register(
      'student@example.com',
      'SecurePassword123!',
      'Test',
      'Student'
    );

    assert.equal(result.userId, 'test-user-123');
    assert.equal(result.requiresConfirmation, true);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/auth\/v1\/signup/);
    assert.equal(requests[0].body.data.first_name, 'Test');
    assert.equal(requests[0].body.data.last_name, 'Student');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Supabase login returns the authenticated user profile', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh-token',
      user: {
        id: 'test-user-123',
        email: 'student@example.com',
        user_metadata: {
          first_name: 'Test',
          last_name: 'Student',
        },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const auth = createSupabaseAuth({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    });

    const result = await auth.login(
      'student@example.com',
      'SecurePassword123!'
    );

    assert.deepEqual(result, {
      userId: 'test-user-123',
      email: 'student@example.com',
      firstName: 'Test',
      lastName: 'Student',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Supabase login rejects invalid credentials', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        code: 'invalid_credentials',
        message: 'Invalid login credentials',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const auth = createSupabaseAuth({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    });

    await assert.rejects(
      auth.login('student@example.com', 'WrongPassword123!'),
      error => {
        assert.match(error.message, /Invalid login credentials/i);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

