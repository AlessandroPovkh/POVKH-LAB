const mobileMenu = document.querySelector(".mobile-nav");

if (mobileMenu) {
  mobileMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileMenu.open) {
      mobileMenu.open = false;
      mobileMenu.querySelector("summary")?.focus();
    }
  });

  mobileMenu.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      mobileMenu.open = false;
    }
  });
}

const catalogFilters = document.querySelector("[data-catalog-filters]");

if (catalogFilters) {
  const buttons = [...catalogFilters.querySelectorAll("[data-filter-value]")];
  const cards = [...document.querySelectorAll("[data-release-card]")];
  const result = catalogFilters.querySelector("[data-filter-result]");
  const resultTemplate = catalogFilters.dataset.resultsTemplate || "{visible} / {total}";

  const applyFilter = (value) => {
    let visible = 0;
    for (const card of cards) {
      const matches = value === "all" || card.dataset.releaseStatus === value;
      card.hidden = !matches;
      if (matches) visible += 1;
    }
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.filterValue === value));
    }
    if (result) {
      result.textContent = resultTemplate
        .replace("{visible}", String(visible))
        .replace("{total}", String(cards.length));
    }
  };

  for (const button of buttons) {
    button.addEventListener("click", () => applyFilter(button.dataset.filterValue));
  }

  applyFilter("all");
}

document.documentElement.classList.add("js-ready");
