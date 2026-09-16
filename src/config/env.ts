/**
 * EXPO_PUBLIC_* values are inlined at export time, so they must be set in the build environment.
 * Nothing secret belongs here: everything in this file ships inside the app.
 * Production falls back to the live Render API, so a build without the variables still works;
 * keep it in step with connect-src in vercel.json.
 */

const LIVE_API_ORIGIN = "https://one1-9-26-hms-back.onrender.com";

const DEV_API =
  process.env.EXPO_PUBLIC_API_URL_DEV || "http://localhost:5003/api/v1";
const PROD_API =
  process.env.EXPO_PUBLIC_API_URL || `${LIVE_API_ORIGIN}/api/v1`;

const DEV_SOCKET =
  process.env.EXPO_PUBLIC_SOCKET_URL_DEV || "http://localhost:5003";
const PROD_SOCKET = process.env.EXPO_PUBLIC_SOCKET_URL || LIVE_API_ORIGIN;

export const environment = {
  apiUrl: __DEV__ ? DEV_API : PROD_API,
  socketUrl: __DEV__ ? DEV_SOCKET : PROD_SOCKET,
  isDev: __DEV__,
  appName: "HMS",
} as const;
