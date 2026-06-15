import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { radii, useTheme, type ColorPalette } from "../lib/theme";

type Tone = "success" | "warning" | "error" | "info" | "neutral";

const getToneMap = (colors: ColorPalette): Record<Tone, { bg: string; text: string }> => ({
  success: { bg: colors.successBg, text: colors.successText },
  warning: { bg: colors.warningBg, text: colors.warningText },
  error: { bg: colors.errorBg, text: colors.errorText },
  info: { bg: colors.infoBg, text: colors.infoText },
  neutral: { bg: colors.bgAlt, text: colors.textSecondary },
});

export function StatusBadge({ label, tone = "neutral", testID }: { label: string; tone?: Tone; testID?: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const t = getToneMap(colors)[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]} testID={testID}>
      <Text style={[styles.text, { color: t.text }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function invoiceTone(status: string): Tone {
  if (status === "paid") return "success";
  if (status === "overdue") return "error";
  if (status === "partial") return "info";
  return "warning";
}

export function quoteTone(status: string): Tone {
  if (status === "accepted") return "success";
  if (status === "rejected") return "error";
  if (status === "sent") return "info";
  return "neutral";
}

export function projectTone(status: string): Tone {
  if (status === "completed") return "success";
  if (status === "review") return "info";
  if (status === "in_progress") return "warning";
  return "neutral";
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  text: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
});
