import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenHeader } from "../../components/Header";
import { api } from "../../lib/api";
import { fmtAED, fmtDateShort } from "../../lib/format";
import { radii, spacing, type, useTheme, type ColorPalette } from "../../lib/theme";
import type { Client, Project, ProjectStatus } from "../../lib/types";
import { PROJECT_STATUSES } from "../../lib/types";

export default function ProjectsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const colWidth = Math.max(260, Math.round(width * 0.78));

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      api<Project[]>("/projects"),
      api<Client[]>("/clients"),
    ]);
    setProjects(p);
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

  const grouped = useMemo(() => {
    const out: Record<ProjectStatus, Project[]> = {
      lead: [],
      proposal_sent: [],
      in_progress: [],
      review: [],
      completed: [],
    };
    projects.forEach((p) => out[p.status].push(p));
    return out;
  }, [projects]);

  const moveProject = async (id: string, dir: 1 | -1) => {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    const idx = PROJECT_STATUSES.findIndex((s) => s.key === proj.status);
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= PROJECT_STATUSES.length) return;
    const nextStatus = PROJECT_STATUSES[nextIdx].key;
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status: nextStatus } : p)));
    try {
      await api(`/projects/${id}/status`, { method: "PATCH", body: { status: nextStatus } });
    } catch {
      // revert
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status: proj.status } : p)));
    }
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Projects" subtitle="Kanban pipeline" bellTo="/notifications" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          horizontal
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 96 }}
          decelerationRate="fast"
          snapToInterval={colWidth + 12}
        >
          {PROJECT_STATUSES.map((s) => (
            <View key={s.key} style={[styles.col, { width: colWidth }]}>
              <View style={styles.colHeader}>
                <Text style={styles.colTitle}>{s.label}</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countText}>{grouped[s.key].length}</Text>
                </View>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {grouped[s.key].length === 0 ? (
                  <View style={styles.emptyCol}>
                    <Text style={styles.emptyColText}>Drop projects here</Text>
                  </View>
                ) : (
                  grouped[s.key].map((p) => (
                    <View key={p.id} style={styles.card} testID={`project-card-${p.id}`}>
                      <TouchableOpacity onPress={() => router.push(`/projects/${p.id}`)}>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {p.name}
                        </Text>
                        <Text style={styles.cardSub} numberOfLines={1}>
                          {clients[p.client_id]?.name ?? "—"}
                        </Text>
                        <View style={styles.cardFooter}>
                          <Text style={styles.cardAmount}>{fmtAED(p.value)}</Text>
                          {p.due_date ? (
                            <View style={styles.dueBadge}>
                              <Ionicons name="calendar-outline" size={11} color={colors.textSecondary} />
                              <Text style={styles.dueText}>{fmtDateShort(p.due_date)}</Text>
                            </View>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                      <View style={styles.moveRow}>
                        <TouchableOpacity
                          style={styles.moveBtn}
                          onPress={() => moveProject(p.id, -1)}
                          disabled={PROJECT_STATUSES.findIndex((x) => x.key === p.status) === 0}
                          testID={`project-${p.id}-move-back`}
                        >
                          <Ionicons name="chevron-back" size={16} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.moveBtn}
                          onPress={() => moveProject(p.id, 1)}
                          disabled={
                            PROJECT_STATUSES.findIndex((x) => x.key === p.status) === PROJECT_STATUSES.length - 1
                          }
                          testID={`project-${p.id}-move-forward`}
                        >
                          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/projects/new")}
        testID="projects-fab"
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color={colors.textInverse} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  col: {
    marginRight: 12,
    backgroundColor: colors.bgAlt,
    borderRadius: radii.lg,
    padding: 10,
    height: "100%",
  },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  colTitle: { ...type.h3, color: colors.textPrimary, fontSize: 16 },
  countPill: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countText: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
  emptyCol: {
    alignItems: "center",
    paddingVertical: 24,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  emptyColText: { color: colors.textMuted, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { ...type.bodyLg, color: colors.textPrimary, fontWeight: "600" },
  cardSub: { ...type.body, color: colors.textSecondary, marginTop: 4 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  cardAmount: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  dueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.bgAlt,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dueText: { fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
  moveRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  moveBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
  },
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
