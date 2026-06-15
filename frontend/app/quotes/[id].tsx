import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHeader } from "../../components/Header";
import { PdfPreviewModal } from "../../components/PdfPreviewModal";
import { quoteTone, StatusBadge } from "../../components/StatusBadge";
import { api } from "../../lib/api";
import { fmtDate, useFmtCurrency } from "../../lib/format";
import { exportQuotePdf } from "../../lib/pdf";
import { useSettings } from "../../lib/settings";
import { radii, spacing, type, useTheme, type ColorPalette } from "../../lib/theme";
import type { Client, Quote } from "../../lib/types";

export default function QuoteDetail() {
  const fmtCurrency = useFmtCurrency();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const { settings } = useSettings();

  const load = useCallback(async () => {
    if (!id) return;
    const q = await api<Quote>(`/quotes/${id}`);
    setQuote(q);
    try {
      const c = await api<Client>(`/clients/${q.client_id}`);
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

  const setStatus = async (status: "accepted" | "rejected") => {
    if (!quote) return;
    setBusy(true);
    try {
      const updated = await api<Quote>(`/quotes/${quote.id}/status`, {
        method: "PATCH",
        query: { status },
      });
      setQuote(updated);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!quote) return;
    await api(`/quotes/${quote.id}`, { method: "DELETE" });
    router.back();
  };

  const onSharePdf = async () => {
    if (!quote) return;
    setExporting(true);
    try {
      const uri = await exportQuotePdf(quote, client, {
        logoUri: settings.logo_base64 ?? null,
        businessName: settings.business_name || null,
        currency: settings.currency || "AED",
        accentColor: settings.accent_color ?? undefined,
      });
      setPdfUri(uri as string);
    } finally {
      setExporting(false);
    }
  };

  if (loading || !quote) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Quote" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title={quote.quote_number} showBack />
      <ScrollView contentContainerStyle={styles.body}>
        {settings.logo_base64 ? (
          <View style={styles.logoWrap} testID="quote-detail-logo">
            <Image source={{ uri: settings.logo_base64 }} style={styles.logo} resizeMode="contain" />
          </View>
        ) : null}
        <View style={styles.headCard}>
          <Text style={styles.label}>QUOTE FOR</Text>
          <Text style={styles.client}>{client?.name ?? "—"}</Text>
          {client?.company ? <Text style={styles.sub}>{client.company}</Text> : null}
          <View style={{ marginTop: 10 }}>
            <StatusBadge label={quote.status} tone={quoteTone(quote.status)} />
          </View>
        </View>

        <Text style={styles.section}>Items</Text>
        {quote.items.map((it, idx) => (
          <View key={idx} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{it.service}</Text>
              {it.description ? <Text style={styles.itemDesc}>{it.description}</Text> : null}
            </View>
            <Text style={styles.itemPrice}>{fmtCurrency(it.price)}</Text>
          </View>
        ))}

        <View style={styles.totalCard}>
          <Text style={styles.label}>TOTAL</Text>
          <Text style={styles.total}>{fmtCurrency(quote.amount)}</Text>
          <Text style={styles.sub}>Sent {fmtDate(quote.created_at)}</Text>
        </View>

        {quote.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.label}>NOTES</Text>
            <Text style={styles.notes}>{quote.notes}</Text>
          </View>
        ) : null}

        <PrimaryButton
          label="Share as PDF"
          variant="secondary"
          onPress={onSharePdf}
          loading={exporting}
          testID="quote-share-pdf"
          leftIcon={<Ionicons name="share-outline" size={16} color={colors.textPrimary} />}
        />

        {quote.status !== "accepted" && quote.status !== "rejected" ? (
          <View style={{ gap: 10, marginTop: spacing.lg }}>
            <PrimaryButton
              label="Mark Accepted"
              onPress={() => setStatus("accepted")}
              loading={busy}
              testID="quote-mark-accepted"
              leftIcon={<Ionicons name="checkmark-circle-outline" size={16} color={colors.textInverse} />}
            />
            <PrimaryButton
              label="Mark Rejected"
              variant="secondary"
              onPress={() => setStatus("rejected")}
              loading={busy}
              testID="quote-mark-rejected"
            />
          </View>
        ) : null}

        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} testID="quote-delete-button">
          <Ionicons name="trash-outline" size={16} color={colors.errorText} />
          <Text style={styles.deleteText}>Delete quote</Text>
        </TouchableOpacity>
      </ScrollView>
      <PdfPreviewModal
        open={!!pdfUri}
        uri={pdfUri}
        title={`Quote ${quote.quote_number}`}
        onClose={() => setPdfUri(null)}
      />
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
  logoWrap: {
    alignSelf: "center",
    width: 80,
    height: 80,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  logo: { width: "100%", height: "100%" },
  headCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  label: { ...type.label, color: colors.textSecondary, marginBottom: 2 },
  client: { ...type.h2, color: colors.textPrimary },
  sub: { color: colors.textSecondary, marginTop: 2 },
  section: { ...type.h3, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: 8 },
  itemRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  itemTitle: { color: colors.textPrimary, fontWeight: "600" },
  itemDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  itemPrice: { color: colors.textPrimary, fontWeight: "700" },
  totalCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  total: { color: colors.textInverse, fontSize: 28, fontWeight: "700", marginTop: 4 },
  notesBox: {
    backgroundColor: colors.bgAlt,
    padding: 12,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  notes: { color: colors.textPrimary, marginTop: 4, fontSize: 14 },
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
