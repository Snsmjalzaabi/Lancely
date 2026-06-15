import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { Input } from "../../components/Input";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHeader } from "../../components/Header";
import { api } from "../../lib/api";
import { spacing, useTheme, type ColorPalette } from "../../lib/theme";

export default function NewClient() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api("/clients", { method: "POST", body: form });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="New Client" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Input
            label="Full name *"
            value={form.name}
            onChangeText={(v) => set("name", v)}
            placeholder="Layla Ahmed"
            testID="client-form-name"
          />
          <Input
            label="Company"
            value={form.company}
            onChangeText={(v) => set("company", v)}
            placeholder="Crescent Studios"
            testID="client-form-company"
          />
          <Input
            label="Email"
            value={form.email}
            onChangeText={(v) => set("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="layla@email.com"
            testID="client-form-email"
          />
          <Input
            label="Phone"
            value={form.phone}
            onChangeText={(v) => set("phone", v)}
            keyboardType="phone-pad"
            placeholder="+971 50 123 4567"
            testID="client-form-phone"
          />
          <Input
            label="Notes"
            value={form.notes}
            onChangeText={(v) => set("notes", v)}
            multiline
            placeholder="Anything worth remembering"
            testID="client-form-notes"
          />
          <PrimaryButton
            label="Save Client"
            onPress={onSave}
            loading={saving}
            disabled={!form.name.trim()}
            testID="client-form-submit"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
});
