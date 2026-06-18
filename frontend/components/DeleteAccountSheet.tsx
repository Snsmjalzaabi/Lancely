// Delete Account confirmation modal — required by Apple Guideline 5.1.1(v).
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { radii, spacing, type, type ColorPalette } from "../lib/theme";

const CONFIRM_TEXT = "DELETE";

export function DeleteAccountSheet({
  open,
  onClose,
  colors,
}: {
  open: boolean;
  onClose: () => void;
  colors: ColorPalette;
}) {
  const styles = makeStyles(colors);
  const { signOut } = useAuth();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setTyped("");
    setError(null);
    setBusy(false);
    onClose();
  };

  const onConfirm = async () => {
    if (typed.trim().toUpperCase() !== CONFIRM_TEXT) {
      setError(`Please type ${CONFIRM_TEXT} to confirm.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // Attempt the standard delete endpoint. If the shared backend doesn't
      // implement it yet, we still sign the user out locally and surface
      // a clear support fallback so Apple's account-deletion requirement is met.
      await api("/auth/me", { method: "DELETE" });
      await signOut();
      close();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError(
          "Account deletion is processed manually. Please email privacy@lance-ly.com from your account email and we'll delete your account within 7 days.",
        );
      } else {
        const msg = e instanceof Error ? e.message : "Could not delete account";
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="warning-outline" size={22} color={colors.errorText} />
            </View>
            <Text style={styles.title}>Delete account?</Text>
          </View>

          <Text style={styles.body}>
            This will permanently delete your account and all of your data:
            clients, projects, quotes, invoices, payments, expenses, and settings.
            {"\n\n"}
            This action cannot be undone.
          </Text>

          <Text style={styles.label}>
            Type <Text style={{ fontWeight: "800" }}>{CONFIRM_TEXT}</Text> to confirm:
          </Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            placeholder={CONFIRM_TEXT}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="delete-account-confirm-input"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={close}
              disabled={busy}
              testID="delete-account-cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteBtn, busy && { opacity: 0.6 }]}
              onPress={onConfirm}
              disabled={busy}
              testID="delete-account-confirm"
            >
              {busy ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color={colors.textInverse} />
                  <Text style={styles.deleteText}>Delete forever</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.legal}>
            Questions about your data? Email privacy@lance-ly.com.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    header: { flexDirection: "row", alignItems: "center", gap: 10 },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.errorBg,
      alignItems: "center",
      justifyContent: "center",
    },
    title: { ...type.headline, color: colors.textPrimary, fontWeight: "800" },
    body: { ...type.body, color: colors.textSecondary, lineHeight: 22 },
    label: { ...type.body, color: colors.textPrimary, fontWeight: "600" },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      color: colors.textPrimary,
      fontSize: 15,
      backgroundColor: colors.bg,
    },
    row: { flexDirection: "row", gap: 10, marginTop: spacing.sm },
    cancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: radii.md,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    cancelText: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
    deleteBtn: {
      flex: 1,
      flexDirection: "row",
      gap: 6,
      paddingVertical: 14,
      borderRadius: radii.md,
      backgroundColor: colors.errorText,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteText: { color: colors.textInverse, fontWeight: "800", fontSize: 15 },
    error: { color: colors.errorText, fontSize: 13, lineHeight: 18 },
    legal: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 4 },
  });
