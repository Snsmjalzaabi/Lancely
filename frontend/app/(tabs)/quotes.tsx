import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { EmptyState } from "../../components/EmptyState";
import { ScreenHeader } from "../../components/Header";
import { quoteTone, StatusBadge } from "../../components/StatusBadge";
import { api } from "../../lib/api";
import { fmtAED, fmtDate } from "../../lib/format";
import { colors, radii, spacing, type } from "../../lib/theme";
import type { Client, Quote } from "../../lib/types";

export default function QuotesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [q, c] = await Promise.all([api<Quote[]>("/quotes"), api<Client[]>("/clients")]);
    setItems(q);
    const map: Record<string, Client> = {};
    c.forEach((cl) => (map[cl.id] = cl));
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

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Quotes" subtitle={`${items.length} sent`} bellTo="/notifications" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No quotes yet"
          subtitle="Create your first quote in under a minute."
          actionLabel="Create Quote"
          onAction={() => router.push("/quotes/new")}
          testID="quotes-empty"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(q) => q.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/quotes/${item.id}`)}
              testID={`quote-row-${item.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.quote_number}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {clients[item.client_id]?.name ?? "—"} · {fmtDate(item.created_at)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={styles.amount}>{fmtAED(item.amount)}</Text>
                <StatusBadge label={item.status} tone={quoteTone(item.status)} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/quotes/new")}
        testID="quotes-fab"
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color={colors.textInverse} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
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
