import { format as fmt } from "date-fns";

export function formatMoney(amount: number | string | null | undefined, currency = "YER", locale = "ar") {
  const n = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar" : "en", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n || 0);
  } catch {
    return `${(n || 0).toFixed(2)} ${currency}`;
  }
}

export function formatNumber(n: number | string | null | undefined, locale = "ar") {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return new Intl.NumberFormat(locale === "ar" ? "ar" : "en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0);
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return "";
  try {
    return fmt(new Date(date), "yyyy-MM-dd");
  } catch {
    return "";
  }
}