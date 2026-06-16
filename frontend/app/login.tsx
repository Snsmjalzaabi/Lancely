import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryButton } from "../components/PrimaryButton";
import { ThemePickerSheet } from "../components/ThemePicker";
import { useAuth } from "../lib/auth";
import { radii, spacing, type, useTheme, type ColorPalette, THEME_LIST } from "../lib/theme";

const LOGO_URL =
  "https://customer-assets.emergentagent.com/job_solvio-mvp/artifacts/jwavdz5g_ChatGPT%20Image%20Jun%2016%2C%202026%2C%2001_05_51%20AM.png";

const DEMO_EMAIL = "test@lancely.ae";
const DEMO_PASSWORD = "test1234";

export default function Login() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { signIn, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);

  if (user) {
    router.replace("/(tabs)");
  }

  const onSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
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
      await signIn(DEMO_EMAIL, DEMO_PASSWORD);
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
            Welcome back to{"\n"}Lancely.
          </Text>
          <Text style={styles.sub}>
            Sign in to access your clients, quotes, invoices, and projects across all your devices.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              testID="login-email-input"
            />
          </View>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
              testID="login-password-input"
            />
          </View>

          <PrimaryButton
            label="Sign in"
            onPress={onSignIn}
            loading={loading}
            testID="login-submit-button"
            leftIcon={<Ionicons name="log-in-outline" size={18} color={colors.textInverse} />}
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            onPress={onDemo}
            disabled={demoLoading}
            style={styles.demoBtn}
            testID="login-demo-button"
          >
            {demoLoading ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <>
                <Ionicons name="rocket-outline" size={18} color={colors.textPrimary} />
                <Text style={styles.demoText}>Try with demo account</Text>
              </>
            )}
          </TouchableOpacity>

          {error ? (
            <Text style={styles.error} testID="login-error">
              {error}
            </Text>
          ) : null}

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>Don&apos;t have an account?</Text>
            <Link href="/register" asChild>
              <TouchableOpacity testID="login-signup-link">
                <Text style={styles.signupLink}> Create one</Text>
              </TouchableOpacity>
            </Link>
          </View>

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
    paddingTop: 48,
    paddingBottom: spacing.xl,
  },
  logoWrap: {
    alignSelf: "center",
    width: 120,
    height: 120,
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
    marginTop: 8,
    maxWidth: 320,
  },
  form: { gap: 12 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 15,
  },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  demoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  demoText: { ...type.bodyLg, color: colors.textPrimary, fontWeight: "600" },
  signupRow: { flexDirection: "row", justifyContent: "center", marginTop: 8 },
  signupText: { color: colors.textSecondary, fontSize: 13 },
  signupLink: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  error: { color: colors.errorText, textAlign: "center", fontSize: 13 },
  footnote: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 4 },
  themePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
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
