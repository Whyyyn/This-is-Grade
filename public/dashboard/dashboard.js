import { agencyRows, ticker } from "/dashboard/content.js";

const root = document.documentElement;
const rows = document.querySelector("#agencyRows");
const tickerLabel = document.querySelector("#tickerLabel");
const tickerCopy = document.querySelector("#tickerCopy");
const themeToggle = document.querySelector("#themeToggle");

function savedTheme() {
  try {
    return localStorage.getItem("agency-theme");
  } catch {
    return null;
  }
}

function preferredTheme() {
  const saved = savedTheme();
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  themeToggle.textContent = theme === "dark" ? "LIGHT" : "DARK";
}

function rowTemplate(row) {
  if (row.tone === "feature") {
    return `
      <section class="relative flex min-h-56 flex-col justify-center gap-5 overflow-hidden bg-primary-500 px-4 py-8 text-secondary-900 sm:px-6 md:min-h-0 md:flex-1 md:flex-row md:items-center md:justify-between md:py-6 lg:px-8">
        <h2 class="font-display text-6xl font-thin uppercase leading-none tracking-normal sm:text-8xl md:text-9xl">${row.label}</h2>
        <p class="max-w-xs text-lg font-normal leading-snug sm:text-xl md:mr-12 md:text-2xl">${row.copy}</p>
      </section>
    `;
  }

  return `
    <section class="relative flex min-h-40 flex-1 items-center overflow-hidden border-b border-secondary-500 px-4 py-7 text-secondary-500 dark:border-neutral-700 dark:text-secondary-50 sm:px-6 lg:px-8">
      <h2 class="relative z-10 font-display text-6xl font-thin uppercase leading-none tracking-normal sm:text-8xl md:text-9xl">${row.label}</h2>
    </section>
  `;
}

rows.innerHTML = agencyRows.map(rowTemplate).join("");
tickerLabel.textContent = ticker.label;
tickerCopy.textContent = ticker.copy;
applyTheme(preferredTheme());

themeToggle.addEventListener("click", () => {
  const nextTheme = root.classList.contains("dark") ? "light" : "dark";
  applyTheme(nextTheme);
  try {
    localStorage.setItem("agency-theme", nextTheme);
  } catch {
    // Theme still works for the current page if storage is unavailable.
  }
});
