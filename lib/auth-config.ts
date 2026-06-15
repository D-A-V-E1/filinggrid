/** True when Supabase env vars are set to real values (not placeholders). */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return (
    url.length > 0 &&
    key.length > 0 &&
    !url.includes("your-project") &&
    !key.includes("your-anon")
  );
}
