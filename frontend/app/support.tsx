import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { ScreenHeader } from "../components/Header";
import { radii, spacing, type, useTheme, type ColorPalette } from "../lib/theme";

const SUPPORT_EMAIL = "hello@lance-ly.com";
const PRIVACY_URL = "https://lance-ly.com/privacy";
const TERMS_URL = "https://lance-ly.com/terms";

const FAQ: { q: string; a: string }[] = [
  { q: "How do I create my first quote?", a: "Tap the Quotes tab → + button. Pick a client, add line items (description, quantity, rate), and tap Save. The PDF is generated instantly." },
  { q: "How do I get paid faster?", a: "After sending an invoice, share it via WhatsApp/Email from the invoice detail page. Lancely sends automatic reminders for unpaid invoices." },
  { q: "How does the Free vs Pro plan work?", a: "Free gives you up to 5 clients, projects, quotes & invoices. Pro removes all limits and adds custom branding, advanced reports, and CSV exports." },
  { q: "How do I cancel my subscription?", a: "Go to iPhone Settings → your Apple ID → Subscriptions → Lancely Pro → Cancel. Your Pro features remain active until the period ends." },
  { q: "How do I restore a previous purchase?", a: "Settings → Restore Purchases. We'll check your Apple ID for any active Lancely subscription." },
  { q: "Is my data safe?", a: "Yes. We use TLS encryption, never sell your data, and don't include any third-party trackers or ad SDKs. See our Privacy Policy for details." },
  { q: "How do I delete my account?", a: "Settings → Delete account. This permanently removes all your clients, projects, invoices, and payment records. Cannot be undone." },
];

export default function Support() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? "1.0.3";
  const buildNum = Platform.select({ ios: Constants.expoConfig?.ios?.buildNumber, android: String(Constants.expoConfig?.android?.versionCode ?? "") }) ?? "";

  const mailto = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Lancely Support`).catch(() => {});
  const openUrl = (u: string) => Linking.openURL(u).catch(() => {});

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Support" showBack />
      <ScrollView contentContainerStyle={styles.body} testID="support-scroll">
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={mailto} testID="support-email">
            <Ionicons name="mail-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Email Support</Text>
              <Text style={styles.rowSub}>{SUPPORT_EMAIL}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.sep} />
          <TouchableOpacity style={styles.row} onPress={() => openUrl(PRIVACY_URL)} testID="support-privacy">
            <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>Privacy Policy</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.sep} />
          <TouchableOpacity style={styles.row} onPress={() => openUrl(TERMS_URL)} testID="support-terms">
            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>Terms of Service</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.section}>Frequently Asked Questions</Text>
        <View style={styles.card}>
          {FAQ.map((item, i) => (
            <View key={item.q}>
              <View style={styles.faqItem}>
                <Text style={styles.q}>{item.q}</Text>
                <Text style={styles.a}>{item.a}</Text>
              </View>
              {i < FAQ.length - 1 ? <View style={styles.sep} /> : null}
            </View>
          ))}
        </View>

        <Text style={styles.section}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>App Version</Text></View>
            <Text style={styles.rowSub}>{version}{buildNum ? ` (${buildNum})` : ""}</Text>
          </View>
        </View>

        <Text style={styles.legal}>© 2026 Lancely. Manage. Create. Get Paid.</Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md },
  rowTitle: { ...type.body, color: colors.textPrimary, fontWeight: "600" },
  rowSub: { ...type.caption, color: colors.textSecondary },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  section: { ...type.caption, color: colors.textSecondary, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: spacing.md, marginLeft: spacing.sm },
  faqItem: { padding: spacing.md, gap: 6 },
  q: { ...type.body, color: colors.textPrimary, fontWeight: "700" },
  a: { ...type.body, color: colors.textSecondary, lineHeight: 22 },
  legal: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: spacing.md },
});
