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
    return NextResponse.redirect(`${origin}/?auth=error`);
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
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  return response;
}
