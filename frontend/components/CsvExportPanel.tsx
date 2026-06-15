import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { api, getToken } from "../lib/api";
import { radii, spacing, useTheme, type ColorPalette } from "../lib/theme";

type ColMeta = { key: string; label: string };
type DatasetKey = "invoices" | "clients" | "payments";
type Options = Record<DatasetKey, ColMeta[]>;

const DATASET_LABEL: Record<DatasetKey, string> = {
  invoices: "Invoices",
  clients: "Clients",
  payments: "Payments",
};
const DATASET_FILE: Record<DatasetKey, string> = {
  invoices: "solvio-invoices.csv",
  clients: "solvio-clients.csv",
  payments: "solvio-payments.csv",
};

export function CsvExportPanel() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [options, setOptions] = useState<Options | null>(null);
  const [open, setOpen] = useState<DatasetKey | null>(null);
  const [chosen, setChosen] = useState<Record<DatasetKey, string[] | null>>({
    invoices: null,
    clients: null,
    payments: null,
  });
  const [busy, setBusy] = useState<DatasetKey | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<Options>("/reports/export-options");
        setOptions(r);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const download = async (ds: DatasetKey) => {
    setBusy(ds);
    try {
      const colsParam = (chosen[ds] && chosen[ds]!.length > 0) ? `?cols=${chosen[ds]!.join(",")}` : "";
      const base = process.env.EXPO_PUBLIC_BACKEND_URL;
      const tok = await getToken();
      const url = `${base}/api/reports/${ds}.csv${colsParam}`;
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const r = await fetch(url, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        const blob = await r.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = DATASET_FILE[ds];
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
      } else {
        const target = `${FileSystem.cacheDirectory}${DATASET_FILE[ds]}`;
        const dl = await FileSystem.downloadAsync(url, target, {
          headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(dl.uri, { mimeType: "text/csv", dialogTitle: DATASET_FILE[ds] });
        }
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card} testID="reports-export-panel">
      <Text style={styles.title}>Export data</Text>
      <Text style={styles.sub}>Pick a dataset, choose columns, then download.</Text>
      {(["invoices", "clients", "payments"] as DatasetKey[]).map((ds) => {
        const optsForDs = options?.[ds] ?? [];
        const selectedCount = chosen[ds]?.length ?? optsForDs.length;
        return (
          <View key={ds} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dsLabel}>{DATASET_LABEL[ds]}</Text>
              <Text style={styles.dsHint}>
                {selectedCount} / {optsForDs.length} columns
              </Text>
            </View>
            <TouchableOpacity
              style={styles.colsBtn}
              onPress={() => setOpen(ds)}
              testID={`csv-cols-${ds}`}
            >
              <Ionicons name="options-outline" size={14} color={colors.textPrimary} />
              <Text style={styles.colsBtnText}>Columns</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dlBtn}
              onPress={() => download(ds)}
              disabled={busy === ds}
              testID={`csv-export-${ds}`}
            >
              <Ionicons name="download-outline" size={14} color={colors.textInverse} />
              <Text style={styles.dlBtnText}>{busy === ds ? "…" : "CSV"}</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      {open ? (
        <ColumnsSheet
          dataset={open}
          allCols={options?.[open] ?? []}
          value={chosen[open] ?? (options?.[open] ?? []).map((c) => c.key)}
          onClose={() => setOpen(null)}
          onSave={(next) => {
            setChosen((p) => ({ ...p, [open]: next }));
            setOpen(null);
          }}
        />
      ) : null}
    </View>
  );
}

function ColumnsSheet({
  dataset,
  allCols,
  value,
  onClose,
  onSave,
}: {
  dataset: DatasetKey;
  allCols: ColMeta[];
  value: string[];
  onClose: () => void;
  onSave: (next: string[]) => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  // Working list: ordered + checked.
  const [list, setList] = useState<{ key: string; label: string; checked: boolean }[]>(() => {
    const valueSet = new Set(value);
    const ordered = value
      .map((k) => allCols.find((c) => c.key === k))
      .filter(Boolean) as ColMeta[];
    const rest = allCols.filter((c) => !valueSet.has(c.key));
    return [
      ...ordered.map((c) => ({ ...c, checked: true })),
      ...rest.map((c) => ({ ...c, checked: false })),
    ];
  });

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[idx], next[target]] = [next[target], next[idx]];
    setList(next);
  };
  const toggle = (idx: number) => {
    const next = [...list];
    next[idx] = { ...next[idx], checked: !next[idx].checked };
    setList(next);
  };
  const save = () => onSave(list.filter((x) => x.checked).map((x) => x.key));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID={`csv-cols-sheet-${dataset}`}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>{DATASET_LABEL[dataset]} columns</Text>
        <Text style={styles.sheetSub}>Tap to include · use arrows to reorder.</Text>
        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
          {list.map((c, idx) => (
            <View key={c.key} style={styles.colRow}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => toggle(idx)}
                testID={`csv-col-toggle-${dataset}-${c.key}`}
              >
                <Ionicons
                  name={c.checked ? "checkbox" : "square-outline"}
                  size={20}
                  color={c.checked ? colors.primary : colors.textMuted}
                />
              </TouchableOpacity>
              <Text style={[styles.colName, !c.checked && { color: colors.textMuted }]}>{c.label}</Text>
              <TouchableOpacity onPress={() => move(idx, -1)} disabled={idx === 0} style={styles.arrowBtn}>
                <Ionicons name="chevron-up" size={16} color={idx === 0 ? colors.textMuted : colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => move(idx, 1)}
                disabled={idx === list.length - 1}
                style={styles.arrowBtn}
              >
                <Ionicons name="chevron-down" size={16} color={idx === list.length - 1 ? colors.textMuted : colors.textPrimary} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.saveBtn} onPress={save} testID={`csv-cols-save-${dataset}`}>
          <Text style={styles.saveBtnText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginTop: 12,
    },
    title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    sub: { fontSize: 13, color: colors.textSecondary, marginTop: 2, marginBottom: 12 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    dsLabel: { fontWeight: "700", color: colors.textPrimary, fontSize: 14 },
    dsHint: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
    colsBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgAlt,
    },
    colsBtnText: { color: colors.textPrimary, fontWeight: "600", fontSize: 12 },
    dlBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: radii.md,
      backgroundColor: colors.primary,
    },
    dlBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 12 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      paddingHorizontal: 20,
      paddingTop: 12,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    handle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 16 },
    sheetTitle: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
    sheetSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2, marginBottom: 12 },
    colRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 10,
    },
    checkbox: { width: 28 },
    colName: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: "500" },
    arrowBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bgAlt,
    },
    saveBtn: {
      marginTop: 12,
      paddingVertical: 14,
      borderRadius: radii.md,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    saveBtnText: { color: colors.textInverse, fontWeight: "700" },
  });
