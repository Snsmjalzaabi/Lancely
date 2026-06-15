import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { Input } from "../../components/Input";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHeader } from "../../components/Header";
import { ClientPicker } from "../../components/ClientPicker";
import { api } from "../../lib/api";
import { colors, radii, spacing, type } from "../../lib/theme";
import { PROJECT_STATUSES } from "../../lib/types";
import type { Client, ProjectStatus } from "../../lib/types";

export default function NewProject() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string }>();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>(params.clientId ?? "");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("lead");
  const [dueDays, setDueDays] = useState("30");
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const c = await api<Client[]>("/clients");
        setClients(c);
        if (!clientId && c.length > 0) setClientId(c[0].id);
      })();
    }, [clientId]),
  );

  const valid = !!clientId && name.trim().length > 0;

  const onSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const due = new Date();
      due.setDate(due.getDate() + (Number(dueDays) || 30));
      await api("/projects", {
        method: "POST",
        body: {
          name,
          client_id: clientId,
          value: Number(value) || 0,
          status,
          due_date: due.toISOString(),
          start_date: new Date().toISOString(),
        },
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="New Project" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ClientPicker clients={clients} value={clientId} onChange={setClientId} />
          <Input
            label="Project name *"
            value={name}
            onChangeText={setName}
            placeholder="Website redesign"
            testID="project-form-name"
          />
          <Input
            label="Value (AED)"
            value={value}
            onChangeText={(v) => setValue(v.replace(/[^0-9.]/g, ""))}
            keyboardType="numeric"
            placeholder="5000"
            testID="project-form-value"
          />
          <Input
            label="Due in (days)"
            value={dueDays}
            onChangeText={(v) => setDueDays(v.replace(/[^0-9]/g, ""))}
            keyboardType="numeric"
            placeholder="30"
            testID="project-form-due-days"
          />

          <Text style={styles.label}>Status</Text>
          <View style={styles.statusRow}>
            {PROJECT_STATUSES.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.chip, status === s.key && styles.chipActive]}
                onPress={() => setStatus(s.key)}
                testID={`project-status-${s.key}`}
              >
                <Text style={[styles.chipText, status === s.key && styles.chipTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <PrimaryButton
            label="Save Project"
            onPress={onSave}
            loading={saving}
            disabled={!valid}
            testID="project-form-submit"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 6, fontWeight: "600", marginTop: 4 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: colors.textInverse },
});
