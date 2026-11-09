import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let client = null;
export function supabase() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

// Анонимная сессия (README §4: identity из JWT). Повторный вызов безвреден.
export async function ensureSession() {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session;
  const { data: signed, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  return signed.session;
}
