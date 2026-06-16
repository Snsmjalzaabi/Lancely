import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { EmptyState } from "../components/EmptyState";
import { ScreenHeader } from "../components/Header";
import { CsvExportPanel } from "../components/CsvExportPanel";
import { QuickDateChips } from "../components/QuickDateChips";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFmtCurrency } from "../lib/format";
import {
  radii,
  shadow,
  spacing,
  type,
  useTheme,
  type ColorPalette,
} from "../lib/theme";

type ReportSummary = {
  monthly_revenue: { label: string; total: number }[];
  top_clients: { client_id: string; name: string; company?: string; total: number }[];
  avg_invoice_value: number;
  quote_acceptance_rate: number;
  quotes_accepted: number;
  quotes_rejected: number;
  quotes_sent: number;
  aging: { current: number; "1_30": number; "31_60": number; "61_90": number; "90_plus": number };
  total_invoiced: number;
  total_paid: number;
  collection_rate: number;
};

const AGING_BUCKETS: { key: keyof ReportSummary["aging"]; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "1_30", label: "1–30d" },
  { key: "31_60", label: "31–60d" },
  { key: "61_90", label: "61–90d" },
  { key: "90_plus", label: "90+d" },
];

export default function ReportsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const fmtCurrency = useFmtCurrency();
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (range.from) params.set("date_from", range.from);
    if (range.to) params.set("date_to", range.to);
    const qs = params.toString();
    type PLResp = { income?: number; expense?: number; net?: number; series?: { month: string; income: number; expense: number; net: number }[] };
    const pl = await api<PLResp>(`/reports/pl${qs ? `?${qs}` : ""}`).catch(() => ({} as PLResp));
    const series = pl.series ?? [];
    // Adapt the web /reports/pl shape into the local ReportSummary shape
    const adapted = {
      total_earned: pl.income ?? 0,
      revenue_this_month: series.length ? series[series.length - 1].income : 0,
      outstanding_balance: 0, // not provided by /reports/pl; fetched separately on dashboard
      active_clients: 0,
      active_projects: 0,
      pending_invoices_amount: 0,
      overdue_invoices_amount: 0,
      monthly_revenue: series.map((s) => ({ label: s.month, total: Number(s.income ?? 0) })),
      top_clients: [],
    } as unknown as ReportSummary;
    setData(adapted);
  }, [range.from, range.to]);

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

  if (!user?.is_pro) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Advanced Reports" showBack />
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState
            icon="lock-closed-outline"
            title="A Lancely Pro feature"
            subtitle="Upgrade to unlock revenue charts, top clients, and AR aging."
            actionLabel="See Lancely Pro"
            onAction={() => router.replace("/pro")}
            testID="reports-paywall"
          />
        </View>
      </View>
    );
  }

  if (loading || !data) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Advanced Reports" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const maxRev = Math.max(1, ...data.monthly_revenue.map((m) => m.total));

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Advanced Reports" subtitle="Insights into your business" showBack />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.filterCard} testID="reports-filter-card">
          <Text style={styles.filterTitle}>Date range</Text>
          <QuickDateChips value={range} onChange={(next) => setRange(next)} testIdPrefix="reports-quick" />
        </View>
        <View style={styles.kpiRow}>
          <KpiTile label="Total earned" value={fmtCurrency(data.total_paid)} colors={colors} testID="report-kpi-earned" />
          <KpiTile label="Avg invoice" value={fmtCurrency(data.avg_invoice_value)} colors={colors} testID="report-kpi-avg" />
        </View>
        <View style={styles.kpiRow}>
          <KpiTile
            label="Collection rate"
            value={`${data.collection_rate.toFixed(1)}%`}
            colors={colors}
            testID="report-kpi-collection"
          />
          <KpiTile
            label="Quote acceptance"
            value={`${data.quote_acceptance_rate.toFixed(0)}%`}
            colors={colors}
            testID="report-kpi-acceptance"
          />
        </View>

        <View style={styles.card} testID="report-chart">
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Revenue last 6 months</Text>
            <Text style={styles.cardSub}>{fmtCurrency(data.total_paid)} total</Text>
          </View>
          <View style={styles.chartRow}>
            {data.monthly_revenue.map((m) => {
              const h = Math.round((m.total / maxRev) * 120);
              return (
                <View key={m.label} style={styles.chartCol}>
                  <Text style={styles.chartValue} numberOfLines={1}>
                    {m.total > 0 ? fmtCurrency(m.total) : ""}
                  </Text>
                  <View style={[styles.bar, { height: Math.max(h, 4), backgroundColor: colors.primary }]} />
                  <Text style={styles.chartLabel}>{m.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top clients</Text>
          {data.top_clients.length === 0 ? (
            <Text style={styles.empty}>No paid invoices yet.</Text>
          ) : (
            data.top_clients.map((c, idx) => (
              <Pressable
                key={c.client_id}
                style={styles.clientRow}
                onPress={() => router.push(`/clients/${c.client_id}`)}
                testID={`report-top-client-${c.client_id}`}
              >
                <View style={styles.rank}>
                  <Text style={styles.rankText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {c.company ? (
                    <Text style={styles.clientCompany} numberOfLines={1}>
                      {c.company}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.clientTotal}>{fmtCurrency(c.total)}</Text>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Outstanding aging</Text>
          <Text style={styles.cardSub}>How long unpaid invoices have been overdue.</Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {AGING_BUCKETS.map((b) => {
              const v = data.aging[b.key];
              const total = AGING_BUCKETS.reduce((s, x) => s + data.aging[x.key], 0) || 1;
              const pct = (v / total) * 100;
              return (
                <View key={b.key} testID={`report-aging-${b.key}`}>
                  <View style={styles.agingHead}>
                    <Text style={styles.agingLabel}>{b.label}</Text>
                    <Text style={styles.agingValue}>{fmtCurrency(v)}</Text>
                  </View>
                  <View style={styles.agingTrack}>
                    <View style={[styles.agingFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quote pipeline</Text>
          <View style={styles.statsRow}>
            <StatPill label="Sent" value={data.quotes_sent} colors={colors} />
            <StatPill label="Accepted" value={data.quotes_accepted} tone="success" colors={colors} />
            <StatPill label="Rejected" value={data.quotes_rejected} tone="error" colors={colors} />
          </View>
        </View>

        <CsvExportPanel />

        <TouchableOpacity onPress={() => router.back()} style={styles.doneBtn} testID="reports-done-button">
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

async function _unusedExportInvoicesCsv() {
  // Replaced by CsvExportPanel; kept as a noop to avoid import churn.
}

function KpiTile({
  label,
  value,
  colors,
  testID,
}: {
  label: string;
  value: string;
  colors: ColorPalette;
  testID?: string;
}) {
  const styles = makeStyles(colors);
  return (
    <View style={styles.kpi} testID={testID}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function StatPill({
  label,
  value,
  tone,
  colors,
}: {
  label: string;
  value: number;
  tone?: "success" | "error";
  colors: ColorPalette;
}) {
  const bg =
    tone === "success" ? colors.successBg : tone === "error" ? colors.errorBg : colors.bgAlt;
  const fg =
    tone === "success" ? colors.successText : tone === "error" ? colors.errorText : colors.textPrimary;
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: radii.md, backgroundColor: bg, alignItems: "center" }}>
      <Text style={{ color: fg, fontSize: 22, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600", marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    body: { padding: spacing.md, paddingBottom: spacing.xxl },
    kpiRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
    kpi: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
    },
    kpiLabel: { ...type.label, color: colors.textSecondary, textTransform: "uppercase" },
    kpiValue: { ...type.h2, color: colors.textPrimary, marginTop: 4 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginTop: 12,
      ...shadow,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    cardTitle: { ...type.h3, color: colors.textPrimary },
    cardSub: { ...type.body, color: colors.textSecondary, marginTop: 2 },
    chartRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      marginTop: 16,
      height: 160,
    },
    chartCol: { flex: 1, alignItems: "center", gap: 6 },
    chartValue: { fontSize: 9, color: colors.textSecondary, fontWeight: "600", height: 12 },
    bar: { width: "70%", borderTopLeftRadius: 6, borderTopRightRadius: 6 },
    chartLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
    empty: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
    clientRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rank: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.bgAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    rankText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
    clientName: { color: colors.textPrimary, fontWeight: "600" },
    clientCompany: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
    clientTotal: { color: colors.textPrimary, fontWeight: "700" },
    agingHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    agingLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
    agingValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
    agingTrack: {
      height: 8,
      backgroundColor: colors.bgAlt,
      borderRadius: 4,
      overflow: "hidden",
    },
    agingFill: { height: "100%", borderRadius: 4 },
    statsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
    doneBtn: {
      paddingVertical: 14,
      alignItems: "center",
      marginTop: spacing.lg,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    doneText: { color: colors.textSecondary, fontWeight: "600" },
    csvBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingVertical: 14,
      marginTop: spacing.md,
    },
    csvText: { color: colors.textInverse, fontWeight: "700", fontSize: 14 },
    filterCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: 12,
    },
    filterTitle: { fontSize: 12, color: colors.textSecondary, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  });
