import { useSettings } from "./settings";

// Active currency is held at the module level so legacy `fmtAED(...)` calls automatically
// reflect the user's chosen currency once SettingsProvider has loaded it.
let activeCurrency = "AED";

export function setActiveCurrency(code: string) {
  if (code && typeof code === "string") activeCurrency = code;
}

export function fmtCurrency(value: number | null | undefined, code?: string): string {
  const n = typeof value === "number" ? value : 0;
  const c = code || activeCurrency;
  return `${c} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function useFmtCurrency() {
  const { settings } = useSettings();
  const code = settings.currency || "AED";
  return (value: number | null | undefined) => fmtCurrency(value, code);
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateShort(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function daysFromNow(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  const diff = d.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Backwards-compat alias used across the app prior to settings being added.
export const fmtAED = (v: number | null | undefined) => fmtCurrency(v);
