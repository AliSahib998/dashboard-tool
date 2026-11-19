export type Role = 'ADMIN' | 'ANALYST' | 'VIEWER'
export type Engine = 'POSTGRES' | 'MYSQL' | 'SQLSERVER' | 'ORACLE' | 'MONGODB'
export type VizType =
  | 'TABLE' | 'NUMBER' | 'TREND' | 'PROGRESS' | 'GAUGE'
  | 'BAR' | 'ROW' | 'LINE' | 'AREA' | 'COMBO' | 'PIE' | 'SCATTER' | 'FUNNEL' | 'WATERFALL'

export interface Me {
  id: number
  email: string
  fullName: string
  role: Role
}

export interface User extends Me {
  active: boolean
  createdAt: string
}

export interface DataSource {
  id: number
  name: string
  engine: Engine
  jdbcUrl: string
  username: string | null
  schemaFilter: string | null
  createdAt: string
}

export interface SaveDataSource {
  name: string
  engine: Engine
  jdbcUrl: string
  username?: string
  password?: string
  schemaFilter?: string
}

export interface SchemaColumn {
  name: string
  type: string
  nullable: boolean
}

export interface SchemaTable {
  schema: string | null
  name: string
  type: string
  columns: SchemaColumn[]
}

export interface QueryResult {
  columns: { name: string; type: 'number' | 'string' | 'date' | 'boolean' }[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
  durationMs: number
}

/** A question variable ({{name}}) or a dashboard filter. */
export interface ParameterDef {
  name: string
  label?: string
  type?: 'text' | 'number' | 'date'
  widget?: 'input' | 'dropdown'
  /** Static dropdown values */
  options?: string[] | null
  /** Dropdown values from a column */
  source?: { dataSourceId: number; table: string; column: string } | null
  /** Dates may be relative: today, yesterday, -30d, -6m, start_of_month... */
  defaultValue?: string | null
}

export type ParamValues = Record<string, string>

export interface Question {
  id: number
  name: string
  description: string | null
  dataSourceId: number
  /** SQL, or for MongoDB the aggregation pipeline (JSON array) */
  sql: string
  /** MongoDB collection, null for SQL data sources */
  collection: string | null
  parameters: ParameterDef[]
  vizType: VizType
  vizSettings: string | null
  updatedAt: string
}

export interface SaveQuestion {
  name: string
  description?: string
  dataSourceId: number
  sql: string
  collection?: string
  parameters?: ParameterDef[]
  vizType: VizType
  vizSettings: string
}

export interface DashboardSummary {
  id: number
  name: string
  description: string | null
  cardCount: number
  updatedAt: string
}

export interface DashboardCard {
  id: number
  question: Question
  x: number
  y: number
  w: number
  h: number
  /** dashboard filter name -> question variable name */
  mappings: Record<string, string>
}

export interface Dashboard {
  id: number
  name: string
  description: string | null
  filters: ParameterDef[]
  cards: DashboardCard[]
  updatedAt: string
}

export interface SaveDashboard {
  name: string
  description?: string | null
  filters?: ParameterDef[]
  cards: { questionId: number; x: number; y: number; w: number; h: number; mappings?: Record<string, string> }[]
}

export interface AuditEntry {
  id: number
  userEmail: string | null
  action: string
  dataSourceId: number | null
  questionId: number | null
  sqlText: string | null
  rowCount: number | null
  durationMs: number | null
  success: boolean
  errorMessage: string | null
  createdAt: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function csrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : undefined
}

async function ensureCsrf() {
  if (!csrfToken()) {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (method !== 'GET') {
    await ensureCsrf()
    const token = csrfToken()
    if (token) headers['X-XSRF-TOKEN'] = token
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    window.dispatchEvent(new Event('auth:expired'))
  }
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`
    try {
      const problem = await res.json()
      if (problem?.detail) message = problem.detail
    } catch {
      // body was not JSON
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const api = {
  login: (email: string, password: string) => request<Me>('POST', '/api/auth/login', { email, password }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  me: () => request<Me>('GET', '/api/auth/me'),

  dataSources: () => request<DataSource[]>('GET', '/api/datasources'),
  createDataSource: (b: SaveDataSource) => request<DataSource>('POST', '/api/datasources', b),
  updateDataSource: (id: number, b: SaveDataSource) => request<DataSource>('PUT', `/api/datasources/${id}`, b),
  deleteDataSource: (id: number) => request<void>('DELETE', `/api/datasources/${id}`),
  testDataSource: (b: SaveDataSource, id?: number) =>
    request<{ ok: boolean; message: string }>('POST', `/api/datasources/test${id ? `?id=${id}` : ''}`, b),
  schema: (id: number) => request<SchemaTable[]>('GET', `/api/datasources/${id}/schema`),

  runSql: (dataSourceId: number, sql: string, collection?: string, parameters?: ParameterDef[], values?: ParamValues) =>
    request<QueryResult>('POST', '/api/query', { dataSourceId, sql, collection, parameters, values }),
  columnValues: (dataSourceId: number, table: string, column: string) =>
    request<string[]>('POST', '/api/query/values', { dataSourceId, table, column }),

  questions: () => request<Question[]>('GET', '/api/questions'),
  question: (id: number) => request<Question>('GET', `/api/questions/${id}`),
  createQuestion: (b: SaveQuestion) => request<Question>('POST', '/api/questions', b),
  updateQuestion: (id: number, b: SaveQuestion) => request<Question>('PUT', `/api/questions/${id}`, b),
  deleteQuestion: (id: number) => request<void>('DELETE', `/api/questions/${id}`),
  runQuestion: (id: number, values: ParamValues = {}) =>
    request<QueryResult>('POST', `/api/questions/${id}/run`, { values }),
  questionParamValues: (id: number, name: string) =>
    request<string[]>('GET', `/api/questions/${id}/parameters/${encodeURIComponent(name)}/values`),
  dashboardFilterValues: (id: number, name: string) =>
    request<string[]>('GET', `/api/dashboards/${id}/filters/${encodeURIComponent(name)}/values`),

  dashboards: () => request<DashboardSummary[]>('GET', '/api/dashboards'),
  dashboard: (id: number) => request<Dashboard>('GET', `/api/dashboards/${id}`),
  createDashboard: (b: SaveDashboard) => request<Dashboard>('POST', '/api/dashboards', b),
  updateDashboard: (id: number, b: SaveDashboard) => request<Dashboard>('PUT', `/api/dashboards/${id}`, b),
  deleteDashboard: (id: number) => request<void>('DELETE', `/api/dashboards/${id}`),

  users: () => request<User[]>('GET', '/api/users'),
  createUser: (b: { email: string; fullName: string; password: string; role: Role }) =>
    request<User>('POST', '/api/users', b),
  updateUser: (id: number, b: { fullName: string; role: Role; active: boolean; password?: string }) =>
    request<User>('PUT', `/api/users/${id}`, b),

  audit: (page: number, size: number) =>
    request<{ items: AuditEntry[]; total: number; page: number; size: number }>(
      'GET', `/api/audit?page=${page}&size=${size}`),
}

export function parseSettings(json: string | null | undefined): VizSettings {
  if (!json) return {}
  try {
    return JSON.parse(json) as VizSettings
  } catch {
    return {}
  }
}

export interface NumberFormat {
  /** number: 1,234.5 · percent: 0.25 shown as 25% · compact: 1.2M */
  style?: 'number' | 'percent' | 'compact'
  decimals?: number
  prefix?: string
  suffix?: string
}

export interface VizSettings {
  /** Category / label column (or the numeric X column for scatter, the date column for trend) */
  x?: string
  /** Value columns */
  y?: string[]
  /** Split one value column into a series per distinct value of this column (long-format data) */
  series?: string
  /** Single value column for number, trend, progress and gauge */
  value?: string
  /** Scatter: column that controls bubble size */
  size?: string
  stack?: 'none' | 'normal' | 'percent'
  /** Combo: value columns drawn as lines on a right-hand axis; the rest are bars */
  lineSeries?: string[]
  /** Goal line (bar/row/line/area/combo) or target (progress) */
  goal?: number
  goalLabel?: string
  /** Gauge range */
  min?: number
  max?: number
  /** Trend and gauge: whether a higher value is good (green) or bad (red) */
  upIsGood?: boolean
  /** Waterfall: add a total bar at the end */
  showTotal?: boolean
  showLabels?: boolean
  format?: NumberFormat
}
