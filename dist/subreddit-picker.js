const validName = /^[A-Za-z0-9_]{2,21}$/;
const recentKey = "reddit-lab-recent-communities";
export const searchName = (value) =>
  String(value)
    .trim()
    .replace(/^\/?r\//i, "");

export function rankCommunities(candidates, query, limit = 10) {
  const needle = searchName(query).toLowerCase();
  const unique = new Map();
  for (const candidate of candidates) {
    const item =
      typeof candidate === "string" ? { name: candidate } : candidate;
    if (typeof item?.name !== "string" || !validName.test(item.name)) continue;
    const key = item.name.toLowerCase();
    if (!unique.has(key)) unique.set(key, item);
  }
  const score = (name) =>
    name === needle ? 0 : name.startsWith(needle) ? 1 : 2;
  return [...unique.values()]
    .filter(({ name }) => name.toLowerCase().includes(needle))
    .sort((a, b) =>
      needle
        ? score(a.name.toLowerCase()) - score(b.name.toLowerCase()) ||
          a.name.length - b.name.length ||
          a.name.localeCompare(b.name)
        : 0,
    )
    .slice(0, limit);
}

export function createSubredditPicker({
  root,
  search,
  getKnown,
  onSelect,
  onInput,
}) {
  const input = root.querySelector("input");
  const toggle = root.querySelector("#community-toggle");
  const popup = root.querySelector("#community-popup");
  const list = root.querySelector("[role=listbox]");
  const status = root.querySelector("[role=status]");
  let recent = [];
  try {
    const saved = JSON.parse(localStorage.getItem(recentKey) || "[]");
    if (Array.isArray(saved))
      recent = saved
        .filter((n) => typeof n === "string" && validName.test(n))
        .slice(0, 12);
  } catch {}
  const cache = new Map();
  let options = [],
    remote = [],
    active = -1,
    query = "",
    loading = false,
    failed = false;
  let timer,
    request,
    revision = 0;

  function cancel() {
    clearTimeout(timer);
    request?.cancel();
    request = null;
    revision++;
  }
  function close() {
    cancel();
    popup.hidden = true;
    input.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }
  function highlight(index) {
    active = index;
    [...list.children].forEach((option, i) =>
      option.setAttribute("aria-selected", String(i === active)),
    );
    if (active >= 0) {
      const option = list.children[active];
      input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }
  function render() {
    const focusedName = options[active]?.name;
    const known = getKnown();
    options = rankCommunities(
      [
        ...recent.map((name) => ({ name, detail: "Recently selected" })),
        ...known,
        ...remote.map((name) => ({ name, detail: "Archive directory" })),
      ],
      query,
    );
    const name = searchName(query);
    if (
      validName.test(name) &&
      !options.some((item) => item.name.toLowerCase() === name.toLowerCase())
    )
      options.push({
        name,
        detail: "Look up this name directly",
        manual: true,
      });
    list.replaceChildren();
    for (const [index, option] of options.entries()) {
      const row = document.createElement("button");
      row.type = "button";
      row.tabIndex = -1;
      row.id = `community-option-${index}`;
      row.className = `community-option${option.manual ? " community-manual" : ""}`;
      row.setAttribute("role", "option");
      row.dataset.index = String(index);
      const title = document.createElement("span");
      title.className = "community-option-name";
      const position = option.name.toLowerCase().indexOf(name.toLowerCase());
      title.append(option.manual ? "Use r/" : "r/");
      if (name && position >= 0) {
        title.append(option.name.slice(0, position));
        const match = document.createElement("strong");
        match.textContent = option.name.slice(position, position + name.length);
        title.append(match, option.name.slice(position + name.length));
      } else title.append(option.name);
      const detail = document.createElement("span");
      detail.className = "community-option-detail";
      detail.textContent = option.detail || "Suggested community";
      row.append(title, detail);
      list.append(row);
    }
    status.replaceChildren();
    if (loading) {
      const spinner = document.createElement("span");
      spinner.className = "loader inline-loader";
      spinner.setAttribute("aria-hidden", "true");
      status.append(spinner, " Searching subreddits…");
    } else {
      const matches = options.filter((o) => !o.manual).length;
      status.textContent = failed
        ? "Directory search unavailable. You can still enter a name."
        : !query
          ? "Recent & suggested communities"
          : matches
            ? `${matches} matching ${matches === 1 ? "subreddit" : "subreddits"}`
            : name.length < 2
              ? "Type at least 2 characters to search the archive."
              : "No directory matches. You can still try this name.";
    }
    list.setAttribute("aria-busy", String(loading));
    highlight(
      focusedName ? options.findIndex((o) => o.name === focusedName) : -1,
    );
  }
  function show(value) {
    cancel();
    query = searchName(value);
    remote = cache.get(query.toLowerCase()) || [];
    loading = validName.test(query) && !cache.has(query.toLowerCase());
    failed = false;
    popup.hidden = false;
    input.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-expanded", "true");
    render();
    if (!loading) return;
    const ticket = revision;
    timer = setTimeout(async () => {
      try {
        request = search(query);
        const names = await request.promise;
        if (ticket !== revision) return;
        remote = names;
        cache.set(query.toLowerCase(), names);
        if (cache.size > 60) cache.delete(cache.keys().next().value);
      } catch (error) {
        if (ticket !== revision) return;
        failed = !error.cancelled;
      } finally {
        if (ticket === revision) {
          loading = false;
          request = null;
          render();
        }
      }
    }, 300);
  }
  function choose(index) {
    const option = options[index];
    if (!option) return;
    input.value = option.name;
    recent = [
      option.name,
      ...recent.filter((n) => n.toLowerCase() !== option.name.toLowerCase()),
    ].slice(0, 12);
    try {
      localStorage.setItem(recentKey, JSON.stringify(recent));
    } catch {}
    input.focus({ preventScroll: true });
    close();
    onSelect(option.name);
  }
  input.addEventListener("focus", () => show(""));
  input.addEventListener("click", () => {
    if (popup.hidden) show("");
  });
  input.addEventListener("input", () => {
    onInput();
    active = -1;
    show(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (popup.hidden) show("");
      if (options.length)
        highlight(
          active < 0
            ? event.key === "ArrowDown"
              ? 0
              : options.length - 1
            : (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
                options.length,
        );
    } else if (event.key === "Enter" && !popup.hidden && active >= 0) {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" || event.key === "Tab") close();
  });
  toggle.addEventListener("mousedown", (event) => event.preventDefault());
  toggle.addEventListener("click", () => {
    if (!popup.hidden) close();
    else {
      input.focus({ preventScroll: true });
      show("");
    }
  });
  list.addEventListener("mousedown", (event) => event.preventDefault());
  list.addEventListener("click", (event) => {
    const option = event.target.closest("[role=option]");
    if (option) choose(Number(option.dataset.index));
  });
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget)) close();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) close();
  });
  input.form?.addEventListener("submit", close);
  return {
    clearRecent() {
      recent = [];
      cache.clear();
      try {
        localStorage.removeItem(recentKey);
      } catch {}
      close();
    },
  };
}
