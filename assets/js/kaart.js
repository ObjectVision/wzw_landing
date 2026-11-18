// Kaartviewers: province overview -> in-page derondekaart viewer with a zoom transition.
(function () {
  const root = document.querySelector("[data-kaart]");
  if (!root) return;

  const header = document.getElementById("site-header");
  const mapSvg = root.querySelector(".kaart__map svg");
  const viewer = root.querySelector(".viewer");
  const zoomBox = viewer.querySelector(".viewer__zoom");
  const frameBox = viewer.querySelector(".viewer__frame");
  const titleEl = viewer.querySelector(".viewer__title");
  const logoEl = document.querySelector(".header__province");
  const homeUrl = root.dataset.home;
  const homeTitle = root.dataset.homeTitle;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const FULL = mapSvg.dataset.viewbox.split(/\s+/).map(Number);
  const ZOOM_MS = 850;
  const FADE_MS = 300;
  const LOAD_TIMEOUT_MS = 12000;

  // Province registry from the overview map.
  const provinces = {};
  mapSvg.querySelectorAll("a.prov--active").forEach((a) => {
    provinces[a.dataset.province] = {
      id: a.dataset.province,
      name: a.dataset.name,
      variant: a.dataset.variant,
      logo: a.dataset.logo || "",
      href: a.getAttribute("href"),
      bbox: a.dataset.bbox.split(/\s+/).map(Number),
      link: a,
    };
  });
  const byPath = (path) =>
    Object.values(provinces).find((p) => normalize(p.href) === normalize(path));
  const normalize = (p) => p.replace(/\/index\.html$/, "/").replace(/\/?$/, "/");

  // Non-interactive clone of the map used for the zoom animation.
  const clone = mapSvg.cloneNode(true);
  clone.setAttribute("preserveAspectRatio", "none");
  clone.removeAttribute("role");
  clone.removeAttribute("aria-label");
  clone.setAttribute("focusable", "false");
  clone.querySelectorAll("a").forEach((a) => {
    a.removeAttribute("href");
    a.setAttribute("tabindex", "-1");
  });
  zoomBox.appendChild(clone);

  let current = root.dataset.open || null;
  let canGoBack = false; // true when the previous history entry is our overview
  let token = 0;

  // ---------- helpers ----------
  const syncHeaderHeight = () =>
    document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
  const setViewBox = (vb) => clone.setAttribute("viewBox", vb.map((n) => n.toFixed(2)).join(" "));
  const getViewBox = () => clone.getAttribute("viewBox").split(/\s+/).map(Number);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const animated = () => !reduceMotion.matches;

  // ViewBox for the viewer-sized clone that puts the map exactly over the overview map.
  function overviewViewBox(V) {
    const M = mapSvg.getBoundingClientRect();
    const s = Math.min(M.width / FULL[2], M.height / FULL[3]);
    const rx = M.left + (M.width - FULL[2] * s) / 2;
    const ry = M.top + (M.height - FULL[3] * s) / 2;
    return [FULL[0] - (rx - V.left) / s, FULL[1] - (ry - V.top) / s, V.width / s, V.height / s];
  }

  // ViewBox that fits the province bbox (padded) into the viewer's aspect ratio.
  function provinceViewBox(p, V) {
    let [x, y, w, h] = p.bbox;
    const pad = Math.max(w, h) * 0.12;
    x -= pad; y -= pad; w += pad * 2; h += pad * 2;
    const A = V.width / V.height;
    if (w / h > A) { const nh = w / A; y -= (nh - h) / 2; h = nh; }
    else { const nw = h * A; x -= (nw - w) / 2; w = nw; }
    return [x, y, w, h];
  }

  // Zoom: interpolate centre linearly, scale geometrically (feels like a camera move).
  function tween(from, to, ms, my) {
    return new Promise((resolve) => {
      const c0 = [from[0] + from[2] / 2, from[1] + from[3] / 2];
      const c1 = [to[0] + to[2] / 2, to[1] + to[3] / 2];
      const A = to[2] / to[3];
      const t0 = performance.now();
      const step = (now) => {
        if (my !== token) return resolve(false);
        const t = Math.min(1, (now - t0) / ms);
        const e = ease(t);
        const w = from[2] * Math.pow(to[2] / from[2], e);
        const h = w / A;
        const cx = c0[0] + (c1[0] - c0[0]) * e;
        const cy = c0[1] + (c1[1] - c0[1]) * e;
        setViewBox([cx - w / 2, cy - h / 2, w, h]);
        t < 1 ? requestAnimationFrame(step) : resolve(true);
      };
      requestAnimationFrame(step);
    });
  }

  function markSelected(id) {
    clone.querySelectorAll("[data-province]").forEach((el) =>
      el.classList.toggle("is-selected", el.dataset.province === id)
    );
  }

  function makeIframe(p) {
    frameBox.textContent = "";
    const f = document.createElement("iframe");
    f.title = "Kaartviewer WoonZorgwijzer " + p.name;
    f.allow = "fullscreen; geolocation; clipboard-write";
    f.setAttribute("allowfullscreen", "");
    const loaded = new Promise((resolve) => {
      f.addEventListener("load", resolve, { once: true });
      setTimeout(resolve, LOAD_TIMEOUT_MS);
    });
    f.src = p.variant;
    frameBox.appendChild(f);
    return loaded;
  }

  function setChrome(p) {
    titleEl.textContent = "WoonZorgwijzer " + p.name;
    showLogo(p);
    document.title = "WoonZorgwijzer " + p.name + " - " + homeTitle.split(" - ").pop();
  }

  // Province logo next to the site logo in the header.
  let logoTimer;
  function showLogo(p) {
    if (!logoEl) return;
    clearTimeout(logoTimer);
    if (!p.logo) return hideLogo();
    if (logoEl.getAttribute("src") !== p.logo) {
      logoEl.classList.remove("is-visible");
      logoEl.src = p.logo;
    }
    logoEl.alt = "Provincie " + p.name;
    logoEl.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => logoEl.classList.add("is-visible")));
  }
  function hideLogo() {
    if (!logoEl) return;
    logoEl.classList.remove("is-visible");
    clearTimeout(logoTimer);
    logoTimer = setTimeout(() => { if (!current) logoEl.hidden = true; }, 300);
  }

  // ---------- open / close ----------
  async function open(id, { push = true } = {}) {
    const p = provinces[id];
    if (!p || current === id) return;
    const my = ++token;
    const midFlight = !viewer.hidden; // already open, or interrupted while closing
    current = id;
    root.classList.remove("is-returning");
    viewer.classList.remove("is-returning");

    if (push) {
      history.pushState({ kaart: id, fromHome: true }, "", p.href);
      canGoBack = true;
    }
    setChrome(p);
    markSelected(id);

    // Lock page scroll first (this also drops the scrollbar gutter), then measure.
    document.body.classList.add("viewer-open");
    viewer.hidden = false;
    viewer.classList.remove("is-ready", "is-zoomed");
    const loaded = makeIframe(p);
    const V = viewer.getBoundingClientRect();
    const target = provinceViewBox(p, V);

    if (animated()) {
      if (!midFlight) setViewBox(overviewViewBox(V));
      void viewer.offsetWidth; // commit start state before transitions kick in
      root.classList.add("is-open");
      viewer.classList.add("is-active");
      if (!(await tween(getViewBox(), target, ZOOM_MS, my))) return;
    } else {
      setViewBox(target);
      root.classList.add("is-open");
      viewer.classList.add("is-active");
    }

    viewer.classList.add("is-zoomed");
    await loaded;
    if (my !== token) return;
    viewer.classList.add("is-ready");
  }

  async function close({ animate = true } = {}) {
    if (!current) return;
    const my = ++token;
    const p = provinces[current];
    current = null;
    document.title = homeTitle;
    hideLogo();

    viewer.classList.remove("is-ready", "is-zoomed");

    if (animate && animated()) {
      await wait(FADE_MS); // iframe fades out, zoomed province shows again
      if (my !== token) return;
      frameBox.textContent = "";
      // Page chrome fades back in while the clone zooms out over the (hidden) overview map.
      root.classList.add("is-returning");
      viewer.classList.add("is-returning");
      // Restore page scroll/gutter before measuring so the clone lands exactly on the overview map.
      document.body.classList.remove("viewer-open");
      const V = viewer.getBoundingClientRect();
      if (!(await tween(getViewBox(), overviewViewBox(V), ZOOM_MS, my))) return;
    } else {
      frameBox.textContent = "";
    }
    // Clone now sits exactly on the overview map: swap them.
    root.classList.remove("is-open", "is-returning");
    document.body.classList.remove("viewer-open");
    viewer.classList.remove("is-active", "is-returning");
    viewer.hidden = true;
    if (p) p.link.focus({ preventScroll: true });
  }

  function goHome() {
    if (canGoBack) {
      history.back(); // popstate -> close()
    } else {
      history.pushState({ kaart: null }, "", homeUrl);
      close();
    }
  }

  // ---------- events ----------
  mapSvg.addEventListener("click", (e) => {
    const a = e.target.closest("a.prov--active");
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(a.dataset.province);
  });

  // Header links to the overview (e.g. menu item "Kaartviewers") return without a page load.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || !current || root.contains(a)) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (normalize(new URL(a.href, location.href).pathname) !== normalize(homeUrl)) return;
    e.preventDefault();
    goHome();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current) goHome();
  });

  window.addEventListener("popstate", (e) => {
    const p = byPath(location.pathname);
    if (p) {
      canGoBack = !!(e.state && e.state.fromHome);
      open(p.id, { push: false });
    } else {
      canGoBack = false;
      close();
    }
  });

  window.addEventListener("resize", () => {
    syncHeaderHeight();
    if (current && viewer.classList.contains("is-zoomed")) {
      setViewBox(provinceViewBox(provinces[current], viewer.getBoundingClientRect()));
    }
  });

  // ---------- init ----------
  syncHeaderHeight();
  if (current && provinces[current]) {
    // Deep link: viewer + iframe are server-rendered; just sync state.
    history.replaceState({ kaart: current, fromHome: false }, "");
    markSelected(current);
    setViewBox(provinceViewBox(provinces[current], viewer.getBoundingClientRect()));
  } else {
    current = null;
    history.replaceState({ kaart: null }, "");
  }
})();
