// Resolves an uploaded file's URL against the storage origin — strips any
// mismatched host from server-formatted URLs (e.g. kioscify.localhost or a
// stale LAN IP, unreachable from emulators/devices). Same rule as the logo
// resolver in app/home.tsx.
export function resolveStorageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const base =
    process.env.EXPO_PUBLIC_STORAGE_URL ||
    process.env.EXPO_PUBLIC_API_URL?.replace("/api/v1", "") ||
    "http://localhost:3000";
  try {
    const path = raw.startsWith("http") ? new URL(raw).pathname : raw;
    return `${base}${path}`;
  } catch {
    return raw;
  }
}
