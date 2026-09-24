/* Dental clinic — interactions. No dependencies. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isHome = document.body.classList.contains("page-home");
  window.__siteReady = true;

  /* ------------------------------------------------------------ header */
  const header = $("[data-header]");
  const onScrollHeader = () => header && header.classList.toggle("is-scrolled", window.scrollY > 24);
  onScrollHeader();
  window.addEventListener("scroll", onScrollHeader, { passive: true });

  /* ------------------------------------------------------- mobile menu */
  const menu = $("[data-menu]");
  const toggle = $("[data-menu-toggle]");
  let menuOpen = false;
  let menuTimer;

  function setMenu(open) {
    if (!menu || !toggle || open === menuOpen) return;
    menuOpen = open;
    clearTimeout(menuTimer);
    toggle.setAttribute("aria-expanded", String(open));
    $(".visually-hidden", toggle).textContent = open ? "Close menu" : "Open menu";
    document.body.classList.toggle("menu-open", open);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("is-open")));
      setTimeout(() => $("a", menu)?.focus(), 60);
    } else {
      menu.classList.remove("is-open");
      menuTimer = setTimeout(() => (menu.hidden = true), reduceMotion.matches ? 0 : 450);
    }
    updateMobileBar();
  }

  toggle?.addEventListener("click", () => setMenu(!menuOpen));
  menu?.addEventListener("click", (e) => {
    if (e.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (!menuOpen) return;
    if (e.key === "Escape") {
      setMenu(false);
      toggle.focus();
    } else if (e.key === "Tab") {
      const items = [toggle, ...$$("a, button", menu)];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  window.matchMedia("(min-width: 1200px)").addEventListener("change", (e) => e.matches && setMenu(false));

  /* ---------------------------------------------------- active nav link */
  if (isHome && "IntersectionObserver" in window) {
    const links = $$(".nav__link");
    const byId = new Map(links.map((l) => [l.hash.slice(1), l]));
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((l) => l.removeAttribute("aria-current"));
          byId.get(entry.target.id)?.setAttribute("aria-current", "true");
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    byId.forEach((_, id) => {
      const el = document.getElementById(id);
      if (el) spy.observe(el);
    });
  }

  /* ------------------------------------------------------------ reveal */
  const revealEls = $$("[data-reveal]");
  if ("IntersectionObserver" in window && !reduceMotion.matches) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------------------------------------------------------- parallax */
  const parallaxEls = $$("[data-parallax]");
  const parallaxOK = () => !reduceMotion.matches && window.innerWidth >= 768;
  let ticking = false;
  function parallax() {
    ticking = false;
    const vh = window.innerHeight;
    const enabled = parallaxOK();
    parallaxEls.forEach((el) => {
      if (!enabled) {
        el.style.transform = "";
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      const factor = parseFloat(el.dataset.parallax) || 0.05;
      const delta = (r.top + r.height / 2 - vh / 2) * -factor;
      el.style.transform = `translate3d(0, ${delta.toFixed(1)}px, 0)`;
    });
  }
  const requestParallax = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(parallax);
    }
  };
  if (parallaxEls.length) {
    window.addEventListener("scroll", requestParallax, { passive: true });
    window.addEventListener("resize", requestParallax);
    parallax();
  }

  /* ----------------------------------------------------------- dialogs */
  let lastTrigger = null;

  function openDialog(id, trigger) {
    const dialog = document.getElementById(id);
    if (!dialog || typeof dialog.showModal !== "function") {
      // No dialog (service removed from config): fall back to the services section.
      document.getElementById("services")?.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth" });
      return;
    }
    lastTrigger = trigger || document.activeElement;
    if (menuOpen) setMenu(false);
    dialog.showModal();
    $(".dialog__close", dialog)?.focus();
  }

  $$("dialog.dialog").forEach((dialog) => {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
      const closer = e.target.closest("[data-dialog-close]");
      if (closer) {
        dialog.close();
        if (closer.dataset.reason) setReason(closer.dataset.reason);
      }
    });
    dialog.addEventListener("close", () => {
      if (lastTrigger && document.contains(lastTrigger) && !dialog.dataset.skipFocus) lastTrigger.focus({ preventScroll: true });
      delete dialog.dataset.skipFocus;
      if (location.hash === `#${dialog.id}`) history.replaceState(null, "", location.pathname + location.search);
    });
  });

  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-dialog-open]");
    if (opener) {
      e.preventDefault();
      openDialog(opener.dataset.dialogOpen, opener);
      return;
    }
    const link = e.target.closest('a[href*="#svc-"]');
    if (link && isHome && link.pathname === location.pathname) {
      e.preventDefault();
      openDialog(link.hash.slice(1), link);
    }
  });

  // "Request a consultation" inside a dialog should land on the form, not bounce focus back.
  $$("dialog [data-reason]").forEach((a) => a.addEventListener("click", () => (a.closest("dialog").dataset.skipFocus = "1")));

  /* --------------------------------------------- reason pre-selection */
  const reasonSelect = $("#f-reason");
  function setReason(value) {
    if (!reasonSelect) return;
    const match = Array.from(reasonSelect.options).find((o) => o.value === value);
    if (match) {
      reasonSelect.value = value;
      reasonSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  $$("[data-reason]").forEach((el) => {
    if (!el.closest("dialog")) el.addEventListener("click", () => setReason(el.dataset.reason));
  });

  /* --------------------------------------------------------- accordion */
  function setAccordion(item, open) {
    const btn = $(".acc-item__btn", item);
    item.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
  }
  $$("[data-accordion] .acc-item").forEach((item) => {
    $(".acc-item__btn", item).addEventListener("click", () => setAccordion(item, !item.classList.contains("is-open")));
  });
  function openFromHash(hash) {
    if (!hash || hash.length < 2) return;
    let target;
    try {
      target = document.querySelector(hash);
    } catch {
      return;
    }
    if (!target) return;
    if (target.matches(".acc-item")) setAccordion(target, true);
    if (target.matches("dialog.dialog")) {
      document.getElementById("services")?.scrollIntoView();
      openDialog(target.id);
    }
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href*="#faq-"]');
    if (a && a.pathname === location.pathname) openFromHash(a.hash);
  });
  window.addEventListener("hashchange", () => openFromHash(location.hash));
  if (location.hash) openFromHash(location.hash);

  /* ------------------------------------------------ before / after slider */
  $$("[data-ba]").forEach((ba) => {
    const stage = $(".ba__stage", ba);
    const range = $("[data-ba-range]", ba);
    const set = (pct) => {
      const v = Math.max(0, Math.min(100, pct));
      stage.style.setProperty("--pos", `${v}%`);
      range.value = String(Math.round(v));
      range.setAttribute("aria-valuetext", `${Math.round(v)}% before, ${100 - Math.round(v)}% after`);
    };
    range.style.pointerEvents = "none";
    range.addEventListener("input", () => set(Number(range.value)));
    let dragging = false;
    const fromEvent = (e) => {
      const r = stage.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    };
    stage.addEventListener("pointerdown", (e) => {
      dragging = true;
      stage.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    stage.addEventListener("pointermove", (e) => dragging && fromEvent(e));
    const stop = () => (dragging = false);
    stage.addEventListener("pointerup", stop);
    stage.addEventListener("pointercancel", stop);
    set(50);
  });

  /* ---------------------------------------------------------- carousel */
  $$("[data-carousel]").forEach((carousel) => {
    const viewport = $(".carousel__viewport", carousel);
    const track = $("[data-carousel-track]", carousel);
    const items = Array.from(track.children);
    const dotsWrap = $("[data-carousel-dots]", carousel);
    const status = $("[data-carousel-status]", carousel);
    if (!items.length) return;
    let index = 0;

    items.forEach((item, i) => {
      item.setAttribute("role", "group");
      item.setAttribute("aria-roledescription", "slide");
      item.setAttribute("aria-label", `${i + 1} of ${items.length}`);
    });

    const dots = items.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "carousel__dot";
      b.setAttribute("aria-label", `Show review ${i + 1} of ${items.length}`);
      b.addEventListener("click", () => go(i));
      dotsWrap.appendChild(b);
      return b;
    });

    function layout() {
      const item = items[index];
      const offset = (viewport.clientWidth - item.offsetWidth) / 2 - item.offsetLeft;
      track.style.transform = `translate3d(${offset}px, 0, 0)`;
    }

    function go(i, announce = true) {
      index = (i + items.length) % items.length;
      items.forEach((it, n) => {
        it.classList.toggle("is-active", n === index);
        it.setAttribute("aria-hidden", String(n !== index));
      });
      dots.forEach((d, n) => (n === index ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
      layout();
      if (announce && status) status.textContent = `Review ${index + 1} of ${items.length}`;
    }

    $("[data-carousel-prev]", carousel).addEventListener("click", () => go(index - 1));
    $("[data-carousel-next]", carousel).addEventListener("click", () => go(index + 1));
    carousel.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    });
    items.forEach((it, n) => it.addEventListener("click", () => n !== index && go(n)));

    let startX = null;
    viewport.addEventListener("pointerdown", (e) => (startX = e.clientX));
    viewport.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      startX = null;
    });

    window.addEventListener("resize", layout);
    window.addEventListener("load", layout);
    go(0, false);
  });

  /* --------------------------------------------------------------- map */
  $$("[data-map]").forEach((map) => {
    $("[data-map-load]", map)?.addEventListener("click", () => {
      const iframe = document.createElement("iframe");
      iframe.src = map.dataset.src;
      iframe.title = "Map showing the clinic location";
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      iframe.allowFullscreen = true;
      map.replaceChildren(iframe);
      iframe.focus();
    });
  });

  /* -------------------------------------------------------- mobile bar */
  const bar = $("[data-mobile-bar]");
  const hero = $(".hero, .page-hero");
  const appointment = $("#appointment");
  let appointmentVisible = false;
  function updateMobileBar() {
    if (!bar) return;
    const threshold = hero ? hero.offsetHeight * 0.6 : 200;
    bar.classList.toggle("is-visible", window.scrollY > threshold && !appointmentVisible && !menuOpen);
  }
  if (bar) {
    window.addEventListener("scroll", updateMobileBar, { passive: true });
    if (appointment && "IntersectionObserver" in window) {
      new IntersectionObserver(
        ([entry]) => {
          appointmentVisible = entry.isIntersecting;
          updateMobileBar();
        },
        { rootMargin: "0px 0px -20% 0px" }
      ).observe(appointment);
    }
    updateMobileBar();
  }

  /* ----------------------------------------------------- appointment form */
  const form = $("[data-appt-form]");
  if (form) initForm(form);

  function initForm(form) {
    const submit = $("[data-submit]", form);
    const errorBox = $("[data-form-error]", form);
    const success = $("[data-form-success]");
    const started = $("[data-started]", form);
    const dateInput = $("[data-min-today]", form);
    const phoneLink = $(".call-link")?.getAttribute("href") || "/#contact";
    let attempted = false;

    const pad = (n) => String(n).padStart(2, "0");
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (dateInput) dateInput.min = today;
    if (started) started.value = String(Date.now());

    const rules = {
      firstName: (v) => (v.trim() ? "" : "Please enter your first name."),
      lastName: (v) => (v.trim() ? "" : "Please enter your last name."),
      phone: (v) =>
        !v.trim() ? "Please enter your phone number." : v.replace(/\D/g, "").length < 7 ? "Please enter a valid phone number." : "",
      email: (v) =>
        !v.trim()
          ? "Please enter your email address."
          : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
            ? ""
            : "Please enter a valid email address, like name@example.com.",
      patientType: () => (form.querySelector('[name="patientType"]:checked') ? "" : "Please let us know if you're a new or existing patient."),
      preferredDate: (v) => (!v ? "Please choose a preferred date." : v < today ? "Please choose today or a future date." : ""),
      preferredTime: (v) => (v ? "" : "Please choose a preferred time."),
      reason: (v) => (v ? "" : "Please select a reason for your visit."),
      consent: () => (form.elements.consent.checked ? "" : "Please agree to be contacted so we can confirm your appointment."),
    };

    function fieldFor(name) {
      const el = form.elements[name];
      const node = el instanceof RadioNodeList ? el[0] : el;
      return { node, field: node.closest(".field") };
    }

    function validate(name) {
      const el = form.elements[name];
      const value = el instanceof RadioNodeList ? el.value : el.value;
      const msg = rules[name](value);
      const { field } = fieldFor(name);
      const err = field && $(".field__error", field);
      field?.classList.toggle("is-invalid", Boolean(msg));
      const inputs = el instanceof RadioNodeList ? Array.from(el) : [el];
      inputs.forEach((i) => (msg ? i.setAttribute("aria-invalid", "true") : i.removeAttribute("aria-invalid")));
      if (err) err.textContent = msg;
      return !msg;
    }

    Object.keys(rules).forEach((name) => {
      const el = form.elements[name];
      const inputs = el instanceof RadioNodeList ? Array.from(el) : [el];
      inputs.forEach((i) => {
        i.addEventListener("blur", () => attempted && validate(name));
        i.addEventListener("change", () => (attempted || i.getAttribute("aria-invalid")) && validate(name));
        i.addEventListener("input", () => i.getAttribute("aria-invalid") && validate(name));
      });
    });

    function showError(html) {
      errorBox.innerHTML = html;
      errorBox.hidden = false;
    }

    function setLoading(on) {
      submit.disabled = on;
      submit.classList.toggle("is-loading", on);
      submit.setAttribute("aria-busy", String(on));
      $(".btn__label", submit).textContent = on ? "Sending request…" : "Request Appointment";
    }

    function showSuccess() {
      form.hidden = true;
      success.hidden = false;
      success.focus();
      success.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "center" });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      attempted = true;
      errorBox.hidden = true;

      const invalid = Object.keys(rules).filter((name) => !validate(name));
      if (invalid.length) {
        showError(`Please check the ${invalid.length === 1 ? "highlighted field" : `${invalid.length} highlighted fields`} below.`);
        fieldFor(invalid[0]).node.focus();
        return;
      }

      // Honeypot: bots fill hidden fields. Quietly accept without sending.
      if (form.elements.company.value) {
        showSuccess();
        return;
      }

      const data = new FormData(form);
      data.set("_elapsedSeconds", String(Math.round((Date.now() - Number(started?.value || Date.now())) / 1000)));
      data.delete("_started");

      setLoading(true);
      try {
        const provider = form.dataset.provider;
        const res =
          provider === "endpoint"
            ? await fetch(form.action, {
                method: "POST",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                body: JSON.stringify(Object.fromEntries(data.entries())),
              })
            : await fetch("/", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams(data).toString(),
              });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showSuccess();
      } catch (err) {
        console.warn("Appointment request failed:", err);
        showError(
          `We couldn't send your request just now. Please try again in a moment, or <a href="${phoneLink}">call our office</a> and we'll be happy to help.`
        );
        errorBox.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "center" });
      } finally {
        setLoading(false);
      }
    });
  }
})();
