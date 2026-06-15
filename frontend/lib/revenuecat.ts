// Lancely RevenueCat integration.
// Native-only: react-native-purchases requires a development/production build (not Expo Go or web).
// On Expo Go / web / Android, we fall back to a "mocked" path so the rest of the app keeps working.
//
// Flow:
//   1. On app start, call configureRevenueCat(userId?) once (idempotent).
//   2. The Pro paywall calls getOfferings() to render available packages.
//   3. User taps a package → call purchasePackage() → returns updated entitlements.
//   4. The "pro" entitlement is what unlocks Lancely Pro features.
//   5. Restore purchases → call restorePurchases() (required by Apple).
import { Platform } from "react-native";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ENTITLEMENT_ID = "pro";

// Lazy-loaded SDK reference. We never `import` it at module scope so that
// Metro on web / Expo Go doesn't try to bundle native code.
type PurchasesModule = typeof import("react-native-purchases");
let Purchases: PurchasesModule["default"] | null = null;
let configured = false;

/** True when the RC SDK is usable on this platform/runtime. */
export function isRevenueCatAvailable(): boolean {
  if (Platform.OS !== "ios") return false; // iOS only for v1
  if (!IOS_KEY) return false;
  // Expo Go does not bundle the native module. We detect that by attempting require.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("react-native-purchases");
    return true;
  } catch {
    return false;
  }
}

async function loadSdk(): Promise<PurchasesModule["default"] | null> {
  if (Purchases) return Purchases;
  if (!isRevenueCatAvailable()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("react-native-purchases") as PurchasesModule;
  Purchases = mod.default;
  return Purchases;
}

/** Configure RevenueCat once. Safe to call multiple times — only first call configures. */
export async function configureRevenueCat(appUserId?: string): Promise<void> {
  if (configured) return;
  const sdk = await loadSdk();
  if (!sdk || !IOS_KEY) return;
  try {
    await sdk.configure({ apiKey: IOS_KEY, appUserID: appUserId });
    configured = true;
  } catch (e) {
    // Avoid crashing the app on init failure — log and continue with mocked path.
    // eslint-disable-next-line no-console
    console.warn("[RevenueCat] configure failed", e);
  }
}

export type Pkg = {
  identifier: string;
  productId: string;
  priceString: string;
  title: string;
  period: "monthly" | "annual" | "other";
  raw: unknown; // the SDK Package — needed by purchasePackage()
};

/** Fetch the current offering's monthly + annual packages. Returns [] if unavailable. */
export async function getOfferings(): Promise<Pkg[]> {
  const sdk = await loadSdk();
  if (!sdk) return [];
  try {
    const offerings = await sdk.getOfferings();
    const current = offerings.current;
    if (!current) return [];
    const result: Pkg[] = [];
    for (const p of current.availablePackages) {
      const product = p.product;
      const period: Pkg["period"] = p.packageType === "MONTHLY"
        ? "monthly"
        : p.packageType === "ANNUAL"
          ? "annual"
          : "other";
      result.push({
        identifier: p.identifier,
        productId: product.identifier,
        priceString: product.priceString,
        title: product.title || product.identifier,
        period,
        raw: p,
      });
    }
    return result;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[RevenueCat] getOfferings failed", e);
    return [];
  }
}

/** Returns true if user has the "pro" entitlement active. */
export async function hasProEntitlement(): Promise<boolean> {
  const sdk = await loadSdk();
  if (!sdk) return false;
  try {
    const info = await sdk.getCustomerInfo();
    return !!info.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

/** Trigger native purchase sheet. Returns true on success, false on cancel/error. */
export async function purchasePackage(pkg: Pkg): Promise<{ ok: boolean; reason?: string }> {
  const sdk = await loadSdk();
  if (!sdk) return { ok: false, reason: "RevenueCat is not available on this device" };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sdk.purchasePackage(pkg.raw as any);
    const hasPro = !!result.customerInfo.entitlements.active[ENTITLEMENT_ID];
    return { ok: hasPro, reason: hasPro ? undefined : "Subscription not active" };
  } catch (e: unknown) {
    // SDK throws on user cancel — distinguish gracefully.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = e as any;
    if (err?.userCancelled) return { ok: false, reason: "Purchase cancelled" };
    return { ok: false, reason: err?.message || "Purchase failed" };
  }
}

/** Apple requires a Restore Purchases button. */
export async function restorePurchases(): Promise<{ ok: boolean; reason?: string }> {
  const sdk = await loadSdk();
  if (!sdk) return { ok: false, reason: "RevenueCat is not available on this device" };
  try {
    const info = await sdk.restorePurchases();
    const hasPro = !!info.entitlements.active[ENTITLEMENT_ID];
    return { ok: hasPro, reason: hasPro ? undefined : "No active subscriptions to restore" };
  } catch (e: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { ok: false, reason: (e as any)?.message || "Restore failed" };
  }
}
