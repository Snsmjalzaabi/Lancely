import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { Input } from "../../components/Input";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHeader } from "../../components/Header";
import { ClientPicker } from "../../components/ClientPicker";
import { api } from "../../lib/api";
import { colors, spacing } from "../../lib/theme";
import type { Client } from "../../lib/types";

export default function NewInvoice() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string }>();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>(params.clientId ?? "");
  const [amount, setAmount] = useState("");
  const [dueDays, setDueDays] = useState("14");
  const [notes, setNotes] = useState("");
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

  const valid = !!clientId && Number(amount) > 0;

  const onSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const due = new Date();
      due.setDate(due.getDate() + (Number(dueDays) || 14));
      await api("/invoices", {
        method: "POST",
        body: {
          client_id: clientId,
          amount: Number(amount),
          due_date: due.toISOString(),
          notes,
        },
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="New Invoice" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ClientPicker clients={clients} value={clientId} onChange={setClientId} />
          <Input
            label="Amount (AED) *"
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
            keyboardType="numeric"
            placeholder="3300"
            testID="invoice-form-amount"
          />
          <Input
            label="Due in (days)"
            value={dueDays}
            onChangeText={(v) => setDueDays(v.replace(/[^0-9]/g, ""))}
            keyboardType="numeric"
            placeholder="14"
            testID="invoice-form-due-days"
          />
          <Input
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Optional"
            testID="invoice-form-notes"
          />
          <PrimaryButton
            label="Create Invoice"
            onPress={onSave}
            loading={saving}
            disabled={!valid}
            testID="invoice-form-submit"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
});
