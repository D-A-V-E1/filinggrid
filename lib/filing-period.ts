/** Filing period URL helpers for 10-K / 10-Q / 20-F / 6-K compare. */

export interface ComparePeriod {
  fiscalYear?: number;
  period?: string;
}

export const CURRENT_YEAR = new Date().getFullYear();

export function annualPeriodId(year: number): string {
  return `annual-${year}`;
}

export function resolveComparePeriod(yearParam?: string, periodParam?: string): ComparePeriod {
  if (periodParam?.trim()) {
    const period = periodParam.trim();
    return {
      period,
      fiscalYear: fiscalYearFromPeriod(period),
    };
  }
  if (yearParam) {
    const year = parseInt(yearParam, 10);
    if (!Number.isNaN(year)) {
      return { fiscalYear: year };
    }
  }
  return {};
}

export function fiscalYearFromPeriod(period?: string, fiscalYear?: number): number | undefined {
  if (fiscalYear != null) return fiscalYear;
  if (!period) return undefined;
  if (period.startsWith("annual-")) {
    const year = parseInt(period.slice("annual-".length), 10);
    return Number.isNaN(year) ? undefined : year;
  }
  if (period.startsWith("interim-")) {
    const rest = period.slice("interim-".length);
    const year = parseInt(rest.slice(0, 4), 10);
    return Number.isNaN(year) ? undefined : year;
  }
  return undefined;
}

export function buildCompareSearchParams(period: ComparePeriod): URLSearchParams {
  const params = new URLSearchParams();
  const periodId = period.period;
  const year = period.fiscalYear ?? CURRENT_YEAR;

  if (periodId?.startsWith("interim-")) {
    params.set("period", periodId);
    return params;
  }

  if (year < CURRENT_YEAR) {
    params.set("year", String(year));
  }
  if (periodId && periodId !== annualPeriodId(CURRENT_YEAR)) {
    params.set("period", periodId);
  }
  return params;
}

export function comparePathWithPeriod(slug: string, period: ComparePeriod): string {
  const params = buildCompareSearchParams(period);
  const query = params.toString();
  return query ? `/compare/${slug}?${query}` : `/compare/${slug}`;
}

export function parseMetaPeriodKey(period?: ComparePeriod): string {
  if (period?.period) return period.period;
  if (period?.fiscalYear != null) return annualPeriodId(period.fiscalYear);
  return "current";
}

export function normalizeComparePeriodId(period?: string | null): string | null {
  if (!period) return null;
  const interim = period.match(/^interim-(\d{4})-(Q[1-4])(?:-.+)?$/i);
  if (interim) return `interim-${interim[1]}-${interim[2].toUpperCase()}`;
  if (/^annual-\d{4}-20f$/i.test(period)) return period.replace(/-20f$/i, "");
  return period;
}

/** Infer filing form from a period id when column metadata is missing (e.g. stale cache). */
export function formFromPeriodId(period?: string): string | null {
  if (!period) return null;
  if (period.startsWith("interim-")) {
    const slotMatch = period.match(/interim-\d{4}-(Q[1-4])-(.+)$/i);
    return slotMatch ? slotMatch[2].toUpperCase() : null;
  }
  if (period.includes("-20f")) return "20-F";
  if (period.startsWith("annual-")) return null;
  return null;
}

export function displayFormLabel(form: string): string {
  return form.replace(/\/A$/i, "");
}

/** Align /parse/section query params with the active compare period (not per-column FY). */
export function sectionHtmlRequestParams(
  comparePeriod?: string | null,
  compareFiscalYear?: number | null
): { fiscalYear: number | null; period: string | null } {
  const periodId = comparePeriod?.trim() || null;
  const compareFy = compareFiscalYear ?? null;

  if (!periodId && compareFy == null) {
    return { fiscalYear: null, period: null };
  }

  return {
    fiscalYear: compareFy,
    period: periodId,
  };
}
