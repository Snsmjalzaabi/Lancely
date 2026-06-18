import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "../../components/Header";
import { ThemePickerSheet } from "../../components/ThemePicker";
import { DeleteAccountSheet } from "../../components/DeleteAccountSheet";
import { useAuth } from "../../lib/auth";
import { useSettings } from "../../lib/settings";
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
  const { settings, options, update, loading } = useSettings();
  const router = useRouter();
  const isPro = !!user?.is_pro;
  const goPro = () => router.push("/pro");

  const [themeOpen, setThemeOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [tzOpen, setTzOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const activeOpt = PICKER_OPTIONS.find((o) => o.key === themeKey) ?? PICKER_OPTIONS[0];
  const resolvedOpt = PICKER_OPTIONS.find((o) => o.key === resolvedKey);
  const themeValueLabel =
    themeKey === "system" ? `System · ${resolvedOpt?.label ?? ""}` : activeOpt.label;

  const pickLogo = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo permission denied. Enable it in Settings to upload a logo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const data = asset.base64
      ? `data:image/jpeg;base64,${asset.base64}`
      : asset.uri;
    setUploading(true);
    try {
      await update({ logo_base64: data });
    } catch (e) {
      const m = e instanceof Error ? e.message : "Upload failed";
      setError(m);
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    if (!isPro) return goPro();
    setError(null);
    try {
      await update({ logo_base64: null });
    } catch (e) {
      const m = e instanceof Error ? e.message : "Remove failed";
      setError(m);
    }
  };

  const setAccent = async (hex: string | null) => {
    if (!isPro) return goPro();
    setError(null);
    try {
      await update({ accent_color: hex });
    } catch (e) {
      const m = e instanceof Error ? e.message : "Update failed";
      setError(m);
    }
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Settings" subtitle="Personalize Lancely" bellTo="/notifications" />
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
        <SettingsRow
          icon="color-palette-outline"
          label="Theme"
          value={themeValueLabel}
          onPress={() => setThemeOpen(true)}
          colors={colors}
          testID="settings-theme-row"
        />

        <Text style={styles.sectionTitle}>Workspace</Text>
        <SettingsRow
          icon="cash-outline"
          label="Currency"
          value={settings.currency}
          onPress={() => setCurrencyOpen(true)}
          colors={colors}
          testID="settings-currency-row"
        />
        <SettingsRow
          icon="time-outline"
          label="Time zone"
          value={settings.timezone === "device" ? "Device default" : settings.timezone}
          onPress={() => setTzOpen(true)}
          colors={colors}
          testID="settings-tz-row"
        />

        <View style={styles.proHeaderRow}>
          <Text style={styles.sectionTitle}>Branding</Text>
          <View style={styles.proBadge}>
            <Ionicons name="sparkles" size={11} color={colors.primary} />
            <Text style={[styles.proText, { color: colors.primary }]}>PRO</Text>
          </View>
        </View>

        {isPro ? null : (
          <TouchableOpacity
            style={styles.upgradeBanner}
            onPress={goPro}
            testID="settings-upgrade-banner"
            activeOpacity={0.85}
          >
            <Ionicons name="rocket-outline" size={18} color={colors.textInverse} />
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeBannerTitle}>Unlock Lancely Pro</Text>
              <Text style={styles.upgradeBannerSub}>
                Custom logo, accent color, advanced reports — AED 29/mo
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textInverse} />
          </TouchableOpacity>
        )}

        <View style={styles.brandCard} testID="settings-brand-card">
          <Text style={styles.brandLabel}>Business name</Text>
          <Text style={styles.brandHint}>Appears on your invoices and quotes.</Text>
          <TextInput
            value={settings.business_name || ""}
            onChangeText={(v) => update({ business_name: v })}
            placeholder="e.g. Crescent Studios"
            placeholderTextColor={colors.textMuted}
            style={styles.bizInput}
            maxLength={80}
            testID="settings-business-name-input"
          />

          <View style={styles.divider} />

          <Text style={styles.brandLabel}>Accent color</Text>
          <Text style={styles.brandHint}>Overrides the primary color of your theme.</Text>
          <View style={styles.swatchRow}>
            <TouchableOpacity
              style={[styles.swatch, !settings.accent_color && styles.swatchActive]}
              onPress={() => setAccent(null)}
              testID="settings-accent-reset"
            >
              <Ionicons name="refresh-outline" size={14} color={colors.textPrimary} />
            </TouchableOpacity>
            {(options?.accent_swatches ?? []).map((hex) => {
              const active = settings.accent_color?.toUpperCase() === hex.toUpperCase();
              return (
                <TouchableOpacity
                  key={hex}
                  style={[
                    styles.swatch,
                    { backgroundColor: hex, borderColor: active ? colors.textPrimary : colors.border },
                    active && { borderWidth: 3 },
                  ]}
                  onPress={() => setAccent(hex)}
                  testID={`settings-accent-${hex.replace("#", "")}`}
                />
              );
            })}
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} /> : null}

        <Text style={styles.sectionTitle}>About</Text>
        <SettingsRow
          icon="stats-chart-outline"
          label="Advanced Reports"
          value={isPro ? "Open" : "PRO"}
          onPress={() => router.push("/reports")}
          colors={colors}
          testID="settings-reports-row"
        />
        <SettingsRow icon="rocket-outline" label="Version" value="1.0.0 · MVP" colors={colors} testID="settings-version-row" />
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

        <TouchableOpacity
          style={styles.deleteAccount}
          onPress={() => setDeleteOpen(true)}
          testID="settings-delete-account-button"
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
          <Text style={styles.deleteAccountText}>Delete account</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>Lancely — Manage. Create. Get Paid.</Text>
      </ScrollView>

      <DeleteAccountSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        colors={colors}
      />

      <ThemePickerSheet open={themeOpen} onClose={() => setThemeOpen(false)} />
      <OptionsSheet
        title="Currency"
        open={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        options={(options?.currencies ?? ["AED"]).map((c) => ({ key: c, label: c }))}
        value={settings.currency}
        onSelect={(v) => update({ currency: v })}
        testIdPrefix="settings-currency-option"
      />
      <OptionsSheet
        title="Time zone"
        open={tzOpen}
        onClose={() => setTzOpen(false)}
        options={(options?.timezones ?? ["device"]).map((t) => ({
          key: t,
          label: t === "device" ? "Device default" : t,
        }))}
        value={settings.timezone}
        onSelect={(v) => update({ timezone: v })}
        testIdPrefix="settings-tz-option"
      />
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  colors,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
  colors: ColorPalette;
  testID?: string;
}) {
  const styles = makeStyles(colors);
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={styles.row} onPress={onPress} activeOpacity={0.7} testID={testID}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.textPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
    </Wrap>
  );
}

function OptionsSheet({
  title,
  open,
  onClose,
  options,
  value,
  onSelect,
  testIdPrefix,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  options: { key: string; label: string }[];
  value: string;
  onSelect: (key: string) => void;
  testIdPrefix: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: "70%" }]}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>{title}</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {options.map((opt) => {
            const active = opt.key === value;
            return (
              <TouchableOpacity
                key={opt.key}
                style={styles.optionRow}
                onPress={() => {
                  onSelect(opt.key);
                  onClose();
                }}
                testID={`${testIdPrefix}-${opt.key}`}
              >
                <Text style={[styles.optionLabel, active && { color: colors.primary, fontWeight: "700" }]}>
                  {opt.label}
                </Text>
                {active ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
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
    proHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    proBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.bgAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    proText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
    upgradeBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.primary,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    upgradeBannerTitle: { color: colors.textInverse, fontWeight: "700", fontSize: 14 },
    upgradeBannerSub: { color: colors.onPrimaryMuted, fontSize: 12, marginTop: 2 },
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
    brandCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: 8,
    },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    logoPreview: {
      width: 64,
      height: 64,
      borderRadius: radii.md,
      backgroundColor: colors.bgAlt,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
    },
    logoImg: { width: 64, height: 64 },
    brandLabel: { fontWeight: "700", color: colors.textPrimary, fontSize: 14 },
    brandHint: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    smallBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.md,
    },
    smallBtnText: { color: colors.textInverse, fontWeight: "600", fontSize: 13 },
    smallGhostBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    smallGhostText: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
    bizInput: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: radii.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.textPrimary,
      minHeight: 44,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.md,
    },
    swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
    swatch: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    swatchActive: { borderColor: colors.textPrimary, borderWidth: 2 },
    error: { color: colors.errorText, fontSize: 13, marginTop: 8, textAlign: "center" },
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
    deleteAccount: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
      paddingVertical: 12,
      marginTop: 8,
    },
    deleteAccountText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
    footer: {
      textAlign: "center",
      color: colors.textMuted,
      fontSize: 12,
      marginTop: spacing.lg,
    },
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
    sheetTitle: { fontSize: 22, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionLabel: { fontSize: 15, color: colors.textPrimary },
  });
