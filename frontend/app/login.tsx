import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryButton } from "../components/PrimaryButton";
import { ThemePickerSheet } from "../components/ThemePicker";
import { useAuth } from "../lib/auth";
import { radii, spacing, type, useTheme, type ColorPalette, THEME_LIST } from "../lib/theme";

const LOGO_URL =
  "https://customer-assets.emergentagent.com/job_solvio-mvp/artifacts/mid6xyfp_ChatGPT%20Image%20Jun%2015%2C%202026%2C%2011_05_07%20PM.png";

export default function Login() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { signInWithGoogle, signInDemo, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);

  if (user) {
    router.replace("/(tabs)");
  }

  const onGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onDemo = async () => {
    setError(null);
    setDemoLoading(true);
    try {
      await signInDemo();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Demo sign-in failed";
      setError(msg);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoWrap}>
          <Image
            source={{ uri: LOGO_URL }}
            style={styles.logo}
            resizeMode="contain"
            testID="login-logo"
          />
        </View>

        <View style={styles.heroCopy}>
          <Text style={styles.hero} testID="login-hero">
            From Client to Payment.{"\n"}One Place.
          </Text>
          <Text style={styles.sub}>
            Manage clients, quotes, projects, invoices, and payments — all in one calm dashboard.
          </Text>
        </View>

        <View style={styles.bullets}>
          {[
            { icon: "people-outline", label: "Add clients in 30 seconds" },
            { icon: "document-text-outline", label: "Send quotes in under a minute" },
            { icon: "wallet-outline", label: "Know who owes you, instantly" },
          ].map((b) => (
            <View key={b.label} style={styles.bulletRow}>
              <View style={styles.bulletIcon}>
                <Ionicons name={b.icon as never} size={18} color={colors.primary} />
              </View>
              <Text style={styles.bulletText}>{b.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.cta}>
          <PrimaryButton
            label="Continue with Google"
            onPress={onGoogle}
            loading={loading}
            testID="login-google-button"
            leftIcon={<Ionicons name="logo-google" size={18} color={colors.textInverse} />}
          />
          <PrimaryButton
            label="Try with demo data"
            onPress={onDemo}
            loading={demoLoading}
            variant="secondary"
            testID="login-demo-button"
            leftIcon={<Ionicons name="rocket-outline" size={18} color={colors.textPrimary} />}
          />
          {error ? (
            <Text style={styles.error} testID="login-error">
              {error}
            </Text>
          ) : null}
          <Text style={styles.footnote}>
            By continuing you agree to Lancely&apos;s Terms & Privacy.
          </Text>

          <View style={styles.themePreviewRow}>
            <Text style={styles.themePreviewLabel}>Theme</Text>
            <View style={styles.themeDots}>
              {THEME_LIST.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[
                    styles.themeDot,
                    { backgroundColor: t.swatch, borderColor: colors.border },
                  ]}
                  onPress={() => setThemeOpen(true)}
                  testID={`login-theme-dot-${t.key}`}
                />
              ))}
              <TouchableOpacity
                onPress={() => setThemeOpen(true)}
                style={styles.themeOpen}
                testID="login-theme-open"
              >
                <Text style={styles.themeOpenText}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
      <ThemePickerSheet open={themeOpen} onClose={() => setThemeOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 64,
    paddingBottom: spacing.xl,
  },
  logoWrap: {
    alignSelf: "center",
    width: 140,
    height: 140,
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: "#000",
    marginBottom: spacing.lg,
  },
  logo: { width: "100%", height: "100%" },
  heroCopy: { alignItems: "center", marginBottom: spacing.lg },
  hero: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  sub: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 12,
    maxWidth: 320,
  },
  bullets: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xl,
    gap: 12,
  },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bulletIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  bulletText: { ...type.bodyLg, color: colors.textPrimary, flex: 1 },
  cta: { gap: 12 },
  error: { color: colors.errorText, textAlign: "center", fontSize: 13 },
  footnote: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 8 },
  themePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  themePreviewLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  themeDots: { flexDirection: "row", alignItems: "center", gap: 8 },
  themeDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
  themeOpen: { marginLeft: 4 },
  themeOpenText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
});
