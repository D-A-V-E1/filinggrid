import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { appendQueryParam, sanitizeReturnPath } from "@/lib/auth-redirect";
import { isSupabaseConfigured } from "@/lib/auth-config";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeReturnPath(searchParams.get("next"), "/");
  const destination = appendQueryParam(next, "auth", "success");

  if (!code || !isSupabaseConfigured()) {
    const errParams = new URLSearchParams({ auth: "error" });
    const errorCode = searchParams.get("error_code");
    if (errorCode) errParams.set("error_code", errorCode);
    return NextResponse.redirect(`${origin}/?${errParams.toString()}`);
  }

  let response = NextResponse.redirect(`${origin}${destination}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.redirect(`${origin}${destination}`);
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.redirect(`${origin}${destination}`);
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const errParams = new URLSearchParams({ auth: "error" });
    if (error.code) errParams.set("error_code", error.code);
    return NextResponse.redirect(`${origin}/?${errParams.toString()}`);
  }

  return response;
}
