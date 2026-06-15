import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii } from "../lib/theme";
import type { Client } from "../lib/types";

export function ClientPicker({
  clients,
  value,
  onChange,
}: {
  clients: Client[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>Client *</Text>
      {clients.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Add a client first to continue.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {clients.map((c) => {
            const active = value === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onChange(c.id)}
                testID={`client-chip-${c.id}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 6, fontWeight: "600" },
  row: { gap: 8, paddingVertical: 4 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    flexShrink: 0,
    maxWidth: 200,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.textInverse },
  empty: {
    backgroundColor: colors.bgAlt,
    padding: 12,
    borderRadius: radii.md,
    alignItems: "center",
  },
  emptyText: { color: colors.textMuted, fontSize: 13 },
});
