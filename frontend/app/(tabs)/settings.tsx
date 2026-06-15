import { useState } from "react";
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ScreenHeader } from "../../components/Header";
import { ThemePickerSheet } from "../../components/ThemePicker";
import { useAuth } from "../../lib/auth";
import {
  PICKER_OPTIONS,
  radii,
  spacing,
  type,
  useTheme,
  type ColorPalette,
} from "../../lib/theme";

export default function SettingsScreen() {
  const { colors, themeKey, resolvedKey } = useTheme();
  const styles = makeStyles(colors);
  const { user, signOut } = useAuth();
  const [themeOpen, setThemeOpen] = useState(false);

  const activeOption =
    PICKER_OPTIONS.find((o) => o.key === themeKey) ?? PICKER_OPTIONS[0];
  const resolvedOption = PICKER_OPTIONS.find((o) => o.key === resolvedKey);
  const themeValueLabel =
    themeKey === "system"
      ? `System · ${resolvedOption?.label ?? ""}`
      : activeOption.label;

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Settings" subtitle="Personalize Solvio" bellTo="/notifications" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard} testID="settings-profile-card">
          <View style={styles.avatar}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>
                {(user?.name || "?").slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {user?.name ?? "Signed in"}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {user?.email ?? ""}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Appearance</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={() => setThemeOpen(true)}
          testID="settings-theme-row"
          activeOpacity={0.7}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="color-palette-outline" size={18} color={colors.textPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Theme</Text>
            <Text style={styles.rowSub}>{themeValueLabel}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Workspace</Text>
        <InfoRow icon="cash-outline" label="Currency" value="AED" colors={colors} testID="settings-currency-row" />
        <InfoRow icon="time-outline" label="Time zone" value="Device default" colors={colors} testID="settings-tz-row" />

        <Text style={styles.sectionTitle}>About</Text>
        <InfoRow icon="rocket-outline" label="Version" value="1.0.0 · MVP" colors={colors} testID="settings-version-row" />
        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL("https://emergent.sh")}
          testID="settings-support-row"
          activeOpacity={0.7}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="help-circle-outline" size={18} color={colors.textPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Support</Text>
            <Text style={styles.rowSub}>Get in touch</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signOut}
          onPress={signOut}
          testID="settings-signout-button"
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.errorText} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>Solvio — From Client to Payment. One Place.</Text>
      </ScrollView>

      <ThemePickerSheet open={themeOpen} onClose={() => setThemeOpen(false)} />
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  colors,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: ColorPalette;
  testID?: string;
}) {
  const styles = makeStyles(colors);
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.textPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    body: { padding: spacing.md, paddingBottom: spacing.xxl },
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.bgAlt,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImg: { width: 56, height: 56 },
    avatarText: { color: colors.primary, fontSize: 22, fontWeight: "700" },
    name: { ...type.h3, color: colors.textPrimary },
    email: { ...type.body, color: colors.textSecondary, marginTop: 2 },
    sectionTitle: {
      ...type.label,
      color: colors.textSecondary,
      textTransform: "uppercase",
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      paddingHorizontal: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: 8,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.bgAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    rowLabel: { ...type.bodyLg, color: colors.textPrimary, fontWeight: "600" },
    rowSub: { ...type.body, color: colors.textSecondary, marginTop: 2 },
    rowValue: { ...type.body, color: colors.textSecondary, fontWeight: "600" },
    signOut: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.errorBg,
      paddingVertical: 14,
      borderRadius: radii.md,
      marginTop: spacing.lg,
    },
    signOutText: { color: colors.errorText, fontWeight: "700", fontSize: 15 },
    footer: {
      textAlign: "center",
      color: colors.textMuted,
      fontSize: 12,
      marginTop: spacing.lg,
    },
  });
