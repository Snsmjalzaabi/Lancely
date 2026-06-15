import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { EmptyState } from "../../components/EmptyState";
import { ScreenHeader } from "../../components/Header";
import { api } from "../../lib/api";
import { colors, radii, spacing, type } from "../../lib/theme";
import type { Client } from "../../lib/types";

export default function ClientsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const data = await api<Client[]>("/clients");
    setItems(data);
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
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Clients" subtitle={`${items.length} total`} bellTo="/notifications" />
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search clients"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          testID="clients-search-input"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={query ? "No matches" : "No clients yet"}
          subtitle={query ? "Try a different search." : "Add your first client to get started."}
          actionLabel="Add Client"
          onAction={() => router.push("/clients/new")}
          testID="clients-empty"
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/clients/${item.id}`)}
              testID={`client-row-${item.id}`}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.name || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.name}</Text>
                {item.company ? <Text style={styles.subtitle}>{item.company}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/clients/new")}
        testID="clients-fab"
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color={colors.textInverse} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bgAlt,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: 10,
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "700", color: colors.primary, fontSize: 16 },
  title: { ...type.bodyLg, color: colors.textPrimary },
  subtitle: { ...type.body, color: colors.textSecondary, marginTop: 2 },
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
