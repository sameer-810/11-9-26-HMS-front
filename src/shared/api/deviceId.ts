import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "hms-device-id";
let cached: string | null = null;

function uuid() {
  // crypto.randomUUID is not present on every RN engine.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** stable random id for this installation (used for the device cap); not tied to hardware. */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing =
      Platform.OS === "web" ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
  // fall through and mint a fresh one for this session.
  }

  const fresh = uuid();
  cached = fresh;
  try {
    if (Platform.OS === "web") localStorage.setItem(KEY, fresh);
    else await SecureStore.setItemAsync(KEY, fresh);
  } catch {
  // not persistable here; the cap will see this as a new device next launch.
  }
  return fresh;
}

export function getDeviceName(): string {
  if (Platform.OS === "web") {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (/Electron/i.test(ua)) return "Desktop app";
    if (/Windows/i.test(ua)) return "Windows browser";
    if (/Mac/i.test(ua)) return "Mac browser";
    if (/Android/i.test(ua)) return "Android browser";
    if (/iPhone|iPad/i.test(ua)) return "iOS browser";
    return "Browser";
  }
  return Platform.OS === "ios" ? "iOS device" : "Android device";
}
