import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors, radii } from "../lib/theme";

export function Input({
  label,
  testID,
  multiline,
  ...rest
}: TextInputProps & { label?: string; testID?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        testID={testID}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 6, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 48,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
});
