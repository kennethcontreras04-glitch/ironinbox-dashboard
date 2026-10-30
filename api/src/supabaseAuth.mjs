
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAuth(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return null;

  function client() {
    return createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  return {
    
async register(email, password, firstName, lastName) {
  let supabase;

  
try {
  supabase = client();
} catch (error) {
  const diagnostic = new Error('SUPABASE_CLIENT_INITIALIZATION_FAILED');

  diagnostic.code =
    error instanceof Error &&
    /supabaseUrl is required/i.test(error.message)
      ? 'MISSING_URL'
      : error instanceof Error &&
        /supabaseKey is required/i.test(error.message)
        ? 'MISSING_KEY'
        : error instanceof Error &&
          /invalid supabaseUrl/i.test(error.message)
          ? 'INVALID_URL'
          : 'CLIENT_SETUP_ERROR';

  throw diagnostic;
}


  let result;

  try {
    result = await supabase.auth.signUp({
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
  } catch {
    throw new Error('SUPABASE_SIGNUP_REQUEST_FAILED');
  }

  const { data, error } = result;

  if (error) throw error;

  return {
    userId: data.user?.id,
    requiresConfirmation: !data.session,
  };
},


    async login(email, password) {
      const supabase = client();

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (error) throw error;

      return {
        userId: data.user.id,
        email: data.user.email,
        firstName: data.user.user_metadata?.first_name || '',
        lastName: data.user.user_metadata?.last_name || '',
      };
    },
  };
}

