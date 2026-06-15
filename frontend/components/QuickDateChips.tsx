import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useTheme, type ColorPalette } from "../lib/theme";

const PRESETS = [
  { key: "7d", label: "Last 7d" },
  { key: "30d", label: "Last 30d" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

function rangeFor(key: string): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (key === "all") return { from: "", to: "" };
  if (key === "7d") {
    const a = new Date(today);
    a.setDate(a.getDate() - 7);
    return { from: iso(a), to: iso(today) };
  }
  if (key === "30d") {
    const a = new Date(today);
    a.setDate(a.getDate() - 30);
    return { from: iso(a), to: iso(today) };
  }
  if (key === "month") {
    const a = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: iso(a), to: iso(today) };
  }
  if (key === "year") {
    const a = new Date(today.getFullYear(), 0, 1);
    return { from: iso(a), to: iso(today) };
  }
  return { from: "", to: "" };
}

export function QuickDateChips({
  value,
  onChange,
  testIdPrefix = "quick-chip",
}: {
  value: { from: string; to: string };
  onChange: (next: { from: string; to: string }, presetKey: string) => void;
  testIdPrefix?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const activeKey = (() => {
    for (const p of PRESETS) {
      const r = rangeFor(p.key);
      if (r.from === value.from && r.to === value.to) return p.key;
    }
    return null;
  })();

  return (
    <View style={styles.row}>
      {PRESETS.map((p) => {
        const active = activeKey === p.key;
        return (
          <TouchableOpacity
            key={p.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(rangeFor(p.key), p.key)}
            testID={`${testIdPrefix}-${p.key}`}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.textSecondary, fontWeight: "600", fontSize: 11 },
    chipTextActive: { color: colors.textInverse },
  });
