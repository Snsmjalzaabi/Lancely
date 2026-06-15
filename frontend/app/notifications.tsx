import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenHeader } from "../components/Header";
import { EmptyState } from "../components/EmptyState";
import { api } from "../lib/api";
import { colors, radii, spacing, type } from "../lib/theme";
import type { Notification } from "../lib/types";

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  invoice_overdue: "alert-circle-outline",
  invoice_due_soon: "time-outline",
  project_due_soon: "briefcase-outline",
  quote_awaiting: "document-text-outline",
};
const TONES: Record<string, string> = {
  invoice_overdue: colors.errorBg,
  invoice_due_soon: colors.warningBg,
  project_due_soon: colors.infoBg,
  quote_awaiting: colors.bgAlt,
};
const TONE_FG: Record<string, string> = {
  invoice_overdue: colors.errorText,
  invoice_due_soon: colors.warningText,
  project_due_soon: colors.infoText,
  quote_awaiting: colors.textSecondary,
};

export default function NotificationsScreen() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ items: Notification[] }>("/notifications");
    setItems(r.items);
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

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Notifications" subtitle="Things that need attention" showBack />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="You're all caught up"
          subtitle="Nothing overdue. Enjoy your coffee."
          testID="notifications-empty"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: TONES[item.type] ?? colors.bgAlt }]} testID={`notif-${item.id}`}>
              <Ionicons
                name={ICONS[item.type] ?? "notifications-outline"}
                size={20}
                color={TONE_FG[item.type] ?? colors.textPrimary}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.title, { color: TONE_FG[item.type] ?? colors.textPrimary }]}>
                  {item.title}
                </Text>
                <Text style={styles.sub}>{item.subtitle}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  card: {
    flexDirection: "row",
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: 10,
    alignItems: "center",
  },
  title: { ...type.bodyLg, fontWeight: "700" },
  sub: { ...type.body, color: colors.textSecondary, marginTop: 2 },
});
