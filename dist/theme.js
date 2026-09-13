// Runs before styles load so a saved preference is applied before first paint.
(() => {
  const key = "reddit-lab-theme";
  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const valid = (value) =>
    ["system", "light", "dark"].includes(value) ? value : "system";
  let preference = "system";
  try {
    preference = valid(localStorage.getItem(key));
  } catch {}
  function apply() {
    root.dataset.theme =
      preference === "system"
        ? system.matches
          ? "dark"
          : "light"
        : preference;
    const select = document.querySelector("#theme");
    if (select) select.value = preference;
  }
  apply();
  system.addEventListener("change", apply);
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) {
      preference = valid(event.newValue);
      apply();
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.querySelector("#theme")?.addEventListener("change", (event) => {
      preference = valid(event.target.value);
      try {
        localStorage.setItem(key, preference);
      } catch {}
      apply();
    });
  });
})();
