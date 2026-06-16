import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenHeader } from "../components/Header";
import { useAuth } from "../lib/auth";
import {
  getOfferings,
  isRevenueCatAvailable,
  purchasePackage,
  restorePurchases,
  type Pkg,
} from "../lib/revenuecat";
import {
  radii,
  spacing,
  type,
  useTheme,
  type ColorPalette,
} from "../lib/theme";

const FEATURES = [
  { icon: "infinite-outline" as const, label: "Unlimited clients, projects & invoices" },
  { icon: "image-outline" as const, label: "Custom business logo on quotes & invoices" },
  { icon: "color-palette-outline" as const, label: "Accent color & PDF branding (coming soon)" },
  { icon: "stats-chart-outline" as const, label: "Advanced revenue reports & exports" },
  { icon: "headset-outline" as const, label: "Priority support" },
];

export default function ProPaywallScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rcAvailable = isRevenueCatAvailable();
  const isPro = !!user?.is_pro;

  useEffect(() => {
    let alive = true;
    if (!rcAvailable) return;
    (async () => {
      const pkgs = await getOfferings();
      if (!alive) return;
      setPackages(pkgs);
      // Default to annual if present, else monthly
      const annual = pkgs.find((p) => p.period === "annual");
      setSelectedId((annual ?? pkgs[0])?.identifier ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [rcAvailable]);

  const onPurchase = async () => {
    setError(null);
    setBusy(true);
    try {
      if (rcAvailable && packages.length > 0) {
        // Real purchase flow via RevenueCat (native iOS only)
        const pkg = packages.find((p) => p.identifier === selectedId) ?? packages[0];
        const res = await purchasePackage(pkg);
        if (!res.ok) {
          setError(res.reason ?? "Purchase failed");
          return;
        }
        await refresh();
        router.back();
      } else {
        // Web / Expo Go preview \u2014 no mocked endpoint on shared backend.
        setError("Pro purchases are only available on iOS builds. Run the app on a real device after publishing.");
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "Upgrade failed";
      setError(m);
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    setError(null);
    setBusy(true);
    try {
      if (rcAvailable) {
        const res = await restorePurchases();
        if (!res.ok) {
          setError(res.reason ?? "Nothing to restore");
          return;
        }
        await refresh();
      } else {
        setError("Restore is only available on iOS production builds.");
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "Restore failed";
      setError(m);
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    setError(null);
    setBusy(true);
    try {
      // Pro subscriptions are managed via the App Store / Play Store. Direct user there.
      setError("To cancel, open Settings \u2192 Apple ID \u2192 Subscriptions on your device.");
    } finally {
      setBusy(false);
    }
  };

  const monthlyPkg = packages.find((p) => p.period === "monthly");
  const annualPkg = packages.find((p) => p.period === "annual");
  const hasRealPackages = packages.length > 0;

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Lancely Pro" showBack />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.proGlyph}>
            <Ionicons name="sparkles" size={28} color={colors.textInverse} />
          </View>
          <Text style={styles.title}>Run your business{"\n"}without limits.</Text>
          <Text style={styles.subtitle}>
            Lancely Pro unlocks branded invoices, unlimited records, and advanced reports.
          </Text>

          {!hasRealPackages ? (
            <View style={styles.priceCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.priceAmount}>AED 29</Text>
                <Text style={styles.priceUnit}>per month, billed monthly</Text>
              </View>
              <View style={styles.savePill}>
                <Text style={styles.savePillText}>14-day trial</Text>
              </View>
            </View>
          ) : null}
        </View>

        {hasRealPackages ? (
          <View style={styles.packagesRow}>
            {annualPkg ? (
              <TouchableOpacity
                onPress={() => setSelectedId(annualPkg.identifier)}
                style={[
                  styles.pkgCard,
                  selectedId === annualPkg.identifier && styles.pkgCardSelected,
                ]}
                testID="pkg-annual"
              >
                <View style={styles.bestBadge}>
                  <Text style={styles.bestBadgeText}>BEST VALUE</Text>
                </View>
                <Text style={styles.pkgPeriod}>Annual</Text>
                <Text style={styles.pkgPrice}>{annualPkg.priceString}</Text>
                <Text style={styles.pkgHint}>billed yearly</Text>
              </TouchableOpacity>
            ) : null}
            {monthlyPkg ? (
              <TouchableOpacity
                onPress={() => setSelectedId(monthlyPkg.identifier)}
                style={[
                  styles.pkgCard,
                  selectedId === monthlyPkg.identifier && styles.pkgCardSelected,
                ]}
                testID="pkg-monthly"
              >
                <Text style={styles.pkgPeriod}>Monthly</Text>
                <Text style={styles.pkgPrice}>{monthlyPkg.priceString}</Text>
                <Text style={styles.pkgHint}>billed monthly</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View style={styles.featureCard}>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={16} color={colors.primary} />
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isPro ? (
          <>
            <View style={styles.activeBanner} testID="pro-active-banner">
              <Ionicons name="checkmark-circle" size={18} color={colors.successText} />
              <Text style={styles.activeText}>You&apos;re on Lancely Pro</Text>
            </View>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={busy}
              testID="pro-cancel-button"
            >
              {busy ? (
                <ActivityIndicator color={colors.textSecondary} />
              ) : (
                <Text style={styles.cancelText}>Cancel subscription</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.upgradeBtn}
              onPress={onPurchase}
              disabled={busy}
              testID="pro-upgrade-button"
            >
              {busy ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <>
                  <Ionicons name="rocket-outline" size={18} color={colors.textInverse} />
                  <Text style={styles.upgradeText}>
                    {rcAvailable ? "Subscribe" : "Start free trial"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {rcAvailable ? (
              <TouchableOpacity
                onPress={onRestore}
                disabled={busy}
                style={styles.restoreBtn}
                testID="pro-restore-button"
              >
                <Text style={styles.restoreText}>Restore Purchases</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}

        <Text style={styles.footnote}>
          {rcAvailable
            ? "Subscriptions auto-renew until cancelled in Settings → Apple ID. Cancel anytime."
            : "You can cancel anytime. No real payment is processed in this preview build."}
        </Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    body: { padding: spacing.md, paddingBottom: spacing.xxl },
    hero: {
      backgroundColor: colors.primary,
      borderRadius: radii.xl,
      padding: spacing.lg,
      alignItems: "flex-start",
      marginBottom: spacing.md,
    },
    proGlyph: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.md,
    },
    title: {
      fontSize: 30,
      lineHeight: 34,
      fontWeight: "800",
      color: colors.textInverse,
      letterSpacing: -0.6,
    },
    subtitle: {
      fontSize: 14,
      color: colors.onPrimaryMuted,
      marginTop: 8,
      maxWidth: 320,
    },
    priceCard: {
      marginTop: spacing.lg,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: radii.lg,
      padding: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
    },
    priceAmount: { color: colors.textInverse, fontSize: 26, fontWeight: "800" },
    priceUnit: { color: colors.onPrimaryMuted, fontSize: 12, marginTop: 2 },
    savePill: {
      backgroundColor: colors.textInverse,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    savePillText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
    featureCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: 12,
    },
    featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    featureIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.bgAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    featureLabel: { ...type.body, color: colors.textPrimary, flex: 1, fontWeight: "500" },
    upgradeBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: radii.lg,
      paddingVertical: 16,
    },
    upgradeText: { color: colors.textInverse, fontWeight: "700", fontSize: 16 },
    restoreBtn: { paddingVertical: 14, alignItems: "center", marginTop: 6 },
    restoreText: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
    packagesRow: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
    pkgCard: {
      flex: 1,
      borderRadius: radii.lg,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      minHeight: 112,
    },
    pkgCardSelected: { borderColor: colors.primary, backgroundColor: colors.bgAlt },
    pkgPeriod: { ...type.caption, color: colors.textSecondary, fontWeight: "700", marginBottom: 4 },
    pkgPrice: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.4 },
    pkgHint: { ...type.caption, color: colors.textMuted, marginTop: 4 },
    bestBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      marginBottom: 6,
    },
    bestBadgeText: { color: colors.textInverse, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
    activeBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.successBg,
      paddingVertical: 14,
      borderRadius: radii.lg,
      marginBottom: 10,
    },
    activeText: { color: colors.successText, fontWeight: "700" },
    cancelBtn: {
      paddingVertical: 14,
      alignItems: "center",
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelText: { color: colors.textSecondary, fontWeight: "600" },
    error: { color: colors.errorText, textAlign: "center", marginBottom: 8 },
    footnote: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: "center",
      marginTop: spacing.md,
    },
  });
