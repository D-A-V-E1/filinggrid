function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^TODO(_|$)/i.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return lower.includes("your-project") || lower.includes("your-anon");
}

/** True when Supabase env vars are set to real values (not placeholders). */
export function isSupabaseConfigured(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !key) return false;
  if (isPlaceholderValue(url) || isPlaceholderValue(key)) return false;
  if (!isValidHttpUrl(url)) return false;
  return true;
}

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable sb_publishable_... or legacy anon key) in .env (see .env.example).";
