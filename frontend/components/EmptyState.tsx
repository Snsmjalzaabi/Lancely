import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radii, spacing, type, useTheme, type ColorPalette } from "../lib/theme";

export function EmptyState({
  icon = "sparkles-outline",
  title,
  subtitle,
  actionLabel,
  onAction,
  testID,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.btn} onPress={onAction} testID={`${testID ?? "empty"}-action`}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  wrap: { alignItems: "center", padding: spacing.xl, gap: 8 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: { ...type.h3, color: colors.textPrimary, textAlign: "center" },
  subtitle: { ...type.body, color: colors.textSecondary, textAlign: "center", maxWidth: 280 },
  btn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radii.md,
  },
  btnText: { color: colors.textInverse, fontWeight: "600", fontSize: 14 },
});
