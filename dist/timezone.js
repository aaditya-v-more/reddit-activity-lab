const KEY = "reddit-activity-timezone";
export function validZone(value) {
  if (typeof value !== "string" || !value) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}
export function deviceZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Older browsers use the legacy alias for Kolkata.
    return zone === "Asia/Calcutta" ? "Asia/Kolkata" : validZone(zone) ? zone : "UTC";
  } catch { return "UTC"; }
}
export function preferredZone(storage, detected = deviceZone()) {
  try {
    const saved = storage?.getItem(KEY);
    if (validZone(saved)) return { zone: saved, manual: true };
  } catch { /* Storage restrictions do not prevent device detection. */ }
  return { zone: validZone(detected) ? detected : "UTC", manual: false };
}
export function saveZone(storage, zone) {
  try {
    if (zone === null) storage?.removeItem(KEY);
    else if (validZone(zone)) storage?.setItem(KEY, zone);
  } catch { /* Keep the selection usable when browser storage is blocked. */ }
}
