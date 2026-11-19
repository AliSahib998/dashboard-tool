import type { QueryResult } from './api'

function escape(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // Guard against formula injection when the file is opened in Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(result: QueryResult, filename: string) {
  const lines = [
    result.columns.map((c) => escape(c.name)).join(','),
    ...result.rows.map((r) => r.map(escape).join(',')),
  ]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace(/[^\w\- ]+/g, '_') + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}
