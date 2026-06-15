import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { THEME_LIST, useTheme, radii, type ColorPalette, type ThemeKey } from "../lib/theme";

export function ThemePickerTrigger() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const styles = makeTriggerStyles(colors);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={styles.iconBtn}
        testID="theme-picker-trigger"
      >
        <Ionicons name="color-palette-outline" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <ThemePickerSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ThemePickerSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { themeKey, setTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeSheetStyles(colors);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="theme-picker-backdrop" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="theme-picker-sheet">
        <View style={styles.handle} />
        <Text style={styles.title}>Theme</Text>
        <Text style={styles.subtitle}>Pick a vibe. Saved instantly.</Text>
        <View style={styles.grid}>
          {THEME_LIST.map((t) => {
            const active = themeKey === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tile, active && styles.tileActive]}
                onPress={() => {
                  setTheme(t.key as ThemeKey);
                  onClose();
                }}
                testID={`theme-option-${t.key}`}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.preview,
                    { backgroundColor: t.colors.bg, borderColor: t.colors.border },
                  ]}
                >
                  <View style={[styles.previewBar, { backgroundColor: t.colors.primary }]} />
                  <View style={[styles.previewLine, { backgroundColor: t.colors.bgAlt }]} />
                  <View style={[styles.previewLine, { width: "60%", backgroundColor: t.colors.bgAlt }]} />
                </View>
                <View style={styles.tileMeta}>
                  <View style={[styles.dot, { backgroundColor: t.swatch }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tileLabel}>{t.label}</Text>
                    <Text style={styles.tileHint}>{t.hint}</Text>
                  </View>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const makeTriggerStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bgAlt,
    },
  });

const makeSheetStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      paddingHorizontal: 20,
      paddingTop: 12,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    handle: {
      alignSelf: "center",
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 16,
    },
    title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, marginBottom: 18 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    tile: {
      width: "47%",
      backgroundColor: colors.bgAlt,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      gap: 10,
    },
    tileActive: { borderColor: colors.primary, borderWidth: 2 },
    preview: {
      height: 80,
      borderRadius: radii.md,
      borderWidth: 1,
      padding: 8,
      justifyContent: "flex-end",
      gap: 6,
    },
    previewBar: { height: 14, width: "40%", borderRadius: 4 },
    previewLine: { height: 6, width: "85%", borderRadius: 3 },
    tileMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 14, height: 14, borderRadius: 7 },
    tileLabel: { fontWeight: "700", color: colors.textPrimary, fontSize: 14 },
    tileHint: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  });
