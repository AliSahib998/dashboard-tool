# Birbank Dashboards

> Full project status, architecture, known limits, roadmap, SSO plan and pre-environment checklist: see [PROJECT_STATUS.md](PROJECT_STATUS.md).

An internal BI and dashboard tool, similar in spirit to Metabase.
Backend: Java 21 + Spring Boot 4. Frontend: React + TypeScript (Vite, Ant Design, ECharts).

## What works today (MVP)

- **Login** with session cookie and CSRF protection. Roles:
  - **Admin**: users, data sources, audit log, and everything below.
  - **Analyst**: write SQL, build questions and dashboards.
  - **Viewer**: open dashboards and saved questions only.
- **Data sources:** PostgreSQL, Oracle, SQL Server and MySQL over JDBC, plus **MongoDB**.
  - Passwords are stored AES-256-GCM encrypted and never sent to the browser.
  - Admins can test a connection before saving it.
- **Schema browser** that reads tables and columns, with SQL autocomplete in the editor.
- **SQL editor** with results table, CSV export, and Ctrl/⌘+Enter to run.
- **MongoDB:** pick a collection and write an aggregation pipeline (JSON array; `ISODate(...)` and `ObjectId(...)` work).
  - Nested documents are flattened into columns (`customer.city`), so tables and charts work the same as SQL.
  - The field list in the schema browser comes from sampling 100 documents per collection.
- **Query safety:**
  - Only a single `SELECT` / `WITH` statement is allowed (parsed with JSqlParser).
  - MongoDB: only read-only stages are allowed. `$out`, `$merge`, `$function`, `$accumulator` and `$where`
    are blocked anywhere in the pipeline, `system.*` collections are blocked, and reads go to secondaries when available.
  - MongoDB credentials go in the user and password fields; a connection string containing them is rejected.
  - `SELECT INTO` and `FOR UPDATE` are rejected.
  - Connections are read-only, with a query timeout and a row limit.
- **14 chart types:**
  - Values: table, number, trend (vs previous period), progress (vs goal), gauge.
  - Charts: bar, row, line, area, combo (bars plus lines on a second axis), pie, scatter/bubble, funnel, waterfall.
- **Chart settings drawer:**
  - Pick the columns for each axis, or split long-format data into series (for example month × channel).
  - Stacking: normal or 100%. Goal lines, values on the chart, and "higher is better" for trend and gauge.
  - Number format: plain, percent or compact (1.2K), with decimals and a prefix or suffix such as `₼` or `AZN`.
  - A "Chart gallery" dashboard shows one example of each type.
- **Saved questions** (SQL plus chart settings).
- **Filters:**
  - In a query, `{{name}}` is a variable and `[[ ... ]]` is optional: it is left out when a variable inside is empty.
    ```sql
    SELECT count(*) FROM transactions
    WHERE status = 'success'
      [[AND created_at >= {{date_from}}]]
      [[AND channel = {{channel}}]]
    ```
    MongoDB works the same way: `{ "$match": { "platform": {{platform}} } }`. Don't put quotes around `{{name}}`.
  - Each variable is text, number or date, entered freely or picked from a dropdown.
    Dropdown values come from a fixed list or from a column (distinct values, cached 10 minutes).
  - Date defaults can be relative and stay current: `today`, `yesterday`, `-30d`, `-6m`, `start_of_month`, `start_of_year`.
  - Dashboard filters sit at the top of a dashboard. Each one connects to a variable in each card,
    automatically when the names match.
  - Filter values are kept in the URL, so a filtered view can be shared as a link.
  - Values are bound as JDBC parameters or typed BSON values, never pasted into the query text,
    and the audit log records the values used.
  - The "Transactions explorer" demo dashboard shows filters in action.
- **Dashboards:** drag-and-resize grid, add or remove cards, auto-refresh, CSV per card.
- **Audit log:** every query run is recorded with user, SQL, rows, duration and errors.

## Run locally (development)

Requirements: Java 21, Node 20+, Docker.

```bash
# 1. Databases: app metadata DB (port 5433), sample Postgres bank DB (port 5434)
#    and sample MongoDB with app events and support tickets (port 27018), all with synthetic data
docker compose up -d app-db sample-db sample-mongo

# 2. Backend on http://localhost:8095
cd backend && ./mvnw spring-boot:run

# 3. Frontend on http://localhost:5173 (proxies /api to the backend)
cd frontend && npm install && npm run dev
```

Sign in with `admin@birbank.local` / `admin123`. Change this password, or set
`ADMIN_EMAIL` / `ADMIN_PASSWORD` before the first start.

On first start, the backend creates the admin user and two demo setups:
- a "Bank sample (Postgres)" data source with the "Retail banking overview" dashboard;
- a "Bank events (MongoDB)" data source with the "Digital channels (MongoDB)" dashboard.

## Run everything in Docker

```bash
SECRET_KEY='a-long-random-string' docker compose --profile full up -d --build
# open http://localhost:3000
```

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | local Postgres on 5433 | App metadata database |
| `SECRET_KEY` | dev value | Encrypts data source passwords. **Set it in every real environment and keep it stable.** |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `admin@birbank.local` / `admin123` | First admin, created only when no users exist |
| `SAMPLE_DB_URL` | local sample DB | Leave empty to skip the Postgres demo |
| `SAMPLE_MONGO_URL` | local sample MongoDB | Leave empty to skip the MongoDB demo. It is re-added on restart while no MongoDB data source exists. |
| `QUERY_MAX_ROWS` | 10000 | Max rows returned per query |
| `QUERY_TIMEOUT_SECONDS` | 60 | Query timeout |
| `PORT` | 8095 | Backend port |

## Project layout

```
backend/   Spring Boot API
  auth/        login, users, roles
  datasource/  connections, pools, encryption, schema metadata
  query/       SQL guard + execution, routes MongoDB queries to mongo/
  params/      filter variables: template rendering, relative dates, dropdown values
  mongo/       MongoDB client, pipeline guard, document flattening, schema sampling
  question/    saved questions
  dashboard/   dashboards and card layout
  audit/       audit log
  resources/db/migration/  Flyway migrations
frontend/  React app (src/pages, src/components, src/api.ts)
docker/    sample database seeds (Postgres and MongoDB)
```

## Before production at a bank (not done yet)

- **SSO:** Keycloak or Active Directory via Spring Security OAuth2/LDAP, instead of local passwords.
- **Fine-grained permissions:** per data source, schema and table; collections or folders for dashboards.
- **Row-level security and column masking:** for example card numbers, FIN codes and phone numbers.
- **More chart types:** pivot table, map of Azerbaijan regions, sankey, box plot, and per-series colors.
- **Multi-select filters** (`IN` lists), date-range pickers, and filters linked to each other (branch list narrowed by city).
- **Visual (no-SQL) query builder.**
- **Scheduled email reports and alerts** (Quartz).
- **Result caching** (Redis) and per-user query concurrency limits.
- **Audit exports to SIEM.** CSV downloads are currently client-side and not audited separately.
- **Secrets in a vault** (HashiCorp Vault or Azure Key Vault) instead of `SECRET_KEY`.
- **Disabled users:** existing sessions currently stay valid until they expire (8h).
- **Data source URL hardening:** admins can add JDBC URLs, and some driver URL options are
  dangerous (for example MySQL `allowLoadLocalInfile`, PostgreSQL `socketFactory`).
  Restrict them with an allow-list.
- **Tests and CI.**
