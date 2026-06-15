import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenHeader } from "../../components/Header";
import { projectTone, StatusBadge } from "../../components/StatusBadge";
import { api } from "../../lib/api";
import { fmtDate, useFmtCurrency } from "../../lib/format";
import { radii, spacing, type, useTheme, type ColorPalette } from "../../lib/theme";
import type { Client, Project, ProjectStatus } from "../../lib/types";
import { PROJECT_STATUSES } from "../../lib/types";

export default function ProjectDetail() {
  const fmtCurrency = useFmtCurrency();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const p = await api<Project>(`/projects/${id}`);
    setProject(p);
    try {
      const c = await api<Client>(`/clients/${p.client_id}`);
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

  const setStatus = async (s: ProjectStatus) => {
    if (!project) return;
    setProject({ ...project, status: s });
    await api(`/projects/${project.id}/status`, { method: "PATCH", body: { status: s } });
  };

  const onDelete = async () => {
    if (!project) return;
    await api(`/projects/${project.id}`, { method: "DELETE" });
    router.back();
  };

  if (loading || !project) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Project" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title={project.name} showBack />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.label}>CLIENT</Text>
          <Text style={styles.h2}>{client?.name ?? "—"}</Text>

          <View style={styles.grid}>
            <View style={styles.cell}>
              <Text style={styles.cellLabel}>VALUE</Text>
              <Text style={styles.cellValue}>{fmtCurrency(project.value)}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.cellLabel}>DUE</Text>
              <Text style={styles.cellValue}>{fmtDate(project.due_date)}</Text>
            </View>
          </View>
          <View style={{ marginTop: 10 }}>
            <StatusBadge label={project.status} tone={projectTone(project.status)} />
          </View>
        </View>

        <Text style={styles.section}>Move to status</Text>
        <View style={styles.statusRow}>
          {PROJECT_STATUSES.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.chip, project.status === s.key && styles.chipActive]}
              onPress={() => setStatus(s.key)}
              testID={`project-detail-status-${s.key}`}
            >
              <Text style={[styles.chipText, project.status === s.key && styles.chipTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} testID="project-delete-button">
          <Ionicons name="trash-outline" size={16} color={colors.errorText} />
          <Text style={styles.deleteText}>Delete project</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  label: { ...type.label, color: colors.textSecondary },
  h2: { ...type.h2, color: colors.textPrimary, marginTop: 2 },
  grid: { flexDirection: "row", gap: 12, marginTop: spacing.md },
  cell: { flex: 1, backgroundColor: colors.bgAlt, padding: 12, borderRadius: radii.md },
  cellLabel: { ...type.label, color: colors.textSecondary },
  cellValue: { color: colors.textPrimary, fontWeight: "700", marginTop: 4 },
  section: { ...type.h3, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: 8 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: colors.textInverse },
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
