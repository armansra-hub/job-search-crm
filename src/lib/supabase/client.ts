"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Uses ONLY the public anon key + the logged-in
// user's session cookie. Never touches the service-role key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
