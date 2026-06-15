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
import { Ionicons } from "@expo/vector-icons";

import { Input } from "../../components/Input";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHeader } from "../../components/Header";
import { ClientPicker } from "../../components/ClientPicker";
import { api } from "../../lib/api";
import { fmtAED } from "../../lib/format";
import { radii, spacing, type, useTheme, type ColorPalette } from "../../lib/theme";
import type { Client, QuoteItem } from "../../lib/types";

export default function NewQuote() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string }>();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>(params.clientId ?? "");
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([{ service: "", description: "", price: 0 }]);
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

  const total = items.reduce((sum, it) => sum + (Number(it.price) || 0), 0);

  const updateItem = (idx: number, patch: Partial<QuoteItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { service: "", description: "", price: 0 }]);
  const removeItem = (idx: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const valid = clientId && items.every((it) => it.service.trim() && it.price > 0);

  const onSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await api("/quotes", {
        method: "POST",
        body: {
          client_id: clientId,
          title: title || "Quote",
          items: items.map((it) => ({ ...it, price: Number(it.price) || 0 })),
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
      <ScreenHeader title="New Quote" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ClientPicker clients={clients} value={clientId} onChange={setClientId} />
          <Input
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Brand identity package"
            testID="quote-form-title"
          />

          <Text style={styles.section}>Line items</Text>
          {items.map((it, idx) => (
            <View key={idx} style={styles.itemCard} testID={`quote-item-${idx}`}>
              <Input
                label="Service *"
                value={it.service}
                onChangeText={(v) => updateItem(idx, { service: v })}
                placeholder="Logo design"
                testID={`quote-item-${idx}-service`}
              />
              <Input
                label="Description"
                value={it.description ?? ""}
                onChangeText={(v) => updateItem(idx, { description: v })}
                placeholder="Optional detail"
                testID={`quote-item-${idx}-desc`}
              />
              <Input
                label="Price (AED) *"
                value={String(it.price || "")}
                onChangeText={(v) => updateItem(idx, { price: Number(v.replace(/[^0-9.]/g, "")) || 0 })}
                keyboardType="numeric"
                placeholder="0"
                testID={`quote-item-${idx}-price`}
              />
              {items.length > 1 ? (
                <TouchableOpacity onPress={() => removeItem(idx)} style={styles.removeRow} testID={`quote-item-${idx}-remove`}>
                  <Ionicons name="trash-outline" size={14} color={colors.errorText} />
                  <Text style={styles.removeText}>Remove item</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          <TouchableOpacity style={styles.addBtn} onPress={addItem} testID="quote-add-item-button">
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.addText}>Add another item</Text>
          </TouchableOpacity>

          <Input
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Valid for 14 days, etc."
            testID="quote-form-notes"
          />

          <View style={styles.totalRow} testID="quote-form-total">
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>{fmtAED(total)}</Text>
          </View>

          <PrimaryButton
            label="Send Quote"
            onPress={onSave}
            loading={saving}
            disabled={!valid}
            testID="quote-form-submit"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
  section: { ...type.h3, color: colors.textPrimary, marginTop: 4, marginBottom: 8 },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  removeRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", marginTop: 4 },
  removeText: { color: colors.errorText, fontSize: 12, fontWeight: "600" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    justifyContent: "center",
    backgroundColor: colors.bgAlt,
    borderRadius: radii.md,
    marginBottom: 16,
  },
  addText: { color: colors.primary, fontWeight: "600" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  totalLabel: { ...type.label, color: colors.textSecondary },
  totalValue: { ...type.h2, color: colors.primary },
});
