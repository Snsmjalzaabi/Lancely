// Lancely design tokens + theme provider.
// Four distinct themes: white, black, blue, amethyst. Selection persists across app launches.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { StatusBarStyle } from "expo-status-bar";
import { useColorScheme } from "react-native";

import { storage } from "@/src/utils/storage";
import { useSettings } from "./settings";

export type ColorPalette = {
  bg: string;
  bgAlt: string;
  surface: string;

  primary: string;
  primaryHover: string;
  // Foreground (text/icon) color when placed on top of `primary`.
  textInverse: string;
  // Muted foreground on top of `primary` (e.g. sub-labels inside the hero card).
  onPrimaryMuted: string;
  // Subtle border/divider used on top of `primary` (e.g. inside hero card).
  onPrimaryBorder: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  border: string;
  borderFocus: string;

  // Tab bar
  tabInactive: string;

  // Status pills
  successBg: string;
  successText: string;
  warningBg: string;
  warningText: string;
  errorBg: string;
  errorText: string;
  infoBg: string;
  infoText: string;

  // Status bar tint
  statusBar: StatusBarStyle;
};

export type ThemeKey = "system" | "white" | "black" | "blue" | "amethyst";
export type ConcreteThemeKey = Exclude<ThemeKey, "system">;

export type ThemeDef = {
  key: ConcreteThemeKey;
  label: string;
  hint: string;
  swatch: string; // dot color shown in the picker
  isDark: boolean;
  colors: ColorPalette;
};

export type PickerOption = {
  key: ThemeKey;
  label: string;
  hint: string;
  swatch: string; // single-color dot
  swatchAlt?: string; // second color for split swatch (used by "system")
};

// ---- Theme palettes ----

const white: ThemeDef = {
  key: "white",
  label: "White",
  hint: "Clean & minimal",
  swatch: "#0F172A",
  isDark: false,
  colors: {
    bg: "#FFFFFF",
    bgAlt: "#F4F5F7",
    surface: "#FFFFFF",
    primary: "#0F172A",
    primaryHover: "#1E293B",
    textInverse: "#FFFFFF",
    onPrimaryMuted: "#94A3B8",
    onPrimaryBorder: "rgba(255,255,255,0.18)",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#94A3B8",
    border: "#E2E8F0",
    borderFocus: "#0F172A",
    tabInactive: "#94A3B8",
    successBg: "#DCFCE7",
    successText: "#14532D",
    warningBg: "#FEF3C7",
    warningText: "#92400E",
    errorBg: "#FEE2E2",
    errorText: "#991B1B",
    infoBg: "#DBEAFE",
    infoText: "#1E40AF",
    statusBar: "dark",
  },
};

const black: ThemeDef = {
  key: "black",
  label: "Black",
  hint: "Bold & dark",
  swatch: "#0A0A0A",
  isDark: true,
  colors: {
    bg: "#0A0A0A",
    bgAlt: "#16171B",
    surface: "#111114",
    primary: "#FAFAFA",
    primaryHover: "#E4E4E7",
    textInverse: "#0A0A0A",
    onPrimaryMuted: "#52525B",
    onPrimaryBorder: "rgba(0,0,0,0.12)",
    textPrimary: "#FAFAFA",
    textSecondary: "#A1A1AA",
    textMuted: "#71717A",
    border: "#27272A",
    borderFocus: "#FAFAFA",
    tabInactive: "#52525B",
    successBg: "rgba(74,222,128,0.14)",
    successText: "#86EFAC",
    warningBg: "rgba(251,191,36,0.14)",
    warningText: "#FCD34D",
    errorBg: "rgba(248,113,113,0.14)",
    errorText: "#FCA5A5",
    infoBg: "rgba(96,165,250,0.14)",
    infoText: "#93C5FD",
    statusBar: "light",
  },
};

const blue: ThemeDef = {
  key: "blue",
  label: "Blue",
  hint: "Calm & corporate",
  swatch: "#2563EB",
  isDark: false,
  colors: {
    bg: "#F4F7FB",
    bgAlt: "#E6EEF9",
    surface: "#FFFFFF",
    primary: "#2563EB",
    primaryHover: "#1D4ED8",
    textInverse: "#FFFFFF",
    onPrimaryMuted: "#BFDBFE",
    onPrimaryBorder: "rgba(255,255,255,0.22)",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#94A3B8",
    border: "#DBE3F1",
    borderFocus: "#2563EB",
    tabInactive: "#94A3B8",
    successBg: "#DCFCE7",
    successText: "#14532D",
    warningBg: "#FEF3C7",
    warningText: "#92400E",
    errorBg: "#FEE2E2",
    errorText: "#991B1B",
    infoBg: "#DBEAFE",
    infoText: "#1E40AF",
    statusBar: "dark",
  },
};

const amethyst: ThemeDef = {
  key: "amethyst",
  label: "Amethyst",
  hint: "Creative & vivid",
  swatch: "#A855F7",
  isDark: true,
  colors: {
    bg: "#0F0A1F",
    bgAlt: "#1A1235",
    surface: "#1B1438",
    primary: "#A855F7",
    primaryHover: "#C084FC",
    textInverse: "#FFFFFF",
    onPrimaryMuted: "#DDD6FE",
    onPrimaryBorder: "rgba(255,255,255,0.18)",
    textPrimary: "#F5F3FF",
    textSecondary: "#C4B5FD",
    textMuted: "#8B7AB8",
    border: "#2E2050",
    borderFocus: "#A855F7",
    tabInactive: "#6D5994",
    successBg: "rgba(74,222,128,0.14)",
    successText: "#86EFAC",
    warningBg: "rgba(251,191,36,0.14)",
    warningText: "#FCD34D",
    errorBg: "rgba(248,113,113,0.14)",
    errorText: "#FCA5A5",
    infoBg: "rgba(96,165,250,0.14)",
    infoText: "#93C5FD",
    statusBar: "light",
  },
};

export const THEMES: Record<ConcreteThemeKey, ThemeDef> = { white, black, blue, amethyst };
export const THEME_LIST: ThemeDef[] = [white, black, blue, amethyst];

// Picker entries (includes the synthetic "system" option).
export const PICKER_OPTIONS: PickerOption[] = [
  { key: "system", label: "System", hint: "Follows your device", swatch: "#FFFFFF", swatchAlt: "#0A0A0A" },
  { key: "white", label: white.label, hint: white.hint, swatch: white.swatch },
  { key: "black", label: black.label, hint: black.hint, swatch: black.swatch },
  { key: "blue", label: blue.label, hint: blue.hint, swatch: blue.swatch },
  { key: "amethyst", label: amethyst.label, hint: amethyst.hint, swatch: amethyst.swatch },
];

// ---- Static (theme-independent) tokens ----

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radii = { sm: 6, md: 12, lg: 16, xl: 24, full: 999 };
export const shadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
} as const;
export const type = {
  h1: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const },
  bodyLg: { fontSize: 16, lineHeight: 22, fontWeight: "500" as const },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "600" as const, letterSpacing: 0.5 },
};

// ---- Provider ----

type ThemeContextValue = {
  theme: ThemeDef;
  themeKey: ThemeKey; // stored preference (may be "system")
  resolvedKey: ConcreteThemeKey; // active palette key after resolution
  colors: ColorPalette;
  setTheme: (key: ThemeKey) => void;
  setAccentOverride: (hex: string | null) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = "lancely_theme";

const VALID_KEYS: ThemeKey[] = ["system", "white", "black", "blue", "amethyst"];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKey] = useState<ThemeKey>("system");
  const [accentOverride, setAccentOverride] = useState<string | null>(null);
  const systemScheme = useColorScheme();

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(STORAGE_KEY, "system");
      if (saved && (VALID_KEYS as string[]).includes(saved)) {
        setThemeKey(saved as ThemeKey);
      }
    })();
  }, []);

  const setTheme = useCallback((key: ThemeKey) => {
    setThemeKey(key);
    storage.setItem(STORAGE_KEY, key);
  }, []);

  const resolvedKey: ConcreteThemeKey = useMemo(() => {
    if (themeKey === "system") {
      return systemScheme === "dark" ? "black" : "white";
    }
    return themeKey;
  }, [themeKey, systemScheme]);

  const value = useMemo<ThemeContextValue>(() => {
    const base = THEMES[resolvedKey];
    const palette: ColorPalette = accentOverride
      ? { ...base.colors, primary: accentOverride, primaryHover: accentOverride, borderFocus: accentOverride }
      : base.colors;
    return {
      theme: { ...base, colors: palette },
      themeKey,
      resolvedKey,
      colors: palette,
      setTheme,
      setAccentOverride,
    };
  }, [themeKey, resolvedKey, accentOverride, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Reads accent_color from user settings and pushes it into ThemeProvider. */
export function useApplyAccentFromSettings() {
  const { settings } = useSettings();
  const { setAccentOverride } = useTheme();
  useEffect(() => {
    setAccentOverride(settings.accent_color ?? null);
  }, [settings.accent_color, setAccentOverride]);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
