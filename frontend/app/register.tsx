import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAuth } from "../lib/auth";
import { radii, spacing, type, useTheme, type ColorPalette } from "../lib/theme";

export default function Register() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [biz, setBiz] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, name, biz);
      router.replace("/(tabs)");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not create account";
      setError(msg);
    } finally {
      setLoading(false);
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="register-back">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>Create your{"\n"}Lancely account</Text>
        <Text style={styles.sub}>One account works on web and mobile. Start free.</Text>

        <View style={styles.form}>
          <Field icon="person-outline" placeholder="Your name" value={name} onChangeText={setName} testID="register-name" colors={colors} />
          <Field icon="briefcase-outline" placeholder="Business name (optional)" value={biz} onChangeText={setBiz} testID="register-business" colors={colors} />
          <Field icon="mail-outline" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCap="none" testID="register-email" colors={colors} />
          <Field icon="lock-closed-outline" placeholder="Password (min 6 characters)" value={password} onChangeText={setPassword} secure testID="register-password" colors={colors} />

          <PrimaryButton
            label="Create account"
            onPress={onSubmit}
            loading={loading}
            testID="register-submit"
            leftIcon={<Ionicons name="sparkles-outline" size={18} color={colors.textInverse} />}
          />

          {error ? <Text style={styles.error} testID="register-error">{error}</Text> : null}

          <View style={styles.signinRow}>
            <Text style={styles.signinText}>Already have an account?</Text>
            <Link href="/login" asChild>
              <TouchableOpacity testID="register-signin-link">
                <Text style={styles.signinLink}> Sign in</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  icon, placeholder, value, onChangeText, keyboardType, autoCap, secure, testID, colors,
}: {
  icon: string; placeholder: string; value: string;
  onChangeText: (t: string) => void;
  keyboardType?: "default" | "email-address";
  autoCap?: "none" | "sentences";
  secure?: boolean;
  testID?: string;
  colors: ColorPalette;
}) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 10,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: radii.lg, paddingHorizontal: spacing.md,
    }}>
      <Ionicons name={icon as never} size={18} color={colors.textSecondary} />
      <TextInput
        style={{ flex: 1, paddingVertical: 14, color: colors.textPrimary, fontSize: 15 }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCap ?? "sentences"}
        autoCorrect={false}
        secureTextEntry={!!secure}
        testID={testID}
      />
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: 48, paddingBottom: spacing.xl },
  backBtn: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  backText: { ...type.body, color: colors.textPrimary, fontWeight: "600" },
  heading: { fontSize: 26, lineHeight: 32, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.4 },
  sub: { ...type.body, color: colors.textSecondary, marginTop: 8, marginBottom: spacing.lg },
  form: { gap: 12 },
  error: { color: colors.errorText, textAlign: "center", fontSize: 13 },
  signinRow: { flexDirection: "row", justifyContent: "center", marginTop: 8 },
  signinText: { color: colors.textSecondary, fontSize: 13 },
  signinLink: { color: colors.primary, fontWeight: "700", fontSize: 13 },
});
