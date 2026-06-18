// Sign in with Apple helper. Native iOS only — returns null on web/Android.
// We pass the Apple identity_token to the shared backend, which verifies it with Apple
// and returns a Lancely JWT + user object.
import { Platform } from "react-native";

type AppleAuthModule = typeof import("expo-apple-authentication");

let AppleAuth: AppleAuthModule | null = null;

function loadModule(): AppleAuthModule | null {
  if (Platform.OS !== "ios") return null;
  if (AppleAuth) return AppleAuth;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    AppleAuth = require("expo-apple-authentication") as AppleAuthModule;
    return AppleAuth;
  } catch {
    return null;
  }
}

/** True when Sign in with Apple is available on the current device/runtime. */
export async function isAppleAuthAvailable(): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return false;
  try {
    return await mod.isAvailableAsync();
  } catch {
    return false;
  }
}

export type AppleSignInResult = {
  identityToken: string;
  authorizationCode: string | null;
  email: string | null;
  fullName: string | null;
  user: string; // stable Apple user id ("sub")
};

/** Trigger Apple's native sheet. Returns null on cancel. Throws on hard failure. */
export async function signInWithApple(): Promise<AppleSignInResult | null> {
  const mod = loadModule();
  if (!mod) throw new Error("Sign in with Apple is not available on this device");
  try {
    const credential = await mod.signInAsync({
      requestedScopes: [
        mod.AppleAuthenticationScope.FULL_NAME,
        mod.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) return null;
    const fullName =
      credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ")
        : null;
    return {
      identityToken: credential.identityToken,
      authorizationCode: credential.authorizationCode ?? null,
      email: credential.email ?? null,
      fullName: fullName || null,
      user: credential.user,
    };
  } catch (e: unknown) {
    // User cancelled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((e as any)?.code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
}
