import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenHeader } from "../../components/Header";
import { ThemePickerTrigger } from "../../components/ThemePicker";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFmtCurrency } from "../../lib/format";
import { radii, shadow, spacing, type, useTheme, type ColorPalette } from "../../lib/theme";
import type { DashboardStats, Invoice } from "../../lib/types";
import { invoiceTone, StatusBadge } from "../../components/StatusBadge";

export default function Dashboard() {
  const fmtCurrency = useFmtCurrency();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const s = await api<DashboardStats>("/analytics/dashboard");
    setStats(s);
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

  // Compute "revenue this month" from the monthly_earnings series tail
  const revenueThisMonth = useMemo(() => {
    if (!stats?.monthly_earnings?.length) return 0;
    const last = stats.monthly_earnings[stats.monthly_earnings.length - 1];
    return Number(last?.earnings ?? last?.amount ?? 0);
  }, [stats]);

  const outstandingInvoices = useMemo(() => {
    const recent = stats?.recent_invoices ?? [];
    return recent.filter((i) => i.status !== "paid").slice(0, 5);
  }, [stats]);

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title={`Hi, ${user?.name?.split(" ")[0] ?? "there"}`}
        subtitle="Here's your business at a glance"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ThemePickerTrigger />
            <TouchableOpacity onPress={signOut} style={styles.iconBtn} testID="dashboard-logout-button">
              <Ionicons name="log-out-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        }
        bellTo="/notifications"
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        testID="dashboard-scroll"
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.heroCard} testID="dashboard-revenue-card">
              <Text style={styles.heroLabel}>Revenue this month</Text>
              <Text style={styles.heroValue}>{fmtCurrency(revenueThisMonth)}</Text>
              <View style={styles.heroFooter}>
                <View>
                  <Text style={styles.heroSubLabel}>Total revenue</Text>
                  <Text style={styles.heroSubValue}>{fmtCurrency(stats?.total_revenue ?? 0)}</Text>
                </View>
                <View>
                  <Text style={styles.heroSubLabel}>Outstanding</Text>
                  <Text style={styles.heroSubValue}>{fmtCurrency(stats?.unpaid_amount ?? 0)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.grid}>
              <KpiTile
                icon="people-outline"
                label="Total Clients"
                value={String(stats?.total_clients ?? 0)}
                tint={colors.infoBg}
                onPress={() => router.push("/(tabs)/clients")}
                testID="kpi-active-clients"
              />
              <KpiTile
                icon="briefcase-outline"
                label="Active Projects"
                value={String(stats?.active_projects ?? 0)}
                tint={colors.successBg}
                onPress={() => router.push("/(tabs)/projects")}
                testID="kpi-active-projects"
              />
              <KpiTile
                icon="time-outline"
                label="Unpaid"
                value={fmtCurrency(stats?.unpaid_amount ?? 0)}
                tint={colors.warningBg}
                onPress={() => router.push("/(tabs)/invoices")}
                testID="kpi-pending-invoices"
              />
              <KpiTile
                icon="alert-circle-outline"
                label="Overdue"
                value={fmtCurrency(stats?.overdue_amount ?? 0)}
                tint={colors.errorBg}
                onPress={() => router.push("/(tabs)/invoices")}
                testID="kpi-overdue-invoices"
              />
            </View>

            <SectionHeader
              title="Outstanding invoices"
              actionLabel="View all"
              onAction={() => router.push("/(tabs)/invoices")}
            />
            {outstandingInvoices.length === 0 ? (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>You&apos;re all caught up. </Text>
              </View>
            ) : (
              outstandingInvoices.map((inv: Invoice) => {
                const remaining = (Number(inv.total ?? 0)) - Number(inv.paid_amount ?? 0);
                const dueLabel = inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—";
                return (
                  <TouchableOpacity
                    key={inv.id}
                    style={styles.row}
                    onPress={() => router.push(`/invoices/${inv.id}`)}
                    testID={`dashboard-invoice-${inv.id}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{inv.number ?? inv.title ?? "Invoice"}</Text>
                      <Text style={styles.rowSubtitle}>Due {dueLabel}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={styles.rowAmount}>{fmtCurrency(remaining)}</Text>
                      <StatusBadge label={inv.status} tone={invoiceTone(inv.status)} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function KpiTile({
  icon,
  label,
  value,
  tint,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tint: string;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <TouchableOpacity style={styles.kpi} onPress={onPress} testID={testID} activeOpacity={0.8}>
      <View style={[styles.kpiIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={18} color={colors.textPrimary} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1}>
        {value}
      </Text>
    </TouchableOpacity>
  );
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onAction}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  heroLabel: { color: colors.onPrimaryMuted, ...type.label, textTransform: "uppercase" },
  heroValue: { color: colors.textInverse, fontSize: 34, lineHeight: 40, fontWeight: "700", marginTop: 6 },
  heroFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.onPrimaryBorder,
  },
  heroSubLabel: { color: colors.onPrimaryMuted, fontSize: 11, fontWeight: "600", letterSpacing: 0.4 },
  heroSubValue: { color: colors.textInverse, fontSize: 16, fontWeight: "600", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: spacing.md },
  kpi: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  kpiLabel: { ...type.body, color: colors.textSecondary },
  kpiValue: { ...type.h3, color: colors.textPrimary, marginTop: 4 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...type.h3, color: colors.textPrimary },
  sectionAction: { color: colors.primary, fontWeight: "600", fontSize: 13 },
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
  rowTitle: { ...type.bodyLg, color: colors.textPrimary },
  rowSubtitle: { ...type.body, color: colors.textSecondary, marginTop: 2 },
  rowAmount: { ...type.bodyLg, color: colors.textPrimary, fontWeight: "700" },
  placeholder: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
  },
  placeholderText: { color: colors.textSecondary },
  notifCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: 8,
  },
  notifTitle: { color: colors.textPrimary, fontWeight: "600" },
  notifSub: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
});
