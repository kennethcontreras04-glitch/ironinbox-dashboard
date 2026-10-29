
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAuth(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return null;

  const createAuthClient = () => createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return {
    async register(email, password, firstName, lastName) {
      const client = createAuthClient();

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`.trim(),
          },
        },
      });

      if (error) throw new Error(error.message);

      return {
        user: data.user,
        requiresConfirmation: !data.session,
      };
    },

    async signIn(email, password) {
      const client = createAuthClient();

      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw new Error(error.message);
      if (!data.user) throw new Error('Unable to authenticate user.');

      return {
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.user_metadata?.first_name || '',
        lastName: data.user.user_metadata?.last_name || '',
      };
    },
  };
}
