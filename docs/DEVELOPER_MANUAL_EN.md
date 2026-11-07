# MicroPlastics Data Entry System — Developer Manual

| | |
|---|---|
| **Document version** | 1.2.0 |
| **Date** | 2026-11-06 |
| **Supersedes** | 1.1.0 (2026-08-18) |
| **Application** | `mp-data-entry-nodejs` 1.0.0 (package.json), repository `qirenwang/Refactoring`, branch `comments-20261103` (to be merged into `main`) |
| **Verified against** | the `comments-20261103` working tree on 2026-11-06 (commit `8c5f194` plus the uncommitted 2026-11-06 batch fixes), the production schema dump `sweetl23_partner_demo_20260818_105317.sql`, and the two 2026-11-05 migrations rehearsed on local MySQL 9.4 and MariaDB 10.6 |

Version 1.1.0 was rewritten from a full audit of the code base and the live database schema. Version 1.2.0 brings it up to date with branch `comments-20261103`: the data-source redesign (eight source types, `DataSourceReference`), the PI's 25-row polymer list, the home-map colours and popups, the sidebar map entry, `DB_PORT` support, the new tests and the removal of the dead files that 1.1.0 listed. **As of 2026-11-06 the two 2026-11-05 migrations and the matching code are not yet deployed**; production still runs the 2026-08-18 state until the release in §9.6 is carried out. Legacy artefacts still present in the repository are listed in §12 so nobody has to rediscover them.

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
**Purpose**: a web application through which researchers enter, edit and review microplastics / plastic-debris sampling data (locations, sampling events, sample details, particle characterisation, data sources). It was refactored from a PHP application to Node.js; a few PHP-era compatibility endpoints remain.

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
                                               ├─ /api/*    routes/api.js       (references, locations, data sources, save/edit samples, my-samples, contact, geocode)
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
│   ├── database.js                 # mysql2 pool (DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME from the environment or .env)
│   └── session.js                  # express-session config (MemoryStore)
├── middleware/
│   └── auth.js                     # requireAuth, redirectIfLoggedIn, checkSessionTimeout
├── routes/
│   ├── auth.js                     # /auth/* – captcha, login, signup, logout, password reset, account recovery
│   ├── pages.js                    # EJS page routes
│   └── api.js                      # /api/* – ~4,660 lines, all data endpoints
├── services/
│   ├── emailService.js             # Nodemailer transport + 4 mail functions
│   └── accountRecoveryOutbox.js    # Durable, lease-based e-mail worker for password-reset mail
├── utils/
│   ├── account-recovery.js         # token hashing, AES-GCM payloads, password policy, base URL
│   ├── percentage.js               # decimal-safe percentage helpers (tolerance 0.1)
│   └── sampling-date.js            # year/month/day partial-date normalisation
├── scripts/                        # CLI tools (§10, §13): backup, migrate, purge, init (stale), check
├── db/
│   ├── 2026MMDD_*.sql              # 18 idempotent migrations (§6)
│   ├── sweetl23_partner_demo_202601181155.sql  # Jan-2026 seed dump (pre-refactor baseline)
│   └── backups/                    # scripts/backup-database.js output – git-ignored
├── views/                          # EJS pages (standalone HTML each), partials/, data_forms/ (formpage2–5)  (§7)
├── public/
│   └── css/  js/  assets/          # static files served by express.static (§7)
├── test/                           # 21 node --test files (§8)
├── Testing/                        # manual QA artefacts: bug report, Excel verification toolkit (python; pre-2026-11 table names, §12)
├── docs/                           # this manual (EN + ZH), quick starts, env template
├── img/                            # unnamed.png only – referenced nowhere, not served (§12)
├── developer_manual/               # pandoc exports of this manual – git-ignored (§14)
└── uploads/  logs/  controllers/   # empty directories
```

The dead files that 1.1.0 listed (unused views and backups, dead client scripts, `public/test*.html`, `routes/api copy.js`, root `check-*.js`/`test-*.js` scripts, `error.log`, `scripts/create-sample-table.js`, …) were deleted from the repository on 2026-11-06; `.gitignore` now also ignores `__pycache__/`.

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
| `SESSION_TIMEOUT` | middleware/auth.js, session, auth, api | seconds; `parseInt(x)*1000 \|\| 1800000` → 30 min if unset or non-numeric |
| `COOKIE_HTTP_ONLY` | config/session.js | `true` unless the literal string `false` |
| `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` | config/database.js and every script | app defaults `localhost` / `root` / `mysql` / `sweetl23_partner_demo`; `backup-database.js` has no defaults and requires `DB_NAME` |
| `DB_PORT` | config/database.js, `scripts/backup-database.js`, `scripts/update-database.js`, `scripts/purge-data-entered-before.js` | `3306` when unset; the production container must leave it unset or set `3306` (§9.5). `scripts/check-database.js` and `scripts/init-database.js` ignore it and always connect on 3306 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | services/emailService.js | port 465 → implicit TLS, otherwise STARTTLS required; transport is verified at import time |
| `ADMIN_EMAIL_1/2/3` | emailService (contact form recipients) | `ADMIN_EMAIL_1` falls back to `SMTP_USER` |
| `PUBLIC_BASE_URL` | utils/account-recovery.js | reset-link origin; derived from the request in development, **required in production** |
| `ACCOUNT_RECOVERY_ENCRYPTION_KEY` | utils/account-recovery.js | AES-256-GCM key for outbox payloads; falls back to `SESSION_SECRET`; **throws in production if both unset** |
| `ACCOUNT_RECOVERY_POLL_INTERVAL_MS` | services/accountRecoveryOutbox.js | `5000` |
| `GEOCODING_BASE_URL`, `GEOCODING_USER_AGENT`, `GEOCODING_CONTACT_EMAIL` | routes/api.js (`/api/geocode/address`) | Nominatim defaults; **not in env.template.txt** |
| `PRUNE_DATABASE_BACKUPS` | scripts/backup-database.js | when exactly `true`, deletes older dumps after a successful backup; **not in the template** |

`COOKIE_SECURE` appears in some `.env` files but is dead: `config/session.js` hard-codes `secure: false`.

`dotenv` never overrides a variable that is already set in the environment, so `DB_*` values given on the command line win over `.env`. The repository's `.env` points at the **production** database; every local run against a test database must therefore pass all five `DB_*` variables explicitly (§3.4).

### 3.2 Local development

```bash
npm install
npm run dev        # nodemon app.js on PORT (default 3001)
npm start          # node app.js
npm test           # 21 test files (122 tests), no database needed
```

The local port defaults to 3001 so it does not collide with a production-style container on 3000.

Run all four with the five `DB_*` variables pointing at a local server (§3.4). The repository `.env` points at production: `npm run dev`/`npm start` connect to it, and several test files load `routes/api.js`, which creates a mysql2 pool from it (§8).

### 3.3 Database access

- Production database: MariaDB 10.6 `sweetl23_partner_demo` on the SweetLab VPS (`DB_HOST=104.247.77.90`), `utf8mb4_unicode_ci`, pool of 10 connections.
- From a developer Mac the database is reachable **only when cPanel → Remote MySQL whitelists your current IP**. `Host … is not allowed to connect` means the IP changed (VPN, new lease, other office), not a wrong password.
- The `mysql` CLI is not required: every maintenance task is a Node script (`scripts/`). If you do use the CLI to run a migration, pass `--default-character-set=utf8mb4` (§6.1).
- Develop, test and rehearse against a local throwaway database (§3.4); production is touched only by the backup, migration and data-operation steps of a release (§9).

### 3.4 Local test databases

Two throwaway servers are used on the main dev Mac. Both are started by hand on a loopback-only port with a scratch data directory outside the repository, are never registered as system services, and are loaded from the latest `db/backups/*.sql` dump (the dump contains `CREATE DATABASE`/`USE sweetl23_partner_demo`).

| | MySQL 9.4 — everyday local DB | MariaDB 10.6 — migration rehearsal on the production engine |
|---|---|---|
| Binaries | `/usr/local/mysql/bin` (not on `PATH`; a system instance already owns 3306) | native Apple-silicon Homebrew at `/opt/homebrew`, formula `mariadb@10.6` (keg-only, but linked on this Mac, so the bare `mysqld`, `mysql` and `mysqladmin` on `PATH` are MariaDB 10.6); the init script is `/opt/homebrew/opt/mariadb@10.6/scripts/mariadb-install-db` (not on `PATH`) |
| Address | `127.0.0.1:33306` | `127.0.0.1:33307` |
| Set-up | `/usr/local/mysql/bin/mysqld --no-defaults --initialize-insecure --datadir=<scratch>/data`, then start `/usr/local/mysql/bin/mysqld --no-defaults --datadir=<scratch>/data --port=33306 --bind-address=127.0.0.1 --socket=<short dir>/mysql.sock --mysqlx=OFF`. Always type the full path: a bare `mysqld` starts MariaDB, not MySQL 9.4. macOS socket paths must stay under ~100 characters, so symlink a short `/tmp` directory to the scratch folder | initialise a scratch data directory with `/opt/homebrew/opt/mariadb@10.6/scripts/mariadb-install-db` and start `mariadbd` with `--no-defaults`, that data directory, `--port=33307 --bind-address=127.0.0.1` and a short socket path; do **not** use `brew services` (it would register a background service with the default configuration) |
| Loading a dump | replace `date NOT NULL DEFAULT current_timestamp()` with `date NOT NULL` first (a MariaDB-only default MySQL rejects) | loads unchanged |
| Why | runs the app and the browser checks | MariaDB-only behaviour (e.g. the collation failure in §6.2) only shows up here |

Rules that keep these runs away from production:

- **Always pass `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS` and `DB_NAME` explicitly** for the app, scripts and harnesses — the repository `.env` points at production and `dotenv` only fills in what is missing. Example: `DB_HOST=127.0.0.1 DB_PORT=33306 DB_USER=… DB_PASS=… DB_NAME=sweetl23_partner_demo node scripts/update-database.js db/<file>.sql`. Use a throwaway local account, never a real password. `scripts/check-database.js` and `scripts/init-database.js` ignore `DB_PORT` and always connect on 3306, so they cannot reach these two servers.
- The application pool honours `DB_PORT`, so the app itself can run against a local server. The local `.claude/launch.json` has a `sweetlab-localdb` profile that starts `node app.js` on `PORT=3001` with `NODE_ENV=development` and the five `DB_*` variables pointing at `127.0.0.1:33306`. `.claude/` is untracked but **not** git-ignored: never stage it with `git add -A`/`git add .` (it holds that profile's throwaway password and session notes). Adding `.claude/` to `.gitignore` is an open follow-up (§12).
- Logging in locally still needs the CAPTCHA, so a person types it in the browser (or use the session-stub harness in §8).
- The dumps hold real user data: keep the scratch directories outside the repository, stop the servers with `/usr/local/mysql/bin/mysqladmin … shutdown` (MySQL) and `mariadb-admin … shutdown` (MariaDB), and delete the data directories when done.

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

There is no layout file and no `pageSpecificJS` mechanism (both were removed on 2026-11-06); every rendered view hard-codes its own `<script>` tags. `/home` passes `currentPage: 'home'`, which highlights the sidebar's **Interactive Map** entry.

### 4.4 API (`routes/api.js`, ~4,660 lines)

All responses are JSON `{ success, message?, data?, errors? }`. Auth = `requireAuth`. The router has 28 registrations (the two data-source routes each answer on two paths); the tables below list all of them. Removed on this branch: `POST /api/test-save` (unauthenticated session echo), `POST /api/add-test-location-data` (seeded test rows) and a second, shadowed `GET /api/map-data`.

**Health / diagnostics**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | – | liveness; echoes `NODE_ENV`, origin, host, UA |
| GET | `/api/cors-test` | – | echoes CORS headers |

**Map**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/map-data` | – | all geolocated samples of every user with partial-date presentation, media type (`sample_type`), size-class counts (`fragments_count`, `microplastics_count`), the fragment / microplastic / total sample amounts and their `Units_Ref` codes (the home-map popup computes count ÷ amount per unit, §7.4) |
| GET | `/api/php/get_map_data.php` | – | legacy PHP-shaped payload; `?zipcode`, `?plastic_type` |

**Reference data**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/references` | – | one call: `polymers, purposes, colors, forms, methods (MethodType <> 'Count'), opacities, soilTextures, units, sizes, dataSourceTypes` plus `pubSources` (the same eight types under the pre-redesign `PubSource*` keys, kept for older clients) — every list `ORDER BY SortOrder, <ID>` (§5.4). It returns **no data-source list** |
| GET | `/api/ref/methods` | – | `Methods_Ref`; `?type`, `?appliesTo=MP\|Debris\|SoilType` |
| GET | `/api/ref/opacity`, `/api/ref/soil-texture`, `/api/ref/units` | – | single tables |

**Data sources** (`DataSourceReference`, §5.3; `/publications` is the pre-redesign alias of each path)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/data-sources`, `/api/publications` | – | **only the signed-in user's data sources**: rows they entered (`EnteredBy = me`) or that one of their own sampling events already cites; any `?scope` is ignored (the form still sends `?scope=mine`); signed out → empty list without a query. Rows carry the ten PI fields, `source_type_name`, `publication_status`, `is_mine`, and `publication_*` aliases; own entries first, newest first. There is no endpoint for the full list |
| POST | `/api/data-sources`, `/api/publications` | ✔ | create one data source; validated by the shared `validateDataSourceDetails()` (§7.2), `EnteredBy` = session user; returns `{ data_source_id, publication_id_num }` |

The listing (`listDataSources`) and the save-time check (`resolvePublicationId`) share one SQL condition, `MY_DATA_SOURCE_CONDITION`, so a source the user can see is exactly a source the user can save against.

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
| POST | `/api/save-form-data` | ✔ | create a full sample (transaction below); a data source is **mandatory** |
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

**`POST /api/save-form-data` transaction** (`api.js:1864-2380`):

```
pre-checks: validatePercentageGroups, validateNewSaveRules({ requireDataSource: true }), normalizeSamplingEventDates
BEGIN
 1. DataSourceReference  resolvePublicationId(): the selected data_source_id (400 "no longer exists" / "This data source is
                         not one of yours…" unless it passes MY_DATA_SOURCE_CONDITION), or INSERT a new row
                         (id = MAX+1 via nextTableId(), EnteredBy = session user); no data source → 400
 2. SamplingEvent        id = MAX+1; PublicationID_Num = step 1; weather → WeatherType_Ref ids; DeviceInstallationPeriod = date mode; UserSamplingID = session user
 3. SampleDetails        id = MAX+1; ~40 columns via insertFromMap() (filtered against the live schema by getTableColumns())
 4. MicroplasticsInSample (only if microplastics data present; id = MAX+1) → MicroplasticsPolymerDetails via insertPolymerDetails()
 5. FragmentsInSample     (only if fragments data present; id = MAX+1)      → FragmentsPolymerDetails
 6. detail rows via insertDetailRows(): FragmentsColor/Form/Opacity/Purposes, MicroplasticsColor/Opacity/Size/Form(shape)/Form(texture)
COMMIT → { success, samplingEventId, sampleDetailsId, publicationId, dataSourceId }   (the last two are the same id)
ROLLBACK on error → status error.statusCode || 500 (stack only in development)
```

Polymer inserts assert the schema before writing (`assertDecimalPercentageStorage`, `assertAutoIncrementColumn`, `assertPolymerOtherDescColumn`, `assertSubmittedPolymerTotal`) and read the rows back afterwards (`assertStoredPolymerDetails`).

**Edit flow** (`GET` then `PUT /api/my-samples/:id/form-data`): `buildSampleFormData()` joins `SampleDetails ⋈ SamplingEvent ⋈ DataSourceReference ⋈ Location ⋈ MediaType ⋈ WaterEnvType ⋈ Units_Ref×4` (gated on ownership), flattens to the form's snake_case keys (the data source as `data_source_id`, `data_source_type_id` and the other detail field names), then loads the two `*InSample` rows, polymer fields (`loadPolymerFieldsForForm`) and each detail group (`loadDetailRowsForForm`). `PUT` validates (`includeLegacyColumnGroups: false`; `validateNewSaveRules` **without** `requireDataSource`), then in one transaction: ownership check → `resolvePublicationId` (same ownership rule as a new sample) → `UPDATE SamplingEvent` → `UPDATE SampleDetails` → `upsertChildRow` for both `*InSample` → `replacePolymerDetails` ×2 → nine `replaceDetailRows` configs. **An omitted detail group is left untouched; an explicitly submitted `[]` clears it.** Shape and texture share `MicroplasticsFormDetails`, so both must be sent together (400 otherwise). Data source on edit: a payload without any data-source field keeps the sample's current one; a sample that has a data source cannot lose it (400 "…cannot be removed"); a legacy sample saved before data sources became mandatory may stay without one, and the response then carries `notice: 'This sample has no data source yet…'`.

`module.exports._internals` exposes the pure helpers used by the tests (`getFragmentDebrisCount`, `buildFragmentCountColumns`, `validateNumericRanges`, `validateNewSaveRules`, `validateDataSourceRules`, `getPublicationInputState`, `listDataSources`, `resolvePublicationId`, `insertPolymerDetails`, `replacePolymerDetails`, `loadPolymerFieldsForForm`, …). Data-source input is read under the new field names first, with the pre-redesign `publication_*` names as fallbacks (`DATA_SOURCE_FIELD_ALIASES`).

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

`config/database.js`: `mysql.createPool({ host, port, user, password, database, charset:'utf8mb4', connectionLimit:10 })` with `port = DB_PORT` (default 3306); exports `pool`, `testConnection()`.

`config/session.js`: `{ secret: SESSION_SECRET, resave:false, saveUninitialized:false, cookie:{ secure:false, httpOnly: COOKIE_HTTP_ONLY !== 'false', maxAge: SESSION_TIMEOUT*1000 || 30 min, sameSite: production ? 'strict' : 'lax' }, name:'sessionId' }`. **No store → MemoryStore**: sessions are per-process and lost on restart, and the app cannot be scaled horizontally without adding a store.

### 4.8 Utilities

| File | Exports | Notes |
|---|---|---|
| `utils/account-recovery.js` | `hashResetToken`, `getResetTokenCandidates`, `encryptRecoveryPayload`/`decryptRecoveryPayload` (`v1:iv:tag:ciphertext`), `isStrongPassword`, `normalizeAccountIdentifier`, `resolvePublicBaseUrl`, `buildPasswordResetUrl`, `resolveRecoveryEncryptionSecret`, messages | key fallback `ACCOUNT_RECOVERY_ENCRYPTION_KEY → SESSION_SECRET → dev constant`; throws in production without a real key |
| `utils/percentage.js` | `PERCENTAGE_DECIMAL_PLACES=4`, `PERCENTAGE_TOLERANCE=0.1`, `parsePercentage`, `sumPercentages`, `isPercentageTotalValid`, `toDatabasePercentage`, `isBlankPercentage` | the tolerance is duplicated in `form-handler.js` and `formpage5.ejs` (must stay 0.1 in all three) |
| `utils/sampling-date.js` | `normalizeSamplingEventDates`, `addPartialDatePresentation` | year / year-month / full-date components, `mode` → `DeviceInstallationPeriod`, `collection_date_display` for read APIs |

`routes/api.js` also `require`s the browser module `public/js/publication-form-utils.js` (UMD), so the data-source rules and messages exist once and are applied identically in the form and on the server (§7.2).

---

## 5. Database Schema

Source of truth: the latest dump in `db/backups/` (currently `sweetl23_partner_demo_20260818_105317.sql`, 40 tables, InnoDB, `utf8mb4_unicode_ci`) **plus the two 2026-11-05 migrations** (§6.2). This section describes the schema after those migrations; until they are deployed (§9.6), production still has `Publications` / `PubSource_Ref` and the 20-row polymer list. The migrations only rename and extend tables, so the count stays at 40. `database_init.sql` and the January-2026 seed dump are **not** current (§6.3).

### 5.1 Table inventory

| Group | Tables |
|---|---|
| Core (18) | `users`, `Location`, `DataSourceReference` (was `Publications`), `SamplingEvent`, `SampleDetails`, `MicroplasticsInSample`, `FragmentsInSample`, `MicroplasticsPolymerDetails`, `MicroplasticsColorDetails`, `MicroplasticsFormDetails`, `MicroplasticsOpacityDetails`, `MicroplasticsSizeDetails`, `FragmentsPolymerDetails`, `FragmentsColorDetails`, `FragmentsFormDetails`, `FragmentsOpacityDetails`, `FragmentsPurposes`, `RamanDetails` |
| Auth / support (4) | `password_reset_tokens`, `account_recovery_outbox`, `account_recovery_cooldowns`, `contact_submissions` |
| Reference (18) | `PolymerType_Ref`, `Purpose_Ref`, `ColorType_Ref`, `Form_Ref`, `Methods_Ref`, `Opacity_Ref`, `SoilTexture_Ref`, `Units_Ref`, `SizeClass_Ref`, `DataSourceTypeReference` (was `PubSource_Ref`) (these ten carry `SortOrder`), `Country_Ref` (249), `State_Ref` (51), `OrganizationType_Ref` (12), `MediaType_WithinLitterWaterSoil_Ref` (4), `WaterEnvType_Ref` (6), `WeatherType_Ref` (3), `Wavelength_Ref` (5), `LocType_Env-Indoor_Ref` (2, note the hyphen) |

There is no session table and no audit table.

### 5.2 Entity relationships

```
users ──< Location (UserCreated)
users ──< SamplingEvent (UserSamplingID)
users ──< DataSourceReference (EnteredBy, nullable)
DataSourceTypeReference ──< DataSourceReference (source_type_id)
Location ──< SamplingEvent (LocationID_Num)         DataSourceReference ──< SamplingEvent (PublicationID_Num → data_source_id, nullable)
SamplingEvent ──< SampleDetails (SamplingEvent_Num)
SampleDetails ──< MicroplasticsInSample ──< Microplastics{Polymer,Color,Form,Opacity,Size}Details
SampleDetails ──< FragmentsInSample     ──< Fragments{Polymer,Color,Form,Opacity}Details, FragmentsPurposes
SampleDetails ──< RamanDetails
users ──< password_reset_tokens ──< account_recovery_outbox
```

Delete rules: parent links from `SamplingEvent`/`SampleDetails`/`*InSample` upward are RESTRICT; the Color/Form/Opacity/Size/Purposes detail tables cascade from their `*InSample` parent, **but the two `*PolymerDetails` tables do not** (RESTRICT). Reference FKs are RESTRICT except `Opacity_Ref` and `SizeClass_Ref` links, which cascade. `password_reset_tokens` and `account_recovery_outbox` cascade from `users`/tokens. Data sources: `FK_Event_Publication` (SamplingEvent → DataSourceReference) is ON UPDATE CASCADE and restricts deletes; `FK_DataSource_SourceType` has no `ON UPDATE`/`ON DELETE` clause, so a referenced type can be neither renumbered nor deleted (MySQL refuses a CHECK constraint on a column whose FK cascades, and the eight type IDs never change); `FK_DataSource_EnteredBy` is ON UPDATE CASCADE, ON DELETE SET NULL. Deleting sample data therefore has to go bottom-up (this is what `scripts/purge-data-entered-before.js` does).

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

**DataSourceReference** (was `Publications`; renamed and extended by `20261105_redesign_data_source_tables.sql` to the PI's ten-field structure; the PI's column names are used verbatim because the team browses the tables in phpMyAdmin) — PK `data_source_id` (was `PublicationUniqueID`; application-assigned MAX+1 via `nextTableId()`).

| Column | Type | Meaning |
|---|---|---|
| `source_type_id` → `DataSourceTypeReference` | int NOT NULL | was `PubSource_Code`; 1–4 Published, 5–8 Unpublished (§5.4) |
| `authors_or_organization` | mediumtext NULL | was `Authors`; authors (First Last; …) or the responsible organisation |
| `publication_year` | int NULL | was `Year`; required for types 1–4, must be NULL for types 5–8 |
| `source_title` | varchar(500) NOT NULL | article / book / report / dataset / project title; migrated rows were back-filled from the title segment of the APA citation, else the whole citation, else the journal, else `Untitled source` |
| `journal_publisher_or_repository` | mediumtext NULL | was `Journal` |
| `source_identifier_or_url` | varchar(500) NULL | DOI, ISBN, report number, dataset ID or URL |
| `project_or_collection_name` | varchar(255) NULL | associated project or collection |
| `date_accessed` | date NULL | required for type 4 (Public Database or Data Repository), must be NULL otherwise |
| `citation_text` | mediumtext NULL | was `FullCitation_APA`; complete APA citation |
| `PubSource_Legacy` | mediumtext NULL | the pre-2026-11 `PubSource_Ref` code of migrated rows (appended as ` [PubSource_Ref n]` when the column already held a different value); NULL on new rows |
| `EnteredBy` → `users` | int NULL | who entered the source; drives the per-user reuse list. Migrated rows were back-filled when every event citing the source belongs to one user; otherwise NULL |
| `DateEntered` | date NOT NULL default now | |

CHECK constraints (the PI's rules, MariaDB syntax): `chk_publication_year` — `(source_type_id IN (1,2,3,4) AND publication_year IS NOT NULL) OR (source_type_id IN (5,6,7,8) AND publication_year IS NULL)`; `chk_date_accessed` — `(source_type_id = 4 AND date_accessed IS NOT NULL) OR (source_type_id <> 4 AND date_accessed IS NULL)`. Authors/organisation, journal/publisher/repository and the citation are nullable in the database but required by the application for every new data source (§7.2).

**DataSourceTypeReference** (was `PubSource_Ref`) — PK `source_type_id` (was `PubSourceUniqueID`; 1–8, fixed), `SortOrder` (10–80), `source_type_name` varchar(100) NOT NULL (was `PubSourceLabel`), `publication_status` varchar(20) NOT NULL with CHECK `chk_source_type_publication_status` (`'Published'` / `'Unpublished'`), `description` varchar(255) NOT NULL (was `PubSourceDescription`), `DateEntered`. The eight rows are listed in §5.4.

**SamplingEvent** — **no primary key**, UNIQUE `SamplingEventUniqueID` (application-assigned MAX+1).

| Column | Type | Meaning |
|---|---|---|
| `LocationID_Num` → `Location` NOT NULL; `PublicationID_Num` → `DataSourceReference.data_source_id` NULL; `UserSamplingID` → `users` NOT NULL | | `PublicationID_Num` kept its pre-redesign name; the application requires it on every new sample, NULL survives only on legacy samples |
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
| `PolymerType_Ref` (25, the PI's 2026-11 list) | `Polymer_Code` (UNIQUE), `Polymer_AltCodes` (PI alternates such as PETE, PE-HD, PE-LD, PUR, MULTI — display only), `Polymer_FullName`, `RecycleCode` (1–6 on PET … PS, NULL elsewhere), `Category`, `CommonApplications`, `ClassificationNotes`. Codes in PI order: PET, HDPE, PVC, LDPE, PP, PS, ABS, CA, EVA, PAN, PA, PBT, PC, PE, PMMA, PTFE, PU, SAN, MIX, OTHER, UNKNOWN, BITUMEN, RUBBER, RTB, OSM | migration `20261105_polymer_table_v2.sql`. IDs are not contiguous: continuing rows keep theirs (1–8, 10, 11, 14, 17–20; PETE became PET in place), the ten new rows got MAX+1. The retired PLA, PB, PE_UHMW, HIPS, EPS are deleted when no polymer-details row references them, otherwise kept at `SortOrder` 1010–1050 and marked "Legacy option" in `ClassificationNotes` |
| `DataSourceTypeReference` (8) | Published: 1 Journal Article, 2 Book or Conference Publication, 3 Government or Technical Report, 4 Public Database or Data Repository; Unpublished: 5 Research or Laboratory Data, 6 Government or Industry Data, 7 Community-Collected Data, 8 Citizen Science or Personal Collection Data | the IDs are hard-coded in `publication-form-utils.js` and the CHECK constraints (§5.3): adding or renumbering a type is a code + migration change, not a data edit |
| `Purpose_Ref` (7) | `single_use`, `multi_use`, `consumer_product`, `bag_container`, `packing`, `other_purpose`, `unknown_purpose`; `Purpose_Name` UNIQUE | names were edited to the PI's wording after the seed dump |
| `ColorType_Ref` (13) | `Color_Set` = `Simple` (4, legacy MP set) / `Detailed` (9 incl. `other_mixed`) | the form offers only `Detailed`; a legacy `Simple` value is kept as a disabled option on edit |
| `Form_Ref` (8) | flags `AppliesTo_MP_Shape`, `AppliesTo_Texture`; `Other_Mixed` applies to both | |
| `Methods_Ref` (13) | `MethodType` Polymer / Count / Percent / SoilTexture with `AppliesTo_MP/Debris/SoilType` flags | `Count` rows are excluded from `/api/references` |
| `Opacity_Ref` (4), `SoilTexture_Ref` (12, USDA classes), `Units_Ref` (3: L, g, km2), `SizeClass_Ref` (5) | | |
| `Country_Ref` (249, ISO 3166-1, `ISOAlpha2`; id 1 = United States), `State_Ref` (51), `OrganizationType_Ref` (12) | signup/profile | |
| `MediaType_WithinLitterWaterSoil_Ref` (4), `WaterEnvType_Ref` (6), `WeatherType_Ref` (3), `Wavelength_Ref` (5), `LocType_Env-Indoor_Ref` (2) | | |

**Display order is data, not code.** The ten tables served by `/api/references` carry `SortOrder INT NOT NULL DEFAULT 0` (migration `20260817_add_reference_sort_order.sql`) and every list on the form is rendered in `ORDER BY SortOrder, <ID>`:

- regular options count in tens (10, 20, 30, …) so a new option can be slotted between neighbours;
- catch-alls are pinned high: `Other …` = 900, `Unknown` = 990, so they always close a list — **except** in `PolymerType_Ref`, which follows the PI's numbered list (`SortOrder` = PI No. × 10, 10–250, so Other Polymer = 200 and Unknown Polymer = 210 sit inside the list on purpose);
- Purposes follow the PI's datasheet order (Products one time → Products multiple times → Other durable goods → Bag → Packing → Other → Unknown); data-source types are 10–80 in ID order; the other tables keep their historical order.

To reorder or add an option no code changes: `UPDATE Purpose_Ref SET SortOrder = 35 WHERE Purpose_Code = '…';` or `INSERT INTO PolymerType_Ref (Polymer_Code, Polymer_FullName, RecycleCode, Category, CommonApplications, ClassificationNotes, SortOrder) VALUES ('PEEK', 'Polyether ether ketone', NULL, 'Plastic polymer', '…', '…', 165);`. Never renumber IDs — sample rows reference them. On the AUTO_INCREMENT tables (`PolymerType_Ref`, `Purpose_Ref`, `ColorType_Ref`, `Form_Ref`, `SizeClass_Ref`) leave the ID to the database; the others need an explicit unused ID (MAX+1). A row left at `SortOrder = 0` sorts **first**, on purpose, as a reminder to assign a value. `Polymer_Code` doubles as the form field suffix — lower-cased, non-alphanumerics replaced by `_` (`mp_polymer_pet`, `fragment_polymer_pet`) — so it must stay unique after that normalisation; the code `OTHER` (normalised `other`) is special-cased in the application (it gets the "Describe the other polymer(s)" box) and must not be renamed. `Polymer_AltCodes`, `ClassificationNotes` and `CommonApplications` are shown as the polymer row's hover text on form page 5.

Removing an option: `DELETE` works only while no sample row references it (RESTRICT FKs) — this is how the polymer v2 migration retires the five dropped polymers, which is why the 2026-11 release purges old sample data before running it (§9.6). Once real data references an option, retire it with a soft-delete flag plus "keep it visible on samples that already use it" logic instead of deleting — that logic does not exist yet (see §12).

---

## 6. Migrations

### 6.1 How migrations work

- One SQL file per change in `db/`, named `YYYYMMDD_description.sql`, applied with `node scripts/update-database.js db/<file>.sql` (the runner refuses paths outside `db/` or without `.sql`, connects with `charset: 'utf8mb4'`, executes the file as a single multi-statement query, stops at the first error, and does not print `SELECT` results — run the pre-flight/post-check queries by hand, e.g. in phpMyAdmin, if you want to see them). If you must use the `mysql`/`mariadb` CLI instead, pass `--default-character-set=utf8mb4`: a latin1 connection fails mid-way on the `COLLATE utf8mb4_unicode_ci` clauses of `20261105_redesign_data_source_tables.sql`.
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
| `20260817_add_reference_sort_order.sql` | `SortOrder` on the ten reference tables + back-fill (§5.4). **Do not re-run after the next migration**: it still targets `PubSource_Ref` and fails once that table is renamed | **migration first**, then `routes/api.js` |
| `20261105_redesign_data_source_tables.sql` ("T1") | data-source redesign, details below | **migration first, code in the same maintenance window** (§9.6) |
| `20261105_polymer_table_v2.sql` ("T3") | the PI's 25-row polymer list, details below | after T1 and the deploy-day purge; then code (§9.6) |

The first sixteen have been applied to production (last on 2026-08-18). **The two 2026-11-05 migrations are not yet applied** (as of 2026-11-06); run them in the order T1 → purge → T3 given in §9.6, not in file-name order.

**`20261105_redesign_data_source_tables.sql` (T1)** — PI request Comments-20261103; every step is guarded, so a re-run is a no-op.
1. Self-check before any change: if a data source that is or will be on a Published type (1–4) has no year, the run aborts with `Table '<db>.ABORTED - type 1-4 data source has no Year - fill Year first' doesn't exist` (the file selects from a non-existent table because `SIGNAL` needs a stored program). On the current production schema `Publications.Year` is `INT NOT NULL`, so this only guards a NULL-able year column (e.g. after an earlier failed run).
2. `RENAME TABLE PubSource_Ref → DataSourceTypeReference`, `Publications → DataSourceReference` (data and incoming FKs survive).
3. Legacy type remap (once, while `PubSource_Code` still exists): old 1 Peer-reviewed publication → 1 Journal Article; old 2 Federal, 3 State/provincial, 4 Local/regional, 5 NGO and 6 Other → 3 Government or Technical Report. The old code is kept in `PubSource_Legacy`. Old type-6 rows must be **reviewed by hand** afterwards: `SELECT * FROM DataSourceReference WHERE PubSource_Legacy = '6' OR PubSource_Legacy LIKE '%[PubSource_Ref 6]';` (mind the CHECK rules when you change their type).
4. Column renames/additions to the ten PI fields plus `PubSource_Legacy` and `EnteredBy` (§5.3); `source_title` back-filled, then made NOT NULL; `EnteredBy` back-filled from `SamplingEvent.UserSamplingID`.
5. The six type rows are rewritten in place to the PI's types 1–6 (`SortOrder` = ID × 10), 7–8 inserted, `publication_status` added.
6. FKs: `FK_DataSource_SourceType` (no `ON UPDATE`/`ON DELETE` clause), `FK_DataSource_EnteredBy` (→ `users`, ON UPDATE CASCADE ON DELETE SET NULL), and `FK_Event_Publication` dropped and re-created identically around the parent-column rename (ON UPDATE CASCADE) so the rename behaves the same on MariaDB 10.6 and MySQL 8+.
7. CHECKs `chk_publication_year`, `chk_date_accessed`, `chk_source_type_publication_status`; a pre-check `SELECT` shows violating rows (expect zero).

Collation: the non-breaking-space variable used by the `source_title` back-fill is declared `CONVERT(X'C2A0' USING utf8mb4) COLLATE utf8mb4_unicode_ci`. Without the `COLLATE`, MariaDB 10.6 stops with "Illegal mix of collations … for operation 'replace'" after the renames, leaving the database half-migrated; MySQL 9.4 does not reproduce it. This was proven on 2026-11-06 by running the unfixed file against a MariaDB 10.6.28 copy of the 2026-08-18 dump; the fixed file then passed the full release sequence (backup → T1 → purge → T3, then T1 and T3 re-run) on MariaDB 10.6, and T1 → T3 → T1 re-run on MySQL 9.4 (§3.4). The abort of the self-check was also confirmed on MariaDB (year set to NULL → stop before any change, schema unchanged).

The old `routes/api.js` reads `PubSource_Ref` / `Publications` and fails with "Table … doesn't exist" against a migrated database; the new `routes/api.js` fails the same way against an un-migrated one — hence one maintenance window for both.

**`20261105_polymer_table_v2.sql` (T3)** — replaces the 20-row list with the PI's 25 rows.
- Adds `Polymer_AltCodes`, `CommonApplications`, `ClassificationNotes`.
- Updates the 15 continuing rows **in place** (matched by old or new code, only while `CommonApplications` IS NULL), so their `PolymerUniqueID` — the FK target of both polymer-details tables — never changes. Only PETE → PET changes a form field name (`mp_polymer_pete` → `mp_polymer_pet`); Rubber/Bitumen/Other only change case, which the field-name normalisation ignores. `PolymerType_Legacy = 'PETE'` snapshots on saved detail rows are rewritten to `'PET'`, because the edit-sample loader refuses a snapshot that disagrees with its reference code.
- Inserts CA, PBT, PE, PTFE, PU, SAN, MIX, UNKNOWN, RTB, OSM with MAX+1 IDs, each skipped if its code exists.
- `SortOrder` = PI No. × 10; `RecycleCode` 1–6 on PET … PS, NULL elsewhere.
- Deletes PLA, PB, PE_UHMW, HIPS, EPS only when no `FragmentsPolymerDetails` / `MicroplasticsPolymerDetails` row references them; a referenced one is kept at `SortOrder` 1010–1050 and stays selectable. In the 2026-08-18 backup all five are still referenced (events 197–200), hence the purge before T3 in §9.6.
- Post-check: `SELECT COUNT(*) FROM PolymerType_Ref` = 25 when all five were deleted. The new list appears on the form immediately (the API reads it per request); deploy `data-summary-utils.js`, `form-handler.js` and `routes/api.js` from the same commit for the label polish, hover help and CSV template header.

### 6.3 Bootstrap files — status

- **`database_init.sql`** (repo root, run by `npm run init-db`): a June-2025 phpMyAdmin dump that was partly hand-edited. It still creates the dropped `PackagesInSample`, lacks all ten detail tables (`FragmentsPurposes` included), `DataSourceReference` (or its old name `Publications`), `contact_submissions` and nine of the ten `SortOrder` reference tables (`PolymerType_Ref` and `DataSourceTypeReference` among them; only `Units_Ref` is there), has no `SortOrder`, and declares `Location.UserCreated` as text. **A database built from it cannot serve the current application.** Regenerating it from the migrated schema is an open follow-up (§12). `scripts/init-database.js` additionally prints a success banner about tables and users it does not create. Treat both as legacy.
- **`db/sweetl23_partner_demo_202601181155.sql`**: the January-2026 pre-refactor snapshot (26 tables, package family, no publications/methods/opacity/etc.). Useful as a migration-rehearsal fixture; not a deployment artefact.
- **To stand up a fresh, current database**, restore the latest `db/backups/*.sql` dump (it contains `CREATE DATABASE`/`USE` and every table) and apply any migration newer than the dump (for the 2026-08-18 dump: T1, then T3) — do not use `init-db`.

---

## 7. Frontend Architecture

### 7.1 Pages are standalone

There is **no layout file**. Every route renders a self-contained EJS file with its own `<head>`, CSS links and `<script>` tags, and includes `partials/header.ejs` (logo, title, user menu), `partials/sidebar.ejs` (Interactive Map → `/home` / Review Data / Enter and Edit Data / Documentation / About), `partials/timeout_modal.ejs` and, on a few pages (`about`, `captcha_test`, `enter_data_by_form`, `error`), `partials/footer.ejs`. Adding a page therefore means copying an existing page's skeleton (see §11).

Views (every file in `views/` is live): `home`, `login`, `signup`, `about`, `documentation`, `review`, `contact`, `enter_and_edit_data`, `enter_data_by_form`, `enter_data_by_file`, `my_locations_fixed`, `my_locations_view`, `my_samples`, `my_profile`, `admin-contact`, `reset_password`, `reset_password_expired`, `captcha_test`, `error`; partials `header`, `sidebar`, `timeout_modal`, `footer`, `detail_percent_rows`; form pages `data_forms/formpage2.ejs` … `formpage5.ejs`.

Stagewise dev toolbar (`stagewise-toolbar.js`) is referenced by 14 views: 10 load it inside `<% if (process.env.NODE_ENV !== 'production') %>`, and 4 (`login`, `signup`, `reset_password`, `reset_password_expired`) have it switched off with `if (false && …)`.

### 7.2 The data-entry wizard (`views/enter_data_by_form.ejs` + `views/data_forms/`)

Progress-bar labels vs page headings:

| Step | Progress label | Page heading | Source | Collects |
|---|---|---|---|---|
| 1 | Location | Location Information | inline in `enter_data_by_form.ejs` | either an existing location (`location_id`) or a new one: name, short code, description, lat/long via Leaflet map, acres, street/city/state/country with **Find Address on Map** (`/api/geocode/address`), or ZIP only |
| 2 | Sampling Event | Sampling Event Information | `formpage2.ejs` | `device_installation_period` (no/yes); start date as `start_year` (required) + optional `start_month`/`start_day`; end date components shown only for device periods; `sample_time`, `sample_description`; **Data Source** section (mandatory, see below); weather (`air_temp`, `current_conditions`, `rainfall`) |
| 3 | Media Information | From what media did you collect plastic? | `formpage3.ejs` | `media_type`: water (+ `water_type`, other description), soil_sediment (+ `sediment_type`), in_soil, soil_litter, mixed_composite (+ description) |
| 4 | Additional Information | Additional Sampling Information | `formpage4.ejs` | `additional_info` yes/no gating one media-specific block: water measurements, sediment/soil depth-weight-organic-texture (+ texture method), surface area/permeability, mixed notes |
| 5 | Particle Details | Sample Details | `formpage5.ejs` | `has_quantitative_data`; `total_sample_amount` + `sample_unit`; **counts** `microplastics_count`, `fragments_count`; **Microplastics Details** (mass, polymer-ID method, percent-estimate method, detail sections Size Classes / Color Types / Opacity Types / Shapes / Textures, dynamic polymer list); **Fragments Details** (mass, methods, sections Purposes / Color Types / Textures / Opacity Types, dynamic polymer list) |
| 6 | Confirmation | Review and Submit | inline `<template id="template-form-page6">` | Data Summary (`generateSummary()`), `additional_notes`, **Save and Continue**, then next-step buttons A) new location/date, B) different media type, C) additional sample, D) new case, same data source |

**Loading**: pages 2–5 are server-rendered once into hidden `<template id="template-form-pageN">` elements; `loadAndAppendNextPage(n)` clones and appends them progressively (all pages stay in the DOM), then runs the page's `updatePageNContent()`. Revisiting a page calls `updateExistingPageContent()`.

**State**: one `formData` object mirrored into `sessionStorage['microplastics_form_data']`; data-source carry-forward per location in `sessionStorage['microplastics_publication_by_location']` (key name unchanged); `window.resetInMemoryFormData()` clears the in-memory copy so a reload cannot resurrect stale values. Pre-redesign `publication_*` keys found in either store are migrated to the new field names on load (`migrateLegacyDataSourceFields`).

**Reference lists**: `initializeReferenceData()` fetches `/api/references` and `/api/data-sources?scope=mine` once, then `populateReferenceDrivenControls()` fills unit/soil-texture/method selects and the data-source type select, `populatePublicationControls()` fills the "Select Existing Data Source" list, `restoreDetailRowsFromFormData()` rebuilds detail rows, and `loadPolymerOptions()` renders one percentage input per polymer into `#mp-polymer-dynamic-container` / `#fragment-polymer-dynamic-container` in `SortOrder` (field names `mp_polymer_<code>` / `fragment_polymer_<code>` with the normalised code; each label's hover text shows the polymer's alternate codes, classification note and common sources; the OTHER row gets a "Describe the other polymer(s)" box `<prefix>other_specify`, shown only while Other has a value). `mapReferenceOptions()` applies the per-list rules (Detailed colours only, shape/texture flags, retained legacy value kept as a disabled option). Detail rows (`partials/detail_percent_rows.ejs`) are `select + percentage + remove`, with duplicate options disabled across sibling rows and a live `Total: N%` badge.

**Data Source section (page 2, `formpage2.ejs` + `form-handler.js` + `publication-form-utils.js`)**. Every new sample must name its data source.

- **Select Existing Data Source** (`data_source_id`): lists only the user's own previous sources (`GET /api/data-sources`). Choosing one autofills every detail field and **locks** them (read-only / disabled, `is-autofilled`); choosing "-- Enter a new data source --" clears and unlocks them.
- **Step 1: Source type** (`data_source_type_id`, required): the eight `DataSourceTypeReference` rows grouped Published / Unpublished; the help text shows the chosen type's status and description. Step 2 stays hidden until a type is chosen (or a source is reused).
- **Step 2: Source details**:

| Field | Required | Rule |
|---|---|---|
| `source_title` | yes | ≤ 500 characters |
| `authors_or_organization` | yes | authors "First Last; …" or an organisation |
| `publication_year` | types 1–4 only (row hidden otherwise) | four digits, 1900 ≤ year ≤ current **UTC** year + 1 (in-press work); must be blank for types 5–8 |
| `date_accessed` | type 4 only (row hidden otherwise) | valid `YYYY-MM-DD`; must be blank for other types |
| `journal_publisher_or_repository` | yes | |
| `source_identifier_or_url` | no | ≤ 500 characters |
| `project_or_collection_name` | no | ≤ 255 characters |
| `citation_text` (Full Citation, APA) | yes | |

The rules and messages live once in `public/js/publication-form-utils.js` (UMD: `window.PublicationFormUtils` in the browser, `require`d by `routes/api.js`): `validateDataSourceDetails()` for a new source, `validateDataSourceSelection()` for the page/submit checks, `getSourceTypeRules()` for which fields apply, and `normalizeDataSourcePayload()`, which drops a year or access date the chosen type does not allow (e.g. typed before switching type) instead of rejecting it. The checks run on page 2's Continue, in the page-6 summary's missing-items list, before submit, and again on the server, with identical wording. The database CHECKs (§5.3) are the last line of defence. After a save, **Option A (new location/date)** clears the form and unlocks the data-source fields so a different source can be chosen or entered; **Option D** keeps only the data-source fields.

**Validation**: numeric guards (`min=0`, percent `max=100`), partial-date validation via `PartialDateUtils`, data-source rules (above), per-group "Current Total" banners for the polymer lists (green at 100 ± 0.1, red above, grey "stored total" for untouched groups in edit mode), and a capture-phase interceptor on page 5's Continue button that lists any percentage group off 100 %.

**Edit mode** (`/enter_data_by_form?editSampleId=N`): the form is locked, `GET /api/my-samples/N/form-data` replaces `formData`, pages 2–6 are force-loaded, reference data must load (hard failure otherwise), the button becomes **Update Data**, and `captureEditPercentageSnapshots()` records the loaded groups so `buildSubmissionPayload()` can **omit untouched percentage groups from the `PUT`** — a legacy record whose stored totals are not 100 % is neither rewritten nor rejected unless the user edits that group. The sample's own data source is shown (and kept selectable even if the reuse list lacks it); a data source is required when the sample already had one (`isDataSourceRequired()`), while a legacy sample saved without one shows a notice and can still be saved — any data-source input it gets must be complete. Save = `PUT /api/my-samples/N/form-data`, then redirect to `/my-samples`.

### 7.3 Client-side modules (`public/js/`)

| File | Lines | Used by | Purpose |
|---|---|---|---|
| `form-handler.js` | 6,514 | enter_data_by_form | the wizard engine (state, navigation, reference lists, data source, detail rows, polymer lists, validation, save/edit, summary, next steps) |
| `data-summary-utils.js` | 221 | enter_data_by_form, tests | UMD `DataSummaryUtils` (particle summary, labels; `formatPolymerName` shows word codes such as OTHER/UNKNOWN/RUBBER by their full name alone) |
| `partial-date-utils.js` | 181 | form, home, my_samples, tests | UMD `PartialDateUtils` (leap years, precision, formatting, ordering) |
| `publication-form-utils.js` | 363 | enter_data_by_form, **routes/api.js**, tests | UMD `PublicationFormUtils`: the shared data-source rules and messages, legacy-key migration, select/autofill/lock helpers (§7.2) |
| `map-data-entry.js` | 266 | enter_data_by_form | Leaflet map + draggable marker for step 1 |
| `map-home.js` | 341 | home, tests | public sample map: media-type colours, legend, concentration popups (§7.4) |
| `enter-and-edit-map.js` | 172 | enter_and_edit_data | landing-page map |
| `my-locations.js` | 756 | my_locations_fixed | `MyLocationsManager`: grid/list, pagination, search, modal map, save/delete |
| `session-timeout.js` | 204 | 10 views | polls `/api/check-session` every 30 s, shows the timeout modal |
| `auth.js` | 399 | login, signup, captcha_test | auth forms + captcha refresh |
| `fancy-modal.js` | 313 | enter_data_by_form, my_profile | `FancyModal`, `fancyConfirm/fancyAlert`, progress/success/error helpers |
| `common.js` | 186 | most pages | shared bootstrap helpers |
| `file-upload.js` | 342 | enter_data_by_file | drop-zone UI |
| `app.js` | 188 | via footer partial | jQuery helpers (jQuery not loaded on all of those pages) |
| `stagewise-toolbar.js` | 827 | 10 views (non-production; 4 more disabled) | dev toolbar |

Every file in `public/js/` is loaded by a live page; the dead scripts listed in 1.1.0 were deleted.

CSS: `mp_style.css` (3,553 lines, main; the unused `.legend-marker.red/.blue/…` colour classes were removed — marker colours come from `map-home.js`), `auth-pages.css` (login/signup/reset), `fancy-modal.css`, `auth.css` (only captcha_test). Assets: `public/assets/` (logo, two home GIFs, favicon).

### 7.4 Home map (`views/home.ejs` + `public/js/map-home.js`)

`/home` is public. `initHomeMap()` draws a Leaflet/OpenStreetMap map centred on the Great Lakes and fetches `GET /api/map-data` (all users' geolocated samples), one circular marker per sample, then fits the view to the markers.

- **Colour = sampling medium, never severity** (field users read the old red/orange hash colours as a heat scale). `MEDIA_TYPE_COLORS`: In Water `#1E90FF`, In Soil/Sediment `#5C4033`, On Soil `#D8B14A`, Mixed Media `#888888`; any other or missing `MediaTypeOverall` → `#666666` ("Other / Unspecified"). Matching ignores case and stray whitespace (`normalizeMediaTypeKey`).
- **Legend** is built from the same palette (`buildLegendEntries` → `updateMapLegend`): only the media types present in the data, in fixed order, unknown last. `home.ejs` only ships a "Loading map data…" placeholder.
- **Popup**: media type, location name, two concentration lines, coordinates and the collection date (partial dates via `PartialDateUtils`). `formatConcentration()` computes count ÷ sample amount per size class:
  - `Plastic fragments (>5mm)` uses `FragLargerThan5mm_Count` with `FragmentsSampleAmount` + its unit; `Microplastics (<5mm)` uses `Micro5mmAndSmaller_Count` with `MicroplasticsSampleAmount` + its unit;
  - when the class amount is missing or ≤ 0, `TotalSampleAmount` + `SampleUnit_Num` is used instead; when the class amount is usable but has no unit, the total's unit is borrowed;
  - no count → `Not analyzed`; a count but no usable amount → `<n> particles (no sample amount recorded)`; an amount with no unit anywhere → `<value> per sample amount (unit not recorded)`;
  - values ≥ 10 are rounded to whole numbers with thousands separators, smaller values keep two significant digits; unit suffixes `/L`, `/g`, `/km²`.
- **Every text value in the popup is HTML-escaped** (`escapeHtml`: media type, location name, concentration lines, date): location names are free text from any signed-in user and the page is public.
- The pure helpers are exported under Node for `test/map-home-colors.test.js` and `test/map-home-concentration.test.js`.

---

## 8. Testing

Node's built-in runner, no database required (fake connections / pure helpers; the route tests swap `config/database` for a recording pool through `require.cache`):

```bash
npm test                      # all 21 files, 122 tests (~3 s)
npm run test:partial-dates    # or test:percentages, test:data-summary, test:publication, test:account-recovery, test:signup
node --test test/data-source-ownership.test.js
```

The `test` script in `package.json` lists every file explicitly, so **add a new test file to that list** or `npm test` will not run it.

No test needs a database, but five files (`data-source-redesign`, `data-source-ownership`, `fragment-count-and-numeric-range`, `other-polymer-description`, `publication-ui`) `require('../routes/api')` without stubbing `config/database`, and that module builds a mysql2 pool from `.env`, which points at production. Run the suite with the five `DB_*` variables pointing at a local server (§3.4), e.g. `DB_HOST=127.0.0.1 DB_PORT=33306 DB_USER=… DB_PASS=… DB_NAME=sweetl23_partner_demo npm test`.

| File | Covers |
|---|---|
| `account-recovery.test.js`, `account-recovery-outbox.test.js`, `email-account-recovery.test.js` | identifier normalisation, token hashing, outbox lease/claim, mail content |
| `signup.test.js`, `user-profile-route.test.js`, `user-profile-view.test.js` | required fields, ISO country set, profile round-trip |
| `partial-date-utils.test.js`, `sampling-date-api.test.js`, `partial-date-integration.test.js` | leap years, precision, single vs device-period rules, form uses six components |
| `percentage-utils.test.js`, `data-summary-utils.test.js` | decimal percentages, summary completeness |
| `publication-ui.test.js` | data-source form: option labels, autofill/lock/unlock, mandatory type select + detail block, type rules (year 1–4, access date 4), identical form/API messages, journal and APA citation required, year 1900 … next UTC year, legacy-edit rules, legacy session-key migration, payload normalisation, script load order |
| `data-source-redesign.test.js` | year/access-date rules per type, required fields, `publication_*` aliases, new samples need a data source while legacy edits do not, T1 migration (renames, kept `PublicationID_Num`, CHECKs), list limited to own/cited sources |
| `data-source-ownership.test.js` | save-time ownership (own and cited-by-own-event accepted, another user's rejected, missing id → "no longer exists"), list and save share one condition, `GET /api/data-sources` only the user's own whatever `?scope`, empty when signed out; `add-test-location-data` and `test-save` return 404 |
| `polymer-table-v2.test.js` | T3 migration: `SortOrder` = No. × 10, guarded in-place updates, PETE → PET snapshots, MAX+1 inserts, guarded deletes, 25 distinct field names, polymer labels and summary order |
| `fragment-count-and-numeric-range.test.js`, `other-polymer-description.test.js` | merged fragments count, negative-number guard, Other-polymer description persistence |
| `reference-sort-order.test.js` | API orders every reference table by `SortOrder`; `/api/references` does not read the data-source list; migration covers each table; Purposes/Other/Unknown order |
| `map-home-colors.test.js`, `map-home-concentration.test.js` | fixed media-type palette, case-insensitive matching, legend content/order, no placeholder legend in `home.ejs`; concentration maths, unit fallbacks, number formatting |
| `migration-runner.test.js` | runner path rules |

Manual/UI verification patterns that have worked:
- run the real app against a local restored dump with explicit `DB_*` variables (§3.4, `sweetlab-localdb` profile) and log in through the browser;
- mount `routes/api.js` on a bare express app with a hand-built pool pointed at a local dump (stub `config/database` via `require.cache`), for endpoint checks with `curl`;
- for an unattended page check, a preload shim that stubs `express-session` (auto-login) opens the auth-gated form without the CAPTCHA;
- rehearse every migration on a MariaDB 10.6 copy before production (§3.4).

`Testing/excel_verification/` holds the Python toolkit that compared the PI's Excel workbook against a dump (2026-08-04); it still uses the pre-2026-11 table names and polymer codes (§12).

---

## 9. Deployment

### 9.1 Production topology (as actually run)

| Item | Value |
|---|---|
| Host | InMotion cPanel VPS `vps86226.inmotionhosting.com` (104.247.77.90), CSF firewall |
| Public URL | `https://entry.sweet-lab.org` (Apache reverse proxy → container port 3000); `http://104.247.77.90:3000` also answers |
| Container | `myapp-container`, app at `/app`, `PORT=3000`, `NODE_ENV=production`; started by hand from a locally built image (the repo's `docker-compose.yml` with `container_name: mp-data-entry` is a reference, not what is running); a nodemon-style watcher restarts the app when files under `/app` change |
| Database | MariaDB 10.6 on the VPS host, reached from the container as `host.docker.internal` (172.17.0.1); CSF must allow `tcp\|in\|d=3306\|s=172.17.0.0/16` and `tcp\|out\|d=3000\|d=172.17.0.0/16`, and `DOCKER="1"` in `csf.conf` |
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
- `public/js/publication-form-utils.js` is both a browser script and a server module (`routes/api.js` `require`s it). A change to it changes server-side validation, so deploy it together with `routes/api.js`; browsers still need a hard refresh.
- SQL files are never copied into the container; migrations run from the Mac (§6.1).
- `docker cp` only adds or overwrites. A file the release **deletes** stays in the container (and, under `public/`, stays publicly served) until you remove it there: `docker exec myapp-container rm -f /app/<path>`. List them with `git diff --name-status --diff-filter=D <deployed commit> -- routes public views`.
- After a deploy, verify from outside: `curl https://entry.sweet-lab.org/api/health` and, for reference changes, `/api/references`.
- Rollback = copy the previous version of the file back (`git show HEAD~1:routes/api.js > /tmp/old.js`) with the same two commands. If a container is stopped or the daemon restarted, `unless-stopped` will not restart a manually stopped container — `docker start myapp-container`.
- Firewall gotcha (2026-08-15 outage): a CSF flush deletes Docker's iptables chains. Fix order is `csf -ra` **then** `systemctl restart docker`; a `docker restart` alone does not recreate the chains.

### 9.3 Standard release sequence

1. `npm test` locally; verify UI changes on a local restored dump when possible; rehearse any migration on a local MariaDB 10.6 copy (§3.4).
2. `node scripts/backup-database.js`.
3. Run any migration marked *migration first* (§6.2).
4. `scp` + `docker cp` each changed runtime file (routes/, public/, views/, services/, config/, middleware/, utils/), and `rm -f` inside the container every runtime file the release deleted; confirm the restart in `docker logs`.
5. Run any migration marked *code first*.
6. Post-check: health, the affected endpoint(s), a hard-refreshed page.
7. Commit on a branch and open a PR (deploy state is not visible in git, so keep the two in step).

### 9.4 Reference container build (`Dockerfile`, `docker-compose.yml`)

`node:lts-slim`, canvas system libraries, `npm install` + `npm prune --production`, non-root user `nodejs`, `EXPOSE 3000`, HEALTHCHECK on `/api/health`, `CMD node app.js`. Compose runs `network_mode: host`, mounts `.:/app:ro`, `uploads/`, `logs/`, `.env:ro`. Use these to rebuild an image from scratch; day-to-day production changes go through §9.2.

### 9.5 Production checklist

- `NODE_ENV=production`, `PORT`, real `SESSION_SECRET`, `ACCOUNT_RECOVERY_ENCRYPTION_KEY`, `PUBLIC_BASE_URL=https://entry.sweet-lab.org`, SMTP settings, `ADMIN_EMAIL_*`, `ALLOWED_ORIGINS` (uncommented).
- `DB_PORT` unset (or `3306`) in the container environment: since 2026-11 `config/database.js` honours it.
- Remote MySQL whitelist for the developer IPs; CSF rules for Docker as above.
- Fresh database backup before every migration or data operation.
- Session store is in-memory: a restart logs everyone out; keep it in mind when timing deploys.

### 9.6 Release 2026-11: data sources and polymer list v2 (deploy order)

Status on 2026-11-06: **not yet deployed**. A command-by-command runbook is prepared separately and reviewed before use (`.claude/cross-check-20261105/deploy/RUNBOOK.md` with helper scripts, local and untracked); this section records the order and the reasons, and its file counts match the runbook's. The release also clears the existing sampling data so that it can be re-entered through the new form (decision of 2026-11-05; user accounts are kept).

Before the window:
- the MariaDB 10.6 rehearsal of steps 1–4 has passed (done 2026-11-06, §6.2);
- users are told not to enter data during the window and to submit or discard any entry in progress — a browser draft from before the deploy can carry old field names (`mp_polymer_pete`, retired polymers, pre-redesign source-type codes) that the new code rejects or misreads;
- the container does not set `DB_PORT` to anything but 3306 (§9.5);
- the container matches the repository: hash every tracked runtime file in `/app` and compare it with the repository copy (`tr -d '\r'` on both sides, §9.2). Apart from the 13 files step 5 replaces, every file must match; the update and delete lists of step 5 assume this. If any file differs, stop and find out why before deleting anything (the runbook's read-only `remote-sweep.sh` does this check);
- one SSH session at a time (§9.1).

Order (from step 2 until step 5 the old code's `/api/references` and data-source queries fail against the renamed tables, so the entry form is unusable — hence the window):

| # | Step | Why here |
|---|---|---|
| 1 | `node scripts/backup-database.js`; keep the file name. Then, still before T1, save the `PolymerType_Ref` rows of PLA, PB, PE_UHMW, HIPS and EPS as INSERT statements in a file next to the dump in `db/backups/` (decided 2026-11-05; the runbook's `save-retired-polymers.js` writes `retired_polymers_<DB_NAME>_<timestamp>.sql`). Keep both files and never delete them | rollback point and the only pre-T1 copy of the data; the `--backup=` the purge requires (< 2 h old when the purge executes); the only way to re-add the five polymers T3 deletes |
| 2 | T1: `node scripts/update-database.js db/20261105_redesign_data_source_tables.sql` | the purge script already uses the new table names |
| 3 | Purge, run by the maintainer: `node scripts/purge-data-entered-before.js --before=<deploy date + 1 day> --include-locations --include-publications` as a dry run, then again with `--execute --backup=<step-1 dump>`. If more than 2 h have passed since step 1, the script refuses that file: run `node scripts/backup-database.js` again and pass the new file to `--backup=`. The step-1 dump stays the rollback point, because the new one is taken after T1; keep both | `--before` is exclusive, so the next day's date also clears rows entered on deploy day; removes every sample, location and data source while keeping users; removes the samples that still reference the five retired polymers |
| 4 | T3: `node scripts/update-database.js db/20261105_polymer_table_v2.sql` | with no references left, it deletes the five retired polymers |
| 5 | Code. First `docker commit myapp-container mp:v9-backup-<date>` and copy out (`docker cp myapp-container:/app/<path> …`) the current version of every file you are about to replace or delete. Then `scp` + `docker cp` the 13 changed runtime files — `package.json` (only the `test` script changed; no runtime effect), `config/database.js`, `routes/api.js`, `routes/pages.js`, `public/css/mp_style.css`, `public/js/data-summary-utils.js`, `public/js/form-handler.js`, `public/js/map-home.js`, `public/js/publication-form-utils.js`, `views/data_forms/formpage2.ejs`, `views/enter_data_by_form.ejs`, `views/home.ejs`, `views/partials/sidebar.ejs` — and `rm -f` in the container the 29 runtime files deleted on this branch (`git diff --name-status --diff-filter=D 2092d2a -- routes public views`, relative to the 2026-08-18 deploy) | new code needs the migrated schema; the image and the file copies are the code rollback point |
| 6 | Checks: `SELECT COUNT(*) FROM PolymerType_Ref` = 25; `DataSourceTypeReference` has 8 rows; T1's last post-check `SELECT` (run by hand — the runner prints nothing) lists `FK_DataSource_SourceType`, `FK_DataSource_EnteredBy`, `FK_Event_Publication` and the three CHECKs; `/home` loads; anonymous `GET /api/data-sources` → `{"success":true,"data":[]}`; `/api/references` has `dataSourceTypes` and no `dataSources`; `POST /api/add-test-location-data`, `POST /api/test-save`, `POST /test-save` (root mount, §2.1), `/test.html`, `/js/form-validation.js`, `/js/map-review.js` → 404 (the last three confirm the in-container deletions); one new entry with a data source saves and appears on the map | |
| 7 | Tell users they can resume, and inform the PI (data cleared, five polymers removed, data-source field rules) | |

If step 2, 3 or 4 fails (the container still runs the old code): restore the step-1 backup, fix the cause and start again at step 2. If step 5 or 6 fails: roll back code and database together, because old code only works with the old schema. Put the previous runtime files back and re-create the deleted ones (from the `docker commit` image or the file copies taken at the start of step 5), then restore the step-1 backup. Anything entered after the deploy is lost. Both migrations are guarded and re-runnable, but the rule is a clean restart. Never run `20260817_add_reference_sort_order.sql` after step 2.

---

## 10. Data Operations

### 10.1 Backups

`node scripts/backup-database.js` writes `db/backups/<DB_NAME>_YYYYMMDD_HHMMSS.sql` (mode 0600, git-ignored): consistent-snapshot logical dump of every table (`DROP TABLE IF EXISTS` + `SHOW CREATE TABLE` + 250-row `INSERT` batches, `SET FOREIGN_KEY_CHECKS=0`, `CREATE DATABASE IF NOT EXISTS`). Set `PRUNE_DATABASE_BACKUPS=true` to delete older dumps after a successful run. Restore by piping the file into any MySQL/MariaDB (see §3.4 for the one MariaDB-only default to patch on MySQL). It honours `DB_PORT` (default 3306) and has no other connection defaults, so set `DB_HOST`/`DB_USER`/`DB_PASS`/`DB_NAME` explicitly when it must not read the production values from `.env`.

### 10.2 Purging entered data

`scripts/purge-data-entered-before.js` deletes every sampling entry whose `SamplingEvent.DateEntered` is before a cutoff, bottom-up through the FK graph, and never touches `users`, `password_reset_tokens` or the account-recovery tables. The cutoff is exclusive (`DateEntered < 'YYYY-MM-DD'`): to include rows entered today, pass tomorrow's date. With `--include-publications` (flag name kept) it also deletes unreferenced rows of `DataSourceReference`; since 2026-11 the script uses the new table names, so it only runs against a database migrated with T1 (§6.2). It honours `DB_PORT` (default 3306), like `backup-database.js` and `update-database.js`; `check-database.js` and `init-database.js` do not.

```bash
node scripts/purge-data-entered-before.js --before=2026-08-01                                   # dry run (counts only)
node scripts/purge-data-entered-before.js --before=2026-08-01 --include-locations --include-publications   # wider dry run
node scripts/purge-data-entered-before.js --before=2026-08-01 --include-locations --include-publications \
     --execute --backup=db/backups/sweetl23_partner_demo_20260818_105317.sql                     # really delete
```

`--execute` requires `--backup=` pointing at a dump ≥ 10 kB and less than two hours old; everything runs in one transaction, each step's `affectedRows` must equal the plan, all remaining counts are re-verified before `COMMIT`, otherwise it rolls back. Locations / data sources are only removed with the flags and only when no remaining event references them. Used on 2026-08-18 to remove everything entered before 2026-08-01 (backup `…_20260818_105317.sql` is the only copy of that data), and planned again for the 2026-11 release to clear all sampling data before re-entry (§9.6). ID counters are not reset.

### 10.3 Editing reference lists

See §5.4. The cheapest moment to add/remove/rename options is while nothing references them (e.g. right after a purge — the 2026-11 release relies on exactly this to drop five polymers); afterwards, deletions are blocked by FKs and need a soft-delete design. `DataSourceTypeReference` is the exception: its eight IDs are wired into code and CHECK constraints, so only labels, descriptions and `SortOrder` are data edits.

---

## 11. Development Guidelines

**API response shape**: `{ success: true, data, message? }` / `{ success: false, message, errors? }`; HTTP status mirrors the outcome (400 validation, 401 auth, 404 not owned/not found, 500 with `error.stack` only in development).

**Validation rules that must stay in sync**
- Percentage groups (polymer lists and every detail section) must total 100 % ± 0.1; the tolerance is defined in `utils/percentage.js`, `form-handler.js` and `formpage5.ejs`.
- Percentages are stored with four decimals (`DECIMAL(7,4)`); numeric inputs reject negatives (`min=0`), percent fields `max=100`; measurements are `DECIMAL(12,6)`.
- Dates: `start_year` required; month/day optional and hierarchical; end components only for device periods (validated client-side, server-side and by CHECK constraints).
- The Other polymer requires a description when its percentage is > 0, and vice versa.
- Data sources: one validator, `public/js/publication-form-utils.js`, serves the browser and `routes/api.js` — change rules and messages only there. Its type rules (year for 1–4, none for 5–8, access date only for 4) mirror the CHECK constraints of `DataSourceReference`; the required text fields (title, authors/organisation, journal/publisher/repository, APA citation) are enforced by the application only. The publication-year bound is computed from the UTC year so browser and server agree.
- A data source is mandatory for new samples; edits of legacy samples without one stay possible. Any endpoint that accepts or lists data sources must apply `MY_DATA_SOURCE_CONDITION` (own or cited by the user's own events).
- Reference lists are never hard-coded: read `/api/references` and respect `SortOrder` (the eight data-source type IDs are the one deliberate exception, §5.4).

**Database patterns**
- Parameterised queries only; multi-table writes in one transaction with rollback.
- Business-key IDs for `SamplingEvent`, `SampleDetails`, `*InSample`, `DataSourceReference` are `MAX(id)+1` inside the transaction (`nextTableId()` or an inline `MAX`); detail tables use AUTO_INCREMENT.
- Inserts go through `insertFromMap()`/`updateFromMap()`, which drop columns that do not exist in the live table (`getTableColumns()`), so code can be deployed shortly before/after a migration when the header allows it.
- New migration: `db/YYYYMMDD_short_name.sql`, idempotent, header explaining purpose and deploy order, pre-flight and post-check `SELECT`s, and a test if it changes behaviour (see `test/reference-sort-order.test.js`, `test/polymer-table-v2.test.js`). Rehearse it on MariaDB 10.6 (§3.4) — MySQL accepts things MariaDB rejects (collations, §6.2) — and make it safe to re-run after a mid-way failure (guard each step on the state it changes, not on a flag set earlier in the file). Variables compared with table columns need an explicit `COLLATE utf8mb4_unicode_ci`.

**Adding a page**: copy the `<head>`/partials skeleton of an existing standalone view (there is no layout), add a route in `routes/pages.js` (`requireAuth` if needed, pass `title`, `currentPage`, `user`), add the entry to `views/partials/sidebar.ejs` if it needs one, and hard-code the page's scripts.

**Adding an API**: `router.<method>('/path', requireAuth, [validators], async (req,res) => { … })` in `routes/api.js`; remember it will also be reachable at the root path because of the legacy mount. An endpoint without `requireAuth` must not return other users' private data (filter by `req.session.user_id`, as `GET /api/data-sources` does), and debug or test-data endpoints do not belong in the router.

**Code style**: kebab-case file names, async/await, underscore-based DB column names (legacy hyphenated names were renamed; the one remaining hyphen is the table `LocType_Env-Indoor_Ref`), LF line endings, no secrets in the repo (`.env`, `db/backups/*.sql`, `tasks/`, `developer_manual/` and `__pycache__/` are git-ignored; the local `.claude/` folder is **not**, so never stage it, §12).

---

## 12. Known Issues and Technical Debt

Verified against the 2026-11-06 working tree of `comments-20261103`; none of these are blocking, but each has bitten someone or will.

**Runtime behaviour**
- `PUT /api/admin/contact-submissions/:id/status` with `status=resolved` throws (`req.session.user.username` — `req.session.user` is never set) → 500. `GET …/contact-submissions` computes `stats` but never populates them.
- No role/permission checks anywhere (`users.role` exists but is not enforced): `/admin/contact` and `/api/admin/*` are open to any logged-in user.
- `/captcha_test` is still a public debug route (page and view kept).
- Sessions live in the express-session MemoryStore (single process, lost on restart); `secure: false` is hard-coded on the cookie.
- `ALLOWED_ORIGINS` is commented out in the template although production CORS depends on it; `DB_PORT`, three geocoding variables and `PRUNE_DATABASE_BACKUPS` are undocumented in the template.
- `/api/locations` returns every location when there is no session (intended for the public map, but worth knowing).
- `views/partials/footer.ejs` injects jQuery asynchronously and loads `bootstrap.min.js` right after it, so pages with the footer log "Bootstrap requires jQuery" in the console (also on `main`; harmless so far).
- Data sources are strictly per user: a user sees and reuses only sources they entered or that their own sampling events cite. There is no sharing or de-duplication across users (two users citing the same paper create two rows). Migrated sources cited by several users have `EnteredBy` = NULL and appear only through the "cited by my events" rule.
- `SamplingEvent.PublicationID_Num` kept its pre-redesign name although it now points at `DataSourceReference.data_source_id`; `/api/references` still returns the `pubSources` alias and the API still accepts the `publication_*` field names. Renaming / dropping these compatibility layers is a possible follow-up.
- After T1, migrated sources that were old type 6 "Other" sit on type 3 until someone reviews them (§6.2); the planned deploy-day purge removes them anyway.
- A data source with a publication year before 1900 (none exist) cannot be reused, and a sample that cites one cannot be saved on edit. The reused source's year field is autofilled and locked (read-only), but page 2's number check still tests it against `min="1900"`, so Continue is blocked and the user cannot correct the value. Fix it if such sources ever appear.
- `/api/upload-file-data` accepts files but never parses them; `/api/download-template` always returns CSV headers.
- Legacy flat percentage columns on `MicroplasticsInSample`/`FragmentsInSample` and `SampleDetails.PackagingSampleAmount/Unit_Num` are still written; `SamplingEvent.WeatherPrecedent24` duplicates `Weather_Precedent24`.
- `SamplingEvent` and `SampleDetails` have no PRIMARY KEY (UNIQUE only); `RamanDetails` has no key at all; `MicroplasticsPolymerDetails`/`FragmentsPolymerDetails` are the only detail tables whose parent FK does not cascade.
- Retiring a reference option that real data uses needs a soft-delete (`IsActive`) plus "keep visible on samples that already use it" handling in the polymer list; not implemented (the colour drop-down already keeps a retained legacy value as a disabled option, which is the pattern to copy). Until then, a retired polymer that is still referenced when T3 runs stays selectable at `SortOrder` 1010–1050 (§6.2).

**Repository hygiene (stale or misleading files)**

The 42 dead tracked files listed in 1.1.0 (unused views, form-page backups, dead client scripts and CSS, `public/test*.html`, `routes/api copy.js`, the ad-hoc root scripts, `error.log`, the publication-ID JSON backup, the schema-flowchart HTML, `scripts/create-sample-table.js`, `Testing/excel_verification/__pycache__/`) and the `pageSpecificJS` locals were deleted on 2026-11-06. What remains:
- `database_init.sql` / `npm run init-db` are stale (§6.3): no polymer, data-source or detail tables. Regenerating it from the migrated schema is a follow-up.
- `Testing/excel_verification/verify.py` still reads `Publications` / `PubSource_Ref` and the old 20 polymer codes (PETE, PLA, …); update both before re-running the Excel comparison.
- `partials/footer.ejs` links to `/pages/about` and `/pages/documentation` (both 404 — routes are `/about`, `/documentation`) and shows "Version 2.0"; `captcha_test.ejs` references a non-existent `/images/logo.png`.
- Step 5's progress label ("Particle Details") and heading ("Sample Details") disagree; the weather block lives on page 2 although a comment says otherwise.
- `img/unnamed.png` is tracked but referenced nowhere (views, public, routes, `app.js`) and is not served (it is outside `public/`).
- `scripts/check-database.js` and `scripts/init-database.js` ignore `DB_PORT` (always 3306), unlike the other three scripts.
- `.claude/` (local launch profiles, cross-check notes, the 2026-11 deploy runbook) is untracked but not git-ignored, and `.claude/launch.json` holds the `sweetlab-localdb` profile's throwaway DB password. Follow-up: add `.claude/` to `.gitignore`, or move the password out of `launch.json` into the environment. Until then, never stage it with `git add -A`/`git add .`.

---

## 13. Useful Commands

```bash
# development
npm install
npm run dev                          # nodemon, PORT=3001
npm start
npm test                             # 21 test files, 122 tests
npm run test:account-recovery        # or test:partial-dates / test:percentages / test:data-summary / test:publication / test:signup

# local test database (§3.4) — always pass every DB_* variable; .env points at production
DB_HOST=127.0.0.1 DB_PORT=33306 DB_USER=<local user> DB_PASS=<throwaway> DB_NAME=sweetl23_partner_demo node app.js
DB_HOST=127.0.0.1 DB_PORT=33307 DB_USER=<local user> DB_PASS=<throwaway> DB_NAME=sweetl23_partner_demo node scripts/update-database.js db/<migration>.sql   # MariaDB rehearsal

# database (from the Mac; needs the Remote MySQL whitelist)
node scripts/backup-database.js
node scripts/update-database.js db/<migration>.sql
npm run migrate:account-recovery
node scripts/purge-data-entered-before.js --before=YYYY-MM-DD [--include-locations --include-publications] [--execute --backup=db/backups/<dump>.sql]
node scripts/check-database.js       # lists tables (its sample_data checks are legacy); ignores DB_PORT

# production checks
curl -s https://entry.sweet-lab.org/api/health
curl -s https://entry.sweet-lab.org/api/references | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s).data;console.log(j.purposes.map(p=>p.Purpose_Name).join(" | "))})'
curl -s https://entry.sweet-lab.org/api/data-sources        # after the 2026-11 release: {"success":true,"data":[]} when not signed in

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
| 1.1.0 | 2026-08-18 | Full rewrite against commit `2092d2a` and the 2026-08-18 schema: current routes/APIs, real schema (dropped tables removed, legacy-but-live columns marked), migrations list with deploy order, real frontend structure, testing, actual production topology and deploy runbook, data operations, known issues |
| **1.2.0** | **2026-11-06** | Updated for branch `comments-20261103` (PI comments of 2026-11-03), verified against its 2026-11-06 working tree: data-source redesign (`DataSourceTypeReference` with eight Published/Unpublished types, `DataSourceReference` with the PI's ten fields plus `EnteredBy`, CHECK constraints, mandatory data source for new samples, per-user lists and save-time ownership check, shared browser/server validator, new Data Source form section); the PI's 25-row polymer list; migrations T1/T3 with collation fix, self-check, MariaDB rehearsal and the release order backup → T1 → purge → T3 → code (§9.6, not yet deployed); home-map media-type colours, legend, concentration popups and HTML escaping; sidebar Interactive Map entry; `DB_PORT` in the app pool and backup script; removed test endpoints and 42 dead files; local MySQL 9.4 / MariaDB 10.6 test recipe; 21 test files / 122 tests; known issues refreshed |

### Document conventions

- File name: `DEVELOPER_MANUAL_EN_v<major>.<minor>.<patch>_<YYYY-MM-DD>.<md|html|docx>` (e.g. `DEVELOPER_MANUAL_EN_v1.1.0_2026-08-18.docx`). Bump **minor** for content updates that track code changes, **major** for architecture changes, **patch** for corrections; the date is the authoritative "as of" marker.
- The Markdown in `docs/DEVELOPER_MANUAL_EN.md` is the source; HTML and Word are generated from it with pandoc and kept in the git-ignored `developer_manual/` folder for distribution.
- When a change alters routes, schema, migrations or deploy steps, update the manual in the same PR and bump the version.
