// web/src/lib/format.ts

/** Format number as Malaysian Ringgit, e.g. "RM 1,234.56" */
export const fmtRM = (v: number) =>
    new Intl.NumberFormat("ms-MY", {
      style: "currency",
      currency: "MYR",
      minimumFractionDigits: 2,
    }).format(Number.isFinite(v) ? v : 0);
  
  /** Generic money formatter for any currency/locale */
  export const fmtMoney = (v: number, currency = "MYR", locale: string | undefined = "ms-MY") =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(Number.isFinite(v) ? v : 0);
  
  /** Pull amount+currency from any booking/payment row (handles *_cents or unit amounts) */
  export function pickAmountAndCurrency(row: any): { amount: number; currency: string } {
    if (!row || typeof row !== "object") return { amount: 0, currency: "MYR" };
  
    // Prefer cents columns when present
    if (row.total_cents != null) return { amount: Number(row.total_cents) / 100, currency: String(row.currency || "MYR").toUpperCase() };
    if (row.amount_cents != null) return { amount: Number(row.amount_cents) / 100, currency: String(row.currency || "MYR").toUpperCase() };
  
    // Fall back to unit-amount columns
    if (row.total_amount != null) return { amount: Number(row.total_amount), currency: String(row.currency || "MYR").toUpperCase() };
    if (row.amount != null) return { amount: Number(row.amount), currency: String(row.currency || "MYR").toUpperCase() };
  
    return { amount: 0, currency: String(row.currency || "MYR").toUpperCase() };
  }
  
  /** Format any row’s price using its currency (defaults to MYR if unknown) */
  export function fmtAnyAmount(row: any): string {
    const { amount, currency } = pickAmountAndCurrency(row);
    try {
      // Use Malaysian locale when currency is MYR; otherwise let the browser pick a sensible default
      const locale = currency === "MYR" ? "ms-MY" : undefined;
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
      }).format(Number.isFinite(amount) ? amount : 0);
    } catch {
      // Fallback if Intl lacks the currency code
      return fmtRM(amount);
    }
  }
  
  /** Default export kept for flexibility */
  export default fmtRM;
  