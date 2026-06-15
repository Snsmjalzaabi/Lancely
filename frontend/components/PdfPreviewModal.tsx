import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";

import { sharePdfUri } from "../lib/pdf";
import { radii, spacing, useTheme, type ColorPalette } from "../lib/theme";

export function PdfPreviewModal({
  open,
  uri,
  title,
  onClose,
}: {
  open: boolean;
  uri: string | null;
  title: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();

  const onPreview = async () => {
    if (!uri) return;
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.open(uri, "_blank");
    } else {
      await WebBrowser.openBrowserAsync(uri);
    }
  };

  const onShare = async () => {
    if (!uri) return;
    await sharePdfUri(uri, title);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="pdf-preview-backdrop" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="pdf-preview-sheet">
        <View style={styles.handle} />
        <View style={styles.iconWrap}>
          <Ionicons name="document-text" size={28} color={colors.primary} />
        </View>
        <Text style={styles.title}>PDF ready</Text>
        <Text style={styles.sub}>Preview the file or send it straight from here.</Text>
        {Platform.OS === "web" && uri ? (
          <View style={styles.webPreview}>
            {/* iframe works on web; falls through to button on native */}
            {React.createElement("iframe", { src: uri, style: { width: "100%", height: 320, border: "0" } })}
          </View>
        ) : null}
        <View style={{ gap: 10, marginTop: 18 }}>
          <TouchableOpacity style={styles.primary} onPress={onPreview} testID="pdf-preview-open">
            <Ionicons name="eye-outline" size={16} color={colors.textInverse} />
            <Text style={styles.primaryText}>Preview</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onShare} testID="pdf-preview-share">
            <Ionicons name="share-outline" size={16} color={colors.textPrimary} />
            <Text style={styles.secondaryText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghost} onPress={onClose} testID="pdf-preview-close">
            <Text style={styles.ghostText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
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
    iconWrap: {
      alignSelf: "center",
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.bgAlt,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
    sub: { fontSize: 13, color: colors.textSecondary, marginTop: 2, textAlign: "center" },
    webPreview: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      overflow: "hidden",
    },
    primary: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    primaryText: { color: colors.textInverse, fontWeight: "700" },
    secondary: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgAlt,
      paddingVertical: 14,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    secondaryText: { color: colors.textPrimary, fontWeight: "700" },
    ghost: { paddingVertical: 12, alignItems: "center" },
    ghostText: { color: colors.textSecondary, fontWeight: "600" },
  });
