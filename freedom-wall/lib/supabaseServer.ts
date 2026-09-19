import { createClient } from '@supabase/supabase-js';

// SERVER ONLY. Never import this file from a page that runs in the browser.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Full-power client (bypasses the database security rules). Used to save
// submissions and to run the posting job.
export function serviceClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Acts as the logged-in admin, so the database's own admin checks apply.
export function userClient(accessToken: string) {
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
