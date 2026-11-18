// Mobile navigation toggle.
(function () {
  const btn = document.querySelector(".navbar__toggle");
  const header = document.getElementById("site-header");
  if (!btn || !header) return;
  btn.addEventListener("click", () => {
    const open = header.classList.toggle("nav-open");
    btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && header.classList.contains("nav-open")) {
      header.classList.remove("nav-open");
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
    }
  });
})();
