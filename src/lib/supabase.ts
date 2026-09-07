import { createClient } from "@supabase/supabase-js";

// Supplied by .env.local, which is git-ignored. These two values are VITE_-
// prefixed because the browser client genuinely needs them at runtime, so they
// are inlined into the bundle and are therefore public by design. That is safe
// only while Row Level Security is enabled on every table — the anon key grants
// exactly the access your RLS policies allow, and nothing protects a table with
// RLS turned off. Never put the service_role key here; it bypasses RLS.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your own Supabase project values.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
