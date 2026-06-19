import { getDevTierForApiHeader } from "@/lib/dev-tier";

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
  anchor?: string | null;
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
  primary_document?: string | null;
  filing_url?: string | null;
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
  text?: string;
  cache_key?: string | null;
}

export interface XbrlMetricSeries {
  label: string;
  concept?: string;
  unit?: string;
  annual?: Array<{ fy?: number; value?: number; end?: string }>;
  quarterly?: Array<{ fy?: number; fp?: string; value?: number; end?: string }>;
}

export interface XbrlDisclosure {
  key: string;
  label: string;
  concept: string;
  text: string;
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
  disclosures?: XbrlDisclosure[];
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

export interface StatementRow {
  key: string;
  label: string;
  concept: string;
  unit?: string;
  value: number;
  fy?: number;
  fp?: string;
  end?: string;
  form?: string;
}

export interface StatementTable {
  label: string;
  rows: StatementRow[];
}

export interface FinancialStatementsXbrl {
  ticker: string;
  cik: string;
  entity_name: string;
  fiscal_year_filter: number | null;
  period_filter: string | null;
  source: string;
  from_cache: boolean;
  fetch_ms?: number;
  period: {
    kind?: string | null;
    fy?: number;
    fp?: string;
    end?: string;
    form?: string;
  };
  statements: {
    income_statement: StatementTable;
    balance_sheet: StatementTable;
    cash_flow: StatementTable;
    stockholders_equity: StatementTable;
  };
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

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/** User-facing message from an API error. */
export function formatApiError(err: unknown, fallback = "Request failed"): string {
  if (err instanceof ApiError) {
    if (typeof err.detail === "object" && err.detail !== null && "message" in err.detail) {
      return String(err.detail.message);
    }
    if (typeof err.detail === "string" && err.detail.trim()) {
      return err.detail;
    }
    if (err.isUnauthorized) {
      return "Sign in to save and load peer groups.";
    }
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

let _authTokenCache: { token: string | null; expiresAt: number } | null = null;
let _authTokenInflight: Promise<string | null> | null = null;
const AUTH_TOKEN_TTL_MS = 30_000;

/** Warm auth token cache before first API call (avoids serial delay on compare load). */
export function prefetchAuthToken(): void {
  if (typeof window === "undefined") return;
  void getAuthToken();
}

/** Drop cached JWT so the next API call reflects the current Supabase session. */
export function clearAuthTokenCache(): void {
  _authTokenCache = null;
  _authTokenInflight = null;
}

async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const now = Date.now();
  if (_authTokenCache && now < _authTokenCache.expiresAt) {
    return _authTokenCache.token;
  }
  if (_authTokenInflight) return _authTokenInflight;

  _authTokenInflight = (async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      _authTokenCache = { token, expiresAt: Date.now() + AUTH_TOKEN_TTL_MS };
      return token;
    } catch {
      return null;
    } finally {
      _authTokenInflight = null;
    }
  })();

  return _authTokenInflight;
}

async function buildAuthHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const devTier = getDevTierForApiHeader();
  if (devTier) {
    headers["X-Dev-Tier"] = devTier;
  }

  return headers;
}

/** Public GET without waiting on Supabase session (e.g. ticker autocomplete). */
export async function apiFetchPublic<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Accept: "application/json" },
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

  return res.json();
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await buildAuthHeaders(options.headers as Record<string, string>);

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
  onColumnMeta?: (column: FilingColumn) => void;
  onColumn: (column: FilingColumn) => void;
  onDone: (parsedAt: string) => void;
  onError?: (error: Error) => void;
}

export async function parseFilingsStream(
  tickers: string[],
  fiscalYear: number | undefined,
  callbacks: ParseStreamCallbacks,
  period?: string
): Promise<void> {
  const headers = await buildAuthHeaders({ Accept: "application/x-ndjson" });

  const res = await fetch(`${API_URL}/parse/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tickers,
      fiscal_year: fiscalYear ?? null,
      period: period ?? null,
    }),
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
      } else if (event.type === "column_meta" && event.column) {
        callbacks.onColumnMeta?.(event.column);
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
  fiscalYear?: number | null,
  options?: { headlineOnly?: boolean; period?: string }
): Promise<FinancialsXbrl> {
  const params = new URLSearchParams();
  if (fiscalYear != null) params.set("fiscal_year", String(fiscalYear));
  if (options?.period) params.set("period", options.period);
  if (options?.headlineOnly) params.set("headline_only", "true");
  const qs = params.toString();
  return apiFetch<FinancialsXbrl>(
    `/filings/${encodeURIComponent(ticker.toUpperCase())}/financials${qs ? `?${qs}` : ""}`
  );
}

export async function fetchFinancialStatements(
  ticker: string,
  fiscalYear?: number | null,
  period?: string | null
): Promise<FinancialStatementsXbrl> {
  const params = new URLSearchParams();
  if (fiscalYear != null) params.set("fiscal_year", String(fiscalYear));
  if (period) params.set("period", period);
  const qs = params.toString();
  return apiFetch<FinancialStatementsXbrl>(
    `/filings/${encodeURIComponent(ticker.toUpperCase())}/financials/statements${qs ? `?${qs}` : ""}`
  );
}

export interface FinancialsBatchCallbacks {
  onStart?: (tickers: string[]) => void;
  onFinancial: (ticker: string, financials: FinancialsXbrl) => void;
  onError?: (ticker: string, message: string) => void;
  onDone: () => void;
}

async function fetchFinancialsPerTicker(
  tickers: string[],
  fiscalYear: number | undefined,
  options: { headlineOnly?: boolean },
  callbacks: FinancialsBatchCallbacks
): Promise<void> {
  const ordered = tickers.map((t) => t.toUpperCase()).filter(Boolean);
  const unique = Array.from(new Set(ordered));
  callbacks.onStart?.(unique);

  await Promise.all(
    unique.map(async (ticker) => {
      try {
        const financials = await fetchFinancials(ticker, fiscalYear, options);
        callbacks.onFinancial(financials.ticker || ticker, financials);
      } catch (err) {
        callbacks.onError?.(
          ticker,
          err instanceof Error ? err.message : "Failed to load financials"
        );
      }
    })
  );

  callbacks.onDone();
}

/** Stream headline/full financials for multiple tickers in one request (shared ticker map). */
export async function fetchFinancialsBatch(
  tickers: string[],
  fiscalYear: number | undefined,
  options: { headlineOnly?: boolean; period?: string },
  callbacks: FinancialsBatchCallbacks
): Promise<void> {
  const headers = await buildAuthHeaders({ Accept: "application/x-ndjson" });

  const res = await fetch(`${API_URL}/filings/financials/batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tickers: tickers.map((t) => t.toUpperCase()),
      fiscal_year: fiscalYear ?? null,
      period: options.period ?? null,
      headline_only: options.headlineOnly ?? false,
    }),
  });

  if (!res.ok) {
    let detail: PaywallError | string | Record<string, unknown> = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? body;
    } catch {
      /* ignore */
    }
    const err = new ApiError(res.status, detail);
    // Fall back when batch is unavailable or tier-gated on aggregate ticker count.
    if (err.status === 404 || err.status === 405 || err.status === 402) {
      await fetchFinancialsPerTicker(tickers, fiscalYear, options, callbacks);
      return;
    }
    throw err;
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
        tickers?: string[];
        ticker?: string;
        financials?: FinancialsXbrl;
        message?: string;
      };

      if (event.type === "start" && event.tickers) {
        callbacks.onStart?.(event.tickers);
      } else if (event.type === "financial" && event.ticker && event.financials) {
        callbacks.onFinancial(event.ticker, event.financials);
      } else if (event.type === "error" && event.ticker) {
        callbacks.onError?.(event.ticker, event.message ?? "Failed to load financials");
      } else if (event.type === "done") {
        callbacks.onDone();
      }
    }
  }
}

export async function fetchSectionHtml(
  ticker: string,
  sectionId: string,
  fiscalYear?: number | null
): Promise<string> {
  const params = new URLSearchParams({
    ticker: ticker.toUpperCase(),
    section_id: sectionId,
    format: "html",
  });
  if (fiscalYear != null) params.set("fiscal_year", String(fiscalYear));

  const result = await apiFetch<SectionHtmlResponse>(`/parse/section?${params}`);
  return result.html;
}

export async function fetchSectionText(
  ticker: string,
  sectionId: string,
  fiscalYear?: number | null
): Promise<string> {
  const params = new URLSearchParams({
    ticker: ticker.toUpperCase(),
    section_id: sectionId,
    format: "text",
  });
  if (fiscalYear != null) params.set("fiscal_year", String(fiscalYear));

  const result = await apiFetch<SectionHtmlResponse>(`/parse/section?${params}`);
  return result.text ?? "";
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

export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}

export async function createCheckout(options?: {
  email?: string;
  returnPath?: string;
}): Promise<{ checkout_url: string }> {
  return apiFetch("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({
      email: options?.email,
      return_path: options?.returnPath,
    }),
  });
}

export async function createPortal(returnPath?: string): Promise<{ portal_url: string }> {
  return apiFetch("/billing/portal", {
    method: "POST",
    body: JSON.stringify({ return_path: returnPath }),
  });
}

export interface PeerGroup {
  id: string;
  group_name: string;
  tickers_list: string[];
}

export interface FilingPeriodOption {
  id: string;
  kind: "annual" | "interim";
  fiscal_year: number;
  fp?: string | null;
  period_end?: string | null;
  report_date?: string | null;
  form: string;
  label: string;
  filing_date?: string | null;
}

export async function fetchFilingPeriods(tickers: string[]): Promise<FilingPeriodOption[]> {
  const q = tickers.map((t) => t.toUpperCase()).join(",");
  return apiFetch<FilingPeriodOption[]>(`/filings/periods?tickers=${encodeURIComponent(q)}`);
}

export async function listPeerGroups(): Promise<PeerGroup[]> {
  return apiFetch<PeerGroup[]>("/peer-groups");
}

export async function createPeerGroup(
  groupName: string,
  tickers: string[]
): Promise<PeerGroup> {
  return apiFetch<PeerGroup>("/peer-groups", {
    method: "POST",
    body: JSON.stringify({
      group_name: groupName,
      tickers_list: tickers.map((t) => t.toUpperCase()),
    }),
  });
}

export async function deletePeerGroup(groupId: string): Promise<void> {
  await apiFetch<{ status: string }>(`/peer-groups/${groupId}`, { method: "DELETE" });
}

export async function searchTickers(q: string): Promise<{ ticker: string; company_name: string }[]> {
  return apiFetchPublic(`/tickers/search?q=${encodeURIComponent(q)}&limit=8`);
}
