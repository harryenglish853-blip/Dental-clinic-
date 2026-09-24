#!/usr/bin/env node
/**
 * Static site build.
 *
 * Reads clinic.config.json, renders every src/*.html page through a tiny
 * template engine and writes the result (plus assets, sitemap and robots.txt)
 * to dist/. Missing clinic facts are never invented: they render as clearly
 * marked placeholders and are listed as warnings. `--strict` turns those
 * warnings into a failed build, for production deploys.
 *
 * Template syntax:
 *   {{> partial}}                       include src/partials/partial.html
 *   {{key.path}}                        HTML-escaped value
 *   {{{key.path}}}                      raw value (pre-rendered HTML)
 *   <!--if:key-->…<!--else:key-->…<!--/if:key-->   conditional on truthiness
 *   <!--page {json}-->                  page front-matter (first line)
 */
import { readFile, writeFile, mkdir, readdir, cp, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "dist");
const STRICT = process.argv.includes("--strict");

const cfg = JSON.parse(await readFile(join(ROOT, "clinic.config.json"), "utf8"));
const warnings = new Set();

/* ------------------------------------------------------------------ utils */

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

/** Returns the verified value, or a bracketed placeholder (and records a warning). */
function need(value, label) {
  if (has(value)) return String(value).trim();
  warnings.add(label);
  return `[${label}]`;
}

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

const icon = (name, cls = "icon") =>
  `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="/assets/img/icons.svg#${name}"></use></svg>`;

/* ------------------------------------------------------------ clinic data */

const a = cfg.address || {};
const siteUrl = has(cfg.siteUrl) ? cfg.siteUrl.replace(/\/+$/, "") : "";
if (!siteUrl) warnings.add("Site URL (needed for canonical URLs, sitemap and Open Graph)");

const name = need(cfg.name, "Clinic Name");
const city = need(a.city, "City");
const state = need(a.state, "State");
const addressSet = has(a.street) && has(a.city);
const addressOneLine = [a.street, a.city, [a.state, a.postalCode].filter(has).join(" ")]
  .filter(has)
  .join(", ");
if (!addressSet) warnings.add("Street address");

const phoneSet = has(cfg.phone);
const phoneE164 = has(cfg.phoneE164) ? cfg.phoneE164 : String(cfg.phone || "").replace(/[^\d+]/g, "");
if (!phoneSet) warnings.add("Phone number");
const emailSet = has(cfg.email);
if (!emailSet) warnings.add("Email address");

const hours = (cfg.hours || []).filter((h) => has(h.days));
const hoursSet = hours.some((h) => has(h.open) || has(h.close));
if (!hoursSet) warnings.add("Office hours");

const directionsUrl = addressSet
  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${cfg.name || ""} ${addressOneLine}`.trim())}`
  : "";
const mapEmbedUrl = addressSet
  ? `https://www.google.com/maps?q=${encodeURIComponent(`${cfg.name || ""} ${addressOneLine}`.trim())}&output=embed`
  : "";

const rating = cfg.rating || {};
const ratingSet = has(rating.value) && has(rating.source);

const socials = Object.entries(cfg.social || {}).filter(([, url]) => has(url));
const socialLabels = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube" };
if (!socials.length) warnings.add("Social media profile URLs (links are hidden until added)");

const form = cfg.form || {};
const formEndpoint = form.provider === "endpoint" && has(form.endpoint) ? form.endpoint : "";
if (form.provider === "endpoint" && !formEndpoint) warnings.add("Form endpoint URL (form.provider is 'endpoint')");

/* ------------------------------------------------------------- fragments */

const PHOTO_SLOTS = {
  hero: { label: "Modern treatment room in natural daylight", alt: "Bright, modern dental treatment room", variant: "room" },
  about: { label: "Clinic reception & architecture", alt: "Calm, light-filled clinic reception area", variant: "lobby" },
  aboutDetail: { label: "Dentist in conversation with patient", alt: "Dentist talking with a patient before treatment", variant: "consult" },
  general: { label: "Preventive care", alt: "Patient during a routine dental check-up", variant: "consult" },
  cosmetic: { label: "Natural, confident smile", alt: "Patient smiling naturally after cosmetic treatment", variant: "smile" },
  restorative: { label: "Restorative treatment", alt: "Dentist planning restorative treatment", variant: "tech" },
  orthodontics: { label: "Orthodontic care", alt: "Patient during an orthodontic check-up", variant: "tech" },
  advanced: { label: "Advanced care", alt: "Modern dental equipment in a treatment room", variant: "room" },
  featured: { label: "Cosmetic dentistry", alt: "Close-up of a natural, healthy smile", variant: "smile" },
  technology: { label: "Digital dental technology", alt: "Close-up of modern dental imaging equipment", variant: "tech" },
  dentist: { label: "Professional portrait of your dentist", alt: "Portrait of the dentist", variant: "portrait" },
  finalCta: { label: "Clinic interior", alt: "", variant: "lobby" },
};

function photo(key, { eager = false } = {}) {
  const slot = PHOTO_SLOTS[key];
  const src = cfg.photos?.[key];
  const alt = key === "dentist" && has(cfg.dentist?.name) ? `Portrait of ${cfg.dentist.name}` : slot.alt;
  if (has(src)) {
    const attrs = eager ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"';
    return `<img class="media__img" src="/${esc(src.replace(/^\/+/, ""))}" alt="${esc(alt)}" ${attrs} decoding="async">`;
  }
  warnings.add(`Photography: ${slot.label}`);
  return `<div class="ph ph--${slot.variant}" role="img" aria-label="${esc(`Photo placeholder: ${slot.label}`)}">
      <span class="ph__tag">${icon("camera", "icon icon--sm")}<span>Photo · ${esc(slot.label)}</span></span>
    </div>`;
}

const serviceIds = new Set((cfg.services || []).map((s) => s.id));
const SERVICE_SLOTS = ["general", "cosmetic", "restorative", "orthodontics", "advanced"];
const photos = Object.fromEntries(
  Object.keys(PHOTO_SLOTS)
    .filter((k) => !SERVICE_SLOTS.includes(k) || serviceIds.has(k))
    .map((k) => [k, photo(k, { eager: k === "hero" })])
);

const services = cfg.services || [];

const servicesHtml = services
  .map(
    (s, i) => `
      <li class="svc" data-reveal style="--d:${i * 80}ms">
        <div class="svc__media media">${photos[s.id] || ""}</div>
        <div class="svc__body">
          <span class="svc__num">${String(i + 1).padStart(2, "0")}</span>
          <h3 class="svc__title">${esc(s.title)}</h3>
          <p class="svc__summary">${esc(s.summary)}</p>
          <ul class="svc__list">${s.items.map((it) => `<li>${esc(it.name)}</li>`).join("")}</ul>
          <button class="svc__more" type="button" data-dialog-open="svc-${esc(s.id)}" aria-haspopup="dialog">
            <span>Learn more<span class="visually-hidden"> about ${esc(s.title)}</span></span>
            <span class="svc__arrow">${icon("arrow-right")}</span>
          </button>
        </div>
      </li>`
  )
  .join("");

const serviceDialogsHtml = services
  .map(
    (s) => `
  <dialog class="dialog" id="svc-${esc(s.id)}" aria-labelledby="svc-${esc(s.id)}-title">
    <div class="dialog__inner">
      <button class="dialog__close" type="button" data-dialog-close aria-label="Close">${icon("close")}</button>
      <p class="eyebrow">Our services</p>
      <h2 class="dialog__title" id="svc-${esc(s.id)}-title">${esc(s.title)}</h2>
      <p class="dialog__lead">${esc(s.summary)}</p>
      <ul class="dialog__list">
        ${s.items
          .map(
            (it) => `<li><span class="dialog__check">${icon("check")}</span><div><strong>${esc(it.name)}</strong><p>${esc(it.text)}</p></div></li>`
          )
          .join("")}
      </ul>
      <p class="dialog__note">Every treatment begins with a conversation. Your dentist will explain your options, what to expect and any costs before you decide.</p>
      <div class="dialog__actions">
        <a class="btn btn--primary" href="#appointment" data-reason="${esc(s.title)}" data-dialog-close>Request a consultation</a>
        ${phoneSet ? `<a class="btn btn--ghost" href="tel:${esc(phoneE164)}">${icon("phone")}<span>Call ${esc(cfg.phone)}</span></a>` : ""}
      </div>
    </div>
  </dialog>`
  )
  .join("");

const reasonOptionsHtml = [
  "Check-up & cleaning",
  ...services.map((s) => s.title),
  "Dental pain / urgent problem",
  "Insurance or payment question",
  "Other",
]
  .filter((v, i, arr) => arr.indexOf(v) === i)
  .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
  .join("");

const footerServicesHtml = services
  .map((s) => `<li><a href="/#svc-${esc(s.id)}">${esc(s.title)}</a></li>`)
  .join("");

const statsHtml = (cfg.stats || [])
  .filter((s) => has(s.value) && has(s.label))
  .map((s) => `<div class="stat"><dt class="stat__label">${esc(s.label)}</dt><dd class="stat__value">${esc(s.value)}</dd></div>`)
  .join("");

const to12h = (t) => {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};
const hoursHtml = hours
  .map(
    (h) =>
      `<tr><th scope="row">${esc(h.days)}</th><td>${
        has(h.open) && has(h.close) ? `${esc(to12h(h.open))} – ${esc(to12h(h.close))}` : has(h.open) ? esc(h.open) : "[Verify hours]"
      }</td></tr>`
  )
  .join("");

const socialHtml = socials
  .map(
    ([k, url]) =>
      `<li><a class="social" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(socialLabels[k] || k)} (opens in a new tab)">${icon(k)}</a></li>`
  )
  .join("");

const techList = cfg.technology || [];
const techHtml = techList
  .map(
    (t, i) => `
      <li class="tech__item" data-reveal style="--d:${i * 90}ms">
        <span class="tech__num">${String(i + 1).padStart(2, "0")}</span>
        <div>
          <h3 class="tech__name">${esc(t.name)}${t.verified ? "" : ' <span class="badge badge--verify" title="Confirm the clinic offers this before launch">Pending verification</span>'}</h3>
          <p>${esc(t.text)}</p>
        </div>
      </li>`
  )
  .join("");
if (techList.some((t) => !t.verified)) warnings.add("Technology list (mark each item verified: true once confirmed, remove the rest)");

const d = cfg.dentist || {};
const dentist = {
  name: need(d.name, "Dentist name"),
  credentials: has(d.credentials) ? d.credentials : "[Credentials]",
  bio: need(d.bio, "Dentist biography"),
  education: has(d.education) ? d.education : "[Verified education]",
  memberships: has(d.memberships) ? d.memberships : "[Verified professional memberships]",
  interests: has(d.interests) ? d.interests : "[Special interests]",
  philosophy: has(d.philosophy) ? d.philosophy : "[Philosophy of care, in the dentist's own words]",
};

const team = (cfg.team || []).filter((m) => has(m.name));
const teamHtml = (team.length ? team : [{}, {}, {}])
  .map(
    (m) => `
      <li class="team-card" data-reveal>
        <div class="team-card__media media">${
          has(m.photo)
            ? `<img class="media__img" src="/${esc(m.photo)}" alt="Portrait of ${esc(m.name)}" loading="lazy" decoding="async">`
            : `<div class="ph ph--portrait" role="img" aria-label="Photo placeholder: team member portrait"><span class="ph__tag">${icon("camera", "icon icon--sm")}<span>Photo · Team portrait</span></span></div>`
        }</div>
        <h2 class="team-card__name">${esc(m.name || "[Team member name]")}</h2>
        <p class="team-card__role">${esc(m.role || "[Role & verified credentials]")}</p>
        <p class="team-card__bio">${esc(m.bio || "[Short biography — replace with verified information.]")}</p>
      </li>`
  )
  .join("");
if (!team.length) warnings.add("Team members");

const reviews = (cfg.reviews || []).filter((r) => has(r.text) && has(r.name));
if (!reviews.length) warnings.add("Patient reviews (authentic, with permission)");
const stars = (n) =>
  `<span class="stars" role="img" aria-label="${n} out of 5 stars">${icon("star").repeat(Math.max(0, Math.min(5, Math.round(n))))}</span>`;
const reviewsHtml = (reviews.length ? reviews : [1, 2, 3].map(() => null))
  .map((r, i) =>
    r
      ? `<li class="review" data-index="${i}">
          <figure>
            ${has(r.rating) ? stars(Number(r.rating)) : ""}
            <blockquote class="review__text"><p>${esc(r.text)}</p></blockquote>
            <figcaption class="review__meta"><strong>${esc(r.name)}</strong>${has(r.source) ? `<span>${esc(r.source)}</span>` : ""}</figcaption>
          </figure>
        </li>`
      : `<li class="review review--placeholder" data-index="${i}">
          <figure>
            <span class="review__quote">${icon("quote", "icon icon--lg")}</span>
            <blockquote class="review__text"><p>[Replace with an authentic patient review, shared with the patient's permission.]</p></blockquote>
            <figcaption class="review__meta"><strong>[Patient first name]</strong><span>[Review source]</span></figcaption>
          </figure>
        </li>`
  )
  .join("");

const ba = (cfg.beforeAfter || []).find((x) => has(x.before) && has(x.after));
if (!ba) warnings.add("Before & after photos (genuine, consented patient results only)");
const beforeAfterHtml = ba
  ? `<img class="ba__img" src="/${esc(ba.after)}" alt="${esc(ba.afterAlt || "After treatment")}" loading="lazy" decoding="async">
     <div class="ba__before"><img class="ba__img" src="/${esc(ba.before)}" alt="${esc(ba.beforeAlt || "Before treatment")}" loading="lazy" decoding="async"></div>`
  : `<div class="ba__layer ba__layer--after" role="img" aria-label="Placeholder: approved after-treatment photo"><span class="ph__tag">${icon("camera", "icon icon--sm")}<span>After · approved patient photo</span></span></div>
     <div class="ba__before"><div class="ba__layer ba__layer--before" role="img" aria-label="Placeholder: approved before-treatment photo"><span class="ph__tag">${icon("camera", "icon icon--sm")}<span>Before · approved patient photo</span></span></div></div>`;

const p = cfg.payment || {};
const paymentCards = [
  ["shield", "Insurance", p.insurance, "[List the insurance plans the clinic verifies it accepts.]"],
  ["card", "Payment methods", p.methods, "[List accepted payment methods.]"],
  ["calendar", "Financing options", p.financing, "[Describe verified financing partners, if any.]"],
  ["heart", "Membership plans", p.membership, "[Describe the in-house membership plan, or remove this card.]"],
]
  .map(
    ([ic, title, val, ph], i) => `
      <li class="pay-card" data-reveal style="--d:${i * 80}ms">
        <span class="icon-tile">${icon(ic)}</span>
        <h3>${title}</h3>
        <p${has(val) ? "" : ' class="is-placeholder"'}>${esc(has(val) ? val : ph)}</p>
      </li>`
  )
  .join("");
if (!has(p.insurance)) warnings.add("Insurance & payment details");

const f = cfg.faq || {};
const faqAnswer = (v, ph) => (has(v) ? `<p>${esc(v)}</p>` : `<p class="is-placeholder">${esc(ph)}</p>`);
const faqs = {
  newPatients: faqAnswer(f.newPatients, "[Confirm whether the clinic is currently accepting new patients.]"),
  insurance: faqAnswer(f.insurance, "[List the insurance plans the clinic accepts. Verify before publishing.]"),
  emergency: faqAnswer(f.emergency, "[Describe how the clinic handles emergency and same-day appointments.]"),
  financing: faqAnswer(f.financing, "[Describe verified financing options, or state that none are offered.]"),
};

/* ---------------------------------------------------------- structured data */

function jsonLd() {
  if (!has(cfg.name)) return "<!-- Structured data is emitted once the clinic name is verified in clinic.config.json -->";
  const ld = {
    "@context": "https://schema.org",
    "@type": "Dentist",
    name: cfg.name,
    description: cfg.description,
    ...(siteUrl && { url: `${siteUrl}/`, "@id": `${siteUrl}/#dentist` }),
    ...(siteUrl && { image: `${siteUrl}/assets/img/og-image.png` }),
    ...(phoneSet && { telephone: phoneE164 }),
    ...(emailSet && { email: cfg.email }),
    ...(addressSet && {
      address: {
        "@type": "PostalAddress",
        streetAddress: a.street,
        addressLocality: a.city,
        ...(has(a.state) && { addressRegion: a.state }),
        ...(has(a.postalCode) && { postalCode: a.postalCode }),
        ...(has(a.country) && { addressCountry: a.country }),
      },
    }),
    ...(has(cfg.geo?.latitude) && {
      geo: { "@type": "GeoCoordinates", latitude: cfg.geo.latitude, longitude: cfg.geo.longitude },
    }),
    ...(hoursSet && {
      openingHoursSpecification: hours
        .filter((h) => has(h.open) && has(h.close) && /^\d{2}:\d{2}$/.test(h.open))
        .map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: h.days, opens: h.open, closes: h.close })),
    }),
    ...(cfg.languages?.length && { knowsLanguage: cfg.languages }),
    ...(socials.length && { sameAs: socials.map(([, u]) => u) }),
    ...(ratingSet &&
      has(rating.count) && {
        aggregateRating: { "@type": "AggregateRating", ratingValue: rating.value, reviewCount: rating.count },
      }),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Dental services",
      itemListElement: services.map((s) => ({
        "@type": "OfferCatalog",
        name: s.title,
        itemListElement: s.items.map((it) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: it.name, description: it.text, serviceType: s.title },
        })),
      })),
    },
  };
  return `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
}

/* ----------------------------------------------------------------- context */

const formAttrs =
  formEndpoint
    ? `action="${esc(formEndpoint)}" method="POST" data-provider="endpoint"`
    : `action="/" method="POST" data-provider="netlify" data-netlify="true" netlify-honeypot="company"`;

const ctx = {
  name,
  nameSet: has(cfg.name),
  shortName: has(cfg.shortName) ? cfg.shortName : name,
  description: cfg.description,
  city,
  state,
  cityState: has(a.city) ? [a.city, a.state].filter(has).join(", ") : "[City, State]",
  year: new Date().getFullYear(),
  siteUrl,
  phone: phoneSet ? cfg.phone : "[Phone number]",
  phoneSet,
  phoneHref: phoneSet ? `tel:${phoneE164}` : "/#contact",
  email: emailSet ? cfg.email : "[Email address]",
  emailSet,
  emailHref: emailSet ? `mailto:${cfg.email}` : "/#appointment",
  addressSet,
  addressStreet: has(a.street) ? a.street : "[Street address]",
  addressLocality: addressSet ? [a.city, [a.state, a.postalCode].filter(has).join(" ")].filter(has).join(", ") : "[City, State ZIP]",
  directionsUrl,
  mapEmbedUrl,
  hoursHtml,
  hoursSet,
  socialHtml,
  socialSet: socials.length > 0,
  spanishSet: (cfg.languages || []).some((l) => /spanish|español/i.test(l)),
  ratingSet,
  ratingValue: rating.value,
  ratingSource: rating.source,
  ratingUrl: has(rating.url) ? rating.url : cfg.reviewsUrl,
  ratingStars: ratingSet ? stars(Number(rating.value)) : "",
  reviewsUrl: cfg.reviewsUrl,
  reviewsSet: has(cfg.reviewsUrl),
  bookingUrl: cfg.bookingUrl,
  bookingSet: has(cfg.bookingUrl),
  formAttrs,
  photo: photos,
  servicesHtml,
  serviceDialogsHtml,
  reasonOptionsHtml,
  footerServicesHtml,
  statsHtml,
  statsSet: statsHtml !== "",
  techHtml,
  dentist,
  teamHtml,
  reviewsHtml,
  reviewCount: reviews.length || 3,
  reviewsReal: reviews.length > 0,
  beforeAfterHtml,
  beforeAfterSet: Boolean(ba),
  paymentCards,
  faq: faqs,
  jsonLd: jsonLd(),
};

/* ------------------------------------------------------------------ render */

async function loadPartials() {
  const dir = join(SRC, "partials");
  const out = {};
  for (const file of await readdir(dir)) out[file.replace(/\.html$/, "")] = await readFile(join(dir, file), "utf8");
  return out;
}

function render(tpl, data, partials) {
  let s = tpl;
  for (let i = 0; i < 5 && s.includes("{{>"); i++) {
    s = s.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, n) => {
      if (!(n in partials)) throw new Error(`Unknown partial: ${n}`);
      return partials[n];
    });
  }
  // Conditionals (innermost first, supports nesting of different keys)
  const cond = /<!--if:(!?)([\w.]+)-->([\s\S]*?)(?:<!--else:\2-->([\s\S]*?))?<!--\/if:\2-->/;
  while (cond.test(s)) {
    s = s.replace(cond, (_, neg, key, yes, no = "") => {
      const v = Boolean(get(data, key));
      return (neg ? !v : v) ? yes : no;
    });
  }
  s = s.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => {
    const v = get(data, k);
    if (v === undefined) throw new Error(`Unknown key: ${k}`);
    return String(v);
  });
  s = s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const v = get(data, k);
    if (v === undefined) throw new Error(`Unknown key: ${k}`);
    return esc(v);
  });
  return s;
}

async function build() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await cp(join(SRC, "assets"), join(OUT, "assets"), { recursive: true });

  const partials = await loadPartials();
  const pages = (await readdir(SRC)).filter((f) => f.endsWith(".html"));
  const sitemap = [];

  for (const file of pages) {
    let tpl = await readFile(join(SRC, file), "utf8");
    const fm = tpl.match(/^<!--page\s+(\{[\s\S]*?\})\s*-->\s*/);
    const page = fm ? JSON.parse(fm[1]) : {};
    if (fm) tpl = tpl.slice(fm[0].length);
    const path = page.path || `/${file}`;
    const pageCtx = {
      ...ctx,
      page: {
        ...page,
        title: render(page.title || name, ctx, partials),
        description: render(page.description || cfg.description, ctx, partials),
        canonical: siteUrl ? `${siteUrl}${path}` : "",
        ogImage: siteUrl ? `${siteUrl}/assets/img/og-image.png` : "",
        robots: page.noindex ? "noindex, follow" : "index, follow",
        isHome: path === "/",
        navPrefix: path === "/" ? "" : "/",
      },
    };
    const html = render(tpl, pageCtx, partials);
    await writeFile(join(OUT, file), html);
    if (!page.noindex) sitemap.push({ path, priority: page.priority || "0.5" });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (siteUrl) {
    await writeFile(
      join(OUT, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap
        .sort((x, y) => y.priority - x.priority)
        .map((u) => `  <url><loc>${esc(siteUrl + u.path)}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`)
        .join("\n")}\n</urlset>\n`
    );
  }
  await writeFile(
    join(OUT, "robots.txt"),
    `User-agent: *\nAllow: /\n${siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml\n` : ""}`
  );

  const list = [...warnings];
  console.log(`Built ${pages.length} pages → dist/`);
  if (list.length) {
    console.warn(`\n⚠  ${list.length} item(s) still need VERIFIED clinic information (shown as placeholders on the site):`);
    for (const w of list) console.warn(`   • ${w}`);
    console.warn("\n   Edit clinic.config.json, then rebuild. Use `npm run build:strict` to block deploys until complete.\n");
    if (STRICT) process.exit(1);
  }
}

await build();
