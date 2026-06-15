import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHeader } from "../../components/Header";
import { invoiceTone, StatusBadge } from "../../components/StatusBadge";
import { api } from "../../lib/api";
import { fmtAED, fmtDate } from "../../lib/format";
import { radii, spacing, type, useTheme, type ColorPalette } from "../../lib/theme";
import type { Client, Invoice } from "../../lib/types";

export default function InvoiceDetail() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const inv = await api<Invoice>(`/invoices/${id}`);
    setInvoice(inv);
    try {
      const c = await api<Client>(`/clients/${inv.client_id}`);
      setClient(c);
    } catch {
      setClient(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          await load();
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  const markPaid = async () => {
    if (!invoice) return;
    setBusy(true);
    try {
      const updated = await api<Invoice>(`/invoices/${invoice.id}/status`, {
        method: "PATCH",
        query: { status: "paid" },
      });
      setInvoice(updated);
    } finally {
      setBusy(false);
    }
  };

  const recordPayment = async () => {
    if (!invoice) return;
    const n = Number(payAmount);
    if (!n || n <= 0) return;
    setBusy(true);
    try {
      const updated = await api<Invoice>(`/invoices/${invoice.id}/pay`, {
        method: "POST",
        body: { amount: n },
      });
      setInvoice(updated);
      setPayAmount("");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!invoice) return;
    await api(`/invoices/${invoice.id}`, { method: "DELETE" });
    router.back();
  };

  if (loading || !invoice) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Invoice" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const remaining = Math.max(invoice.amount - invoice.paid_amount, 0);

  return (
    <View style={styles.flex}>
      <ScreenHeader title={invoice.invoice_number} showBack />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>AMOUNT DUE</Text>
          <Text style={styles.heroValue}>{fmtAED(remaining)}</Text>
          <View style={{ marginTop: 8 }}>
            <StatusBadge label={invoice.status} tone={invoiceTone(invoice.status)} />
          </View>
          <View style={styles.heroGrid}>
            <View style={styles.heroCell}>
              <Text style={styles.heroCellLabel}>Total</Text>
              <Text style={styles.heroCellValue}>{fmtAED(invoice.amount)}</Text>
            </View>
            <View style={styles.heroCell}>
              <Text style={styles.heroCellLabel}>Paid</Text>
              <Text style={styles.heroCellValue}>{fmtAED(invoice.paid_amount)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.metaCard}>
          <MetaRow label="Client" value={client?.name ?? "—"} />
          <MetaRow label="Due date" value={fmtDate(invoice.due_date)} />
          <MetaRow label="Issued" value={fmtDate(invoice.created_at)} />
          {invoice.paid_date ? <MetaRow label="Paid on" value={fmtDate(invoice.paid_date)} /> : null}
          {invoice.notes ? <MetaRow label="Notes" value={invoice.notes} /> : null}
        </View>

        {invoice.status !== "paid" ? (
          <>
            <Text style={styles.section}>Record a payment</Text>
            <View style={styles.payRow}>
              <TextInput
                style={styles.payInput}
                value={payAmount}
                onChangeText={(v) => setPayAmount(v.replace(/[^0-9.]/g, ""))}
                placeholder={`Up to ${fmtAED(remaining)}`}
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                testID="invoice-payment-input"
              />
              <TouchableOpacity
                style={styles.payBtn}
                onPress={recordPayment}
                disabled={busy || !payAmount}
                testID="invoice-payment-submit"
              >
                <Ionicons name="add" size={16} color={colors.textInverse} />
                <Text style={styles.payBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            <PrimaryButton
              label="Mark as fully paid"
              onPress={markPaid}
              loading={busy}
              testID="invoice-mark-paid"
              leftIcon={<Ionicons name="checkmark-done-outline" size={16} color={colors.textInverse} />}
            />
          </>
        ) : null}

        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} testID="invoice-delete-button">
          <Ionicons name="trash-outline" size={16} color={colors.errorText} />
          <Text style={styles.deleteText}>Delete invoice</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  heroLabel: { color: colors.onPrimaryMuted, ...type.label },
  heroValue: { color: colors.textInverse, fontSize: 32, fontWeight: "700", marginTop: 4 },
  heroGrid: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.onPrimaryBorder,
    gap: spacing.lg,
  },
  heroCell: { flex: 1 },
  heroCellLabel: { color: colors.onPrimaryMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  heroCellValue: { color: colors.textInverse, fontSize: 16, fontWeight: "600", marginTop: 4 },
  metaCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  metaLabel: { color: colors.textSecondary, fontSize: 13 },
  metaValue: { color: colors.textPrimary, fontWeight: "600", fontSize: 13, maxWidth: "60%" },
  section: { ...type.h3, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: 8 },
  payRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  payInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 48,
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    justifyContent: "center",
  },
  payBtnText: { color: colors.textInverse, fontWeight: "600" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.errorBg,
  },
  deleteText: { color: colors.errorText, fontWeight: "600" },
});
