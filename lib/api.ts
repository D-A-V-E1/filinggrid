const API_URL =
  typeof window !== "undefined"
    ? "/api/backend"
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  html?: string;
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
  cache_key?: string | null;
  from_cache?: boolean;
}

export interface ParseResponse {
  columns: FilingColumn[];
  section_catalog: { id: string; label: string }[];
  parsed_at: string;
  stateless: boolean;
}

export interface SectionHtmlResponse {
  ticker: string;
  section_id: string;
  html: string;
  cache_key?: string | null;
}

export interface XbrlMetricSeries {
  label: string;
  concept?: string;
  unit?: string;
  annual?: Array<{ fy?: number; value?: number; end?: string }>;
  quarterly?: Array<{ fy?: number; fp?: string; value?: number; end?: string }>;
}

export interface NoteSectionXbrl {
  section_id: string;
  label: string;
  has_data: boolean;
  metrics: Record<string, XbrlMetricSeries>;
  annual_summary: Array<{
    fy: number;
    [key: string]: number | string | undefined;
  }>;
}

export interface FinancialsXbrl {
  ticker: string;
  cik: string;
  entity_name: string;
  fiscal_year_filter: number | null;
  source: string;
  from_cache: boolean;
  fetch_ms?: number;
  annual_summary: Array<{
    fy: number;
    revenue?: number;
    net_income?: number;
    operating_income?: number;
    total_assets?: number;
    total_liabilities?: number;
    stockholders_equity?: number;
    cash?: number;
    eps_diluted?: number;
    [key: string]: number | string | undefined;
  }>;
  metrics?: Record<string, XbrlMetricSeries>;
  notes_xbrl?: Record<string, NoteSectionXbrl>;
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

export interface ParseStreamCallbacks {
  onCatalog: (catalog: { id: string; label: string }[], parsedAt: string) => void;
  onColumn: (column: FilingColumn) => void;
  onDone: (parsedAt: string) => void;
  onError?: (error: Error) => void;
}

export async function parseFilingsStream(
  tickers: string[],
  fiscalYear: number | undefined,
  callbacks: ParseStreamCallbacks
): Promise<void> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/x-ndjson",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/parse/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tickers, fiscal_year: fiscalYear ?? null }),
  });

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

  if (!res.body) {
    throw new Error("Streaming response not supported");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as {
        type: string;
        section_catalog?: { id: string; label: string }[];
        column?: FilingColumn;
        parsed_at?: string;
      };

      if (event.type === "catalog" && event.section_catalog) {
        callbacks.onCatalog(event.section_catalog, event.parsed_at ?? new Date().toISOString());
      } else if (event.type === "column" && event.column) {
        callbacks.onColumn(event.column);
      } else if (event.type === "done") {
        callbacks.onDone(event.parsed_at ?? new Date().toISOString());
      }
    }
  }
}

export async function fetchFinancials(
  ticker: string,
  fiscalYear?: number | null
): Promise<FinancialsXbrl> {
  const params = new URLSearchParams();
  if (fiscalYear != null) params.set("fiscal_year", String(fiscalYear));
  const qs = params.toString();
  return apiFetch<FinancialsXbrl>(
    `/filings/${encodeURIComponent(ticker.toUpperCase())}/financials${qs ? `?${qs}` : ""}`
  );
}

export async function fetchSectionHtml(
  ticker: string,
  sectionId: string,
  fiscalYear?: number | null
): Promise<string> {
  const params = new URLSearchParams({
    ticker: ticker.toUpperCase(),
    section_id: sectionId,
  });
  if (fiscalYear != null) params.set("fiscal_year", String(fiscalYear));

  const result = await apiFetch<SectionHtmlResponse>(`/parse/section?${params}`);
  return result.html;
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
