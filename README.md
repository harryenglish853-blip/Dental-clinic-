# Dental Clinic Website

A fast, accessible, mobile-first website for a modern dental practice. It's plain HTML, CSS and JavaScript, built by a small Node script with no dependencies.

**Clinic facts are never invented.** Every business detail (name, phone, address, hours, dentist bio, reviews, ratings, insurance, technology, photos) comes from `clinic.config.json`. Until a value is filled in, the site shows a clearly marked placeholder such as `[Phone number]`, and the build prints a warning for it.

## Quick start

```bash
npm run dev          # build + preview at http://localhost:8080
npm run build        # build to dist/
npm run build:strict # fail the build while any clinic info is still unverified
```

Requires Node 18 or newer. There is nothing to install.

## Launch checklist

1. **Fill in `clinic.config.json`** with verified information: `siteUrl`, `name`, `address`, `phone`, `phoneE164` (e.g. `+15550100000`), `email`, `hours` and `social`.
   - Enter hours in 24-hour format (`"08:00"`) so they also appear in structured data. Use `"open": "Closed"` for days the clinic is closed.
2. **Photography.** Put images in `src/assets/img/` (AVIF or WebP preferred, about 2000px on the long edge for the hero and about 1200px for everything else). Then set the paths under `photos`. Until then, each slot shows a placeholder that describes the shot needed.
3. **Services.** Edit `services` so that only treatments the clinic actually offers remain.
4. **Technology.** Remove anything the clinic doesn't own. Set `"verified": true` on the rest to remove the "Pending verification" badge.
5. **Dentist and team** (`dentist`, `team`). Use real, verified credentials only.
6. **Reviews** (`reviews`, `rating`, `reviewsUrl`). Use authentic reviews shared with permission only. Star ratings and the "Read more reviews" button appear only once these are filled in.
7. **Before & after** (`beforeAfter: [{ "before": "assets/img/…", "after": "…", "beforeAlt": "…", "afterAlt": "…" }]`). Use genuine patient results with written consent only.
8. **Payment and FAQ answers** (`payment`, `faq`).
9. **Stats** (`stats: [{ "value": "…", "label": "…" }]`). These are hidden unless provided.
10. **Legal pages.** Have `privacy.html` and `terms.html` reviewed, and link the clinic's HIPAA Notice of Privacy Practices.
11. Run `npm run build:strict`. It passes only when nothing is left unverified.

## Appointment form

The form validates every field and has error, loading and success states. For spam protection it uses a hidden honeypot field and records how long the visitor spent on the form (`_elapsedSeconds`).

It never tells the visitor an appointment is confirmed. After a successful submission it says: *"Thank you. Your appointment request has been received. Our team will contact you to confirm availability."*

- **Netlify (default).** Deploy to Netlify and submissions appear under **Forms → appointment**. Set up email notifications there.
- **Any other backend.** Set `"form": { "provider": "endpoint", "endpoint": "https://…" }`. The form sends JSON and treats any 2xx response as success.

**Health privacy.** The form asks visitors not to include medical history or insurance numbers, and "Reason for visit" is a general category. If the clinic must comply with HIPAA, send submissions to a HIPAA-eligible form service or backend that will sign a Business Associate Agreement. Netlify Forms and most general-purpose form services are not HIPAA-compliant by default.

When you preview locally, submitting the form shows the error state on purpose. Submissions only work once the site is deployed.

## Project structure

```
clinic.config.json     all clinic facts (edit this)
build.mjs              template rendering, structured data, sitemap, robots.txt
netlify.toml           build settings + security headers (CSP, HSTS…)
src/index.html         home page (all main sections)
src/team.html          full team page
src/privacy.html, terms.html, accessibility.html, 404.html
src/partials/          shared head, header, footer, mobile CTA bar
src/assets/css/main.css
src/assets/js/main.js  nav, reveal/parallax motion, dialogs, accordion,
                       before/after slider, reviews carousel, form
```

## What's built in

- **SEO:** a unique title and description for each page, a canonical URL, Open Graph image, `Dentist` JSON-LD (only verified fields, including the service catalog), `sitemap.xml` and `robots.txt`.
- **Accessibility (WCAG 2.2 AA target):**
  - semantic landmarks, a skip link and a correct heading order
  - visible focus styles, a keyboard-operable menu (with focus trap), dialogs, accordion, slider and carousel
  - labelled form fields with ARIA error messages, AA-contrast colors, and touch targets of 44px or more
  - `prefers-reduced-motion` support
- **Performance:**
  - one CSS file and one deferred JS file (together about 90 KB uncompressed, much smaller gzipped), no framework
  - fonts load with `display=swap`, and Google Maps loads only when the visitor asks for it
  - placeholder art is pure CSS, and real images lazy-load
- **Responsive:** tested at 320, 375, 390, 430, 768, 1024, 1440 and 1920px with no horizontal overflow. On phones, a sticky Call | Book bar appears after the hero and hides while the form is on screen.
