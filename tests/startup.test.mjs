import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { analyze, DAYS, median, localParts } from "../dist/analysis.js";
import { BOTS, addDays, subredditName } from "../dist/archive.js";
import { preferredZone, saveZone, availableZones, zoneName } from "../dist/timezone.js";
import { inlineStarter } from "../scripts/starter-page.mjs";

const html = inlineStarter(fs.readFileSync(new URL("../dist/index.html", import.meta.url), "utf8"));
const bootstrap = html.match(/<script id="starter-bootstrap" type="application\/json">([\s\S]*?)<\/script>/)[1];
const app = fs.readFileSync(new URL("../dist/app.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replaceAll("import.meta.url", '"https://example.test/app.js"');
const summary = JSON.parse(bootstrap).snapshot;
const snapshot = (d = summary) => ({
  dataset: { mode: "on-demand", acquisitionRequests: 2, subreddit: d.subreddit, coverage: d.coverage, audit: d.audit, ledger: d.ledger, posts: [], zones: {} },
  analysis: { ...d.result, posts: [], eligible: [] },
});
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(setImmediate); };

// Exercise the actual page controller with browser storage/worker boundaries mocked.
// No source records, external requests, or browser profile access are needed.
function page({ saved = null, delayRestore = false, storageError = false, detected = "Asia/Kolkata", preference = null, acquisitionRequests = 2 } = {}) {
  const elements = new Map(), documentEvents = {}, workerActions = [], http = [], timers = [];
  function element(selector) {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, {
        value: "", textContent: "", innerHTML: "", dataset: {}, hidden: false,
        options: [], attributes: {}, listeners: {}, scrollLeft: 0, clientWidth: 300, scrollWidth: 1190,
        classList: { toggle(name, yes) { yes ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); }, remove(name) { classes.delete(name); }, add(name) { classes.add(name); } },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
        add(option) { this.options.push(option); },
        focus() {}, contains() { return false; },
      });
    }
    return elements.get(selector);
  }
  element("#starter-bootstrap").textContent = bootstrap;
  element("#community").value = "AskReddit";
  element("#timezone").value = "Asia/Kolkata";
  element("#timezone").options = [{ value: "Asia/Kolkata", textContent: "India · IST (UTC+5:30)" }];
  const pendingRestores = [];
  class Worker {
    listeners = {};
    addEventListener(name, fn) { this.listeners[name] = fn; }
    terminate() {}
    postMessage(message) {
      workerActions.push(message);
      if (message.action === "cancel") return;
      const reply = () => {
        const data = message.action === "restore" && storageError
          ? { id: message.id, error: "Storage unavailable" }
          : { id: message.id, result: message.action === "restore" ? (!message.options || (saved && saved.analysis.zone === message.options.zone && saved.analysis.start === message.options.start && saved.analysis.end === message.options.end) ? saved : null)
            : message.action === "load" ? { dataset: { ...snapshot().dataset, acquisitionRequests }, analysis: snapshot().analysis }
            : message.action === "pulse" ? { checkedAt: new Date().toISOString() } : true };
        queueMicrotask(() => this.listeners.message({ data }));
      };
      if (message.action === "restore" && delayRestore) pendingRestores.push(reply);
      else reply();
    }
  }
  const document = {
    body: { dataset: { archiveRelay: "true", localStudy: "false" } },
    querySelector: element,
    querySelectorAll: () => [],
    addEventListener(name, fn) { (documentEvents[name] ||= []).push(fn); },
  };
  vm.runInNewContext(app, {
    availableZones, zoneName, deviceZone: () => detected, preferredZone: (storage) => preferredZone(storage, detected), saveZone,
    Option: function(textContent, value) { return { textContent, value }; },
    document, Worker, URL, analyze, DAYS, median, localParts, BOTS, addDays, subredditName,
    createSubredditPicker: () => ({ clearRecent() {} }),
    navigator: { storage: { persist: () => Promise.resolve(true) } },
    window: { localStorage: { getItem: () => preference, setItem: (key, value) => { preference = value; }, removeItem: () => { preference = null; } }, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, scrollTo() {} },
    fetch: async (url) => { http.push(url); throw new Error("Unexpected HTTP request during startup"); },
    requestAnimationFrame: (fn) => fn(),
    setInterval: (fn) => { timers.push(fn); return timers.length; }, clearInterval() {}, setTimeout,
  });
  return { element, documentEvents, workerActions, http, timers,
    restore() { pendingRestores.splice(0).forEach((reply) => reply()); },
    click(button) { (documentEvents.click || []).forEach((fn) => fn({ target: { closest: () => button } })); },
  };
}

test("a fresh visit renders the embedded real summary before storage resolves, without archive or JSON fetches", async () => {
  const p = page({ delayRestore: true });
  assert.match(p.element("#content").innerHTML, /Activity by day and hour/);
  assert.equal(p.element("#community").value, summary.subreddit);
  assert.equal(p.element("#start").value, summary.result.start);
  p.restore(); await flush();
  assert.deepEqual(p.http, []);
  assert.deepEqual(p.workerActions.map((x) => x.action), ["restore", "remember"]);
  assert.match(p.element("#freshness").textContent, /Included summary/);
});

test("a returning visit restores an older saved community without automatic acquisition or stale starter labels", async () => {
  const d = JSON.parse(fs.readFileSync(new URL("../dist/starter/ClaudeAI-Asia_Kolkata.json", import.meta.url), "utf8"));
  const p = page({ saved: snapshot(d) }); await flush();
  assert.equal(p.element("#community").value, "ClaudeAI");
  assert.match(p.element("#freshness").textContent, /Saved analysis · r\/ClaudeAI/);
  assert.doesNotMatch(p.element("#freshness").textContent, /r\/ollama/);
  assert.deepEqual(p.workerActions.map((x) => x.action), ["restore"]);
  assert.deepEqual(p.http, []);
});

test("idle time, view navigation, and heatmap metrics never request archive data", async () => {
  const p = page(); await flush();
  p.click({ dataset: { view: "activity" } });
  p.click({ dataset: { metric: "authors" } });
  for (let i = 0; i < 6; i++) p.timers.forEach((tick) => tick());
  await flush();
  assert.equal(p.timers.length, 0, "no recurring acquisition timer is installed");
  assert.equal(p.workerActions.some((x) => ["load", "pulse", "discover"].includes(x.action)), false);
  assert.deepEqual(p.http, []);
});

test("storage failures preserve the included analysis and do not fall through to acquisition", async () => {
  const p = page({ storageError: true }); await flush();
  assert.match(p.element("#content").innerHTML, /Activity by day and hour/);
  assert.equal(p.workerActions.some((x) => ["load", "pulse"].includes(x.action)), false);
  assert.deepEqual(p.http, []);
});

test("late storage restoration cannot overwrite filters the visitor has started changing", async () => {
  const p = page({ saved: snapshot(), delayRestore: true });
  p.element("#community").value = "testcommunity";
  p.element("#filters").listeners.input[0]();
  p.restore(); await flush();
  assert.equal(p.element("#community").value, "testcommunity");
  assert.equal(p.workerActions.some((x) => x.action === "load"), false);
});

test("an explicit Refresh data action still acquires records and checks source freshness", async () => {
  const p = page(); await flush();
  p.click({ id: "refresh-archive", dataset: {} }); await flush();
  const loads = p.workerActions.filter((x) => x.action === "load");
  assert.equal(loads.length, 1);
  assert.equal(loads[0].options.force, true);
  assert.equal(p.workerActions.filter((x) => x.action === "pulse").length, 1);
});


test("unchanged filters reuse the visible analysis; changed dates start a requested acquisition", async () => {
  const p = page(); await flush();
  p.element("#filters").listeners.submit[0]({ preventDefault() {} });
  await flush();
  assert.equal(p.workerActions.some((x) => x.action === "load"), false);
  p.element("#start").value = "2026-09-05";
  p.element("#filters").listeners.submit[0]({ preventDefault() {} });
  await flush();
  const loads = p.workerActions.filter((x) => x.action === "load");
  assert.equal(loads.length, 1);
  assert.equal(loads[0].options.start, "2026-09-05");
});


test("device timezone selects an embedded matching summary without archive requests", async () => {
  const p = page({ detected: "America/New_York" }); await flush();
  assert.equal(p.element("#timezone").value, "America/New_York");
  assert.equal(p.element("#timezone-help").hidden, true);
  assert.doesNotMatch(p.element("#timezone-help").textContent, /Showing saved data/);
  assert.equal(p.workerActions.filter((x) => x.action === "load").length, 0);
  assert.equal(p.http.length, 0);
});
test("an unbundled device zone stays selected with honestly labelled starter data", async () => {
  const p = page({ detected: "Asia/Kathmandu" }); await flush();
  assert.equal(p.element("#timezone").value, "Asia/Kathmandu");
  assert.match(p.element("#timezone-help").textContent, /Showing saved data in Asia\/Kolkata/);
  assert.equal(p.workerActions.filter((x) => x.action === "load").length, 0);
});
test("manual preference wins over detection and a different saved analysis", async () => {
  const p = page({ detected: "America/New_York", preference: "Europe/Berlin", saved: snapshot() }); await flush();
  assert.equal(p.element("#timezone").value, "Europe/Berlin");
  assert.match(p.element("#timezone-help").textContent, /Apply filters to analyze in Europe\/Berlin/);
  assert.equal(p.workerActions.filter((x) => x.action === "load").length, 0);
});

test("changing the bundled starter timezone uses its embedded summary without acquisition or freshness polling", async () => {
  const p = page(); await flush();
  p.element("#timezone").value = "America/New_York";
  p.element("#timezone").listeners.change[0](); await flush();
  assert.equal(p.element("#timezone").value, "America/New_York");
  assert.equal(p.element("#load-panel").hidden, true);
  assert.equal(p.workerActions.some((x) => ["load", "pulse"].includes(x.action)), false);
  assert.deepEqual(p.http, []);
});
test("a local cache calculation never follows up with a source freshness request", async () => {
  const p = page({ acquisitionRequests: 0 }); await flush();
  p.element("#start").value = "2026-09-05";
  p.element("#filters").listeners.submit[0]({ preventDefault() {} }); await flush();
  assert.equal(p.workerActions.filter((x) => x.action === "load").length, 1);
  assert.equal(p.workerActions.filter((x) => x.action === "pulse").length, 0);
});

test("an acquired analysis switches through the reusable cache rather than falling back to an older starter", async () => {
  const p = page({ saved: snapshot(), acquisitionRequests: 0 }); await flush();
  p.element("#timezone").value = "America/New_York";
  p.element("#timezone").listeners.change[0](); await flush();
  assert.equal(p.workerActions.filter((x) => x.action === "load").length, 1);
  assert.equal(p.workerActions.filter((x) => x.action === "pulse").length, 0);
  assert.deepEqual(p.http, []);
});

test("the superseded funny starter switches to the new default without an archive request", async () => {
  const old = snapshot(); old.dataset.mode = "starter"; old.dataset.subreddit = "funny";
  const p = page({ saved: old }); await flush();
  assert.equal(p.element("#community").value, "AskReddit");
  assert.equal(p.workerActions.some((x) => ["load", "pulse"].includes(x.action)), false);
});
