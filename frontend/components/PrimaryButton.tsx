import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii } from "../lib/theme";

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  testID,
  leftIcon,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  testID?: string;
  leftIcon?: React.ReactNode;
}) {
  const isDisabled = !!disabled || !!loading;
  const styleByVariant =
    variant === "secondary"
      ? styles.secondary
      : variant === "danger"
        ? styles.danger
        : styles.primary;
  const textByVariant =
    variant === "secondary" ? styles.secondaryText : styles.primaryText;
  return (
    <TouchableOpacity
      style={[styles.base, styleByVariant, isDisabled && styles.disabled]}
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={variant === "secondary" ? colors.textPrimary : colors.textInverse} />
      ) : (
        <View style={styles.row}>
          {leftIcon}
          <Text style={textByVariant}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.bgAlt, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.errorBg, borderWidth: 1, borderColor: colors.errorText },
  disabled: { opacity: 0.5 },
  primaryText: { color: colors.textInverse, fontWeight: "600", fontSize: 15 },
  secondaryText: { color: colors.textPrimary, fontWeight: "600", fontSize: 15 },
});
