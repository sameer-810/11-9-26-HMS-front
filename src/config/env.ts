/**
 * EXPO_PUBLIC_* values are inlined into the bundle at export time, so they must
 * be present in the environment that runs the build — not just at runtime.
 *
 * Nothing secret belongs here. Anything in this file ships inside the app and
 * can be read by anyone who installs it.
 */

const DEV_API = process.env.EXPO_PUBLIC_API_URL_DEV || "http://localhost:5003/api/v1";
const PROD_API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5003/api/v1";

const DEV_SOCKET = process.env.EXPO_PUBLIC_SOCKET_URL_DEV || "http://localhost:5003";
const PROD_SOCKET = process.env.EXPO_PUBLIC_SOCKET_URL || "http://localhost:5003";

export const environment = {
  apiUrl: __DEV__ ? DEV_API : PROD_API,
  socketUrl: __DEV__ ? DEV_SOCKET : PROD_SOCKET,
  isDev: __DEV__,
  appName: "HMS",
} as const;
