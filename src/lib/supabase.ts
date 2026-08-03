import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)

// The anon key is public. Everything this client can do is bounded by RLS.
// When the build had no credentials the client still constructs, so the app can
// render a configuration notice instead of a blank page.
export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'anon-key-missing',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)
