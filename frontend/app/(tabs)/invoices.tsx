import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { EmptyState } from "../../components/EmptyState";
import { ScreenHeader } from "../../components/Header";
import { invoiceTone, StatusBadge } from "../../components/StatusBadge";
import { api } from "../../lib/api";
import { fmtDate, useFmtCurrency } from "../../lib/format";
import { radii, spacing, type, useTheme, type ColorPalette } from "../../lib/theme";
import type { Client, Invoice, InvoiceStatus } from "../../lib/types";

type FilterKey = "all" | InvoiceStatus;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "overdue", label: "Overdue" },
  { key: "partial", label: "Partial" },
  { key: "paid", label: "Paid" },
];

export default function InvoicesScreen() {
  const fmtCurrency = useFmtCurrency();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const [items, setItems] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  const load = useCallback(async () => {
    const [inv, cli] = await Promise.all([api<Invoice[]>("/invoices"), api<Client[]>("/clients")]);
    setItems(inv);
    const map: Record<string, Client> = {};
    cli.forEach((c) => (map[c.id] = c));
    setClients(map);
  }, []);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  const totals = useMemo(() => {
    const totalOf = (i: Invoice) => Number(i.total ?? 0);
    const paidOf = (i: Invoice) => Number(i.paid_amount ?? 0);
    const earned = items.reduce((sum, i) => sum + paidOf(i), 0);
    const outstanding = items.reduce((sum, i) => sum + Math.max(totalOf(i) - paidOf(i), 0), 0);
    const overdue = items
      .filter((i) => i.status === "overdue")
      .reduce((sum, i) => sum + Math.max(totalOf(i) - paidOf(i), 0), 0);
    return { earned, outstanding, overdue };
  }, [items]);

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Invoices" subtitle="Payments at a glance" bellTo="/notifications" />

      <View style={styles.stickyHead}>
        <View style={styles.metrics}>
          <Metric label="Earned" value={fmtCurrency(totals.earned)} tone="success" testID="invoices-metric-earned" />
          <Metric label="Outstanding" value={fmtCurrency(totals.outstanding)} tone="warning" testID="invoices-metric-outstanding" />
          <Metric label="Overdue" value={fmtCurrency(totals.overdue)} tone="error" testID="invoices-metric-overdue" />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`invoices-filter-${f.key}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={filter === "all" ? "No invoices yet" : "No invoices in this view"}
          subtitle={filter === "all" ? "Create your first invoice in 30 seconds." : undefined}
          actionLabel={filter === "all" ? "Create Invoice" : undefined}
          onAction={() => router.push("/invoices/new")}
          testID="invoices-empty"
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/invoices/${item.id}`)}
              testID={`invoice-row-${item.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.number ?? item.title ?? "Invoice"}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {clients[item.client_id]?.name ?? "—"} · Due {item.due_date ? fmtDate(item.due_date) : "—"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={styles.amount}>{fmtCurrency(Number(item.total ?? 0))}</Text>
                <StatusBadge label={item.status} tone={invoiceTone(item.status)} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/invoices/new")}
        testID="invoices-fab"
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color={colors.textInverse} />
      </TouchableOpacity>
    </View>
  );
}

function Metric({
  label,
  value,
  tone,
  testID,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "error";
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const bg =
    tone === "success" ? colors.successBg : tone === "warning" ? colors.warningBg : colors.errorBg;
  const fg =
    tone === "success" ? colors.successText : tone === "warning" ? colors.warningText : colors.errorText;
  return (
    <View style={[styles.metric, { backgroundColor: bg }]} testID={testID}>
      <Text style={[styles.metricLabel, { color: fg }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: fg }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  stickyHead: {
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
  },
  metrics: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.md,
    marginBottom: 10,
  },
  metric: { flex: 1, padding: 12, borderRadius: radii.md },
  metricLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  metricValue: { fontWeight: "700", fontSize: 15, marginTop: 4 },
  chipRow: { paddingHorizontal: spacing.md, gap: 8, paddingVertical: 4 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: colors.textInverse },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: 10,
  },
  title: { ...type.bodyLg, color: colors.textPrimary, fontWeight: "600" },
  sub: { ...type.body, color: colors.textSecondary, marginTop: 2 },
  amount: { ...type.bodyLg, color: colors.textPrimary, fontWeight: "700" },
  fab: {
    position: "absolute",
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
