# Birbank Dashboards: project status and handover

_Last updated: 2026-11-20_

An internal BI and dashboard tool for Birbank, similar in spirit to Metabase, built from scratch
(no Metabase code is used: Metabase is AGPL). Backend Java / Spring Boot, frontend React.

**Next steps (planned for 2026-11-21):**
1. Integrate SSO (see [SSO plan](#10-next-step-sso-plan)).
2. Deploy to the pre environment (see [Pre-environment deployment checklist](#11-pre-environment-deployment-checklist)).

---

## Contents

1. [Quick start](#1-quick-start)
2. [What is built](#2-what-is-built)
3. [Architecture](#3-architecture)
4. [Data model and migrations](#4-data-model-and-migrations)
5. [REST API](#5-rest-api)
6. [Security design](#6-security-design)
7. [Demo content](#7-demo-content)
8. [Known limitations and technical debt](#8-known-limitations-and-technical-debt)
9. [Gap analysis vs Metabase and roadmap](#9-gap-analysis-vs-metabase-and-roadmap)
10. [Next step: SSO plan](#10-next-step-sso-plan)
11. [Pre-environment deployment checklist](#11-pre-environment-deployment-checklist)

---

## 1. Quick start

Requirements: Java 21, Node 20+ (tested with 24), Docker.

```bash
# Databases: app metadata (5433), sample Postgres bank data (5434), sample MongoDB (27018)
docker compose up -d app-db sample-db sample-mongo

# Backend: http://localhost:8095
cd backend && ./mvnw spring-boot:run

# Frontend: http://localhost:5173 (proxies /api to the backend)
cd frontend && npm install && npm run dev
```

Everything in Docker instead: `SECRET_KEY='long-random' docker compose --profile full up -d --build`,
then open http://localhost:3000. Stop the dev servers first, because both use port 8095.

**Local login (dev only):** `admin@birbank.local` / `admin123`. A test viewer `viewer@birbank.local` /
`viewer123` was also created by hand in the local database; it is not seeded.

| Service | Port | Notes |
|---|---|---|
| Frontend dev server (Vite) | 5173 | `BACKEND_URL` env var changes the proxy target |
| Backend | 8095 | 8080 and 8090 were already taken on the dev machine; override with `PORT` |
| App metadata DB (Postgres 16) | 5433 | user/password/db `dashboard` |
| Sample Postgres bank DB | 5434 | read-only user `dashboard_reader` / `reader` |
| Sample MongoDB 7 | 27018 | read-only user `dashboard_reader` / `reader`, `authSource=bank_events` |
| Frontend in Docker (nginx) | 3000 | `--profile full` only |

All sample data is synthetic.

---

## 2. What is built

### Users and roles
- Local login (email and password, BCrypt), session cookie, CSRF protection.
- Roles:

  | Role | Can do |
  |---|---|
  | **Admin** | Users, data sources, audit log, plus everything below |
  | **Analyst** | Write SQL / MongoDB queries, create and edit questions and dashboards |
  | **Viewer** | Open dashboards and saved questions, change filters, export CSV |

- Admin user management: create users, change role, deactivate, reset password.
- First admin is created on startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` when no users exist.

### Data sources
- **PostgreSQL, Oracle, SQL Server, MySQL** (JDBC) and **MongoDB** (official Java driver).
- Passwords stored encrypted with AES-256-GCM (key derived from `SECRET_KEY`), never returned to the browser.
- "Test connection" before saving.
- Optional schema / collection filter (comma-separated) to limit what is shown.
- One small read-only connection pool per data source (HikariCP, max 5), or one MongoClient (max 5 connections).
- MongoDB reads use `secondaryPreferred`, to keep load off the primary.

### Query editor
- CodeMirror editor with SQL dialects and autocomplete from the schema, or JSON mode for MongoDB pipelines.
- Schema browser: tables and columns, or MongoDB collections and fields (fields from a 100-document sample).
- Run with Ctrl/⌘+Enter. Results table with sorting. CSV export (client-side, Excel-safe: formula-injection guarded, UTF-8 BOM).
- Row limit (`QUERY_MAX_ROWS`, default 10000) and timeout (`QUERY_TIMEOUT_SECONDS`, default 60).
- MongoDB: pick a collection and write an aggregation pipeline. Shell syntax such as `ISODate(...)` and `ObjectId(...)` works.
  Nested documents are flattened into columns (`customer.city`).

### Visualizations (14 types)
- **Values:** table, number, trend (latest vs previous row, % change), progress (vs goal), gauge.
- **Charts:** bar, row, line, area, combo (bars + lines on a second axis), pie, scatter/bubble, funnel, waterfall.
- **Chart settings drawer:**
  - Axis columns, and series split for long-format data (e.g. month × channel → one series per channel).
  - Stacking: off, stacked or 100%. Goal line and label. Values on the chart.
  - "Higher is better" for trend and gauge. Gauge min and max. Waterfall total bar.
  - Number format: plain, percent or compact, with decimals and a prefix or suffix (`₼`, ` AZN`).
- Sensible automatic column choice per chart type.
- Rendering with Apache ECharts.

### Questions (saved queries)
- Query, chart type, chart settings and filter definitions saved together. Viewers can run them but not edit.

### Dashboards
- Drag-and-resize grid (12 columns), add or remove cards, rename.
- Auto-refresh (1, 5 or 15 minutes), refresh all, CSV per card, click a card title to open the question.

### Filters
- In a query: `{{name}}` is a variable. `[[ ... ]]` is optional and is removed when a variable inside has no value.
  ```sql
  SELECT count(*) FROM transactions
  WHERE status = 'success'
    [[AND created_at >= {{date_from}}]]
    [[AND channel = {{channel}}]]
  ```
  MongoDB: `{ "$match": { "platform": {{platform}} } }`. Never put quotes around `{{name}}`.
- Variable types: text, number, date. Input: free input or dropdown.
  Dropdown values come from a fixed list, or from a column (distinct values, max 1000, cached 10 minutes).
- Defaults; date defaults can be relative: `today`, `yesterday`, `start_of_week`, `start_of_month`,
  `start_of_year`, `-30d`, `-2w`, `-6m`, `-1y`.
- **Dashboard filters:** a filter bar at the top. Each filter is connected to a variable in each card
  (automatically when names match). Filter values are kept in the URL for shareable links.

### Audit log
- Every query run (ad-hoc SQL, ad-hoc MongoDB, saved question, dropdown values): user, data source, question,
  executed SQL or pipeline, filter values used, row count, duration, success or error, time.
- Admin page with paging and expandable SQL.

---

## 3. Architecture

```
Browser (React SPA)
   │  /api/* (JSON, session cookie + X-XSRF-TOKEN)
   ▼
Spring Boot backend ──► App metadata DB (Postgres): users, data sources, questions, dashboards, audit
   │
   ├── JDBC (read-only pools) ──► Postgres / Oracle / SQL Server / MySQL data sources
   └── MongoDB driver ─────────► MongoDB data sources
```

### Stack

| Part | Technology |
|---|---|
| Backend | Java 21, Spring Boot 4.1.2 (Spring MVC, Security 7, Data JPA / Hibernate 7, Validation, Actuator), Flyway, Jackson 3 |
| SQL safety | JSqlParser 5.3 |
| Drivers | postgresql, ojdbc17, mssql-jdbc, mysql-connector-j, mongodb-driver-sync (versions managed by Spring Boot) |
| Frontend | React 19, TypeScript 7, Vite 8, Ant Design 6, TanStack Query 5, React Router 7 |
| Charts / grid / editor | Apache ECharts 6 (echarts-for-react), react-grid-layout 2, CodeMirror 6 (@uiw/react-codemirror) |
| Packaging | Dockerfiles for backend (JRE 21, non-root user) and frontend (nginx, proxies /api to backend:8095) |

### Repository layout

```
backend/src/main/java/az/birbank/dashboard/
  auth/         login, current user, users admin, roles
  config/       security, app properties, demo data seeding (DataInitializer)
  common/       error handling (ProblemDetail)
  datasource/   data source CRUD, encryption, JDBC pools, schema metadata
  mongo/        MongoDB client registry, pipeline guard, document flattening, schema sampling
  query/        SQL guard, query execution (routes MongoDB queries to mongo/)
  params/       filters: template rendering, relative dates, dropdown values, JSON columns
  question/     saved questions
  dashboard/    dashboards, cards, filters
  audit/        audit log
backend/src/main/resources/
  application.yml
  db/migration/   Flyway V1..V3
frontend/src/
  api.ts          typed API client (CSRF handling)
  auth.tsx        current user context, role helpers
  params.ts       filter helpers (variable detection, relative date text)
  csv.ts          CSV export
  components/     Visualization, VizSettingsForm, SchemaBrowser, ParameterWidget, ParameterEditor, AppLayout
  pages/          Login, DashboardsList, DashboardView, QuestionsList, QuestionView, QueryEditor, admin/*
docker/           sample database seeds (Postgres SQL, MongoDB JS)
docker-compose.yml
```

### Configuration (environment variables)

| Variable | Default (dev) | Purpose |
|---|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | `jdbc:postgresql://localhost:5433/dashboard`, `dashboard`, `dashboard` | App metadata DB |
| `SECRET_KEY` | `change-me-change-me-change-me-32b` | Encrypts data source passwords. **Must be set and kept stable**: changing it makes stored passwords unreadable |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `admin@birbank.local`, `admin123` | First admin, only when no users exist |
| `SAMPLE_DB_URL`, `SAMPLE_DB_USER`, `SAMPLE_DB_PASSWORD` | local sample Postgres | **Set `SAMPLE_DB_URL` empty outside dev** |
| `SAMPLE_MONGO_URL`, `SAMPLE_MONGO_USER`, `SAMPLE_MONGO_PASSWORD` | local sample MongoDB | **Set `SAMPLE_MONGO_URL` empty outside dev** |
| `QUERY_MAX_ROWS` | 10000 | Max rows per query |
| `QUERY_TIMEOUT_SECONDS` | 60 | Query timeout |
| `PORT` | 8095 | Backend port |

Session timeout is 8h; the cookie is HttpOnly and SameSite=Lax.

---

## 4. Data model and migrations

| Table | Purpose |
|---|---|
| `app_user` | email, full name, BCrypt hash, role, active |
| `data_source` | name, engine, URL (`jdbc_url` column also holds MongoDB connection strings), username, encrypted password, schema filter |
| `question` | name, description, data source, query text (`sql_text`; the pipeline for MongoDB), `collection_name` (MongoDB), `parameters` (JSON), viz type, viz settings (JSON) |
| `dashboard` | name, description, `filters` (JSON) |
| `dashboard_card` | dashboard, question, x/y/w/h, `parameter_mappings` (JSON: filter name → variable name) |
| `audit_log` | user, action, data source, question, SQL text (with filter values), rows, duration, success, error |

Migrations (Flyway, run automatically on startup):
- `V1__init.sql`: all tables.
- `V2__question_collection.sql`: `question.collection_name` (MongoDB).
- `V3__filters.sql`: `question.parameters`, `dashboard.filters`, `dashboard_card.parameter_mappings`.

---

## 5. REST API

All endpoints are under `/api`, JSON, and need a session, except login and csrf. Errors are RFC 7807
`ProblemDetail` with a readable `detail`. Mutating requests need the `X-XSRF-TOKEN` header (value of the
`XSRF-TOKEN` cookie).

| Method & path | Who | Purpose |
|---|---|---|
| `GET /auth/csrf` | anyone | Issues the XSRF-TOKEN cookie |
| `POST /auth/login` | anyone | `{email, password}` → current user |
| `POST /auth/logout` | user | Ends the session |
| `GET /auth/me` | user | Current user |
| `GET /users`, `POST /users`, `PUT /users/{id}` | admin | User management |
| `GET /datasources` | user | List (no passwords) |
| `POST /datasources`, `PUT /datasources/{id}`, `DELETE /datasources/{id}` | admin | Manage data sources |
| `POST /datasources/test[?id=]` | admin | Test connection (with `id`, reuses the stored password) |
| `GET /datasources/{id}/schema` | admin, analyst | Tables and columns, or collections and fields |
| `POST /query` | admin, analyst | Run ad-hoc `{dataSourceId, sql, collection?, parameters?, values?}` |
| `POST /query/values` | admin, analyst | Distinct values `{dataSourceId, table, column}` |
| `GET /questions`, `GET /questions/{id}` | user | Read questions |
| `POST /questions`, `PUT /questions/{id}`, `DELETE /questions/{id}` | admin, analyst | Manage questions |
| `POST /questions/{id}/run` | user | Run with `{values: {variable: value}}` |
| `GET /questions/{id}/parameters/{name}/values` | user | Dropdown values for a question variable |
| `GET /dashboards`, `GET /dashboards/{id}` | user | Read dashboards |
| `POST /dashboards`, `PUT /dashboards/{id}`, `DELETE /dashboards/{id}` | admin, analyst | Manage dashboards (PUT replaces filters and cards) |
| `GET /dashboards/{id}/filters/{name}/values` | user | Dropdown values for a dashboard filter |
| `GET /audit?page=&size=` | admin | Audit log |
| `GET /actuator/health` | anyone | Health check |

---

## 6. Security design

- **Read-only by design (defence in depth):**
  1. SQL: JSqlParser must parse exactly one `SELECT` / `WITH` statement. `SELECT ... INTO` and `FOR UPDATE/SHARE` are rejected.
  2. MongoDB:
     - Only an allow-list of read stages is accepted.
     - `$out`, `$merge`, `$function`, `$accumulator` and `$where` are rejected anywhere, including nested pipelines.
     - `system.*` collections are blocked.
  3. JDBC connections are opened read-only. A query timeout and a row limit always apply.
  4. Data sources should use a read-only database user (documented on the admin page).
- **Filters cannot inject:**
  - SQL values are JDBC parameters (`?`).
  - MongoDB values are encoded as typed BSON literals.
  - Numbers and dates are parsed and validated.
  - Dropdown columns must exist in the schema metadata and identifiers are quoted.
  - Tested: `pos' OR '1'='1` matches nothing; `1 or 1=1` for a number is rejected; a `$out` injection becomes a plain string.
- **Credentials:**
  - Data source passwords are AES-256-GCM encrypted and never sent to the browser.
  - A MongoDB URL containing a user or password is rejected; they go in the separate fields.
- **Web:**
  - Session cookie is HttpOnly and SameSite=Lax. CSRF uses Spring Security's SPA cookie mode.
  - The session ID changes on login. Unauthenticated API calls get 401.
  - Method-level role checks (`@PreAuthorize`).
- **Audit:** every query execution, with filter values, success or failure.

---

## 7. Demo content

Seeded on startup **only while the sample data sources are configured** (dev):

| Dashboard | Data source | Shows |
|---|---|---|
| Retail banking overview | Bank sample (Postgres) | Number, pie, bar, line and table on transactions, customers and branches |
| Chart gallery | Bank sample (Postgres) | One example of each chart type |
| Transactions explorer | Bank sample (Postgres) | Filters: From (default -90d), To, Channel and Branch (dropdowns from columns), connected to 5 cards |
| Digital channels (MongoDB) | Bank events (MongoDB) | App events and support tickets |

Sample Postgres data: 6 branches, 2,000 customers, 4,000 accounts, 50,000 transactions (last 180 days).
Sample MongoDB data: 30,000 app events and 3,000 support tickets.

Seeding rules:
- The admin user and the first Postgres demo are created only on an empty database.
- The MongoDB demo is created while no MongoDB data source exists.
- The chart gallery and explorer are created while a data source named "Bank sample (Postgres)" exists and the dashboard name is free.
- Setting the `SAMPLE_*_URL` variables empty disables all of this.

---

## 8. Known limitations and technical debt

**Must fix before production:**
- **No automated tests or CI.** Everything was verified by hand (API calls with curl and browser checks).
  The generated `DashboardApplicationTests` needs a running database.
- **Sessions are in server memory.** A restart logs everyone out, and you can't run more than one backend
  instance. Fix: Spring Session with Redis or JDBC.
- **Deactivated users** stay logged in until their session expires (8h). Fix: session registry or Spring
  Session and invalidate on deactivation.
- **Dev defaults in `application.yml`** (`SECRET_KEY`, `admin123`). Make startup fail when the default
  `SECRET_KEY` is used outside a dev profile.
- **JDBC URL options are not restricted.** Admins can set dangerous driver options (for example MySQL
  `allowLoadLocalInfile`, PostgreSQL `socketFactory`). Add an allow-list.
- **No per-dashboard or per-data-source permissions.** Every user sees every dashboard and question.
- **CSV export happens in the browser and is not audited.**

**Functional limits:**
- Deletes are permanent: no trash, no revision history.
- A variable inside quotes (`'{{x}}'`) is not replaced. A nested array literal `[[...]]` in a MongoDB
  pipeline is treated as an optional block.
- When a dashboard filter is cleared, the question's own default still applies.
- Filters are single-value: no multi-select (`IN`) and no single date-range picker.
- The MongoDB schema browser shows fields from a 100-document sample.
- Schema metadata is read live on each request; only dropdown values are cached.

**Housekeeping:**
- The frontend bundle is a single chunk of more than 500 kB; code-split ECharts and CodeMirror.
- Minor lint warnings (`set-state-in-effect`).
- `react-grid-layout` v2 API.

---

## 9. Gap analysis vs Metabase and roadmap

### Missing compared to Metabase

**Security and permissions** ⭐ (most important for a bank):
- SSO (LDAP / SAML / OIDC), password reset, 2FA.
- User groups. Data permissions per database, schema and table.
- Row-level security (for example a branch manager sees only their branch).
- Column masking (card numbers, FIN codes, phone numbers).

**Querying without SQL:**
- Visual query builder (filter, summarize, join, custom columns). This is the biggest functional gap.
- Drill-through: click a chart to see the underlying rows, zoom, or break down.
- Models, metrics and segments (a semantic layer). Questions built on other questions. SQL snippets, query history.

**Data catalog:**
- Table and column metadata admin (display names, descriptions, semantic types, hidden columns).
- Browse data, global search, scheduled sync.

**Dashboards and charts:**
- Pivot table, maps (Azerbaijan regions), sankey, box plot.
- Per-series colors, conditional table formatting.
- Text and heading cards, dashboard tabs, click behaviour (link to another dashboard or URL), cross-filtering.
- Multi-select filters, date-range picker, linked filters.

**Organization:**
- Collections (folders) with permissions ⭐, bookmarks, pinned items, verified content.
- Revision history, trash and restore.

**Sharing:**
- Scheduled email / Slack / Teams subscriptions ⭐ and alerts.
- Server-side Excel and PDF export with audit ⭐.
- Embedding (signed), public links.

**Operations:**
- Result caching ⭐, query concurrency limits, query cancellation.
- Shared sessions (Redis) ⭐, usage analytics, metrics.
- Azerbaijani and Russian UI, dark mode, mobile layout.

**Engineering:** tests and CI ⭐.

### Roadmap (agreed order)

| Step | Scope | Why |
|---|---|---|
| 1 | **SSO** (tomorrow), then groups, collections with permissions, row-level security and masking | Required before real customer data |
| 2 | Tests, CI, Redis sessions, caching, startup checks | Needed to run it reliably |
| 3 | Scheduled email reports, alerts, Excel/PDF export | The features business users ask for first |
| 4 | Visual query builder, drill-through | Opens the tool to non-SQL users |
| 5 | Pivot, maps, text cards, tabs, cross-filtering | Polish |

---

## 10. Next step: SSO plan

**Goal:** users sign in with the bank's corporate identity. Their role (Admin, Analyst or Viewer) comes from
their identity-provider groups. Local login stays only as an emergency admin login and can be switched off.

### Proposed design (OIDC, standard Spring Security)
- **Backend:**
  - Add `spring-boot-starter-oauth2-client`.
  - Configure a provider via `spring.security.oauth2.client.registration.sso.*` and
    `provider.sso.issuer-uri`, all from environment variables.
  - Use the authorization-code flow with PKCE. The backend is the OIDC client, and the session cookie
    model stays the same, so the frontend changes very little.
  - On login, a custom `OidcUserService`:
    1. Reads `email`, `name` and the groups/roles claim.
    2. Maps groups to roles, for example `BI-Admins → ADMIN`, `BI-Analysts → ANALYST` and any other
       allowed group → `VIEWER`. Users in no allowed group are rejected.
    3. Creates the `app_user` on first login (just-in-time) and updates name and role on every login.
       An `auth_provider` column is added in a new migration `V4`.
  - The principal stays `UserPrincipal`, so all existing role checks keep working.
  - Logout also ends the IdP session (OIDC RP-initiated logout) when the provider supports it.
  - Settings: `SSO_ENABLED`, `LOCAL_LOGIN_ENABLED` (default true in dev, false in pre and prod except a
    break-glass admin), `SSO_ROLE_MAPPING`.
  - Audit `LOGIN` and `LOGIN_FAILED` events.
- **Frontend:**
  - A "Sign in with Birbank SSO" button on the login page that goes to `/oauth2/authorization/sso`.
  - Hide the email/password form when local login is disabled. The backend exposes `GET /api/auth/config`.
  - User management: SSO users are read-only (role comes from groups); local users stay editable.
- **Nginx / proxy:** forward `/oauth2/` and `/login/oauth2/` to the backend as well as `/api/`.
  Set `server.forward-headers-strategy=framework` so redirect URIs use the external https host.

### Information needed tomorrow
1. Which identity provider: Keycloak, Microsoft Entra ID (Azure AD), AD FS, or another OIDC/SAML IdP?
   If it is SAML only, use `spring-security-saml2-service-provider` instead; the design is otherwise the same.
2. Issuer URL, client ID and client secret (from the vault, not the repo) for the **pre** environment.
3. Redirect URI to register: `https://<pre-host>/login/oauth2/code/sso`.
4. The claim that carries groups or roles, and the exact group names for Admin, Analyst and Viewer.
5. Should local login be disabled in pre? Who is the break-glass admin?
6. Is any user attribute needed for row-level security later (for example branch code)? If so, include it in the claims now.

---

## 11. Pre-environment deployment checklist

### Build
- Images: `docker compose --profile full build` builds `birbank-dashboard-backend` and `birbank-dashboard-frontend`.
  Tag and push them to the bank's registry (registry URL still to be confirmed).
- Both images build successfully as of 2026-11-20. The backend runs as a non-root user.

### Runtime configuration for pre
- **App metadata database:** a managed PostgreSQL. Set `DB_URL`, `DB_USER` and `DB_PASSWORD`.
  Flyway migrates the schema on startup.
- **`SECRET_KEY`:** a strong random value from the vault. Keep it stable, and back it up together with the database.
- **First admin:** set `ADMIN_EMAIL` / `ADMIN_PASSWORD` for the first start only, or use SSO from the start.
- **Disable demo data:** `SAMPLE_DB_URL=` and `SAMPLE_MONGO_URL=` (empty).
- **Limits:** set `QUERY_MAX_ROWS` and `QUERY_TIMEOUT_SECONDS` as agreed with the DBAs.
- **SSO settings:** see section 10.
- **TLS:** terminate HTTPS at the ingress or load balancer. Pass `X-Forwarded-*` headers and set
  `server.forward-headers-strategy=framework`.
- **Replicas:** run a single backend replica until sessions are moved to Redis (section 8).
- **Health check:** `GET /actuator/health` for liveness and readiness.

### Network and data access
- **Firewall:** open connections from the backend to each reporting database or replica and to the app metadata DB.
- **Database accounts:** ask the DBAs for **read-only** users. Prefer replicas or a data warehouse over the core banking database.
- **MongoDB:** a user with only the `read` role.

### After deploying
- Sign in, check `/actuator/health`, add a data source, run a query, check the audit log.
- Change the bootstrap admin password, or disable local login once SSO works.
- Set up database backups for the app metadata DB.

### Open questions for pre
- **Platform:** Kubernetes or OpenShift, plain VMs with Docker, or something else? Is there a Helm chart or
  manifest standard to follow?
- **Registry and CI/CD:** which image registry and which pipeline (GitLab CI, Jenkins, GitHub Actions)?
- **Hostname and certificates** for pre.
- **App database:** who provides the PostgreSQL instance?
- **Data sources:** which reporting databases to connect first, and their read-only users.
