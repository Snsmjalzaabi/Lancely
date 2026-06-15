// Solvio design tokens — sourced from /app/design_guidelines.json (Organic & Earthy light theme).

export const colors = {
  bg: "#F9F9F6",
  bgAlt: "#F0F0EB",
  surface: "#FFFFFF",
  primary: "#2C5545",
  primaryHover: "#1E3F20",
  secondary: "#D1D5CB",
  textPrimary: "#1A1C19",
  textSecondary: "#5E635C",
  textMuted: "#8A8F86",
  textInverse: "#FFFFFF",
  border: "#E5E5E0",
  borderFocus: "#2C5545",

  successBg: "#E8F3E9",
  successText: "#1E3F20",
  warningBg: "#FFF4E5",
  warningText: "#B36B00",
  errorBg: "#FCECEC",
  errorText: "#A94438",
  infoBg: "#E5F0F9",
  infoText: "#1A5C87",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radii = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const shadow = {
  shadowColor: "#1A1C19",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
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
