import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appendQueryParam, sanitizeReturnPath } from "@/lib/auth-redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeReturnPath(searchParams.get("next"), "/");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = appendQueryParam(next, "auth", "success");
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth=error`);
}
