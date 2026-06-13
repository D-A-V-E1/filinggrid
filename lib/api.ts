const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface AuthMe {
  email: string | null;
  tier: string;
  is_authenticated: boolean;
  limits: {
    max_columns: number;
    historical: boolean;
    current_year_only: boolean;
  };
  organization_id: string | null;
}

export interface FilingSection {
  id: string;
  label: string;
  heading: string;
  html: string;
  text_preview: string;
}

export interface FilingColumn {
  ticker: string;
  company_name: string;
  cik: string;
  form: string | null;
  filing_date: string | null;
  report_date: string | null;
  fiscal_year: number | null;
  sections: FilingSection[];
  error: string | null;
}

export interface ParseResponse {
  columns: FilingColumn[];
  section_catalog: { id: string; label: string }[];
  parsed_at: string;
  stateless: boolean;
}

export interface PaywallError {
  code: string;
  reason: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  detail: PaywallError | string | Record<string, unknown>;

  constructor(status: number, detail: PaywallError | string | Record<string, unknown>) {
    super(typeof detail === "object" && "message" in detail ? String(detail.message) : String(detail));
    this.status = status;
    this.detail = detail;
  }

  get isPaywall(): boolean {
    return this.status === 402;
  }
}

async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail: PaywallError | string | Record<string, unknown> = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? body;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }

  return res.json();
}

export async function parseFilings(
  tickers: string[],
  fiscalYear?: number
): Promise<ParseResponse> {
  return apiFetch<ParseResponse>("/parse", {
    method: "POST",
    body: JSON.stringify({ tickers, fiscal_year: fiscalYear ?? null }),
  });
}

export async function getAuthMe(): Promise<AuthMe> {
  return apiFetch<AuthMe>("/auth/me");
}

export async function createCheckout(email?: string): Promise<{ checkout_url: string }> {
  return apiFetch("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function createPortal(): Promise<{ portal_url: string }> {
  return apiFetch("/billing/portal", { method: "POST" });
}

export async function searchTickers(q: string): Promise<{ ticker: string; company_name: string }[]> {
  return apiFetch(`/tickers/search?q=${encodeURIComponent(q)}&limit=8`);
}
