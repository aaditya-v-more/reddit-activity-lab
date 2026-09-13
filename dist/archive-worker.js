import { ArcticClient, loadArchive, subredditName } from "./archive.js";

const client = new ArcticClient();
const controllers = new Map();
let dbPromise;
function db() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("reddit-activity-lab", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("days", { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return dbPromise;
}
async function transaction(mode, fn) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("days", mode),
      store = tx.objectStore("days");
    const request = fn(store);
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
const cache = {
  async get(key) {
    try {
      return (await transaction("readonly", (s) => s.get(key)))?.value;
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      const bytes = JSON.stringify(value).length * 2;
      if (bytes > 10000000) return;
      const saved = (await transaction("readonly", (s) => s.getAll()))
        .filter((x) => x.key !== key)
        .sort((a, b) => a.savedAt - b.savedAt);
      let used = saved.reduce((sum, x) => sum + x.bytes, 0);
      while (saved.length >= 180 || used + bytes > 40000000) {
        const old = saved.shift();
        if (!old) break;
        await transaction("readwrite", (s) => s.delete(old.key));
        used -= old.bytes;
      }
      await transaction("readwrite", (s) =>
        s.put({ key, value, bytes, savedAt: Date.now() }),
      );
    } catch {
      /* Cache denial/quota must not turn valid analysis into a failure. */
    }
  },
};
self.addEventListener("message", async ({ data }) => {
  if (data.action === "cancel") {
    controllers.get(data.target)?.abort();
    return;
  }
  const controller = new AbortController();
  controllers.set(data.id, controller);
  try {
    let result;
    if (data.action === "discover")
      result = await client.discover(data.prefix, controller.signal);
    else if (data.action === "pulse")
      result = await client.pulse(
        subredditName(data.subreddit),
        controller.signal,
      );
    else if (data.action === "clear") {
      await transaction("readwrite", (s) => s.clear());
      result = true;
    } else if (data.action === "load")
      result = await loadArchive({
        ...data.options,
        client,
        cache,
        signal: controller.signal,
        progress: (value) => self.postMessage({ id: data.id, progress: value }),
      });
    else throw new Error("Unknown archive operation");
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error.message,
      cancelled: error.name === "AbortError",
    });
  } finally {
    controllers.delete(data.id);
  }
});
