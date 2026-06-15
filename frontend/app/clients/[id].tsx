import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenHeader } from "../../components/Header";
import { invoiceTone, projectTone, quoteTone, StatusBadge } from "../../components/StatusBadge";
import { api } from "../../lib/api";
import { fmtDate, useFmtCurrency } from "../../lib/format";
import { radii, spacing, type, useTheme, type ColorPalette } from "../../lib/theme";
import type { Client, Invoice, Project, Quote } from "../../lib/types";

export default function ClientProfile() {
  const fmtCurrency = useFmtCurrency();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const [c, p, q, inv] = await Promise.all([
      api<Client>(`/clients/${id}`),
      api<Project[]>("/projects"),
      api<Quote[]>("/quotes"),
      api<Invoice[]>("/invoices"),
    ]);
    setClient(c);
    setProjects(p.filter((x) => x.client_id === id));
    setQuotes(q.filter((x) => x.client_id === id));
    setInvoices(inv.filter((x) => x.client_id === id));
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

  const onDelete = async () => {
    if (!id) return;
    await api(`/clients/${id}`, { method: "DELETE" });
    router.back();
  };

  if (loading || !client) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Client" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const totalPaid = invoices.reduce((s, i) => s + i.paid_amount, 0);
  const outstanding = invoices.reduce((s, i) => s + Math.max(i.amount - i.paid_amount, 0), 0);

  return (
    <View style={styles.flex}>
      <ScreenHeader title={client.name} showBack />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.headCard}>
          <View style={styles.avatarBig}>
            <Text style={styles.avatarBigText}>{client.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.h2}>{client.name}</Text>
          {client.company ? <Text style={styles.subtle}>{client.company}</Text> : null}

          <View style={styles.quickRow}>
            {client.email ? (
              <QuickAction icon="mail-outline" label="Email" onPress={() => Linking.openURL(`mailto:${client.email}`)} testID="client-action-email" />
            ) : null}
            {client.phone ? (
              <QuickAction icon="call-outline" label="Call" onPress={() => Linking.openURL(`tel:${client.phone}`)} testID="client-action-call" />
            ) : null}
            <QuickAction icon="document-text-outline" label="Quote" onPress={() => router.push(`/quotes/new?clientId=${id}`)} testID="client-action-quote" />
            <QuickAction icon="receipt-outline" label="Invoice" onPress={() => router.push(`/invoices/new?clientId=${id}`)} testID="client-action-invoice" />
          </View>

          {client.notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>NOTES</Text>
              <Text style={styles.notes}>{client.notes}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statTile, { backgroundColor: colors.successBg }]}>
            <Text style={[styles.statLabel, { color: colors.successText }]}>PAID</Text>
            <Text style={[styles.statValue, { color: colors.successText }]}>{fmtCurrency(totalPaid)}</Text>
          </View>
          <View style={[styles.statTile, { backgroundColor: colors.warningBg }]}>
            <Text style={[styles.statLabel, { color: colors.warningText }]}>OUTSTANDING</Text>
            <Text style={[styles.statValue, { color: colors.warningText }]}>{fmtCurrency(outstanding)}</Text>
          </View>
        </View>

        <SectionList
          title="Projects"
          empty="No projects yet"
          items={projects.map((p) => ({
            id: p.id,
            title: p.name,
            subtitle: `Value ${fmtCurrency(p.value)}`,
            badge: { label: p.status, tone: projectTone(p.status) as never },
            onPress: () => router.push(`/projects/${p.id}`),
          }))}
        />
        <SectionList
          title="Quotes"
          empty="No quotes yet"
          items={quotes.map((q) => ({
            id: q.id,
            title: q.quote_number,
            subtitle: q.title,
            badge: { label: q.status, tone: quoteTone(q.status) as never },
            amount: fmtCurrency(q.amount),
            onPress: () => router.push(`/quotes/${q.id}`),
          }))}
        />
        <SectionList
          title="Invoices"
          empty="No invoices yet"
          items={invoices.map((i) => ({
            id: i.id,
            title: i.invoice_number,
            subtitle: `Due ${fmtDate(i.due_date)}`,
            badge: { label: i.status, tone: invoiceTone(i.status) as never },
            amount: fmtCurrency(i.amount),
            onPress: () => router.push(`/invoices/${i.id}`),
          }))}
        />

        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} testID="client-delete-button">
          <Ionicons name="trash-outline" size={16} color={colors.errorText} />
          <Text style={styles.deleteText}>Delete client</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <TouchableOpacity style={styles.quick} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: {
    id: string;
    title: string;
    subtitle?: string;
    amount?: string;
    badge?: { label: string; tone: "success" | "warning" | "error" | "info" | "neutral" };
    onPress: () => void;
  }[];
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>{empty}</Text>
        </View>
      ) : (
        items.map((it) => (
          <TouchableOpacity key={it.id} style={styles.row} onPress={it.onPress}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{it.title}</Text>
              {it.subtitle ? <Text style={styles.rowSub}>{it.subtitle}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              {it.amount ? <Text style={styles.rowAmount}>{it.amount}</Text> : null}
              {it.badge ? <StatusBadge label={it.badge.label} tone={it.badge.tone} /> : null}
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
  headCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
  },
  avatarBig: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarBigText: { color: colors.primary, fontSize: 22, fontWeight: "700" },
  h2: { ...type.h2, color: colors.textPrimary },
  subtle: { ...type.body, color: colors.textSecondary, marginTop: 2 },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: spacing.md,
  },
  quick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.bgAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  quickLabel: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  notesBox: {
    width: "100%",
    backgroundColor: colors.bgAlt,
    padding: 12,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  notesLabel: { ...type.label, color: colors.textSecondary, marginBottom: 4 },
  notes: { color: colors.textPrimary, fontSize: 14 },
  statsRow: { flexDirection: "row", gap: 12, marginTop: spacing.md },
  statTile: { flex: 1, padding: 14, borderRadius: radii.md },
  statLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  statValue: { fontSize: 18, fontWeight: "700", marginTop: 4 },
  sectionTitle: { ...type.h3, color: colors.textPrimary, marginBottom: 8 },
  emptyRow: {
    backgroundColor: colors.bgAlt,
    padding: 14,
    borderRadius: radii.md,
    alignItems: "center",
  },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  row: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  rowTitle: { color: colors.textPrimary, fontWeight: "600" },
  rowSub: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  rowAmount: { color: colors.textPrimary, fontWeight: "700" },
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
