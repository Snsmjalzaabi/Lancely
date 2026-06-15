import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { spacing, type, useTheme, type ColorPalette } from "../lib/theme";

export function ScreenHeader({
  title,
  subtitle,
  showBack,
  right,
  bellTo,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: React.ReactNode;
  bellTo?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="header-back-button">
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.rightWrap}>
          {right}
          {bellTo ? (
            <TouchableOpacity
              onPress={() => router.push(bellTo as never)}
              style={styles.iconBtn}
              testID="header-notifications-button"
            >
              <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  wrap: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: "row", alignItems: "center" },
  rightWrap: { flexDirection: "row", alignItems: "center", minWidth: 36, justifyContent: "flex-end" },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.h3, color: colors.textPrimary },
  subtitle: { ...type.body, color: colors.textSecondary, marginTop: 2 },
});
