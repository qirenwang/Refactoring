# MicroPlastics Data Entry System — Developer Manual

| | |
|---|---|
| **Document version** | 1.1.0 |
| **Date** | 2026-08-18 |
| **Supersedes** | 1.0.0 (last updated 2026-02-13) |
| **Application** | `mp-data-entry-nodejs` 1.0.0 (package.json), repository `qirenwang/Refactoring`, branch `main` |
| **Verified against** | commit `2092d2a` (2026-08-18) and the production schema dump `sweetl23_partner_demo_20260818_105317.sql` |

This manual was rewritten from a full audit of the current code base and the live database schema. Where the previous edition described things that no longer exist (package tables, `layout.ejs`, the old form steps) they have been removed; where legacy artefacts are still present in the repository they are listed explicitly in §12 so nobody has to rediscover them.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Environment Setup](#3-environment-setup)
4. [Core Modules](#4-core-modules)
5. [Database Schema](#5-database-schema)
6. [Migrations](#6-migrations)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Testing](#8-testing)
9. [Deployment](#9-deployment)
10. [Data Operations](#10-data-operations)
11. [Development Guidelines](#11-development-guidelines)
12. [Known Issues and Technical Debt](#12-known-issues-and-technical-debt)
13. [Useful Commands](#13-useful-commands)
14. [Contact, Version History and Document Conventions](#14-contact-version-history-and-document-conventions)

---

## 1. Project Overview

**Project name**: MicroPlastics Data Entry System (`mp-data-entry-nodejs`)
**Owner**: Wayne State University (SweetLab)
**Purpose**: a web application through which researchers enter, edit and review microplastics / plastic-debris sampling data (locations, sampling events, sample details, particle characterisation, publications). It was refactored from a PHP application to Node.js; a few PHP-era compatibility endpoints remain.

**Production**: `https://entry.sweet-lab.org` (Apache reverse proxy → Docker container on the SweetLab VPS, port 3000). See §9.

### Tech stack

| Component | Technology | Version (package.json) | Notes |
|---|---|---|---|
| Runtime | Node.js | LTS (container `node:lts-slim`; dev machines run 22.x) | |
| Web framework | Express | ^4.18.2 | |
| Templates | EJS | ^3.1.10 | every page is a standalone EJS file (see §7) |
| Database driver | mysql2 (promise API) | ^3.6.0 | production DB is MariaDB 10.6 |
| Sessions | express-session | ^1.17.3 | in-memory store (no session table) |
| Passwords | bcryptjs | ^2.4.3 | 12 rounds |
| CAPTCHA | @napi-rs/canvas | ^0.1.71 | server-rendered PNG |
| E-mail | Nodemailer | ^7.0.3 | password-reset / contact form |
| Security headers | Helmet | ^7.0.0 | CSP only in production |
| CORS | cors | ^2.8.5 | |
| Validation | express-validator | ^7.0.1 | |
| Uploads | Multer | ^1.4.5-lts.1 | 10 MB limit; parsing not implemented |
| Logging | Morgan | ^1.10.0 | `combined` format |
| Config | dotenv | ^16.3.1 | `.env` in project root |
| Dev reload | nodemon | ^3.0.1 (dev) | |
| Declared but unused | `express-handlebars` ^7.1.2, `@stagewise/toolbar-next` ^0.4.1 | | not `require`d anywhere |

Tests use Node's built-in `node --test` runner (no Jest/Mocha).

---

## 2. Architecture

### 2.1 Request flow

```
Browser
   │
   ▼
Apache (HTTPS, entry.sweet-lab.org)  ──►  Docker container "myapp-container" :3000
                                               │  app.js
                                               ├─ helmet → cors → morgan → static(public/) → json/urlencoded → cookie-parser → session → checkSessionTimeout
                                               ├─ /auth/*   routes/auth.js      (login, signup, captcha, password reset)
                                               ├─ /api/*    routes/api.js       (references, locations, publications, save/edit samples, my-samples, contact, geocode)
                                               ├─ /*        routes/pages.js     (EJS pages)
                                               ├─ /*        routes/api.js again (legacy PHP-compat fallback, e.g. /php/get_map_data.php)
                                               ├─ services/ (emailService, accountRecoveryOutbox worker)
                                               └─ mysql2 pool ──► MariaDB on the VPS host (host.docker.internal)
```

Two consequences of the double mount of `routes/api.js` (`app.js:115` and `app.js:123`): every API path also answers without the `/api` prefix (e.g. `GET /references`), and page routes must be registered before the fallback so `/my-samples` renders EJS instead of hitting the API.

### 2.2 Directory structure (current, annotated)

```
Refactoring/
├── app.js                          # Entry point: middleware, route mounting, startup, outbox worker
├── package.json                    # Scripts + dependencies (see §13)
├── Dockerfile / docker-compose.yml # Reference container build (production was started by hand, see §9)
├── database_init.sql               # STALE bootstrap dump (Jun 2025) – not the schema of record (§6.3)
├── Microplastic_sampling_datasheet_v3.xlsx  # PI's datasheet the schema/reference order is modelled on
│
├── config/
│   ├── database.js                 # mysql2 pool (host/user/pass/name from .env; no DB_PORT support)
│   └── session.js                  # express-session config (MemoryStore)
├── middleware/
│   └── auth.js                     # requireAuth, redirectIfLoggedIn, checkSessionTimeout
├── routes/
│   ├── auth.js                     # /auth/* – captcha, login, signup, logout, password reset, account recovery
│   ├── pages.js                    # EJS page routes
│   ├── api.js                      # /api/* – ~4,600 lines, all data endpoints
│   └── api copy.js                 # DEAD 32 KB stale copy, never required (§12)
├── services/
│   ├── emailService.js             # Nodemailer transport + 4 mail functions
│   └── accountRecoveryOutbox.js    # Durable, lease-based e-mail worker for password-reset mail
├── utils/
│   ├── account-recovery.js         # token hashing, AES-GCM payloads, password policy, base URL
│   ├── percentage.js               # decimal-safe percentage helpers (tolerance 0.1)
│   └── sampling-date.js            # year/month/day partial-date normalisation
├── scripts/                        # CLI tools (§10, §13): backup, migrate, purge, init (stale), check, create-sample-table (dead)
├── db/
│   ├── 2026MMDD_*.sql              # 16 idempotent migrations (§6)
│   ├── sweetl23_partner_demo_202601181155.sql  # Jan-2026 seed dump (pre-refactor baseline)
│   └── backups/                    # scripts/backup-database.js output – git-ignored
├── views/                          # EJS pages (standalone HTML each), partials/, data_forms/  (§7)
├── public/
│   ├── css/  js/  assets/          # static files served by express.static (§7)
│   └── test.html, test-cors.html, test-stagewise.html   # ad-hoc dev pages, publicly served (§12)
├── test/                           # 16 node --test files (§8)
├── Testing/                        # manual QA artefacts: bug report, Excel verification toolkit (python)
├── tasks/                          # prompt/spec artefacts only, no runtime code (git-ignored)
├── docs/                           # this manual (EN + ZH), quick starts, env template
├── uploads/  logs/  controllers/   # empty directories
└── (root leftovers)                # check-*.js, test-*.js, run-5-test-cases.js, error.log … see §12
```

### 2.3 Middleware order in `app.js`

| # | Line | Middleware | Behaviour |
|---|---|---|---|
| 1 | 23–53 | `helmet` | production: defaults + explicit CSP (self, unpkg, cdnjs, jsdelivr, jquery, bootstrapcdn; `img-src 'self' data: https:`); development: every Helmet sub-policy disabled |
| 2 | 56–66 | `cors` | production origin = `ALLOWED_ORIGINS` (comma list) or `false`; development = any origin; `credentials: true` |
| 3 | 69–75 | manual `OPTIONS *` handler | echoes `Origin`, always 200 |
| 4 | 78–82 | `morgan('combined')` | skips `GET /api/check-session` |
| 5 | 85 | `express.static('public')` | |
| 6–8 | 88–90 | `express.json()`, `express.urlencoded`, `cookie-parser` | default 100 kb JSON limit |
| 9 | 93 | `express-session` | see §4.7 |
| 10 | 96–102 | EJS view engine; view cache off in development | |
| 11 | 111 | `checkSessionTimeout` (global) | |
| 12–15 | 114–123 | `/auth`, `/api`, `/` pages, `/` api fallback | |
| 16–17 | 126–140 | error handler (500, `error.ejs`, message only in development), 404 handler | |

`NODE_ENV` is forced to `development` when unset (`app.js:11-13`) before any config module reads it. `startServer()` runs at module load, so `require('./app')` in a test opens the DB pool, binds the port and starts the outbox worker.

---

## 3. Environment Setup

### 3.1 Environment variables

Copy `docs/env.template.txt` to `.env` in the project root. Complete list of variables the code reads:

| Variable | Used by | Default / behaviour |
|---|---|---|
| `NODE_ENV` | app.js, session, auth, api, account-recovery | forced to `development` if unset; `production` enables CSP, strict CORS, `sameSite=strict`, and makes `PUBLIC_BASE_URL` and a recovery key mandatory |
| `PORT` | app.js | `3001` (production container uses `3000`) |
| `ALLOWED_ORIGINS` | app.js (production CORS) | comma-separated; **unset in production means CORS origin `false`** – uncomment it in the template |
| `SESSION_SECRET` | config/session.js, utils/account-recovery.js (fallback key) | `'your-secret-key-here'` |
| `SESSION_TIMEOUT` | middleware/auth.js, session, auth, api | seconds; `parseInt(x)*1000 || 1800000` → 30 min if unset or non-numeric |
| `COOKIE_HTTP_ONLY` | config/session.js | `true` unless the literal string `false` |
| `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` | config/database.js and every script | app defaults `localhost` / `root` / `mysql` / `sweetl23_partner_demo`; `backup-database.js` has no defaults and requires `DB_NAME` |
| `DB_PORT` | **only** `scripts/update-database.js` and `scripts/purge-data-entered-before.js` | `3306`; **the application pool ignores it** (config/database.js has no `port`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | services/emailService.js | port 465 → implicit TLS, otherwise STARTTLS required; transport is verified at import time |
| `ADMIN_EMAIL_1/2/3` | emailService (contact form recipients) | `ADMIN_EMAIL_1` falls back to `SMTP_USER` |
| `PUBLIC_BASE_URL` | utils/account-recovery.js | reset-link origin; derived from the request in development, **required in production** |
| `ACCOUNT_RECOVERY_ENCRYPTION_KEY` | utils/account-recovery.js | AES-256-GCM key for outbox payloads; falls back to `SESSION_SECRET`; **throws in production if both unset** |
| `ACCOUNT_RECOVERY_POLL_INTERVAL_MS` | services/accountRecoveryOutbox.js | `5000` |
| `GEOCODING_BASE_URL`, `GEOCODING_USER_AGENT`, `GEOCODING_CONTACT_EMAIL` | routes/api.js (`/api/geocode/address`) | Nominatim defaults; **not in env.template.txt** |
| `PRUNE_DATABASE_BACKUPS` | scripts/backup-database.js | when exactly `true`, deletes older dumps after a successful backup; **not in the template** |

`COOKIE_SECURE` appears in some `.env` files but is dead: `config/session.js` hard-codes `secure: false`.

### 3.2 Local development

```bash
npm install
npm run dev        # nodemon app.js on PORT (default 3001)
npm start          # node app.js
npm test           # 16 test files, no database needed
```

The local port defaults to 3001 so it does not collide with a production-style container on 3000.

### 3.3 Database access

- Production database: MariaDB 10.6 `sweetl23_partner_demo` on the SweetLab VPS (`DB_HOST=104.247.77.90`), `utf8mb4_unicode_ci`, pool of 10 connections.
- From a developer Mac the database is reachable **only when cPanel → Remote MySQL whitelists your current IP**. `Host … is not allowed to connect` means the IP changed (VPN, new lease, other office), not a wrong password.
- The `mysql` CLI is not required: every maintenance task is a Node script (`scripts/`). If you want a throwaway local server for rehearsing migrations, MySQL 9.4 lives in `/usr/local/mysql/bin` on the main dev Mac; initialise a scratch data directory with `mysqld --initialize-insecure`, start it on a spare port (e.g. 33306), load the latest `db/backups/*.sql` (replace `date NOT NULL DEFAULT current_timestamp()` with `date NOT NULL`, a MariaDB-only default), and point the scripts at it with `DB_HOST=127.0.0.1 DB_PORT=33306`. The application pool itself has no `DB_PORT` support, so run the app against it only through a small harness that builds its own pool.

---

## 4. Core Modules

### 4.1 Authentication (`routes/auth.js`, 957 lines)

| Method | Path | Guards | Purpose |
|---|---|---|---|
| GET | `/auth/captcha` | – | 6-character code stored in `req.session.captcha_code`, rendered as 150×50 PNG (`@napi-rs/canvas`), no-cache |
| POST | `/auth/login` | `redirectIfLoggedIn`, validators (login, password, captcha) | captcha check (case-insensitive, single-use) → `users` lookup by username **or** e-mail → `bcrypt.compare` → session (`user_id`, `username`, `email`, `last_activity`) → optional 30-day `remember_user` cookie → `redirectUrl` (sanitised local URL) |
| POST | `/auth/signup` | `redirectIfLoggedIn`, 12 validators | username 3–50, e-mail, password ≥ 6 + confirm, names, organisation, `organization_type_num`, `organization_type_other`, `job_title`, `country_num`, `state_num` (US requires a state, non-US forbids one), captcha; uniqueness check; `bcrypt.hash(pw, 12)`; auto-login |
| POST | `/auth/logout` | – | destroys session, clears `sessionId` and `remember_user` |
| GET | `/auth/check-session` | – | `{logged_in, timeout, username}`; destroys the session when past `SESSION_TIMEOUT` |
| POST | `/auth/reset-password-request` | `redirectIfLoggedIn`, validators (identifier 1–100, captcha) | account-recovery request (below); always the same generic message, ≥ 300 ms response floor |
| GET | `/auth/reset-password` | `redirectIfLoggedIn` | without token: request form; with `token` (`^[a-f0-9]{64}$`): validated against `password_reset_tokens`, else redirect `/reset-password-expired` |
| POST | `/auth/reset-password` | `redirectIfLoggedIn`, validators (token, strong password, confirm) | transactional reset; no captcha (mail possession already proven) |

There is no `express-rate-limit`; throttling for recovery is DB-backed (`account_recovery_cooldowns`).

**Account recovery request** (`enqueueAccountRecoveryRequest`, one transaction):
1. `INSERT IGNORE` + `SELECT … FOR UPDATE` on `account_recovery_cooldowns` for scope `identifier` (HMAC-SHA256 of the NFKC-lower-cased identifier; limit 5 per 15-minute window, over-limit blocks 15 min).
2. Look the user up by username or e-mail.
3. Second cooldown for scope `account` keyed on `User_UniqueID`.
4. `crypto.randomBytes(32)` → SHA-256 hash stored in `password_reset_tokens` (`expires_at = NOW() + 1 HOUR`).
5. AES-256-GCM-encrypted mail job inserted into `account_recovery_outbox` (`event_id` UUID as idempotency key).
6. Commit; the mail is sent later by the outbox worker (§4.6).

**Password reset submit**: resolve the token owner (hashed or legacy raw token), lock the `users` row **before** the token row (deliberate lock order), `bcrypt.hash`, update the password, mark **all** outstanding tokens for that user used, commit, then best-effort confirmation e-mail.

Password policy (`utils/account-recovery.js:88`): ≥ 8 characters with lower-case, upper-case, digit and special character.

### 4.2 Middleware (`middleware/auth.js`)

| Export | Behaviour |
|---|---|
| `requireAuth` | passes when `req.session.user_id` (refreshes `last_activity`); otherwise stores `returnUrl` and returns `401 {success:false, message:'Authentication required', redirect:'/login'}` for `/api/*` or JSON `Accept`, else `302 /login`. Under the root fallback mount `req.path` lacks `/api/`, so JSON detection relies on the `Accept` header |
| `redirectIfLoggedIn` | `302 /home` when logged in |
| `checkSessionTimeout` | global; on inactivity ≥ `SESSION_TIMEOUT` destroys the session, clears cookies, `401 {message:'Session expired'}` for API/JSON or redirect `/login`; otherwise refreshes `last_activity` |

### 4.3 Page routes (`routes/pages.js`)

| Path | Auth | View | Notes |
|---|---|---|---|
| `/` | – | → `/home` | |
| `/home` | – | `home` | public map (`map-home.js`) |
| `/login`, `/signup` | `redirectIfLoggedIn` | `login`, `signup` | signup loads `OrganizationType_Ref`, `Country_Ref`, `State_Ref` |
| `/about`, `/documentation`, `/review`, `/contact` | – | same-named views | |
| `/enter_and_edit_data` | – | `enter_and_edit_data` | landing page with map |
| `/enter_data_by_form` | **requireAuth** | `enter_data_by_form` | `?editSampleId=<int>` switches to edit mode (title "Edit My Data") |
| `/enter_data_by_file` | **requireAuth** | `enter_data_by_file` | upload UI; server-side parsing not implemented |
| `/my-locations` | **requireAuth** | `my_locations_fixed` | note the view name |
| `/my-locations-view` | **requireAuth** | `my_locations_view` | read-only variant |
| `/my-samples` | **requireAuth** | `my_samples` | "Edit My Data" list → edit links |
| `/my-profile` (GET/POST) | **requireAuth** | `my_profile` | POST updates `users` (same org-type/country/state rules as signup; optional password change requires current password + strong new password) |
| `/admin/contact` | **requireAuth** | `admin-contact` | **no role check** – any logged-in user |
| `/reset-password` | – | → `/auth/reset-password` (query preserved) | |
| `/reset-password-expired` | – | `reset_password_expired` | |
| `/logout` (GET) | – | → `/login` | |
| `/captcha_test` | – | `captcha_test` | debug page, still routed |

`pageSpecificJS` locals passed by some routes are consumed only by the unused `views/layout.ejs`; every rendered view hard-codes its own `<script>` tags.

### 4.4 API (`routes/api.js`, ~4,600 lines)

All responses are JSON `{ success, message?, data?, errors? }`. Auth = `requireAuth`.

**Health / diagnostics**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | – | liveness; echoes `NODE_ENV`, origin, host, UA |
| GET | `/api/cors-test` | – | echoes CORS headers |
| POST | `/api/test-save` | – | debug echo of headers/body/**session** (see §12) |
| POST | `/api/add-test-location-data` | ✔ | seeds five hard-coded Detroit locations/events/samples |

**Map**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/map-data` | – | all geolocated samples with partial-date presentation (a second, shadowed registration exists at `api.js:4533`) |
| GET | `/api/php/get_map_data.php` | – | legacy PHP-shaped payload; `?zipcode`, `?plastic_type` |

**Reference data**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/references` | – | one call: `polymers, purposes, colors, forms, methods (MethodType <> 'Count'), opacities, soilTextures, units, sizes, pubSources` — every list `ORDER BY SortOrder, <ID>` (§5.4) |
| GET | `/api/ref/methods` | – | `Methods_Ref`; `?type`, `?appliesTo=MP|Debris|SoilType` |
| GET | `/api/ref/opacity`, `/api/ref/soil-texture`, `/api/ref/units` | – | single tables |

**Publications**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/publications` | – | list, newest year first (snake_case aliases) |
| POST | `/api/publications` | ✔ | create (year, authors, journal, citation, source code required) |

**Locations**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/locations` | – | drop-down list; filtered by `UserCreated` **only when a session exists** |
| POST | `/api/locations` | ✔ | create; needs coordinates **or** full address **or** ZIP; duplicate name → friendly error |
| GET | `/api/my-locations` | ✔ | current user's locations |
| GET | `/api/check-location-exists` | – | name uniqueness check |
| GET | `/api/geocode/address` | ✔ | server-side Nominatim forward geocode (8 s timeout, 429 → "temporarily busy") |

**Samples**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/save-form-data` | ✔ | create a full sample (transaction below) |
| GET | `/api/my-samples` | ✔ | paginated list (`?page`, `?limit` 1–100, default 10) |
| GET | `/api/my-samples/:id` | ✔ | summary; ownership enforced via `UserSamplingID` |
| GET | `/api/my-samples/:id/form-data` | ✔ | full edit payload `{sampleId, formData}` |
| PUT | `/api/my-samples/:id/form-data` | ✔ | full edit write-back (transaction below) |
| PUT | `/api/my-samples/:id` | ✔ | light inline edit (dates/mode/notes, total amount + unit) |

**Session / contact / files**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/check-session` | – | polled every 30 s by `session-timeout.js`; does not destroy the session |
| POST | `/api/contact` | – | stores `contact_submissions` (DB failure tolerated), mails admins + confirmation |
| GET | `/api/admin/contact-submissions` | ✔ | list (`?status`, `?category`); `stats` counters never populated |
| PUT | `/api/admin/contact-submissions/:id/status` | ✔ | status transition; `resolved` path throws (see §12) |
| POST | `/api/upload-file-data` | ✔ | multer upload (`dataFile`, csv/xlsx/json ≤ 10 MB) — acknowledges only |
| GET | `/api/download-template` | ✔ | CSV template |

**`POST /api/save-form-data` transaction** (`api.js:1799-2312`):

```
pre-checks: validatePercentageGroups, validateNewSaveRules, normalizeSamplingEventDates
BEGIN
 1. Publications         resolvePublicationId(): null when publication_present='no', existing id, or INSERT (id = MAX+1)
 2. SamplingEvent        id = MAX+1; weather → WeatherType_Ref ids; DeviceInstallationPeriod = date mode; UserSamplingID = session user
 3. SampleDetails        id = MAX+1; ~40 columns via insertFromMap() (filtered against the live schema by getTableColumns())
 4. MicroplasticsInSample (only if microplastics data present; id = MAX+1) → MicroplasticsPolymerDetails via insertPolymerDetails()
 5. FragmentsInSample     (only if fragments data present; id = MAX+1)      → FragmentsPolymerDetails
 6. detail rows via insertDetailRows(): FragmentsColor/Form/Opacity/Purposes, MicroplasticsColor/Opacity/Size/Form(shape)/Form(texture)
COMMIT → { success, samplingEventId, sampleDetailsId, publicationId }
ROLLBACK on error → status error.statusCode || 500 (stack only in development)
```

Polymer inserts assert the schema before writing (`assertDecimalPercentageStorage`, `assertAutoIncrementColumn`, `assertPolymerOtherDescColumn`, `assertSubmittedPolymerTotal`) and read the rows back afterwards (`assertStoredPolymerDetails`).

**Edit flow** (`GET` then `PUT /api/my-samples/:id/form-data`): `buildSampleFormData()` joins `SampleDetails ⋈ SamplingEvent ⋈ Location ⋈ MediaType ⋈ WaterEnvType ⋈ Units_Ref×4` (gated on ownership), flattens to the form's snake_case keys, then loads the two `*InSample` rows, polymer fields (`loadPolymerFieldsForForm`) and each detail group (`loadDetailRowsForForm`). `PUT` validates (`includeLegacyColumnGroups: false`), then in one transaction: ownership check → `resolvePublicationId` → `UPDATE SamplingEvent` → `UPDATE SampleDetails` → `upsertChildRow` for both `*InSample` → `replacePolymerDetails` ×2 → nine `replaceDetailRows` configs. **An omitted detail group is left untouched; an explicitly submitted `[]` clears it.** Shape and texture share `MicroplasticsFormDetails`, so both must be sent together (400 otherwise).

`module.exports._internals` exposes the pure helpers used by the tests (`getFragmentDebrisCount`, `buildFragmentCountColumns`, `validateNumericRanges`, `validateNewSaveRules`, `insertPolymerDetails`, `replacePolymerDetails`, `loadPolymerFieldsForForm`, …).

### 4.5 E-mail (`services/emailService.js`)

Module-level Nodemailer transport built at import (`SMTP_PORT` 465 → `secure`, else `requireTLS`; timeouts 10/10/30 s; `transporter.verify()` logs on start). Functions, all returning `{success, messageId}` / `{success:false, error}` instead of throwing:

| Function | Purpose |
|---|---|
| `sendPasswordResetEmail(to, resetLink, account, options)` | reset link + account identity; `options.messageId` makes redelivery idempotent |
| `sendPasswordResetConfirmationEmail(to, account)` | after a successful reset |
| `sendContactFormEmail(contactData)` | to `ADMIN_EMAIL_1/2/3` |
| `sendContactConfirmationEmail(contactData)` | auto-reply to the submitter |

### 4.6 Account-recovery outbox worker (`services/accountRecoveryOutbox.js`)

Started once from `app.listen`'s callback (`startAccountRecoveryOutboxWorker`). Constants: 5 delivery attempts, 90 s lease, poll 5 s (`ACCOUNT_RECOVERY_POLL_INTERVAL_MS`), batch 5, back-off 30 s / 2 min / 5 min / 15 min. Each run leases the next `account_recovery_outbox` job (`claim_token` + `lease_until`), decrypts the payload, builds the reset URL (`PUBLIC_BASE_URL`), sends with a stable `Message-ID` `<account-recovery-{eventId}@host>`, then marks sent / retries / dead-letters after 5 attempts (ciphertext cleared in the terminal states). Hourly maintenance sweeps stale rows. Leases are what keep multiple instances from double-sending; the timer is `unref()`ed and repeated identical errors are logged once.

### 4.7 Configuration

`config/database.js`: `mysql.createPool({ host, user, password, database, charset:'utf8mb4', connectionLimit:10 })`; exports `pool`, `testConnection()`. No `port` (3306 only).

`config/session.js`: `{ secret: SESSION_SECRET, resave:false, saveUninitialized:false, cookie:{ secure:false, httpOnly: COOKIE_HTTP_ONLY !== 'false', maxAge: SESSION_TIMEOUT*1000 || 30 min, sameSite: production ? 'strict' : 'lax' }, name:'sessionId' }`. **No store → MemoryStore**: sessions are per-process and lost on restart, and the app cannot be scaled horizontally without adding a store.

### 4.8 Utilities

| File | Exports | Notes |
|---|---|---|
| `utils/account-recovery.js` | `hashResetToken`, `getResetTokenCandidates`, `encryptRecoveryPayload`/`decryptRecoveryPayload` (`v1:iv:tag:ciphertext`), `isStrongPassword`, `normalizeAccountIdentifier`, `resolvePublicBaseUrl`, `buildPasswordResetUrl`, `resolveRecoveryEncryptionSecret`, messages | key fallback `ACCOUNT_RECOVERY_ENCRYPTION_KEY → SESSION_SECRET → dev constant`; throws in production without a real key |
| `utils/percentage.js` | `PERCENTAGE_DECIMAL_PLACES=4`, `PERCENTAGE_TOLERANCE=0.1`, `parsePercentage`, `sumPercentages`, `isPercentageTotalValid`, `toDatabasePercentage`, `isBlankPercentage` | the tolerance is duplicated in `form-handler.js` and `formpage5.ejs` (must stay 0.1 in all three) |
| `utils/sampling-date.js` | `normalizeSamplingEventDates`, `addPartialDatePresentation` | year / year-month / full-date components, `mode` → `DeviceInstallationPeriod`, `collection_date_display` for read APIs |

---

## 5. Database Schema

Source of truth: the latest dump in `db/backups/` (currently `sweetl23_partner_demo_20260818_105317.sql`, 40 tables, InnoDB, `utf8mb4_unicode_ci`). `database_init.sql` and the January-2026 seed dump are **not** current (§6.3).

### 5.1 Table inventory

| Group | Tables |
|---|---|
| Core (18) | `users`, `Location`, `Publications`, `SamplingEvent`, `SampleDetails`, `MicroplasticsInSample`, `FragmentsInSample`, `MicroplasticsPolymerDetails`, `MicroplasticsColorDetails`, `MicroplasticsFormDetails`, `MicroplasticsOpacityDetails`, `MicroplasticsSizeDetails`, `FragmentsPolymerDetails`, `FragmentsColorDetails`, `FragmentsFormDetails`, `FragmentsOpacityDetails`, `FragmentsPurposes`, `RamanDetails` |
| Auth / support (4) | `password_reset_tokens`, `account_recovery_outbox`, `account_recovery_cooldowns`, `contact_submissions` |
| Reference (18) | `PolymerType_Ref`, `Purpose_Ref`, `ColorType_Ref`, `Form_Ref`, `Methods_Ref`, `Opacity_Ref`, `SoilTexture_Ref`, `Units_Ref`, `SizeClass_Ref`, `PubSource_Ref` (these ten carry `SortOrder`), `Country_Ref` (249), `State_Ref` (51), `OrganizationType_Ref` (12), `MediaType_WithinLitterWaterSoil_Ref` (4), `WaterEnvType_Ref` (6), `WeatherType_Ref` (3), `Wavelength_Ref` (5), `LocType_Env-Indoor_Ref` (2, note the hyphen) |

There is no session table and no audit table.

### 5.2 Entity relationships

```
users ──< Location (UserCreated)
users ──< SamplingEvent (UserSamplingID)
Location ──< SamplingEvent (LocationID_Num)         Publications ──< SamplingEvent (PublicationID_Num, nullable)
SamplingEvent ──< SampleDetails (SamplingEvent_Num)
SampleDetails ──< MicroplasticsInSample ──< Microplastics{Polymer,Color,Form,Opacity,Size}Details
SampleDetails ──< FragmentsInSample     ──< Fragments{Polymer,Color,Form,Opacity}Details, FragmentsPurposes
SampleDetails ──< RamanDetails
users ──< password_reset_tokens ──< account_recovery_outbox
```

Delete rules: parent links from `SamplingEvent`/`SampleDetails`/`*InSample` upward are RESTRICT; the Color/Form/Opacity/Size/Purposes detail tables cascade from their `*InSample` parent, **but the two `*PolymerDetails` tables do not** (RESTRICT). Reference FKs are RESTRICT except `Opacity_Ref` and `SizeClass_Ref` links, which cascade. `password_reset_tokens` and `account_recovery_outbox` cascade from `users`/tokens. Deleting sample data therefore has to go bottom-up (this is what `scripts/purge-data-entered-before.js` does).

### 5.3 Core tables

**users** — PK `User_UniqueID` (AUTO_INCREMENT); UNIQUE `username`, `email`.

| Column | Type | Meaning |
|---|---|---|
| `username` varchar(50), `email` varchar(100), `password` varchar(255) | NOT NULL | login identity, bcrypt hash |
| `first_name`, `last_name` varchar(50); `organization` varchar(100); `job_title` varchar(100) | NULL | profile |
| `OrganizationType_Num` → `OrganizationType_Ref`; `OrganizationTypeOther` varchar(255) | NULL | signup organisation type |
| `Country_Num` → `Country_Ref`; `State_Num` → `State_Ref` | NULL | US requires state |
| `role` enum('admin','researcher','user') default `user`; `is_active`; `email_verified` | | **`role` is stored but never enforced** |
| `password_reset_token`, `password_reset_expires` | NULL | legacy in-row token, superseded by `password_reset_tokens` |
| `last_login`, `created_at`, `updated_at` | | |

**Location** — PK `Loc_UniqueID` (AUTO_INCREMENT); UNIQUE `LocationName`.

| Column | Type | Meaning |
|---|---|---|
| `LocationName` varchar(255) NOT NULL; `UserLocID_txt` mediumtext; `Location_Desc` mediumtext NOT NULL | | name, short code for drop-downs, description |
| `Env_Indoor_SelectID` → `LocType_Env-Indoor_Ref` | NULL | outdoor/indoor (app always writes 1) |
| `Lat_DecimalDegree`, `Long_DecimalDegree` decimal(10,6); `Area_acres` decimal(10,0) | NULL | |
| `StreetAddress`, `City`, `State`, `Country` mediumtext; `ZipCode` int | NULL | address alternative to coordinates; ZIP alone for confidential sites |
| `LocationType_Environment`, `LocationType_Indoor` mediumtext; `LandUseCover` varchar(255) | NULL | |
| `DateCreated` datetime NOT NULL default now; `UserCreated` **int NOT NULL → users** | | creator (converted from username text by the 2026-07-10 FK migration) |

**Publications** — PK `PublicationUniqueID` (application-assigned MAX+1). `Year` int, `Authors`, `Journal`, `FullCitation_APA` mediumtext (all NOT NULL), `PubSource_Code` → `PubSource_Ref`, `PubSource_Legacy` mediumtext (label snapshot), `DateEntered` date.

**SamplingEvent** — **no primary key**, UNIQUE `SamplingEventUniqueID` (application-assigned MAX+1).

| Column | Type | Meaning |
|---|---|---|
| `LocationID_Num` → `Location` NOT NULL; `PublicationID_Num` → `Publications` NULL; `UserSamplingID` → `users` NOT NULL | | |
| `StartYear` smallint unsigned NOT NULL; `StartMonth`, `StartDay` tinyint unsigned NULL | | collection (or device start) date at the precision the user knows |
| `EndYear`, `EndMonth`, `EndDay` | NULL | device removal date; only for device-period events |
| `DeviceInstallationPeriod` enum('no','yes') NOT NULL default `no` | | single collection vs installed device |
| `SampleTime` time; `AirTemp_C` decimal(12,6); `Rainfall_cm_Precedent24` decimal(12,6) | NULL | |
| `Weather_Current`, `Weather_Precedent24` → `WeatherType_Ref`; `WeatherPrecedent24` (legacy duplicate, still present) | NULL | |
| `SamplerNames`, `AdditionalNotes` mediumtext; `DateEntered` datetime NOT NULL default now | | `DateEntered` is the entry timestamp used by the purge script |

Ten CHECK constraints enforce the date model: year 1000–9999; month 1–12; a day requires its month; days must exist in that month with full Gregorian leap-year logic; end components require the preceding ones; `DeviceInstallationPeriod='no'` ⇒ all `End*` NULL, `'yes'` ⇒ `EndYear` NOT NULL. Composite indexes on `(StartYear, StartMonth, StartDay, SamplingEventUniqueID)` and `(EndYear, EndMonth, EndDay)`.

**SampleDetails** — **no primary key**, UNIQUE `SampleUniqueID` (MAX+1). `SamplingEvent_Num` → `SamplingEvent` NOT NULL.

| Group | Columns |
|---|---|
| Media | `MediaType_SelectID` → `MediaType_WithinLitterWaterSoil_Ref`; `MediaSubType` varchar(100); `WaterEnvType_SelectID` → `WaterEnvType_Ref`; `WaterTypeOtherDescription`, `SedimentTypeOtherDescription`, `MixedMediaDescription`, `MediaAdditionalNotes` mediumtext |
| Counts | `FragLargerThan5mm_Count` int (fragments **and** whole packaging together); `Micro5mmAndSmaller_Count` int; `ReplicatesCount` int |
| Water | `VolumeSampled`, `WaterDepth`, `SampleWaterDepth`, `FlowVelocity`, `SuspendedSolids`, `Conductivity`, `Turbidity`, `DissolvedOxygen` decimal(12,6) |
| Soil | `SoilTexture` tinytext (**label, not an FK**), `SamplingDepth`, `SoilDryWeight`, `SoilOrganicMatter`, `SoilSand`, `SoilSilt`, `SoilClay`, `SoilMoisture_Percent` decimal(12,6) |
| Surface | `SurfaceAreaSampled`, `PermeableSurfaces`, `ImpermeableSurfaces` decimal(12,6) |
| Amounts | `TotalSampleAmount` + `SampleUnit_Num` → `Units_Ref`; `MicroplasticsSampleAmount` + `MicroplasticsSampleUnit_Num`; `FragmentsSampleAmount` + `FragmentsSampleUnit_Num`; `PackagingSampleAmount` + `PackagingSampleUnit_Num` (legacy, still present and still written) |
| | `DateEntered` datetime NOT NULL default now |

All measurement columns were unified to `DECIMAL(12,6)` on 2026-08-11 (six integer digits max).

**MicroplasticsInSample** — PK `Micro_UniqueID` (MAX+1); `SampleDetails_Num` → `SampleDetails`. `Micro5mmAndSmaller_Count`, `Mass_MP_Total` decimal(12,6), `Method_Count_Num` / `Method_Polymer_Num` → `Methods_Ref` (+ `*_Legacy` label snapshots, `Method_Desc`, `Method_Polymer_Other`), **12 legacy flat percentage columns** (`PercentSize_LessThan1um … PercentSize_1_5mm`, `PercentForm_fiber/Pellet/Fragment`, `PercentColor_Clear/OpaqueLight/OpaqueDark/Mixed`, int) that are still written by `api.js` alongside the normalised detail tables, `DateEntered`.

**FragmentsInSample** — PK `Fragment_UniqueID` (MAX+1); `SampleDetails_Num` → `SampleDetails`. `FragLargerThan5mm_Count` (merged count added 2026-08-15, replacing `PurposeKnown_Count`/`PurposeUnknown_Count`), `Mass_Debris_Total` decimal(12,4), `PurposeKnown_Mass` / `PurposeUnknown_Mass` decimal(10,0) (kept), method columns as above, **10 legacy flat percentage columns** (`PercentColor_Clear/Op_Color/Op_Dk/Mixed`, `PercentForm_Fiber/Pellet/Film/Foam/HardPlastic/Other`) still written, `DateEntered`.

**Detail tables** (all AUTO_INCREMENT PKs, `DateEntered` default now, percentages `DECIMAL(7,4)`):

| Table | Parent FK | Reference FK | Value columns |
|---|---|---|---|
| `MicroplasticsPolymerDetails` | `MicroInSample_Num` (RESTRICT) | `PolymerID_Num` → `PolymerType_Ref` | `PolymerType_Legacy`, `Percentage`, `Method_PercentEstimate`, `PolymerOther_Desc` varchar(255) (only on the Other row) |
| `MicroplasticsColorDetails` | `MicroInSample_Num` (CASCADE) | `MicroColor_Num` → `ColorType_Ref` | `MicroColor_Legacy`, `MicroColorPercent`, `Method_PercentEstimate` |
| `MicroplasticsFormDetails` | `MicroInSample_Num` (CASCADE) | `MicroShape_Num`, `MicroTexture_Num` → `Form_Ref` | shape **and** texture rows share this table: `MicroShape_Legacy/Percent`, `MicroTexture_Legacy/Percent` |
| `MicroplasticsOpacityDetails` | CASCADE | `MicroOpacity_Num` → `Opacity_Ref` (CASCADE) | `MicroOpacity_Legacy`, `MicroOpacityPercent` |
| `MicroplasticsSizeDetails` | CASCADE | `MicroSize_Num` → `SizeClass_Ref` (CASCADE) | `MicroSize_Legacy`, `MicroSizePercent` |
| `FragmentsPolymerDetails` | `FragInSample_Num` (RESTRICT) | `PolymerID_Num` → `PolymerType_Ref` | as microplastics polymer, `Method_PercentEstimate` NOT NULL |
| `FragmentsColorDetails` / `FragmentsFormDetails` / `FragmentsOpacityDetails` | CASCADE | Color / Form / Opacity refs | `Frag*_Legacy`, `Frag*Percent`, `Method_PercentEstimate` NOT NULL |
| `FragmentsPurposes` | CASCADE | `Purpose_Num` → `Purpose_Ref` | `Purpose_Legacy`, `Percent_Purpose` — "percent of a fragment sample represented by each consumer purpose" |

**RamanDetails** — `Raman_UniqueID`, `SampleDetails_Num` → `SampleDetails`, `Wavelength` → `Wavelength_Ref`, `DateEntered` date. **No primary or unique key.** Effectively unused (1 row before the 2026-08-18 purge, 0 after).

**Support tables**

| Table | Key columns |
|---|---|
| `password_reset_tokens` | `id` PK, `user_id` → users (CASCADE), `email`, `token` varchar(64) UNIQUE (SHA-256 hex; legacy raw tokens still accepted on read), `expires_at` (explicit default so MariaDB never auto-updates it), `used`, `created_at` |
| `account_recovery_outbox` | `id` bigint PK, `event_id` char(36) UNIQUE, `user_id`, `reset_token_id` → tokens (CASCADE), `payload_ciphertext` mediumtext (cleared after delivery), `status` (`pending`…), `attempt_count`, `next_attempt_at`, `claim_token` UNIQUE, `lease_until`, `last_error_code`, `created_at`, `updated_at`, `sent_at`; index `ready_jobs(status, next_attempt_at, lease_until, id)` |
| `account_recovery_cooldowns` | PK (`scope`, `key_hash` binary(32)); `window_started_at`, `attempt_count`, `blocked_until`, `updated_at` — never stores a raw identifier |
| `contact_submissions` | `id` PK, `user_name`, `user_email`, `user_organization`, `question_category`, `user_question`, `subscribe_updates`, `submission_date`, `ip_address`, `status` enum(new,in_progress,resolved,closed), `admin_notes`, `resolved_date`, `resolved_by` |

### 5.4 Reference tables and display order (`SortOrder`)

| Table | Content (rows) | Notes |
|---|---|---|
| `PolymerType_Ref` (20) | `Polymer_Code` (UNIQUE), `Polymer_FullName`, `RecycleCode` 1–7, `Category`; row 20 = `Other` / "Other polymer type" | AUTO_INCREMENT already at 41 — IDs are not contiguous and never will be |
| `Purpose_Ref` (7) | `single_use`, `multi_use`, `consumer_product`, `bag_container`, `packing`, `other_purpose`, `unknown_purpose`; `Purpose_Name` UNIQUE | names were edited to the PI's wording after the seed dump |
| `ColorType_Ref` (13) | `Color_Set` = `Simple` (4, legacy MP set) / `Detailed` (9 incl. `other_mixed`) | the form offers only `Detailed`; a legacy `Simple` value is kept as a disabled option on edit |
| `Form_Ref` (8) | flags `AppliesTo_MP_Shape`, `AppliesTo_Texture`; `Other_Mixed` applies to both | |
| `Methods_Ref` (13) | `MethodType` Polymer / Count / Percent / SoilTexture with `AppliesTo_MP/Debris/SoilType` flags | `Count` rows are excluded from `/api/references` |
| `Opacity_Ref` (4), `SoilTexture_Ref` (12, USDA classes), `Units_Ref` (3: L, g, km2), `SizeClass_Ref` (5), `PubSource_Ref` (6) | | |
| `Country_Ref` (249, ISO 3166-1, `ISOAlpha2`; id 1 = United States), `State_Ref` (51), `OrganizationType_Ref` (12) | signup/profile | |
| `MediaType_WithinLitterWaterSoil_Ref` (4), `WaterEnvType_Ref` (6), `WeatherType_Ref` (3), `Wavelength_Ref` (5), `LocType_Env-Indoor_Ref` (2) | | |

**Display order is data, not code.** The ten tables served by `/api/references` carry `SortOrder INT NOT NULL DEFAULT 0` (migration `20260817_add_reference_sort_order.sql`) and every list on the form is rendered in `ORDER BY SortOrder, <ID>`:

- regular options count in tens (10, 20, 30, …) so a new option can be slotted between neighbours;
- catch-alls are pinned high: `Other …` = 900, `Unknown` = 990, so they always close a list;
- Purposes follow the PI's datasheet order (Products one time → Products multiple times → Other durable goods → Bag → Packing → Other → Unknown); polymers follow recycle codes 1–6, then the remaining polymers, then Other; the other tables keep their historical order.

To reorder or add an option no code changes: `UPDATE Purpose_Ref SET SortOrder = 35 WHERE Purpose_Code = '…';` or `INSERT INTO PolymerType_Ref (Polymer_Code, Polymer_FullName, RecycleCode, Category, SortOrder) VALUES ('PTFE', 'Polytetrafluoroethylene', NULL, 'Synthetic', 175);`. Never write the ID yourself, and never renumber IDs — sample rows reference them. A row left at `SortOrder = 0` sorts **first**, on purpose, as a reminder to assign a value. `Polymer_Code` doubles as the form field suffix (`mp_polymer_<code>`), so it must stay unique; the code `Other` is special-cased in the application and must not be renamed.

Removing an option: `DELETE` works only while no sample row references it (RESTRICT FKs). Once real data references an option, retire it with a soft-delete flag plus "keep it visible on samples that already use it" logic instead of deleting — that logic does not exist yet (see §12).

---

## 6. Migrations

### 6.1 How migrations work

- One SQL file per change in `db/`, named `YYYYMMDD_description.sql`, applied with `node scripts/update-database.js db/<file>.sql` (the runner refuses paths outside `db/` or without `.sql`, and executes the file as a single multi-statement query).
- **There is no migration ledger.** Every migration is written to be idempotent (INFORMATION_SCHEMA guards, `IF(...)` + `PREPARE/EXECUTE`, "only rows still at default" back-fills) so re-running is a no-op.
- Migrations are run **from a developer machine against the production database** (needs the Remote MySQL whitelist), never inside the container. Always `node scripts/backup-database.js` first.
- Each file's header states its deploy order relative to the code. Two patterns exist: *migration first* (adds columns the new code needs) and *code first* (drops columns the old code still reads).

### 6.2 Migration list (chronological)

| File | Purpose | Deploy order |
|---|---|---|
| `20260627_allow_small_sampled_areas.sql` | widen `SurfaceAreaSampled`, `TotalSampleAmount` … to `DECIMAL(12,6)` | – |
| `20260710_drop_legacy_package_category_details.sql` | drop `PackageCategoryDetails` (lossy — back up first) | – |
| `20260710_enforce_database_relationships.sql` | normalise sentinels, convert `Location.UserCreated` to a user FK, add the FK graph | – |
| `20260713_drop_sample_details_wholepkg_count.sql` | fold `WholePkg_Count` into `FragLargerThan5mm_Count`, drop it | – |
| `20260713_drop_sample_storage_location.sql` | drop `StorageLocation` + `StorageLoc_Ref` FK | – |
| `20260713_drop_sample_landscape_type.sql` | move terrestrial-soil discriminator into `MediaSubType`, drop `LandscapeType` | – |
| `20260713_link_sample_units_reference.sql` | unit codes → `Units_Ref` FKs (`*SampleUnit_Num`) | – |
| `20260713_extend_user_signup_profile.sql` | `OrganizationType_Ref` + optional profile columns on `users` | – |
| `20260720_preserve_percentage_precision.sql` | detail percentages → `DECIMAL(7,4)`, detail PKs → AUTO_INCREMENT | **migration first**, then code |
| `20260722_expand_country_reference.sql` | `Country_Ref` → 249 ISO entries + `ISOAlpha2` (id 1 stays US) | – |
| `20260727_fix_account_recovery.sql` | canonical `password_reset_tokens`, `account_recovery_cooldowns`, `account_recovery_outbox` (`npm run migrate:account-recovery`) | – |
| `20260728_replace_sampling_dates_with_components.sql` | `SamplingDate`/`DeviceStart/EndDate` → `Start*/End*` components + CHECKs | – |
| `20260811_unify_sample_numeric_precision.sql` | measurements → `DECIMAL(12,6)`; two pre-flight SELECTs must return no rows | **migration first**, then `formpage2/4.ejs` |
| `20260815_add_polymer_other_description.sql` | `PolymerOther_Desc` on both polymer detail tables; relabel Other → "Other polymer type" | either order, but before the next one |
| `20260815_merge_fragment_purpose_counts.sql` | `FragmentsInSample.FragLargerThan5mm_Count`, back-fill, drop `PurposeKnown/Unknown_Count` | **code first** (`api.js`, `form-handler.js`, `formpage5.ejs`, `mp_style.css`), then migration |
| `20260817_add_reference_sort_order.sql` | `SortOrder` on the ten reference tables + back-fill (§5.4) | **migration first**, then `routes/api.js` |

All sixteen have been applied to production (last on 2026-08-18).

### 6.3 Bootstrap files — status

- **`database_init.sql`** (repo root, run by `npm run init-db`): a June-2025 phpMyAdmin dump that was partly hand-edited. It still creates the dropped `PackagesInSample`, lacks all ten detail tables, `FragmentsPurposes`, `Publications`, `contact_submissions` and nine reference tables, has no `SortOrder`, and declares `Location.UserCreated` as text. **A database built from it cannot serve the current application.** `scripts/init-database.js` additionally prints a success banner about tables and users it does not create. Treat both as legacy.
- **`db/sweetl23_partner_demo_202601181155.sql`**: the January-2026 pre-refactor snapshot (26 tables, package family, no publications/methods/opacity/etc.). Useful as a migration-rehearsal fixture; not a deployment artefact.
- **To stand up a fresh, current database**, restore the latest `db/backups/*.sql` dump (it contains `CREATE DATABASE`/`USE` and every table) — do not use `init-db`.

---

## 7. Frontend Architecture

### 7.1 Pages are standalone

`views/layout.ejs` is **never rendered**. Every route renders a self-contained EJS file with its own `<head>`, CSS links and `<script>` tags, and includes `partials/header.ejs` (logo, title, user menu), `partials/sidebar.ejs` (Review Data / Enter and Edit Data / Documentation / About), `partials/timeout_modal.ejs` and, on a few pages, `partials/footer.ejs`. Adding a page therefore means copying an existing page's skeleton (see §11).

Live views: `home`, `login`, `signup`, `about`, `documentation`, `review`, `contact`, `enter_and_edit_data`, `enter_data_by_form`, `enter_data_by_file`, `my_locations_fixed`, `my_locations_view`, `my_samples`, `my_profile`, `admin-contact`, `reset_password`, `reset_password_expired`, `captcha_test`, `error`. Dead views are listed in §12.

Stagewise dev toolbar (`stagewise-toolbar.js`) is included by 11 views inside `<% if (process.env.NODE_ENV !== 'production') %>`.

### 7.2 The data-entry wizard (`views/enter_data_by_form.ejs` + `views/data_forms/`)

Progress-bar labels vs page headings:

| Step | Progress label | Page heading | Source | Collects |
|---|---|---|---|---|
| 1 | Location | Location Information | inline in `enter_data_by_form.ejs` (`data_forms/formpage1.ejs` is a diverged dead copy) | either an existing location (`location_id`) or a new one: name, short code, description, lat/long via Leaflet map, acres, street/city/state/country with **Find Address on Map** (`/api/geocode/address`), or ZIP only |
| 2 | Sampling Event | Sampling Event Information | `formpage2.ejs` | `device_installation_period` (no/yes); start date as `start_year` (required) + optional `start_month`/`start_day`; end date components shown only for device periods; `sample_time`, `sample_description`; publication block (`publication_present` yes/no, pick existing or enter year/authors/journal/APA/source); weather (`air_temp`, `current_conditions`, `rainfall`) |
| 3 | Media Information | From what media did you collect plastic? | `formpage3.ejs` | `media_type`: water (+ `water_type`, other description), soil_sediment (+ `sediment_type`), in_soil, soil_litter, mixed_composite (+ description) |
| 4 | Additional Information | Additional Sampling Information | `formpage4.ejs` | `additional_info` yes/no gating one media-specific block: water measurements, sediment/soil depth-weight-organic-texture (+ texture method), surface area/permeability, mixed notes |
| 5 | Particle Details | Sample Details | `formpage5.ejs` | `has_quantitative_data`; `total_sample_amount` + `sample_unit`; **counts** `microplastics_count`, `fragments_count`; **Microplastics Details** (mass, polymer-ID method, percent-estimate method, detail sections Size Classes / Color Types / Opacity Types / Shapes / Textures, dynamic polymer list); **Fragments Details** (mass, methods, sections Purposes / Color Types / Textures / Opacity Types, dynamic polymer list) |
| 6 | Confirmation | Review and Submit | inline `<template id="template-form-page6">` (`data_forms/formpage6.ejs` is dead) | Data Summary (`generateSummary()`), `additional_notes`, **Save and Continue**, then next-step buttons A) new location/date, B) different media type, C) additional sample, D) new case same publication |

**Loading**: pages 2–5 are server-rendered once into hidden `<template id="template-form-pageN">` elements; `loadAndAppendNextPage(n)` clones and appends them progressively (all pages stay in the DOM), then runs the page's `updatePageNContent()`. Revisiting a page calls `updateExistingPageContent()`.

**State**: one `formData` object mirrored into `sessionStorage['microplastics_form_data']`; publication carry-forward per location in `sessionStorage['microplastics_publication_by_location']`; `window.resetInMemoryFormData()` clears the in-memory copy so a reload cannot resurrect stale values.

**Reference lists**: `initializeReferenceData()` fetches `/api/references` and `/api/publications` once, then `populateReferenceDrivenControls()` fills unit/soil-texture/method/publication selects, `restoreDetailRowsFromFormData()` rebuilds detail rows, and `loadPolymerOptions()` renders one percentage input per polymer into `#mp-polymer-dynamic-container` / `#fragment-polymer-dynamic-container` (field names `mp_polymer_<code>` / `fragment_polymer_<code>`; the Other row gets a "Describe the other polymer(s)" box `<prefix>other_specify`, shown only while Other has a value). `mapReferenceOptions()` applies the per-list rules (Detailed colours only, shape/texture flags, retained legacy value kept as a disabled option). Detail rows (`partials/detail_percent_rows.ejs`) are `select + percentage + remove`, with duplicate options disabled across sibling rows and a live `Total: N%` badge.

**Validation**: numeric guards (`min=0`, percent `max=100`), partial-date validation via `PartialDateUtils`, per-group "Current Total" banners for the polymer lists (green at 100 ± 0.1, red above, grey "stored total" for untouched groups in edit mode), and a capture-phase interceptor on page 5's Continue button that lists any percentage group off 100 %.

**Edit mode** (`/enter_data_by_form?editSampleId=N`): the form is locked, `GET /api/my-samples/N/form-data` replaces `formData`, pages 2–6 are force-loaded, reference data must load (hard failure otherwise), the button becomes **Update Data**, and `captureEditPercentageSnapshots()` records the loaded groups so `buildSubmissionPayload()` can **omit untouched percentage groups from the `PUT`** — a legacy record whose stored totals are not 100 % is neither rewritten nor rejected unless the user edits that group. Save = `PUT /api/my-samples/N/form-data`, then redirect to `/my-samples`.

### 7.3 Client-side modules (`public/js/`)

| File | Lines | Used by | Purpose |
|---|---|---|---|
| `form-handler.js` | 6,387 | enter_data_by_form | the wizard engine (state, navigation, reference lists, detail rows, polymer lists, validation, save/edit, summary, next steps) |
| `data-summary-utils.js` | 207 | enter_data_by_form, tests | UMD `DataSummaryUtils` (particle summary, labels) |
| `partial-date-utils.js` | 181 | form, home, my_samples, tests | UMD `PartialDateUtils` (leap years, precision, formatting, ordering) |
| `publication-form-utils.js` | 98 | enter_data_by_form | UMD publication select/lock helpers |
| `map-data-entry.js` | 266 | enter_data_by_form | Leaflet map + draggable marker for step 1 |
| `map-home.js` | 214 | home | public sample map |
| `enter-and-edit-map.js` | 172 | enter_and_edit_data | landing-page map |
| `my-locations.js` | 756 | my_locations_fixed | `MyLocationsManager`: grid/list, pagination, search, modal map, save/delete |
| `session-timeout.js` | 204 | 10 views | polls `/api/check-session` every 30 s, shows the timeout modal |
| `auth.js` | 399 | login, signup, captcha_test | auth forms + captcha refresh |
| `fancy-modal.js` | 313 | enter_data_by_form, my_profile | `FancyModal`, `fancyConfirm/fancyAlert`, progress/success/error helpers |
| `common.js` | 186 | most pages | shared bootstrap helpers |
| `file-upload.js` | 342 | enter_data_by_file | drop-zone UI |
| `app.js` | 188 | via footer partial | jQuery helpers (jQuery not loaded on all of those pages) |
| `stagewise-toolbar.js` | 827 | 11 views (non-production) | dev toolbar |
| dead: `dashboard.js`, `form-validation.js`, `main.js`, `map-handler.js`, `map-review.js`, `form-loader.js`, `multi-form-handler.js`, `stagewise-toolbar-enhanced.js`, `form-handler.js.bak`, `form-handler.js.bak2` | | none | see §12 |

CSS: `mp_style.css` (3,575 lines, main), `auth-pages.css` (login/signup/reset), `fancy-modal.css`, `auth.css` (only captcha_test); `style.css` and `fourcolumns.css` are unused. Assets: `public/assets/` (logo, two home GIFs, favicon).

---

## 8. Testing

Node's built-in runner, no database required (fake connections / pure helpers):

```bash
npm test                      # all 16 files (~3 s)
npm run test:partial-dates    # or test:percentages, test:data-summary, test:publication, test:account-recovery, test:signup
node --test test/reference-sort-order.test.js
```

| File | Covers |
|---|---|
| `account-recovery.test.js`, `account-recovery-outbox.test.js`, `email-account-recovery.test.js` | identifier normalisation, token hashing, outbox lease/claim, mail content |
| `signup.test.js`, `user-profile-route.test.js`, `user-profile-view.test.js` | required fields, ISO country set, profile round-trip |
| `partial-date-utils.test.js`, `sampling-date-api.test.js`, `partial-date-integration.test.js` | leap years, precision, single vs device-period rules, form uses six components |
| `percentage-utils.test.js`, `data-summary-utils.test.js`, `publication-ui.test.js` | decimal percentages, summary completeness, publication disambiguation |
| `fragment-count-and-numeric-range.test.js`, `other-polymer-description.test.js` | merged fragments count, negative-number guard, Other-polymer description persistence |
| `reference-sort-order.test.js` | API orders every reference table by `SortOrder`; migration covers each table; Purposes/Other/Unknown order |
| `migration-runner.test.js` | runner path rules |

Manual/UI verification patterns that have worked: mount `routes/api.js` on a bare express app with a hand-built pool pointed at a local restored dump (stub `config/database` via `require.cache`), or run the whole app against that dump with a preload shim that stubs `express-session` (auto-login) — this lets you open the auth-gated form locally with real data. `Testing/excel_verification/` holds the Python toolkit that compared the PI's Excel workbook against a dump (2026-08-04).

---

## 9. Deployment

### 9.1 Production topology (as actually run)

| Item | Value |
|---|---|
| Host | InMotion cPanel VPS `vps86226.inmotionhosting.com` (104.247.77.90), CSF firewall |
| Public URL | `https://entry.sweet-lab.org` (Apache reverse proxy → container port 3000); `http://104.247.77.90:3000` also answers |
| Container | `myapp-container`, app at `/app`, `PORT=3000`, `NODE_ENV=production`; started by hand from a locally built image (the repo's `docker-compose.yml` with `container_name: mp-data-entry` is a reference, not what is running); a nodemon-style watcher restarts the app when files under `/app` change |
| Database | MariaDB 10.6 on the VPS host, reached from the container as `host.docker.internal` (172.17.0.1); CSF must allow `tcp|in|d=3306|s=172.17.0.0/16` and `tcp|out|d=3000|d=172.17.0.0/16`, and `DOCKER="1"` in `csf.conf` |
| Health | `GET /api/health` (Docker HEALTHCHECK every 30 s) |
| Access | SSH only from IPs listed in `/etc/csf/csf.allow`; user `sweetl23` (docker yes, sudo no) via SSH or the cPanel Terminal; root via WHM → Terminal. Never run parallel ssh/scp sessions (CSF connection limits on port 22) |
| Backups | `docker commit myapp-container mp:v8-backup-<date>` before risky container work; database dumps via `scripts/backup-database.js` (git-ignored) |

### 9.2 Deploying code

Files are copied one by one; there is no CI/CD and no image rebuild for routine changes.

```bash
# on the Mac, from the project root
scp /Users/<you>/Desktop/Refactoring/routes/api.js sweetl23@104.247.77.90:~/Refactoring/routes/api.js
```

```bash
# on the server (ssh or cPanel Terminal), one command at a time
docker cp ~/Refactoring/routes/api.js myapp-container:/app/routes/api.js
docker exec myapp-container sh -c "tr -d '\r' < /app/routes/api.js | md5sum"   # compare with: tr -d '\r' < routes/api.js | md5
docker logs --tail 15 myapp-container                                            # expect the watcher restart
curl -s -o /dev/null -w 'local %{http_code}\n' http://127.0.0.1:3000/api/health
```

Rules of thumb:
- Hash with `tr -d '\r'` on both sides so CRLF/LF differences do not count; the repo is LF-normalised.
- Static JS/CSS changes need a hard refresh in the browser (`Cmd-Shift-R`); server-side changes do not.
- SQL files are never copied into the container; migrations run from the Mac (§6.1).
- After a deploy, verify from outside: `curl https://entry.sweet-lab.org/api/health` and, for reference changes, `/api/references`.
- Rollback = copy the previous version of the file back (`git show HEAD~1:routes/api.js > /tmp/old.js`) with the same two commands. If a container is stopped or the daemon restarted, `unless-stopped` will not restart a manually stopped container — `docker start myapp-container`.
- Firewall gotcha (2026-08-15 outage): a CSF flush deletes Docker's iptables chains. Fix order is `csf -ra` **then** `systemctl restart docker`; a `docker restart` alone does not recreate the chains.

### 9.3 Standard release sequence

1. `npm test` locally; verify UI changes on a local restored dump when possible.
2. `node scripts/backup-database.js`.
3. Run any migration marked *migration first* (§6.2).
4. `scp` + `docker cp` each changed runtime file (routes/, public/, views/, services/, config/, middleware/, utils/); confirm the restart in `docker logs`.
5. Run any migration marked *code first*.
6. Post-check: health, the affected endpoint(s), a hard-refreshed page.
7. Commit on a branch and open a PR (deploy state is not visible in git, so keep the two in step).

### 9.4 Reference container build (`Dockerfile`, `docker-compose.yml`)

`node:lts-slim`, canvas system libraries, `npm install` + `npm prune --production`, non-root user `nodejs`, `EXPOSE 3000`, HEALTHCHECK on `/api/health`, `CMD node app.js`. Compose runs `network_mode: host`, mounts `.:/app:ro`, `uploads/`, `logs/`, `.env:ro`. Use these to rebuild an image from scratch; day-to-day production changes go through §9.2.

### 9.5 Production checklist

- `NODE_ENV=production`, `PORT`, real `SESSION_SECRET`, `ACCOUNT_RECOVERY_ENCRYPTION_KEY`, `PUBLIC_BASE_URL=https://entry.sweet-lab.org`, SMTP settings, `ADMIN_EMAIL_*`, `ALLOWED_ORIGINS` (uncommented).
- Remote MySQL whitelist for the developer IPs; CSF rules for Docker as above.
- Fresh database backup before every migration or data operation.
- Session store is in-memory: a restart logs everyone out; keep it in mind when timing deploys.

---

## 10. Data Operations

### 10.1 Backups

`node scripts/backup-database.js` writes `db/backups/<DB_NAME>_YYYYMMDD_HHMMSS.sql` (mode 0600, git-ignored): consistent-snapshot logical dump of every table (`DROP TABLE IF EXISTS` + `SHOW CREATE TABLE` + 250-row `INSERT` batches, `SET FOREIGN_KEY_CHECKS=0`, `CREATE DATABASE IF NOT EXISTS`). Set `PRUNE_DATABASE_BACKUPS=true` to delete older dumps after a successful run. Restore by piping the file into any MySQL/MariaDB (see §3.3 for the one MariaDB-only default to patch on MySQL).

### 10.2 Purging entered data

`scripts/purge-data-entered-before.js` deletes every sampling entry whose `SamplingEvent.DateEntered` is before a cutoff, bottom-up through the FK graph, and never touches `users`, `password_reset_tokens` or the account-recovery tables.

```bash
node scripts/purge-data-entered-before.js --before=2026-08-01                                   # dry run (counts only)
node scripts/purge-data-entered-before.js --before=2026-08-01 --include-locations --include-publications   # wider dry run
node scripts/purge-data-entered-before.js --before=2026-08-01 --include-locations --include-publications \
     --execute --backup=db/backups/sweetl23_partner_demo_20260818_105317.sql                     # really delete
```

`--execute` requires `--backup=` pointing at a dump ≥ 10 kB and less than two hours old; everything runs in one transaction, each step's `affectedRows` must equal the plan, all remaining counts are re-verified before `COMMIT`, otherwise it rolls back. Locations/publications are only removed with the flags and only when no remaining event references them. Used on 2026-08-18 to remove everything entered before 2026-08-01 (backup `…_20260818_105317.sql` is the only copy of that data). ID counters are not reset.

### 10.3 Editing reference lists

See §5.4. The cheapest moment to add/remove/rename options is while nothing references them (e.g. right after a purge); afterwards, deletions are blocked by FKs and need a soft-delete design.

---

## 11. Development Guidelines

**API response shape**: `{ success: true, data, message? }` / `{ success: false, message, errors? }`; HTTP status mirrors the outcome (400 validation, 401 auth, 404 not owned/not found, 500 with `error.stack` only in development).

**Validation rules that must stay in sync**
- Percentage groups (polymer lists and every detail section) must total 100 % ± 0.1; the tolerance is defined in `utils/percentage.js`, `form-handler.js` and `formpage5.ejs`.
- Percentages are stored with four decimals (`DECIMAL(7,4)`); numeric inputs reject negatives (`min=0`), percent fields `max=100`; measurements are `DECIMAL(12,6)`.
- Dates: `start_year` required; month/day optional and hierarchical; end components only for device periods (validated client-side, server-side and by CHECK constraints).
- The Other polymer requires a description when its percentage is > 0, and vice versa.
- Reference lists are never hard-coded: read `/api/references` and respect `SortOrder`.

**Database patterns**
- Parameterised queries only; multi-table writes in one transaction with rollback.
- Business-key IDs for `SamplingEvent`, `SampleDetails`, `*InSample`, `Publications` are `MAX(id)+1` inside the transaction; detail tables use AUTO_INCREMENT.
- Inserts go through `insertFromMap()`/`updateFromMap()`, which drop columns that do not exist in the live table (`getTableColumns()`), so code can be deployed shortly before/after a migration when the header allows it.
- New migration: `db/YYYYMMDD_short_name.sql`, idempotent, header explaining purpose and deploy order, pre-flight and post-check `SELECT`s, and a test if it changes behaviour (see `test/reference-sort-order.test.js`).

**Adding a page**: copy the `<head>`/partials skeleton of an existing standalone view (there is no layout), add a route in `routes/pages.js` (`requireAuth` if needed, pass `title`, `currentPage`, `user`), add the sidebar entry, hard-code the page's scripts (do not rely on `pageSpecificJS`).

**Adding an API**: `router.<method>('/path', requireAuth, [validators], async (req,res) => { … })` in `routes/api.js`; remember it will also be reachable at the root path because of the legacy mount.

**Code style**: kebab-case file names, async/await, underscore-based DB column names (legacy hyphenated names were renamed; the one remaining hyphen is the table `LocType_Env-Indoor_Ref`), LF line endings, no secrets in the repo (`.env`, `db/backups/*.sql` and `tasks/` are git-ignored).

---

## 12. Known Issues and Technical Debt

Verified against commit `2092d2a`; none of these are blocking, but each has bitten someone or will.

**Runtime behaviour**
- `PUT /api/admin/contact-submissions/:id/status` with `status=resolved` throws (`req.session.user.username` — `req.session.user` is never set) → 500. `GET …/contact-submissions` computes `stats` but never populates them.
- A second `GET /api/map-data` handler (`api.js:4533`) is shadowed by the first and is dead.
- `POST /api/test-save` is unauthenticated and echoes the whole `req.session`; `POST /api/add-test-location-data` seeds test rows into production tables. Both should be removed or guarded.
- No role/permission checks anywhere (`users.role` exists but is not enforced): `/admin/contact` and `/api/admin/*` are open to any logged-in user.
- Sessions live in the express-session MemoryStore (single process, lost on restart); `secure: false` is hard-coded on the cookie.
- `config/database.js` ignores `DB_PORT`; `ALLOWED_ORIGINS` is commented out in the template although production CORS depends on it; three geocoding variables and `PRUNE_DATABASE_BACKUPS` are undocumented in the template.
- `/api/locations` returns every location when there is no session (intended for the public map, but worth knowing).
- `/api/upload-file-data` accepts files but never parses them; `/api/download-template` always returns CSV headers.
- Legacy flat percentage columns on `MicroplasticsInSample`/`FragmentsInSample` and `SampleDetails.PackagingSampleAmount/Unit_Num` are still written; `SamplingEvent.WeatherPrecedent24` duplicates `Weather_Precedent24`.
- `SamplingEvent` and `SampleDetails` have no PRIMARY KEY (UNIQUE only); `RamanDetails` has no key at all; `MicroplasticsPolymerDetails`/`FragmentsPolymerDetails` are the only detail tables whose parent FK does not cascade.
- Retiring a reference option that real data uses needs a soft-delete (`IsActive`) plus "keep visible on samples that already use it" handling in the polymer list; not implemented (the colour drop-down already keeps a retained legacy value as a disabled option, which is the pattern to copy).

**Repository hygiene (dead or misleading files)**
- Views: `layout.ejs` (never rendered; `pageSpecificJS` locals are dead with it), empty `documentation_new.ejs`, `enter_and_edit_data_new.ejs`, `enter_data_by_file_new.ejs`, `reset_password_test.ejs`; duplicates `my_locations.ejs` (= `my_locations_fixed` + debug script), `my_locations_debug.ejs` (= `my_locations_view`), `data_forms/formpage1.ejs`, `data_forms/formpage6.ejs`; four tracked backups `data_forms/formpage5 copy.ejs.bak`, `formpage5.ejs.bak3`, `formpage5.ejs.bak_3col`, `formpage5.ejs.working`.
- JS/CSS: `dashboard.js`, `form-validation.js`, `main.js`, `map-handler.js`, `map-review.js` (review page loads only common/session scripts), `form-loader.js` and `multi-form-handler.js` (only referenced through the dead `pageSpecificJS`), `stagewise-toolbar-enhanced.js`, `form-handler.js.bak`, `form-handler.js.bak2`, `style.css`, empty `fourcolumns.css`; `public/test.html`, `test-cors.html`, `test-stagewise.html` are publicly served.
- Root: `check-all-tokens.js`, `check-password-table.js`, `create-test-token.js`, `run-5-test-cases.js`, `test-auth-fix.js`, `test-database.js`, `test-expired-token.js`, `test-server.js` (ad-hoc scripts, nothing references them), `error.log` (a pasted, stale console log), `backup_PublicationID_Num_2026-06-15T….json`, `microplastics_db_schema_flowchart_fatima.html`, `routes/api copy.js` (32 KB stale copy inside `routes/`), `scripts/create-sample-table.js` (creates tables the app never uses), `Testing/excel_verification/__pycache__/`.
- `partials/footer.ejs` links to `/pages/about` and `/pages/documentation` (both 404 — routes are `/about`, `/documentation`) and shows "Version 2.0"; `captcha_test.ejs` references a non-existent `/images/logo.png`.
- Step 5's progress label ("Particle Details") and heading ("Sample Details") disagree; the weather block lives on page 2 although a comment says otherwise.
- `database_init.sql` / `npm run init-db` are stale (§6.3).

---

## 13. Useful Commands

```bash
# development
npm install
npm run dev                          # nodemon, PORT=3001
npm start
npm test                             # 16 test files
npm run test:account-recovery        # or test:partial-dates / test:percentages / test:data-summary / test:publication / test:signup

# database (from the Mac; needs the Remote MySQL whitelist)
node scripts/backup-database.js
node scripts/update-database.js db/<migration>.sql
npm run migrate:account-recovery
node scripts/purge-data-entered-before.js --before=YYYY-MM-DD [--include-locations --include-publications] [--execute --backup=db/backups/<dump>.sql]
node scripts/check-database.js       # lists tables (its sample_data checks are legacy)

# production checks
curl -s https://entry.sweet-lab.org/api/health
curl -s https://entry.sweet-lab.org/api/references | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s).data;console.log(j.purposes.map(p=>p.Purpose_Name).join(" | "))})'

# container (on the VPS)
docker cp ~/Refactoring/<path> myapp-container:/app/<path>
docker exec myapp-container sh -c "tr -d '\r' < /app/<path> | md5sum"
docker logs --tail 20 myapp-container
docker exec myapp-container curl -s http://127.0.0.1:3000/api/health
docker commit myapp-container mp:backup-$(date +%Y%m%d)

# git
git checkout -b <topic>-YYYYMMDD && git add <files> && git commit && git push -u origin <branch> && gh pr create
```

---

## 14. Contact, Version History and Document Conventions

**Maintainer**: Wayne State University — SweetLab. Issues: in-app contact form (`/contact`) or the repository's pull requests.

### Version history

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2025-01 (last edited 2026-02-13) | Original manual after the PHP → Node.js refactor |
| — | 2026-06 → 2026-08 | Codebase changes not reflected in the manual: publications optional, partial dates, FK enforcement, unit references, signup profile, account recovery, percentage precision, ISO countries, merged fragments count, Other-polymer description, SortOrder, data purge |
| **1.1.0** | **2026-08-18** | Full rewrite against commit `2092d2a` and the 2026-08-18 schema: current routes/APIs, real schema (dropped tables removed, legacy-but-live columns marked), migrations list with deploy order, real frontend structure, testing, actual production topology and deploy runbook, data operations, known issues |

### Document conventions

- File name: `DEVELOPER_MANUAL_EN_v<major>.<minor>.<patch>_<YYYY-MM-DD>.<md|html|docx>` (e.g. `DEVELOPER_MANUAL_EN_v1.1.0_2026-08-18.docx`). Bump **minor** for content updates that track code changes, **major** for architecture changes, **patch** for corrections; the date is the authoritative "as of" marker.
- The Markdown in `docs/DEVELOPER_MANUAL_EN.md` is the source; HTML and Word are generated from it with pandoc and kept in the git-ignored `developer_manual/` folder for distribution.
- When a change alters routes, schema, migrations or deploy steps, update the manual in the same PR and bump the version.
