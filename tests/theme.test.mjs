import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

const code = fs.readFileSync(
  new URL("../dist/theme.js", import.meta.url),
  "utf8",
);
function fixture({ dark = false, saved = null, denied = false } = {}) {
  const root = { dataset: {} },
    select = { value: null },
    events = {},
    windowEvents = {};
  const system = {
    matches: dark,
    addEventListener: (_, fn) => {
      system.change = fn;
    },
  };
  select.addEventListener = (_, fn) => {
    select.change = fn;
  };
  const storage = new Map(saved ? [["reddit-lab-theme", saved]] : []);
  vm.runInNewContext(code, {
    document: {
      documentElement: root,
      querySelector: () => select,
      addEventListener: (type, fn) => {
        events[type] = fn;
      },
    },
    window: {
      matchMedia: () => system,
      addEventListener: (type, fn) => {
        windowEvents[type] = fn;
      },
    },
    localStorage: {
      getItem: (key) => {
        if (denied) throw Error("denied");
        return storage.get(key);
      },
      setItem: (key, value) => {
        if (denied) throw Error("denied");
        storage.set(key, value);
      },
    },
  });
  return { root, select, system, storage, events, windowEvents };
}
test("system theme applies before DOM ready and follows device changes", () => {
  const f = fixture({ dark: true });
  assert.equal(f.root.dataset.theme, "dark");
  f.events.DOMContentLoaded();
  assert.equal(f.select.value, "system");
  f.system.matches = false;
  f.system.change();
  assert.equal(f.root.dataset.theme, "light");
});
test("manual preference persists and overrides the device until System is selected", () => {
  const f = fixture({ dark: true, saved: "light" });
  f.events.DOMContentLoaded();
  assert.equal(f.root.dataset.theme, "light");
  f.system.change();
  assert.equal(f.root.dataset.theme, "light");
  f.select.change({ target: { value: "dark" } });
  assert.equal(f.storage.get("reddit-lab-theme"), "dark");
  f.select.change({ target: { value: "system" } });
  f.system.matches = false;
  f.system.change();
  assert.equal(f.root.dataset.theme, "light");
});
test("denied storage, invalid preferences, and another tab clearing storage remain usable", () => {
  const f = fixture({ denied: true, dark: true });
  f.events.DOMContentLoaded();
  f.select.change({ target: { value: "light" } });
  assert.equal(f.root.dataset.theme, "light");
  f.windowEvents.storage({ key: null, newValue: null });
  assert.equal(f.root.dataset.theme, "dark");
  assert.equal(fixture({ saved: "invalid" }).root.dataset.theme, "light");
});
