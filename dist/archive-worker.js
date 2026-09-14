import { ArcticClient, loadArchive, subredditName } from "./archive.js";
import { analyze } from "./analysis.js";

const client = new ArcticClient({
  relay: new URL(self.location.href).searchParams.has("relay")
    ? new URL("./archive", self.location.href).href
    : null,
});
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
      request.onblocked = () =>
        reject(new Error("Browser cache is busy in another tab."));
      // A blocked storage operation must not leave acquisition waiting indefinitely.
      setTimeout(
        () => reject(new Error("Browser cache did not open in time.")),
        3000,
      );
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
const snapshotKey = (options) =>
  `@analysis|${options.subreddit.toLowerCase()}|${options.zone}|${options.start}|${options.end}`;
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
      await transaction("readwrite", (s) =>
        s.put({ key, value, bytes, savedAt: Date.now() }),
      );
      return true;
    } catch {
      return false; // Keep existing data on quota failure; never evict older analyses.
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
    } else if (data.action === "restore") {
      const key = data.options
        ? snapshotKey(data.options)
        : await cache.get("@last");
      result = key ? await cache.get(key) : null;
    } else if (data.action === "remember") {
      const key = snapshotKey({
        subreddit: data.snapshot.dataset.subreddit,
        ...data.snapshot.analysis,
      });
      result = await cache.set(key, data.snapshot);
      if (result) await cache.set("@last", key);
    } else if (data.action === "analyze") {
      result = analyze(data.dataset, data.options);
    } else if (data.action === "load") {
      const dataset = await loadArchive({
        ...data.options,
        client,
        cache,
        signal: controller.signal,
        progress: (value) => self.postMessage({ id: data.id, progress: value }),
      });
      self.postMessage({ id: data.id, progress: { phase: "analyze" } });
      result = { dataset, analysis: analyze(dataset, data.options) };
    } else throw new Error("Unknown archive operation");
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
