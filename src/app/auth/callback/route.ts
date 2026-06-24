import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Magic-link landing route. Supabase appends a `code` we exchange for a
// session cookie, then we send the user to the board.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — bounce back to login with a flag.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
