import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

// Shared helpers for the JSON route handlers under /api/*.

export async function requireUser(): Promise<
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  return { ok: true, supabase, user };
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

// Confirm the application belongs to the current user (defense in depth on top
// of RLS — gives a clean 404 instead of a silent empty update).
export async function ownsApplication(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .maybeSingle();
  return !!data;
}
