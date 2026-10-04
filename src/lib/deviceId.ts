const KEY = 'gb_device_id';

/**
 * A random per-browser id kept in localStorage and sent with scans, so the server can
 * limit how many accounts scan from one device. It is a weak signal (clearing site data
 * resets it) — one layer among several, not an identity.
 */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode): fall back to a per-page-load id.
    return crypto.randomUUID();
  }
}
