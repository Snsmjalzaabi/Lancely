import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "../lib/auth";
import { useTheme, type ColorPalette } from "../lib/theme";

export default function Index() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={styles.center} testID="splash-loading">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  return user ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
