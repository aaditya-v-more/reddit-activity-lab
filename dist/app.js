import { analyze, DAYS, median, localParts } from "./analysis.js";
import { BOTS, addDays, subredditName } from "./archive.js";
const $ = (s) => document.querySelector(s);
const n = (x) =>
  x == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(x);
const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const hr = (h) => `${String(h).padStart(2, "0")}:00`;
const windowLabel = (w) => `${hr(w.start)}–${hr(w.end)}`;
const shortDate = (d) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const zoneLabel = () =>
  [...$("#timezone").options].find(
    (o) => o.value === (state.result?.zone || $("#timezone").value),
  )?.textContent || $("#timezone").value;
const colors = Array.from({ length: 8 }, (_, i) => `var(--heat-${i})`);
const state = {
  mode: "archive",
  starterManifest: null,
  selectionEpoch: 0,
  starterCache: new Map(),
  studyManifest: null,
  loading: false,
  lastAnalysisCheck: 0,
  view: "overview",
  metric: "comments",
  data: null,
  result: null,
  manifest: null,
  cache: new Map(),
  cell: null,
  page: 0,
  search: "",
  postSort: "score",
  eligibility: "all",
  window: null,
};
function statCard(label, value, foot, icon) {
  return `<article class="stat"><div class="stat-label">${label}<span class="stat-icon" aria-hidden="true">${icon}</span></div><div class="stat-number">${value}</div><div class="stat-foot">${foot}</div></article>`;
}
function heatmap() {
  const r = state.result,
    key = {
      comments: "meanComments",
      posts: "meanPosts",
      authors: "meanAuthors",
    }[state.metric],
    max = Math.max(...r.heat.map((c) => c[key]), 1);
  return `<section class="panel"><div class="panel-head"><div><h2>Activity by day and hour</h2><p>Average ${state.metric === "authors" ? "distinct participants per date/hour" : state.metric + " per hour"}. All times in ${esc(zoneLabel())}.</p></div><div class="segmented" aria-label="Heatmap metric">${["comments", "posts", "authors"].map((m) => `<button data-metric="${m}" class="${state.metric === m ? "active" : ""}" aria-pressed="${state.metric === m}">${m === "authors" ? "Participants" : m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div></div><div class="heat-scroll"><div class="heatmap"><span></span>${Array.from({ length: 24 }, (_, h) => `<span class="heat-hour">${h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>`).join("")}${DAYS.map(
    (d, day) =>
      `<span class="heat-day">${d}</span>${r.heat
        .filter((c) => c.day === day)
        .map((c) => {
          const label = `${d} ${hr(c.hour)}: ${n(c[key])} ${state.metric}, averaged over ${c.occurrences} dates`;
          return `<button class="heat-cell ${state.cell === day * 24 + c.hour ? "selected" : ""}" style="background:${colors[Math.min(7, Math.ceil((c[key] / max) * 7))]}" data-cell="${day * 24 + c.hour}" ${c.exposure ? "" : "disabled"} aria-label="${c.exposure ? label : "No observed dates for this day and hour"}" title="${label}"></button>`;
        })
        .join("")}`,
  ).join(
    "",
  )}</div></div><div class="heat-meta"><span>Click a cell to inspect the activity and its posts</span><span class="legend">Quiet ${colors.map((c) => `<i style="background:${c}" aria-hidden="true"></i>`).join("")} Busy</span></div><div class="heat-detail" id="heat-detail">${cellDetail()}</div></section>`;
}
function cellDetail() {
  const c = state.cell == null ? null : state.result.heat[state.cell];
  return c
    ? `<strong>${DAYS[c.day]} ${hr(c.hour)}–${hr(c.hour + 1)}</strong> · ${n(c.meanComments)} comments/h · ${n(c.meanPosts)} posts/h · ${n(c.meanAuthors)} distinct participants/date-hour · ${c.occurrences} dates. <button class="text-button" id="cell-posts">Inspect posts →</button>`
    : "Each square is a recurring local hour. The legend runs from less to more activity. Hatched cells have no observed dates; neither measures silent readers.";
}
function recommendation() {
  const r = state.result,
    w = r.recommendation;
  if (w && w.delta <= 0)
    return `<section class="panel rec-panel"><div class="panel-head"><div><h2>Posting window to test</h2><p>Based on comment volume in this period.</p></div><span class="rec-icon" aria-hidden="true">↗</span></div><p class="rec-kicker">BUSIEST COMMENT WINDOW</p><div class="rec-time">${windowLabel(r.busiest)}</div><p class="rec-context">Across the week · ${esc(zoneLabel())}</p><div class="rec-figures"><div><b>${n(r.busiest.commentsPerHour)}</b><small>comments per hour</small></div><div><b>${n(r.busiest.postsPerHour)}</b><small>competing posts per hour</small></div></div><div class="rec-rule"></div><p class="rec-context">The early performance candidate (${windowLabel(w)}) did not outperform other windows later. Test this activity window against your usual time.</p><span class="confidence">Activity-led pilot · no confirmed performance gain</span><div><button class="text-button" data-view="performance">Review the evidence →</button></div></section>`;
  if (!w)
    return `<section class="panel rec-panel"><div class="panel-head"><h2>Posting window to test</h2><span class="rec-icon" aria-hidden="true">↗</span></div><p class="rec-kicker">BUSIEST COMMENT WINDOW</p><div class="rec-time">${windowLabel(r.busiest)}</div><p class="rec-context">Across the week · ${esc(zoneLabel())}</p><div class="rec-rule"></div><p class="rec-context">Performance samples are too small to rank reliably. Start with this activity window and compare it with your usual posting time.</p><span class="confidence">Insufficient performance evidence</span></section>`;
  return `<section class="panel rec-panel"><div class="panel-head"><div><h2>Posting window to test</h2><p>Selected from posts in the earlier half.</p></div><span class="rec-icon" aria-hidden="true">↗</span></div><p class="rec-kicker">SELECTED ON THE FIRST HALF</p><div class="rec-time">${windowLabel(w)}</div><p class="rec-context">Across the week · ${esc(zoneLabel())}</p><div class="rec-figures"><div><b>${pct(w.test.rate)}</b><small>success in the later half</small></div><div><b>${n(w.test.n)}</b><small>later-half eligible posts</small></div></div><div class="rec-rule"></div><p class="rec-context">Other windows: ${pct(w.baseline.rate)} success. ${w.delta > 0 ? "The apparent advantage needs a new test." : "The early signal did not beat other windows later."}</p><span class="confidence">${w.label} · ${w.test.ci.map(pct).join("–")} interval</span><div><button class="text-button" data-view="performance">Review the evidence →</button></div></section>`;
}
function trend() {
  const r = state.result,
    max = Math.max(...r.daily.map((d) => d.comments), 1);
  const W = 780,
    H = 130,
    points = r.daily
      .map(
        (d, i) =>
          `${((i / (r.daily.length - 1 || 1)) * W).toFixed(1)},${(H - (d.comments / max) * (H - 12)).toFixed(1)}`,
      )
      .join(" ");
  const peak = [...r.daily].sort((a, b) => b.comments - a.comments)[0];
  return `<section class="panel"><div class="panel-head"><div><h2>Conversations over time</h2><p>Daily comment volume · peaks can reflect releases, news, or a single popular thread.</p></div><div class="chart-key"><span><i class="key-line"></i>Comments</span></div></div><svg class="chart" viewBox="0 0 ${W} ${H + 10}" role="img" aria-label="Daily comments from ${r.start} to ${r.end}; highest ${n(peak.comments)} on ${peak.date}"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f18963" stop-opacity=".18"/><stop offset="100%" stop-color="#f18963" stop-opacity="0"/></linearGradient></defs>${[0, 0.5, 1].map((v) => `<line x1="0" x2="${W}" y1="${H - v * (H - 12)}" y2="${H - v * (H - 12)}" stroke="var(--line)" stroke-dasharray="3 5"/><text x="0" y="${H - v * (H - 12) - 4}" fill="var(--muted)" font-size="10">${n(Math.round(v * max))}</text>`).join("")}<polygon points="0,${H} ${points} ${W},${H}" fill="url(#area)"/><polyline points="${points}" fill="none" stroke="#eb7447" stroke-width="2.5" stroke-linejoin="round"/>${r.daily.map((d, i) => `<circle cx="${(i / (r.daily.length - 1 || 1)) * W}" cy="${H - (d.comments / max) * (H - 12)}" r="4" fill="transparent"><title>${d.date}: ${n(d.comments)} comments, ${n(d.posts)} posts, ${n(d.authors)} participants</title></circle>`).join("")}</svg><div class="chart-labels">${[0, Math.floor(r.daily.length / 3), Math.floor((r.daily.length * 2) / 3), r.daily.length - 1].map((i) => `<span>${shortDate(r.daily[i].date)}</span>`).join("")}</div><div class="insight-note"><span aria-hidden="true">↗</span><span><strong>${shortDate(peak.date)} was the busiest day</strong> with ${n(peak.comments)} comments. Compare weekly patterns before treating a spike as a posting rule.</span></div><details><summary>Accessible daily values</summary><div class="table-scroll"><table><thead><tr><th>Date</th><th>Comments</th><th>Posts</th><th>Distinct participants</th></tr></thead><tbody>${r.daily.map((d) => `<tr><td>${d.date}</td><td>${n(d.comments)}</td><td>${n(d.posts)}</td><td>${n(d.authors)}</td></tr>`).join("")}</tbody></table></div></details></section>`;
}
function overview() {
  const r = state.result;
  return `<div class="stats">${statCard("Archived posts", n(r.totals.posts), `<span class="highlight">${n(r.totals.posts / r.days)} per day</span> · known bots excluded`, "▤")}${statCard("Comments created", n(r.totals.comments), `<span class="highlight">${n(r.totals.comments / r.days)} per day</span> · during this period`, "◌")}${statCard("Daily participants", n(r.totals.medianDailyAuthors), "Median distinct authors per day", "♧")}${statCard("Median post score", n(r.totals.score), `${n(r.totals.n)} eligible posts · 35–40h snapshots`, "↗")}</div><div class="content-grid"><div>${heatmap()}</div>${recommendation()}</div>${trend()}${comparison()}`;
}
const viewTitles = {
  overview: [
    "When to post. Where to start.",
    "Compare activity, competing posts, and score patterns in your community.",
  ],
  activity: [
    "Activity patterns",
    "Read activity alongside competing posts and changes over time.",
  ],
  performance: [
    "Post performance",
    "Compare observed outcomes, then check whether early patterns held up.",
  ],
  posts: [
    "Explore archived posts",
    "Inspect public posts, their score snapshots, and eligibility decisions.",
  ],
  methodology: [
    "Methodology and coverage",
    "Coverage, definitions, and limitations are part of every finding.",
  ],
};
function render() {
  const r = state.result;
  if (!r) return;
  const title = viewTitles[state.view];
  $("#page-title").textContent = title[0];
  $("#page-description").textContent = title[1];
  $("#breadcrumb").textContent = {
    overview: "Overview",
    activity: "Activity patterns",
    performance: "Post performance",
    posts: "Explore posts",
    methodology: "Methodology",
  }[state.view];
  document.querySelectorAll(".nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.view);
    b.setAttribute(
      "aria-current",
      b.dataset.view === state.view ? "page" : "false",
    );
  });
  $("#content").setAttribute("aria-busy", "false");
  if (r.empty) {
    $("#status").textContent = "No complete local days in the selected range.";
    $("#content").innerHTML =
      '<div class="empty-state"><h2>No complete days in this range</h2><p>Choose dates inside the downloaded archive. Missing coverage is not zero activity.</p><button class="button" id="reset-dates">Use the study period</button></div>';
    return;
  }
  $("#status").innerHTML =
    `<span class="coverage-icon" aria-hidden="true">◷</span><span><strong>${shortDate(r.start)} – ${shortDate(r.end)} ${r.end.slice(0, 4)}</strong> · ${r.days} complete local days · Arctic Shift archive · ${["on-demand", "starter"].includes(state.data.mode) ? `${state.data.mode === "starter" ? "Starter snapshot · " : ""}Fetched ${moment(Date.parse(state.data.coverage.fetchedAtMin) / 1000)}–${moment(Date.parse(state.data.coverage.fetchedAtMax) / 1000)} · ` : ""} ${r.clippedDays ? `${r.clippedDays} uncovered or partial days excluded` : "Known bots excluded"} · <button class="text-button" data-view="methodology">View coverage</button></span>`;
  $("#content").innerHTML =
    state.view === "overview"
      ? overview()
      : state.view === "activity"
        ? activity()
        : state.view === "performance"
          ? performance()
          : state.view === "posts"
            ? postsView()
            : methodology();
}
const workerUrl = new URL("./archive-worker.js", import.meta.url);
if (document.body.dataset.archiveRelay === "true")
  workerUrl.searchParams.set("relay", "1");
const worker = new Worker(workerUrl, { type: "module" });
let nextJob = 0,
  activeLoad = null,
  pulsePending = false,
  pulseJob = null,
  loadingTimer = null;
const jobs = new Map();
worker.addEventListener("message", ({ data }) => {
  const pending = jobs.get(data.id);
  if (!pending) return;
  if (data.progress) {
    pending.progress?.(data.progress);
    return;
  }
  jobs.delete(data.id);
  if (data.error)
    pending.reject(
      Object.assign(new Error(data.error), { cancelled: data.cancelled }),
    );
  else pending.resolve(data.result);
});
worker.addEventListener("error", () => {
  for (const pending of jobs.values())
    pending.reject(
      new Error(
        "The background analysis could not start. Reload in a current browser.",
      ),
    );
  jobs.clear();
});
function job(action, options, progress) {
  const id = ++nextJob;
  const promise = new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject, progress });
  });
  worker.postMessage({ id, action, ...options });
  return { id, promise };
}
function setRecent(days = 7) {
  const today = localParts(Date.now() / 1000, $("#timezone").value).date;
  $("#end").value = addDays(today, -1);
  $("#start").value = addDays(today, -days);
}
function liveManifest() {
  return {
    generatedAt: new Date().toISOString(),
    knownBots: BOTS,
    communities: ["ClaudeAI", "ClaudeCode", "ollama"].map((name) => ({ name })),
    zones: [...$("#timezone").options].map((x) => x.value),
    defaultStart: $("#start").value,
    defaultEnd: $("#end").value,
  };
}
const moment = (t) =>
  t == null
    ? "Unavailable"
    : new Date(t * 1000).toLocaleString("en-GB", {
        timeZone: $("#timezone").value,
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
async function refreshPulse() {
  if (pulsePending || state.mode !== "archive" || state.loading) return;
  pulsePending = true;
  const name = $("#community").value,
    ticket = load.ticket;
  $("#freshness").innerHTML =
    '<span class="loader inline-loader" aria-hidden="true"></span> Checking latest archived records…';
  try {
    const request = job("pulse", { subreddit: name });
    pulseJob = request.id;
    const pulse = await request.promise;
    if (
      ticket !== load.ticket ||
      name !== $("#community").value ||
      state.mode !== "archive"
    )
      return;
    $("#freshness").innerHTML =
      `<span><strong>Latest archived post</strong> ${moment(pulse.posts?.createdAt)}</span><span><strong>Latest archived comment</strong> ${moment(pulse.comments?.createdAt)}</span><span>Checked ${moment(Date.parse(pulse.checkedAt) / 1000)} · ${esc(zoneLabel())}</span><span class="freshness-note">Creation times of the newest records returned, not online-user counts. Polls every 5 minutes while visible; archive delays still apply.</span>`;
  } catch (error) {
    if (ticket !== load.ticket || error.cancelled) return;
    $("#freshness").textContent =
      "Source freshness unavailable: " + error.message;
  } finally {
    pulsePending = false;
    pulseJob = null;
  }
}
async function load(force = false) {
  if (typeof force !== "boolean") force = false;
  const ticket = ++load.ticket;
  if (activeLoad) worker.postMessage({ action: "cancel", target: activeLoad });
  if (pulseJob) worker.postMessage({ action: "cancel", target: pulseJob });
  const requested = {
    subreddit: $("#community").value,
    zone: $("#timezone").value,
    start: $("#start").value,
    end: $("#end").value,
  };
  if (state.mode === "archive") {
    const saved = await job("restore", { options: requested }).promise.catch(
      () => null,
    );
    if (ticket !== load.ticket) return;
    if (saved) adoptSnapshot(saved, false);
    else if (
      !state.data ||
      state.data.subreddit.toLowerCase() !==
        requested.subreddit.toLowerCase() ||
      state.result.zone !== requested.zone
    )
      await showStarter(requested.subreddit, requested.zone, true, false).catch(
        () => false,
      );
    if (ticket !== load.ticket) return;
  }
  state.loading = true;
  // Keep the last complete analysis visible until its replacement is ready.
  const previous = state.result
    ? { dataset: state.data, analysis: state.result }
    : null;
  const started = Date.now();
  clearInterval(loadingTimer);
  $("#freshness").innerHTML =
    '<span class="loader inline-loader" aria-hidden="true"></span> Source timestamps will update after acquisition.';
  $("#content").setAttribute("aria-busy", previous ? "false" : "true");
  if (previous)
    $("#status").textContent =
      `Showing r/${state.data.subreddit} · ${state.result.start}–${state.result.end} · ${state.result.zone} while the requested analysis loads.`;
  else $("#status").textContent = "Preparing the selected archive interval…";
  $("#filters button[type=submit]").innerHTML =
    '<span class="loader inline-loader" aria-hidden="true"></span> Apply filters';
  $("#refresh-archive").disabled = true;
  $("#load-panel").hidden = false;
  $("#load-panel").innerHTML = `
    <section class="loading-state" aria-labelledby="loading-title">
      <div class="loading-heading"><span class="loader" aria-hidden="true"></span><div><h2 id="loading-title">Loading r/${esc($("#community").value)}</h2><p>Acquiring the selected dates and checking score snapshots.</p></div></div>
      <p class="loading-stage" id="load-stage" role="status">Checking saved days…</p>
      <progress class="download-progress" id="load-progress" max="1" value="0" aria-label="Completed days"></progress>
      <div class="loading-meta"><span id="load-detail">0% · Waiting for the first records</span><span id="load-elapsed" aria-live="off">0s elapsed</span></div>
      <div class="loading-actions"><p class="small">First loads can take a few minutes. Each completed day is saved for reuse.</p><button class="button quiet" id="cancel-load">Cancel</button></div>
    </section>
    ${previous ? "" : `<div class="skeleton-preview" aria-hidden="true">${Array.from({ length: 4 }, () => '<div class="skeleton-card"><span class="skeleton"></span><span class="skeleton"></span></div>').join("")}</div>`}`;
  if (!previous) $("#content").innerHTML = "";
  loadingTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - started) / 1000);
    const target = $("#load-elapsed");
    if (target)
      target.textContent = `${elapsed < 60 ? elapsed + "s" : Math.floor(elapsed / 60) + "m " + (elapsed % 60) + "s"} elapsed`;
  }, 1000);
  try {
    const entered = subredditName($("#community").value);
    const name =
      state.manifest.communities.find(
        (c) => c.name.toLowerCase() === entered.toLowerCase(),
      )?.name || entered;
    $("#community").value = name;
    const options = {
      subreddit: name,
      start: $("#start").value,
      end: $("#end").value,
      zone: $("#timezone").value,
      force,
    };
    let data, result;
    if (state.mode === "study") {
      const entry = state.manifest.communities.find(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      );
      if (!entry)
        throw new Error(
          "This community is not in the saved study. Choose Current archive to acquire it.",
        );
      data = state.cache.get(entry.name);
      if (!data) {
        const res = await fetch(`/data/${encodeURIComponent(entry.file)}`);
        if (!res.ok) throw new Error("The saved study file is unavailable.");
        data = await res.json();
      }
    } else {
      const request = job("load", { options }, (p) => {
        if (ticket !== load.ticket) return;
        if (p.total) {
          $("#load-detail").textContent =
            `${Math.floor((p.done / p.total) * 100)}% · ${p.done}/${p.total} days complete · ${n(p.records)} records fetched · ${n(p.requests)} requests`;
          $("#load-progress").max = p.total;
          $("#load-progress").value = p.done;
        }
        $("#load-stage").textContent =
          p.phase === "analyze"
            ? "Calculating activity, score comparisons, and uncertainty…"
            : p.phase === "aggregate"
              ? `Summarizing ${p.date}…`
              : p.phase === "retry"
                ? p.reason === "relay"
                  ? "Direct connection failed. Connecting through the site…"
                  : `${p.reason === "rate-limit" ? "Source rate limit reached" : "Source is slow or unavailable"}. Retrying in ${p.seconds}s…`
                : p.cached
                  ? `Saved ${p.done} of ${p.total} complete days`
                  : `Fetching ${p.kind || "records"} for ${p.date}${p.transport === "relay" ? " through the site" : ""}…`;
      });
      activeLoad = request.id;
      const response = await request.promise;
      data = response.dataset;
      result = response.analysis;
    }
    if (ticket !== load.ticket) return;
    if (!data.audit.records)
      throw new Error(
        "No archived records were returned for this community and interval. Try different dates or check the subreddit name; this is not proof of inactivity.",
      );
    if (!result) {
      $("#load-stage").textContent =
        "Calculating activity, score comparisons, and uncertainty…";
      const request = job("analyze", { dataset: data, options });
      activeLoad = request.id;
      result = await request.promise;
      if (ticket !== load.ticket) return;
    }
    state.cache.delete(data.subreddit);
    state.cache.set(data.subreddit, data);
    while (state.cache.size > 6)
      state.cache.delete(state.cache.keys().next().value);
    if (!state.manifest.communities.some((c) => c.name === data.subreddit))
      state.manifest.communities.push({ name: data.subreddit });
    if (state.mode === "archive")
      state.manifest.communities = state.manifest.communities
        .filter(
          (c) =>
            ["ClaudeAI", "ClaudeCode", "ollama"].includes(c.name) ||
            state.cache.has(c.name),
        )
        .slice(-9);
    state.data = data;
    state.result = result;
    state.page = 0;
    state.cell = null;
    state.window = null;
    state.lastAnalysisCheck = Date.now();
    render();
    $("#load-panel").hidden = true;
    await remember({ dataset: data, analysis: result });
    if (state.mode === "study")
      $("#freshness").textContent =
        `Saved study · exported ${state.manifest.generatedAt.slice(0, 10)}. Switch to Current archive to request new data.`;
    return { ok: true };
  } catch (error) {
    if (ticket !== load.ticket) return;
    if (previous) {
      state.data = previous.dataset;
      state.result = previous.analysis;
      render();
      $("#load-panel").innerHTML =
        `<div class="notice"><strong>${error.cancelled ? "Update cancelled." : "Couldn’t update these dates."}</strong> ${error.cancelled ? "" : esc(error.message)} Showing the saved r/${esc(state.data.subreddit)} analysis for ${state.result.start}–${state.result.end}. <button class="text-button" id="retry">Retry update</button></div>`;
    } else {
      $("#load-panel").innerHTML =
        `<div class="notice"><strong>${error.cancelled ? "Acquisition cancelled." : "The archive isn’t responding."}</strong> ${esc(error.message)} <button class="text-button" id="retry">Try again</button> <button class="text-button" id="open-starter">Explore the starter analysis</button></div>`;
      $("#content").setAttribute("aria-busy", "false");
    }

    return { ok: false, error: error.message };
  } finally {
    if (ticket === load.ticket) {
      state.loading = false;
      clearInterval(loadingTimer);
      $("#filters button[type=submit]").textContent = "Apply filters";
      $("#refresh-archive").disabled = false;
      activeLoad = null;
      refreshPulse();
    }
  }
}
load.ticket = 0;
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.view) {
    state.view = b.dataset.view;
    render();
  }
  if (b.dataset.metric) {
    state.metric = b.dataset.metric;
    render();
  }
  if (b.dataset.cell !== undefined) {
    state.cell = Number(b.dataset.cell);
    render();
  }
  if (b.id === "cell-posts") {
    state.view = "posts";
    state.page = 0;
    render();
  }
  if (b.id === "retry") load();
  if (b.id === "reset-dates") {
    $("#start").value = state.manifest.defaultStart;
    $("#end").value = state.manifest.defaultEnd;
    load();
  }
  if (b.id === "method-button") {
    state.view = "methodology";
    render();
  }
});
$("#filters").addEventListener("submit", (e) => {
  e.preventDefault();
  load();
});
function changeSelection() {
  state.selectionEpoch++;
  load();
}
$("#community").addEventListener("change", changeSelection);
$("#timezone").addEventListener("change", changeSelection);
async function remember(snapshot) {
  const saved = await job("remember", { snapshot }).promise.catch(() => false);
  $("#saved-status").textContent = saved
    ? "Saved on this device · retained until you clear local data"
    : "Browser storage is unavailable or full. This analysis is visible but could not be saved.";
  if (saved) navigator.storage?.persist?.().catch(() => {});
}
function adoptSnapshot(snapshot, restoreFilters = true) {
  state.data = snapshot.dataset;
  state.result = snapshot.analysis;
  state.page = 0;
  state.cell = null;
  state.window = null;
  if (restoreFilters) {
    $("#community").value = state.data.subreddit;
    $("#timezone").value = state.result.zone;
    $("#start").value = state.result.start;
    $("#end").value = state.result.end;
  }
  if (state.data.mode !== "starter")
    state.cache.set(state.data.subreddit, state.data);
  render();
}
async function showStarter(
  name = "ollama",
  zone = $("#timezone").value,
  save = true,
  restoreFilters = true,
) {
  const epoch = state.selectionEpoch;
  if (!state.starterManifest) {
    const res = await fetch("/starter/manifest.json");
    if (!res.ok) return false;
    state.starterManifest = await res.json();
  }
  const entry = state.starterManifest.entries.find(
    (e) => e.subreddit.toLowerCase() === name.toLowerCase() && e.zone === zone,
  );
  if (!entry) return false;
  let snapshot = state.starterCache.get(entry.file);
  if (!snapshot) {
    const res = await fetch(`/starter/${encodeURIComponent(entry.file)}`);
    if (!res.ok) return false;
    const d = await res.json();
    snapshot = {
      dataset: {
        mode: "starter",
        subreddit: d.subreddit,
        coverage: d.coverage,
        audit: d.audit,
        ledger: d.ledger,
        posts: [],
        zones: {},
      },
      analysis: { ...d.result, posts: [], eligible: [] },
    };
    state.starterCache.set(entry.file, snapshot);
  }
  if (epoch !== state.selectionEpoch) return false;
  adoptSnapshot(snapshot, restoreFilters);
  if (save) await remember(snapshot);
  $("#freshness").textContent =
    `Starter snapshot · ${snapshot.analysis.start}–${snapshot.analysis.end} · acquired ${moment(Date.parse(snapshot.dataset.coverage.fetchedAtMax) / 1000)} (${zoneLabel()}). Refresh data to check for newer observations.`;
  return true;
}
async function init() {
  const epoch = state.selectionEpoch;
  setRecent();
  state.manifest = liveManifest();
  const lastSaved = job("restore", {}).promise.catch(() => null);
  await showStarter("ollama", $("#timezone").value, false).catch(() => false);
  const saved = await lastSaved;
  if (epoch !== state.selectionEpoch) return;
  if (saved) {
    adoptSnapshot(saved);
    $("#saved-status").textContent =
      "Restored from this device · retained until you clear local data";
  } else if (state.result)
    await remember({ dataset: state.data, analysis: state.result });
  if (document.body.dataset.localStudy === "true") {
    try {
      const response = await fetch("/data/manifest.json");
      if (response.ok) {
        state.studyManifest = await response.json();
        $("#source-mode").add(new Option("Saved six-week study", "study"));
      }
    } catch {}
  }
  // The saved snapshot is immediately useful. Updates run while it stays visible.
  if (epoch === state.selectionEpoch) await load();
}

let suggestionTimer, suggestionJob;
$("#community").addEventListener("input", () => {
  clearTimeout(suggestionTimer);
  state.selectionEpoch++;
  const prefix = $("#community").value;
  if (prefix.replace(/^r\//i, "").length < 2) return;
  suggestionTimer = setTimeout(async () => {
    if (suggestionJob)
      worker.postMessage({ action: "cancel", target: suggestionJob });
    try {
      const request = job("discover", { prefix });
      suggestionJob = request.id;
      const names = await request.promise;
      if ($("#community").value === prefix)
        $("#community-options").innerHTML = names
          .map((x) => `<option value="${esc(x)}"></option>`)
          .join("");
    } catch {}
  }, 600);
});
$("#source-mode").addEventListener("change", () => {
  state.mode = $("#source-mode").value;
  state.cache.clear();
  if (state.mode === "study") {
    state.manifest = state.studyManifest;
    $("#start").value = state.manifest.defaultStart;
    $("#end").value = state.manifest.defaultEnd;
    if (
      !state.manifest.communities.some((c) => c.name === $("#community").value)
    )
      $("#community").value = state.manifest.communities[0].name;
  } else {
    setRecent();
    state.manifest = liveManifest();
  }
  load();
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.days) {
    setRecent(Number(b.dataset.days));
    if (state.mode === "study") {
      state.mode = "archive";
      $("#source-mode").value = "archive";
      state.cache.clear();
      state.manifest = liveManifest();
    }
    load();
  }
  if (b.id === "refresh-archive") load(true);
  if (b.id === "open-starter") {
    awaitStarter();
  }
  if (b.id === "load-evidence") {
    $("#start").value = state.result.start;
    $("#end").value = state.result.end;
    $("#community").value = state.data.subreddit;
    $("#timezone").value = state.result.zone;
    load(true);
  }
  if (b.id === "clear-local-data" || b.id === "clear-browser-cache")
    clearLocalData(b);
  if (b.id === "cancel-load" && activeLoad) {
    b.disabled = true;
    b.textContent = "Cancelling…";
    worker.postMessage({ action: "cancel", target: activeLoad });
  }
  if (b.id === "download-provenance" && state.data?.ledger) {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            subreddit: state.data.subreddit,
            coverage: state.data.coverage,
            requests: state.data.ledger,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "reddit-activity-provenance.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
setInterval(() => {
  if (
    document.hidden ||
    !$("#auto-refresh").checked ||
    state.mode !== "archive" ||
    state.loading
  )
    return;
  refreshPulse();
  if (state.result && Date.now() - state.lastAnalysisCheck >= 15 * 60000)
    load();
}, 5 * 60000);
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) worker.terminate();
});
async function awaitStarter() {
  if (await showStarter().catch(() => false)) $("#load-panel").hidden = true;
}
async function clearLocalData(button) {
  button.disabled = true;
  button.textContent = "Clearing…";
  ++load.ticket;
  state.selectionEpoch++;
  if (activeLoad) worker.postMessage({ action: "cancel", target: activeLoad });
  clearInterval(loadingTimer);
  state.loading = false;
  state.cache.clear();
  try {
    await job("clear", {}).promise;
    $("#saved-status").textContent =
      "Local analyses cleared. The starter snapshot below is provided with the site.";
    await showStarter("ollama", $("#timezone").value, false);
    $("#load-panel").hidden = true;
  } catch {
    $("#saved-status").textContent =
      "Storage could not be cleared. Try clearing site data in your browser settings.";
  } finally {
    $("#refresh-archive").disabled = false;
    $("#filters button[type=submit]").textContent = "Apply filters";
    button.textContent = "Clear local data";
    button.disabled = false;
  }
}

function comparison() {
  const cards = state.manifest.communities
    .map((c) => {
      const d = state.cache.get(c.name);
      if (!d || !d.zones[$("#timezone").value])
        return `<article class="panel"><h3>r/${esc(c.name)}</h3><p class="small">Load this community to compare the same dates and timezone.</p><button class="text-button" data-community="${esc(c.name)}">Load community →</button></article>`;
      const r = analyze(d, {
        start: $("#start").value,
        end: $("#end").value,
        zone: $("#timezone").value,
      });
      if (
        r.empty ||
        r.start !== state.result.start ||
        r.end !== state.result.end
      )
        return `<article class="panel"><h3>r/${esc(c.name)}</h3><p class="small">A matching interval is not cached.</p><button class="text-button" data-community="${esc(c.name)}">Load these dates →</button></article>`;
      return `<article class="panel"><span class="tag">${c.name === "ollama" ? "Local models" : c.name === "ClaudeCode" ? "Coding with Claude" : c.name === "ClaudeAI" ? "Claude community" : "Archive community"}</span><h3 style="margin-top:8px">r/${esc(c.name)}</h3><div class="metric-big">${n(r.totals.comments / r.days)}</div><p class="small" style="margin:0">comments per day · ${n(r.totals.posts / r.days)} new posts/day</p><div class="rec-rule" style="background:var(--line)"></div><p class="small">Median score <strong>${n(r.totals.score)}</strong> · ${n(r.totals.n)} eligible posts<br>Busiest comments: <strong>${windowLabel(r.busiest)}</strong><br>${r.recommendation ? `${r.recommendation.label} for ${windowLabel(r.recommendation)}` : "Too little evidence to rank performance"}</p><button class="text-button" data-community="${esc(c.name)}">Explore this community →</button></article>`;
    })
    .join("");
  return `<section style="margin:26px 0"><div class="panel-head"><div><h2>Compare communities</h2><p>Compare activity and competition. A higher score in one community does not predict how the same post will perform elsewhere.</p></div></div><div class="comparison">${cards}</div></section>`;
}
function activity() {
  const r = state.result,
    peakMetric = (key) => [...r.heat].sort((a, b) => b[key] - a[key])[0],
    commentPeak = peakMetric("meanComments"),
    postPeak = peakMetric("meanPosts"),
    authorPeak = peakMetric("meanAuthors");
  return `<div class="stats">${statCard("Busiest comment slot", `${DAYS[commentPeak.day]} ${hr(commentPeak.hour)}`, `${n(commentPeak.meanComments)} comments/h · ${commentPeak.occurrences} dates`, "◌")}${statCard("Most competing posts", `${DAYS[postPeak.day]} ${hr(postPeak.hour)}`, `${n(postPeak.meanPosts)} posts/h · ${postPeak.occurrences} dates`, "▤")}${statCard("Most participants", `${DAYS[authorPeak.day]} ${hr(authorPeak.hour)}`, `${n(authorPeak.meanAuthors)} distinct/date-hour`, "♧")}${statCard("Observed weeks", r.weeks.length, "First and last weeks may be partial", "▦")}</div>${heatmap()}<section class="panel"><div class="panel-head"><div><h2>Activity and competing posts</h2><p>Comments happen on old and new posts. The ratio below is a conversation-to-submission ratio, not expected replies to a new post.</p></div></div><div class="table-scroll"><table><thead><tr><th>Local window · every day</th><th>Comments / hour</th><th>New posts / hour</th><th>Comments / new post</th><th>Eligible posts</th></tr></thead><tbody>${r.windows.map((w) => `<tr><td><button class="text-button" data-window="${w.i}">${windowLabel(w)}</button></td><td>${n(w.commentsPerHour)}</td><td>${n(w.postsPerHour)}</td><td>${w.postsPerHour ? n(w.commentsPerHour / w.postsPerHour) : "—"}</td><td>${n(w.n)}</td></tr>`).join("")}</tbody></table></div></section>${trend()}<section class="panel"><div class="panel-head"><div><h2>Weekly activity</h2><p>Daily averages make weeks of different lengths comparable. Changing volume can reflect community growth or capture changes.</p></div></div><div class="table-scroll"><table><thead><tr><th>Week beginning</th><th>Days observed</th><th>Comments / day</th><th>Posts / day</th><th>Participants / day</th><th>Median score</th></tr></thead><tbody>${r.weeks.map((w) => `<tr><td>${shortDate(w.week)}</td><td>${w.days}${w.days < 7 ? " · partial" : ""}</td><td>${n(w.commentsPerDay)}</td><td>${n(w.postsPerDay)}</td><td>${n(w.participantsPerDay)}</td><td>${n(w.score)} <small>(n=${n(w.n)})</small></td></tr>`).join("")}</tbody></table></div></section>${comparison()}`;
}
function performance() {
  const r = state.result,
    w = r.recommendation;
  const intervals = Object.entries(r.thresholds)
    .map(([m, t]) => `${m}: score ≥ ${t.score} (n=${n(t.n)})`)
    .join(" · ");
  const flairGroups = r.flairs
    ? r.flairs.map((f) => [f.name, { length: f.n, score: f.score }])
    : Object.entries(
        r.eligible.reduce((a, p) => {
          (a[p.flair || "No flair"] ??= []).push(p);
          return a;
        }, {}),
      )
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 6);
  return `<div class="notice"><strong>How success is defined.</strong> In the full-period comparisons, a successful post reaches its community’s monthly 75th-percentile score (rounded up, at least 1). Ties mean the rate can exceed 25%. Outcomes use 35–40-hour snapshots.</div><section class="panel"><div class="panel-head"><div><h2>Post performance by submission window</h2><p>Four-hour windows pool weekdays to reduce sparse samples. A score is net votes, not an exact upvote count.</p></div><span class="pill">${n(r.totals.n)} eligible posts</span></div><div class="performance-grid">${r.windows.map((x) => `<article class="window-card ${w?.i === x.i ? "selected" : ""}"><span class="pill">${x.n < 30 ? "Sparse sample" : `${x.weeks} weeks observed`}</span><h3>${windowLabel(x)}</h3><div class="window-score">${pct(x.rate)} <span class="small">success</span></div><div class="rank-bar"><span style="width:${(x.rate || 0) * 100}%"></span></div><p class="small">95% Wilson interval: ${x.ci ? x.ci.map(pct).join("–") : "unavailable"}<br>Median score <strong>${n(x.score)}</strong> · median comments <strong>${n(x.medianComments)}</strong><br>${n(x.k)} successful / ${n(x.n)} eligible posts</p><button class="text-button" data-window="${x.i}">Inspect supporting posts →</button></article>`).join("")}</div><p class="small">Comparison thresholds: ${intervals || "No eligible posts"}. Intervals are descriptive and unadjusted for comparing multiple windows or correlated posts.</p></section><div class="content-grid"><section class="panel"><div class="panel-head"><div><h2>Performance in the later period</h2><p>Selection: ${shortDate(r.start)}–${shortDate(new Date(Date.parse(r.midpoint) - 86400000).toISOString().slice(0, 10))}. Later check: ${shortDate(r.midpoint)}–${shortDate(r.end)}.</p></div></div>${w ? `<p class="small">We froze a score threshold of <strong>≥ ${r.discoveryThreshold}</strong> using only the first half, then selected <strong>${windowLabel(w)}</strong> by its first-half Wilson lower bound. Both halves require at least 20 posts; at least four weeks must be represented overall.</p><div class="table-scroll"><table><thead><tr><th>Sample</th><th>Success rate</th><th>Eligible posts</th></tr></thead><tbody><tr><td>Candidate · first half</td><td>${pct(w.train.rate)}</td><td>${w.train.n}</td></tr><tr><td>Candidate · later half</td><td>${pct(w.test.rate)}</td><td>${w.test.n}</td></tr><tr><td>Other windows · later half</td><td>${pct(w.baseline.rate)}</td><td>${w.baseline.n}</td></tr></tbody></table></div><div class="insight-note"><span><strong>${w.label}.</strong> Later-half difference: ${(w.delta * 100).toFixed(1)} percentage points. ${w.deltaCI ? `95% weekly-block bootstrap interval: ${(w.deltaCI[0] * 100).toFixed(1)} to ${(w.deltaCI[1] * 100).toFixed(1)} points.` : "Fewer than three later-half weeks; a weekly uncertainty interval is unavailable."} There are few weeks and many potential confounders; this is a diagnostic, not a causal effect.</span></div>` : `<div class="empty-state"><h3>Too little evidence for a candidate</h3><p>Widen the date range. A candidate needs 20 posts in each half and observations in four weeks.</p></div>`}</section>${recommendation()}</div><section class="panel prose"><h2>Test a posting window</h2><ol><li>Use r/${esc(state.data.subreddit)} only when the topic fits its current rules and audience. Check promotional and duplicate-content rules before posting.</li><li>Compare ${w && w.delta > 0 ? `<strong>${windowLabel(w)}</strong>` : `<strong>${windowLabel(r.busiest)}</strong> (the busiest comment window)`} with your usual posting time. Randomly assign distinct, comparable posts to the two windows across several weeks, balancing weekdays, topic, and flair.</li><li>Aim for 10–15 naturally occurring posts per window as a pilot, without increasing posting frequency just to fill a quota. This is not a powered confirmatory trial.</li><li>Record public score and comment count at the same age (preferably 36 hours). Predeclare the comparison and keep low-performing posts. Record removal status and major releases separately.</li><li>Compare medians and uncertainty. Treat any apparent gain as preliminary until it repeats. Keep private post-insight views separate from public archive metrics.</li></ol></section><section class="panel"><div class="panel-head"><div><h2>How stable was success across weeks?</h2><p>Monthly-relative success for each local window. Small weekly groups can swing sharply.</p></div></div><div class="table-scroll"><table><thead><tr><th>Week</th>${r.windows.map((x) => `<th>${windowLabel(x)}</th>`).join("")}</tr></thead><tbody>${r.weeks
    .map(
      (w) =>
        `<tr><td>${shortDate(w.week)}${w.days < 7 ? " · partial" : ""}</td>${r.windows
          .map((x) => {
            const a = x.weekly.find((a) => a.week === w.week);
            return `<td>${a ? pct(a.rate) : "—"}<br><small>${a ? `n=${a.n}${a.n < 10 ? " · sparse" : ""}` : "No eligible posts"}</small></td>`;
          })
          .join("")}</tr>`,
    )
    .join(
      "",
    )}</tbody></table></div></section><div class="method-grid"><section class="panel"><h2>Monthly context</h2><div class="table-scroll"><table><thead><tr><th>Month</th><th>Days</th><th>Posts/day</th><th>Median score</th><th>Success threshold</th></tr></thead><tbody>${r.monthly.map((m) => `<tr><td>${m.month}</td><td>${m.days}</td><td>${n(m.postsPerDay)}</td><td>${n(m.score)}</td><td>≥ ${m.threshold}</td></tr>`).join("")}</tbody></table></div><p class="small">Months cover only selected dates. Relative thresholds reduce month-level scale differences; they do not fully adjust for growth.</p></section><section class="panel"><h2>Content and outliers still matter</h2><p class="small">The top 1% of eligible posts account for ${pct(r.topShare)} of positive score mass. Medians limit their influence; topic and moderation effects remain.</p><div class="table-scroll"><table><thead><tr><th>Flair</th><th>Posts</th><th>Median score</th></tr></thead><tbody>${flairGroups.map(([f, p]) => `<tr><td>${esc(f)}</td><td>${n(p.length)}</td><td>${n(p.score ?? median(p.map((p) => p.score)))}</td></tr>`).join("")}</tbody></table></div></section></div>`;
}
function filteredPosts() {
  let p = state.result.posts.filter(
    (p) =>
      (state.eligibility === "all" ||
        (state.eligibility === "eligible" ? !p.excluded : !!p.excluded)) &&
      (!state.search ||
        p.title.toLowerCase().includes(state.search.toLowerCase())) &&
      (state.window == null || p.window === state.window) &&
      (state.cell == null ||
        (p.day === Math.floor(state.cell / 24) && p.hour === state.cell % 24)),
  );
  return p.sort((a, b) =>
    state.postSort === "newest"
      ? b.t - a.t
      : state.postSort === "comments"
        ? (b.comments ?? -Infinity) - (a.comments ?? -Infinity)
        : (b.score ?? -Infinity) - (a.score ?? -Infinity),
  );
}
function postsView() {
  if (state.data.mode === "starter")
    return `<section class="panel prose"><h2>Posts for this period</h2><p>The starter snapshot includes activity and performance aggregates from ${n(state.data.audit.posts)} archived posts. Individual post records load on demand.</p><button class="button" id="load-evidence">Load supporting posts</button></section>`;
  const p = filteredPosts(),
    pages = Math.ceil(p.length / 25);
  state.page = Math.min(state.page, Math.max(0, pages - 1));
  const shown = p.slice(state.page * 25, (state.page + 1) * 25);
  return `<section class="panel"><div class="panel-head"><div><h2>Inspect the evidence</h2><p>${n(p.length)} matching posts · public archive scores may differ from current Reddit scores.</p></div><button class="button" id="clear-post-filters">Clear post filters</button></div>${state.cell != null ? `<p class="small">Filtered to ${DAYS[Math.floor(state.cell / 24)]} ${hr(state.cell % 24)}–${hr((state.cell % 24) + 1)}.</p>` : ""}${state.window != null ? `<p class="small">Filtered to ${hr(state.window * 4)}–${hr((state.window + 1) * 4)} across the week.</p>` : ""}<form class="table-controls" id="post-form"><input type="search" id="post-search" aria-label="Search post titles" placeholder="Search post titles…" value="${esc(state.search)}"><select id="eligibility" aria-label="Analysis eligibility"><option value="all" ${state.eligibility === "all" ? "selected" : ""}>All archived posts</option><option value="eligible" ${state.eligibility === "eligible" ? "selected" : ""}>Eligible for performance</option><option value="excluded" ${state.eligibility === "excluded" ? "selected" : ""}>Excluded from performance</option></select><select id="post-sort" aria-label="Sort posts"><option value="score" ${state.postSort === "score" ? "selected" : ""}>Highest score</option><option value="comments" ${state.postSort === "comments" ? "selected" : ""}>Most comments</option><option value="newest" ${state.postSort === "newest" ? "selected" : ""}>Newest submitted</option></select><button class="button">Search</button></form>${shown.length ? `<div class="table-scroll"><table><thead><tr><th>Post</th><th>Submitted · ${esc(zoneLabel())}</th><th>Net score</th><th>Comments</th><th>Snapshot age</th><th>Performance eligibility</th></tr></thead><tbody>${shown.map((p) => `<tr><td class="post-title"><a href="https://www.reddit.com/r/${encodeURIComponent(state.data.subreddit)}/comments/${encodeURIComponent(p.id)}/" target="_blank" rel="noopener noreferrer">${esc(p.title)} ↗</a><small>${esc(p.flair || "No flair")} · ${esc(p.id)}</small></td><td>${p.date}<br>${new Intl.DateTimeFormat("en-GB", { timeZone: state.result.zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(p.t * 1000)}</td><td>${n(p.score)}</td><td>${n(p.comments)}</td><td>${p.age == null ? "Unknown" : `${p.age.toFixed(2)}h`}<small class="small">${p.snapshotAt ? `<br>${new Date(p.snapshotAt * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC")}` : ""}</small></td><td><span class="pill ${p.excluded ? "muted-warning" : ""}">${esc(p.excluded || "Eligible")}</span></td></tr>`).join("")}</tbody></table></div><div class="pagination"><span>Page ${state.page + 1} of ${pages} · 25 per page</span><div class="buttons"><button class="button" data-page="-1" ${state.page === 0 ? "disabled" : ""}>Previous</button><button class="button" data-page="1" ${state.page >= pages - 1 ? "disabled" : ""}>Next</button></div></div>` : '<div class="empty-state"><h3>No matching posts</h3><p>Try a broader search or clear the post filters.</p></div>'}</section>`;
}
function currentMethodology() {
  const d = state.data;
  return `<div class="notice"><strong>An archive-backed study, not a live audience counter.</strong> Recent record timestamps show source freshness. Historical analysis uses completed local days and eligible score snapshots.</div><div class="method-grid">
  <section class="panel prose"><h2>What each metric means</h2><ul><li><strong>Activity:</strong> posts and comments created during the selected interval. Known bots are excluded; captured removed content still contributes to volume.</li><li><strong>Participants:</strong> distinct available authors within a date/hour or local day. Deleted or missing authors are excluded. Counts across hours cannot be added to obtain unique daily people.</li><li><strong>Score:</strong> net voting, not an exact upvote count. No online-user counts, silent readership, weekly visitors, or private views are measured.</li></ul></section>
  <section class="panel prose"><h2>Any covered subreddit, within a bounded interval</h2><p>The browser acquires actual records from Arctic Shift, using the site’s relay when a direct connection fails. No Reddit login is used. A subreddit can be entered even when the provider's infrequently updated discovery directory does not list it.</p><p>Each run is bounded to 93 days, 200,000 records, and 350 source requests. Very busy communities need shorter ranges. Every page must be exhausted before a day's data is used; failed or capped acquisitions never become sampled findings.</p><p>This makes arbitrary communities accessible without hosting an all-Reddit database. It does not establish complete Reddit coverage.</p></section>
  <section class="panel prose"><h2>Freshness and caching</h2><p>Latest post and comment timestamps are checked every 5 minutes while this tab is visible and auto-refresh is enabled. Analysis is checked every 15 minutes. The most recent three days have a 15-minute cache; older completed days expire after seven days. “Refresh data” bypasses those caches.</p><p>Polling is not a webhook: an update can arrive between checks, and archive processing may be delayed. The current day is incomplete and excluded from timing comparisons. The provider usually refreshes post outcomes roughly 36 hours after creation.</p><p>Oldest included day-cache retrieval: <strong>${moment(Date.parse(d.coverage.fetchedAtMin) / 1000)}</strong>. Newest: <strong>${moment(Date.parse(d.coverage.fetchedAtMax) / 1000)}</strong>, ${esc(zoneLabel())}.</p></section>
  <section class="panel prose"><h2>Comparable outcomes</h2><p>Only posts with a recorded second snapshot age between 35 and 40 hours enter performance comparisons. Removed/deleted, pinned, known-bot, and missing-outcome posts are excluded. Restoration metadata overrides stale initial moderation fields; explicit later removal wins.</p><p>Recent posts without a mature snapshot count toward activity but not performance. Download time is not score measurement time; these are neither final outcomes nor first-24-hour measurements.</p></section>
  <section class="panel prose"><h2>Success and uncertainty</h2><p>Descriptive success is score at or above the rounded-up 75th percentile for eligible posts from that community and selected month, at least 1. Ties can make more than 25% successful.</p><p>The candidate threshold is fitted only on the earlier half and frozen for the later half. Six four-hour windows are compared using the first-half Wilson lower bound; a candidate needs 20 posts per half and four represented weeks. Later-half differences use 1,000 calendar-week bootstrap samples when at least three weeks are available.</p><p>Multiple comparisons, sparse groups, partial weeks, content, topic, flair, moderation, growth, and events limit interpretation. These are observational associations, not promises that changing time causes better results.</p></section>
  <section class="panel prose"><h2>Data footprint and reproducibility</h2><p>${n(d.audit.records)} records acquired: ${n(d.audit.posts)} posts and ${n(d.audit.comments)} comments. ${n(d.audit.knownBotRecords)} known-bot records, ${n(d.audit.unattributedRecords)} records without an attributable author, and ${n(d.audit.removedPosts)} removed/deleted posts. ${n(d.audit.eligiblePosts)} posts have eligible performance measurements.</p><p>Author names exist transiently in the acquisition worker for distinct counting. Only anonymous aggregates, redacted post evidence, request URLs, hashes, and retrieval timestamps are cached in this browser. There are no author timelines or third-party analytics logs. Completed days and analyses are kept until you clear local data. Freshness checks do not delete old data. Persistent storage is requested when supported; browser storage limits, private browsing, or clearing site data can still remove it. If space runs out, existing analyses are kept and a save warning is shown.</p><button class="button quiet" id="download-provenance">Download request provenance</button> <button class="button quiet" id="clear-browser-cache">Clear browser cache</button></section>
  </div><section class="panel prose"><h2>Source and hosting</h2><p><a href="https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md" target="_blank" rel="noopener noreferrer">Arctic Shift API documentation ↗</a> · <a href="https://github.com/aaditya-v-more/reddit-activity-lab" target="_blank" rel="noopener noreferrer">Project source and methodology ↗</a></p><p>The application is static. Direct archive requests do not use hosting bandwidth. When a direct connection fails, three fixed Vercel routes use a small stateless relay that strips site credentials before contacting the archive. Relayed requests count toward Vercel Function and transfer limits. No archive database is hosted. Other static hosts can use direct requests or provide an equivalent relay.</p><p>No dataset redistribution license was established. This website does not bundle Reddit records. Archive access and missingness depend on the provider. Cached records may lag later removals; refreshing local data updates the visible archive state.</p></section>`;
}
function methodology() {
  if (["on-demand", "starter"].includes(state.data.mode))
    return currentMethodology();
  const d = state.data,
    a = d.audit,
    c = d.coverage,
    probe = state.manifest.sourceProbe;
  const coverageTime = (t) =>
    new Date(t * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
  const sources = [
    [
      "Arctic Shift API",
      "https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md",
    ],
    [
      "Collection and score updates",
      "https://github.com/ArthurHeitmann/arctic_shift/blob/master/file_content_explanations.md",
    ],
    [
      "Monthly archive downloads",
      "https://github.com/ArthurHeitmann/arctic_shift/blob/master/download_links.md",
    ],
    [
      "Pushshift access requirements",
      "https://support.reddithelp.com/hc/en-us/articles/16470271632404-Pushshift-Access-Request",
    ],
  ];
  return `<div class="notice"><strong>Historical study, not a live audience counter.</strong> This site has no confirmed online-user observations, no weekly-visitor history, and no private view counts. </div><div class="method-grid"><section class="panel prose"><h2>Four different measurements</h2><ul><li><strong>Activity volume:</strong> archived posts and comments created within the selected local interval; known bots excluded. Comments may belong to older posts.</li><li><strong>Active participants:</strong> distinct identifiable authors who posted or commented within each local date/hour window. A person counts once in that window. The overview uses the median of distinct daily counts. Unknown/deleted authors are excluded.</li><li><strong>Online users:</strong> only a count explicitly returned by Reddit could be labeled this way. Unavailable here.</li><li><strong>Weekly visitors:</strong> a separate Reddit audience metric. Unavailable here. Silent readers cannot be inferred from participation.</li></ul></section><section class="panel"><h2>r/${esc(d.subreddit)} acquisition audit</h2><div class="coverage-list">${[
    ["Requested start", coverageTime(c.start)],
    ["Requested end (exclusive)", coverageTime(c.end)],
    ["First returned record", coverageTime(c.firstRecord)],
    ["Last returned record", coverageTime(c.lastRecord)],
    [
      "Locally fetched",
      `${c.fetchedAtMin.slice(0, 10)} – ${c.fetchedAtMax.slice(0, 10)}`,
    ],
    ["Archived posts / comments", `${n(a.posts)} / ${n(a.comments)}`],
    ["Known-bot records excluded", n(a.knownBotRecords)],
    ["Records with unknown author", n(a.unattributedRecords)],
    ["Removed/deleted posts", n(a.removedPosts)],
    ["Eligible performance posts", n(a.eligiblePosts)],
    ["Median second-snapshot age", `${a.snapshotAgeMedian?.toFixed(3)} hours`],
  ]
    .map(
      ([k, v]) =>
        `<div class="coverage-row"><span>${k}</span><span>${v}</span></div>`,
    )
    .join(
      "",
    )}</div><p class="small">Audit counts cover the entire downloaded UTC interval, before the date filter. All pages were exhausted. This proves extraction completion, not that Reddit or the archive captured every record.</p></section><section class="panel prose"><h2>Scores at a known age</h2><p>Arctic Shift documents an initial retrieval followed by an approximately 36-hour refresh. Updated fields include score and comment count. We verify the second timestamp per post and retain only ages from 35 through 40 hours for performance.</p><p>Score is net voting, and neither guaranteed final nor an exact upvote count. These observations cannot measure first-24-hour performance. The local download timestamp is distinct from both archive retrieval timestamps.</p><p>Removed/deleted, pinned, known-bot, missing-outcome, and unsuitable-age posts remain in the evidence list but are excluded from performance. Restoration metadata overrides stale initial moderation fields; an explicit later removal still wins. Activity still counts captured removed content, without displaying removed titles or comment bodies. Moderation therefore changes the population being compared.</p></section><section class="panel prose"><h2>Success, uncertainty, and selection</h2><p>Full-period success means score ≥ the ceiling of the 75th percentile among eligible posts from the same community and selected calendar month, with a minimum threshold of 1. Quantiles use linear interpolation. Ties can lift the success proportion above 25%.</p><p>Window cards show medians, sample sizes, and 95% Wilson score intervals. These intervals assume independent post outcomes and are not corrected for multiple comparisons.</p><p>The recommendation uses a separate threshold fitted only on the first half of selected dates and frozen for the later half. Six four-hour windows compete by the first-half Wilson lower bound. Eligibility requires 20 posts per half and four represented weeks.</p><p>The later-half difference compares that candidate with all other windows. Its 95% interval resamples complete calendar-week clusters 1,000 times with a fixed seed. Fewer than three later-half weeks suppress the interval. Few clusters, partial weeks, shared topics, and selection still limit reliability.</p></section><section class="panel prose"><h2>Coverage and source availability</h2><p>The public Arctic Shift API worked without a login or Reddit session. Pagination uses date overlap and identity deduplication. Monthly compressed JSONL dumps provide an alternative, but the listed July 2026 all-Reddit dump alone is approximately 80.27 GB; this project only downloaded the requested communities.</p><p>Pushshift requires Reddit-approved moderator access restricted to moderation use cases. It was not used for this analytics project.</p><p>No explicit dataset redistribution license was found in the checked Arctic Shift root documentation or July torrent metadata. Public accessibility is not a license grant. The website does not bundle archive records; consult the provider before redistributing a dataset.</p><p>Sources checked ${probe?.checked_at?.slice(0, 10) || state.manifest.generatedAt.slice(0, 10)}. Record boundaries below are API observations, not proof of uninterrupted capture.</p></section><section class="panel prose"><h2>Limits that shape the conclusions</h2><ul><li>Capture gaps, delayed observations, deleted records, private communities, and archive removal requests create unknown missingness. A zero means no captured activity, not guaranteed inactivity.</li><li>The explicit bot list is conservative; other automation is not reliably identified. Current exclusions: ${state.manifest.knownBots.map(esc).join(", ")}.</li><li>Timezones use IANA rules, including half-hour offsets and daylight saving. Partial boundary days are excluded. Activity volumes use actual hourly exposure; participant heatmaps average distinct counts per local date/hour window.</li><li>Flair, topic, subscriber growth, major releases, moderation, and content quality can drive results. Monthly normalization and weekly checks only partly address this.</li><li>No follower tracking, individual activity timelines, or usernames are exported. Only aggregate participation and public post evidence reach the site.</li></ul></section></div><section class="panel" style="margin-top:22px"><div class="panel-head"><div><h2>Verified source boundaries</h2><p>Earliest and latest records returned during the coverage probe. A community may contain gaps between these endpoints.</p></div></div><div class="table-scroll"><table><thead><tr><th>Community</th><th>Record type</th><th>Earliest returned</th><th>Latest returned</th></tr></thead><tbody>${state.manifest.communities
    .flatMap((s) =>
      ["posts", "comments"].map((k) => {
        const p = (probe?.results || []).filter(
          (r) => r.subreddit === s.name && r.kind === k,
        );
        const first = p.find((r) => r.sort === "asc")?.records?.[0],
          last = p.find((r) => r.sort === "desc")?.records?.[0];
        return `<tr><td>r/${esc(s.name)}</td><td>${k}</td><td>${first ? coverageTime(first.created_utc) : "Not probed"}</td><td>${last ? coverageTime(last.created_utc) : "Not probed"}</td></tr>`;
      }),
    )
    .join(
      "",
    )}</tbody></table></div></section><section class="panel prose"><h2>Sources and reproducibility</h2><ul>${sources.map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener noreferrer">${t} ↗</a></li>`).join("")}<li><a href="/data/provenance.json" target="_blank">Download the request provenance ledger</a> · URLs, response hashes, retrieval dates, and row counts.</li><li><a href="/data/manifest.json" target="_blank">Download the export manifest</a> · coverage audit, schemas, and export hashes.</li></ul><p>Original public API responses and the analytical SQLite database stay in the local project’s ignored data directory. Reruns reuse verified response caches, deduplicate records, and keep newer snapshots. A source adapter can be replaced without changing the dashboard’s export contract.</p></section>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.community) {
    $("#community").value = b.dataset.community;
    state.view = "overview";
    changeSelection();
  }
  if (b.dataset.window !== undefined) {
    state.window = Number(b.dataset.window);
    state.cell = null;
    state.page = 0;
    state.view = "posts";
    state.eligibility = "eligible";
    render();
  }
  if (b.dataset.page) {
    state.page += Number(b.dataset.page);
    render();
  }
  if (b.id === "clear-post-filters") {
    state.search = "";
    state.cell = null;
    state.window = null;
    state.eligibility = "all";
    state.page = 0;
    render();
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "post-form") {
    e.preventDefault();
    state.search = $("#post-search").value;
    state.postSort = $("#post-sort").value;
    state.eligibility = $("#eligibility").value;
    state.page = 0;
    render();
  }
});
document.addEventListener("change", (e) => {
  if (["eligibility", "post-sort"].includes(e.target.id)) {
    state.search = $("#post-search").value;
    state.postSort = $("#post-sort").value;
    state.eligibility = $("#eligibility").value;
    state.page = 0;
    render();
  }
});
init();
