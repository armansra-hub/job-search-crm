"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

// Sends a magic link to the given email. Single-user app, but we still go
// through real Supabase Auth so sessions sync across machines (cookie-based).
export async function sendMagicLink(
  _prev: { ok: boolean; message: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const email = String(formData.get("email") || "").trim();
  if (!email) {
    return { ok: false, message: "Enter your email." };
  }

  const supabase = createClient();

  // Prefer the configured site URL; fall back to the request origin so this
  // works on localhost and on Vercel without code changes.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    headers().get("origin") ||
    "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }
  return {
    ok: true,
    message: `Magic link sent to ${email}. Check your inbox and click it to sign in.`,
  };
}
