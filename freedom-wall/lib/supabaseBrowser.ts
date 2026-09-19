import { createClient } from '@supabase/supabase-js';

// Runs in the browser. Uses only the PUBLIC key, so it can do nothing the
// database's security rules don't allow.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
