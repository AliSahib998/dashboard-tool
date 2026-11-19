import type { ParameterDef, ParamValues } from './api'

const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/** Variable names used in a query, in order of first use. */
export function extractVariables(text: string): string[] {
  const names: string[] = []
  for (const m of text.matchAll(VARIABLE)) {
    if (!names.includes(m[1])) names.push(m[1])
  }
  return names
}

export function humanize(name: string) {
  const s = name.replace(/_/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function guessType(name: string): ParameterDef['type'] {
  if (/date|day|_from$|_to$|^from$|^to$|since|until/i.test(name)) return 'date'
  if (/amount|count|min|max|limit|number|_id$|^id$/i.test(name)) return 'number'
  return 'text'
}

/** Keeps the saved definitions for variables still in the query and adds defaults for new ones. */
export function syncParams(defs: ParameterDef[], names: string[]): ParameterDef[] {
  return names.map((n) => defs.find((d) => d.name === n)
    ?? { name: n, label: humanize(n), type: guessType(n), widget: 'input' })
}

export function slugify(label: string, taken: string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'filter'
  let name = /^[a-z_]/.test(base) ? base : `f_${base}`
  let i = 2
  while (taken.includes(name)) name = `${base}_${i++}`
  return name
}

const RELATIVE: Record<string, string> = {
  today: 'today', yesterday: 'yesterday', start_of_week: 'start of this week',
  start_of_month: 'start of this month', start_of_year: 'start of this year',
}

/** "-30d" -> "30 days ago" */
export function describeDate(value?: string | null): string | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  if (RELATIVE[v]) return RELATIVE[v]
  const m = v.match(/^([+-]?)(\d+)([dwmy])$/)
  if (m) {
    const unit = { d: 'day', w: 'week', m: 'month', y: 'year' }[m[3]]!
    const n = Number(m[2])
    return m[1] === '-' ? `${n} ${unit}${n === 1 ? '' : 's'} ago` : `in ${n} ${unit}${n === 1 ? '' : 's'}`
  }
  return value
}

/** Only keeps non-empty values. */
export function cleanValues(values: ParamValues): ParamValues {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}
