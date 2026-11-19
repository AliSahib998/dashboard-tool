import { Empty, Progress, Table, Typography } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import type { NumberFormat, QueryResult, VizSettings, VizType } from '../api'

interface Props {
  result: QueryResult
  vizType: VizType
  settings: VizSettings
  height?: number | string
}

// ECharts callback parameters are loosely typed unions; this keeps the option builders readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

export const PALETTE = ['#5b3fd9', '#16a3a3', '#f59f00', '#e8590c', '#2f9e44', '#d6336c', '#1c7ed6', '#868e96',
  '#9c36b5', '#66a80f']
const GOOD = '#2f9e44'
const BAD = '#e03131'
const MAX_SERIES = 30

/** Which settings each chart type uses. Drives both rendering and the settings form. */
export const CARTESIAN: VizType[] = ['BAR', 'ROW', 'LINE', 'AREA', 'COMBO']
export const SINGLE_VALUE: VizType[] = ['NUMBER', 'TREND', 'PROGRESS', 'GAUGE']
export const STACKABLE: VizType[] = ['BAR', 'ROW', 'LINE', 'AREA']

export function formatValue(v: unknown, fmt: NumberFormat = {}): string {
  if (v === null || v === undefined || v === '') return ''
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return String(v)
  const d = fmt.decimals
  let body: string
  if (fmt.style === 'percent') {
    body = (n * 100).toLocaleString(undefined, { minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 2 }) + '%'
  } else if (fmt.style === 'compact') {
    body = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: d ?? 1 }).format(n)
  } else {
    body = n.toLocaleString(undefined, { minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 2 })
  }
  return (fmt.prefix ?? '') + body + (fmt.suffix ?? '')
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/** Category label; midnight timestamps are shown as plain dates. */
function label(v: unknown, type?: string): string {
  if (v === null || v === undefined) return '(empty)'
  const s = String(v)
  return type === 'date' ? s.replace(/T00:00(:00(\.0+)?)?$/, '') : s
}

function niceCeil(x: number) {
  if (x <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(x))
  return Math.ceil(x / p) * p
}

/** Picks sensible columns when the user has not chosen any. */
export function defaultSettings(result: QueryResult, vizType: VizType): VizSettings {
  const cols = result.columns
  const numeric = cols.filter((c) => c.type === 'number').map((c) => c.name)
  const nonNumeric = cols.filter((c) => c.type !== 'number').map((c) => c.name)
  switch (vizType) {
    case 'NUMBER':
    case 'PROGRESS':
    case 'GAUGE':
      return { value: numeric[0] ?? cols[0]?.name }
    case 'TREND':
      return { x: (cols.find((c) => c.type === 'date') ?? cols.find((c) => c.type !== 'number'))?.name, value: numeric[0] }
    case 'SCATTER':
      return { x: numeric[0], y: numeric.slice(1, 2), series: nonNumeric[0] }
    case 'PIE':
    case 'FUNNEL':
    case 'WATERFALL': {
      const x = nonNumeric[0] ?? cols[0]?.name
      return { x, y: numeric.filter((n) => n !== x).slice(0, 1) }
    }
    default: {
      const x = nonNumeric[0] ?? cols[0]?.name
      const y = numeric.filter((n) => n !== x)
      // Long-format data (e.g. month, channel, count) is split into one series per channel.
      const series = nonNumeric.length >= 2 && numeric.length === 1 && vizType !== 'COMBO' ? nonNumeric[1] : undefined
      return { x, y, series, lineSeries: vizType === 'COMBO' ? y.slice(1) : undefined }
    }
  }
}

/** Defaults merged with the saved settings, dropping columns that no longer exist in the result. */
export function resolveSettings(result: QueryResult, vizType: VizType, s: VizSettings): VizSettings {
  const d = defaultSettings(result, vizType)
  const names = new Set(result.columns.map((c) => c.name))
  const ok = (n?: string) => n !== undefined && names.has(n)
  const ys = s.y?.filter(ok)
  return {
    ...s,
    x: ok(s.x) ? s.x : d.x,
    y: ys && ys.length ? ys : d.y,
    value: ok(s.value) ? s.value : d.value,
    // An empty string means the user explicitly chose "no split".
    series: s.series === undefined ? d.series : ok(s.series) ? s.series : undefined,
    size: ok(s.size) ? s.size : undefined,
    lineSeries: s.lineSeries ?? d.lineSeries,
  }
}

export function ResultTable({ result, height }: { result: QueryResult; height?: number | string }) {
  const columns = result.columns.map((c, i) => ({
    title: c.name,
    dataIndex: i,
    key: i,
    ellipsis: true,
    align: c.type === 'number' ? ('right' as const) : ('left' as const),
    render: (v: unknown) => (v === null ? <span style={{ color: '#bbb' }}>null</span>
      : c.type === 'number' ? formatValue(v) : String(v)),
    sorter: (a: Record<number, unknown>, b: Record<number, unknown>) => {
      const x = a[i], y = b[i]
      if (x === y) return 0
      if (x === null || x === undefined) return -1
      if (y === null || y === undefined) return 1
      return c.type === 'number' ? Number(x) - Number(y) : String(x).localeCompare(String(y))
    },
  }))
  const data = result.rows.map((r, idx) => ({ key: idx, ...Object.fromEntries(r.map((v, i) => [i, v])) }))
  return (
    <Table size="small" columns={columns} dataSource={data} bordered
      pagination={result.rows.length > 100 ? { pageSize: 100, showSizeChanger: false } : false}
      scroll={{ x: 'max-content', y: typeof height === 'number' ? height - 60 : undefined }} />
  )
}

// ---------- option builders ----------

function cartesianData(result: QueryResult, s: VizSettings) {
  const idx = (n?: string) => result.columns.findIndex((c) => c.name === n)
  const xi = idx(s.x)
  const xType = result.columns[xi]?.type
  const ys = s.y ?? []

  if (s.series) {
    const si = idx(s.series)
    const yi = idx(ys[0])
    const sType = result.columns[si]?.type
    const categories: string[] = []
    const catIndex = new Map<string, number>()
    const keys: string[] = []
    for (const r of result.rows) {
      const c = label(r[xi], xType)
      if (!catIndex.has(c)) { catIndex.set(c, categories.length); categories.push(c) }
      const k = label(r[si], sType)
      if (!keys.includes(k) && keys.length < MAX_SERIES) keys.push(k)
    }
    const data = new Map(keys.map((k) => [k, new Array<number | null>(categories.length).fill(null)]))
    for (const r of result.rows) {
      const arr = data.get(label(r[si], sType))
      const v = num(r[yi])
      if (!arr || v === null) continue
      const i = catIndex.get(label(r[xi], xType))!
      arr[i] = (arr[i] ?? 0) + v
    }
    return { categories, series: keys.map((k) => ({ name: k, data: data.get(k)! })) }
  }

  return {
    categories: result.rows.map((r) => label(r[xi], xType)),
    series: ys.map((y) => {
      const yi = idx(y)
      return { name: y, data: result.rows.map((r) => num(r[yi])) }
    }),
  }
}

function cartesianOption(result: QueryResult, vizType: VizType, s: VizSettings): EChartsOption | null {
  if (!s.x || !s.y?.length) return null
  const { categories, series } = cartesianData(result, s)
  const fmt = s.format ?? {}
  const horizontal = vizType === 'ROW'
  const stackMode = STACKABLE.includes(vizType) ? s.stack ?? 'none' : 'none'
  const percent = stackMode === 'percent'
  const valueFmt: NumberFormat = percent ? { style: 'percent', decimals: 0 } : fmt

  if (percent) {
    for (let i = 0; i < categories.length; i++) {
      const total = series.reduce((sum, se) => sum + Math.abs(se.data[i] ?? 0), 0)
      for (const se of series) se.data[i] = total ? (se.data[i] ?? 0) / total : null
    }
  }

  const lineSet = new Set(vizType === 'COMBO' ? s.lineSeries ?? [] : [])
  const dualAxis = vizType === 'COMBO' && series.some((se) => lineSet.has(se.name)) && series.some((se) => !lineSet.has(se.name))
  const hasGoal = typeof s.goal === 'number' && !percent

  const echSeries = series.map((se, i) => {
    const asLine = vizType === 'LINE' || vizType === 'AREA' || lineSet.has(se.name)
    return {
      name: se.name,
      type: asLine ? 'line' : 'bar',
      data: se.data,
      stack: stackMode !== 'none' ? 'total' : undefined,
      smooth: asLine,
      showSymbol: asLine && categories.length < 40,
      connectNulls: asLine,
      areaStyle: vizType === 'AREA' ? { opacity: stackMode !== 'none' ? 0.6 : 0.25 } : undefined,
      yAxisIndex: dualAxis && lineSet.has(se.name) ? 1 : 0,
      barMaxWidth: 48,
      label: s.showLabels ? {
        show: true,
        position: stackMode !== 'none' ? 'inside' : horizontal ? 'right' : 'top',
        fontSize: 11,
        formatter: (p: Any) => formatValue(p.value, valueFmt),
      } : undefined,
      markLine: i === 0 && hasGoal ? {
        symbol: 'none',
        silent: true,
        lineStyle: { type: 'dashed', color: BAD },
        label: { formatter: s.goalLabel || `Goal: ${formatValue(s.goal, fmt)}`, position: 'insideEndTop', color: BAD },
        data: [horizontal ? { xAxis: s.goal } : { yAxis: s.goal }],
      } : undefined,
    }
  })

  const categoryAxis = { type: 'category', data: categories, inverse: horizontal, axisLabel: { hideOverlap: true } }
  const valueAxis = (f: NumberFormat, extra: object = {}) => ({
    type: 'value',
    max: percent ? 1 : undefined,
    axisLabel: { formatter: (v: number) => formatValue(v, f.style === 'percent' ? f : { ...f, style: 'compact' }) },
    splitLine: { lineStyle: { color: '#eef0f5' } },
    ...extra,
  })

  return {
    color: PALETTE,
    legend: series.length > 1 ? { type: 'scroll', top: 0 } : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: vizType === 'LINE' || vizType === 'AREA' ? 'line' : 'shadow' },
      valueFormatter: (v: Any) => formatValue(v, valueFmt),
    },
    grid: { left: 8, right: 16, top: series.length > 1 ? 32 : 16, bottom: 8, containLabel: true },
    xAxis: horizontal ? valueAxis(valueFmt) : categoryAxis,
    yAxis: horizontal ? categoryAxis
      : dualAxis ? [valueAxis(fmt), valueAxis(fmt, { splitLine: { show: false } })]
      : valueAxis(valueFmt),
    dataZoom: !horizontal && categories.length > 60 ? [{ type: 'inside' }] : undefined,
    series: echSeries,
  } as unknown as EChartsOption
}

function pieOption(result: QueryResult, s: VizSettings): EChartsOption | null {
  const idx = (n?: string) => result.columns.findIndex((c) => c.name === n)
  const xi = idx(s.x), yi = idx(s.y?.[0])
  if (xi < 0 || yi < 0) return null
  const fmt = s.format ?? {}
  return {
    color: PALETTE,
    tooltip: { trigger: 'item', valueFormatter: (v: Any) => formatValue(v, fmt) },
    legend: { type: 'scroll', bottom: 0 },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
      data: result.rows.map((r) => ({ name: label(r[xi], result.columns[xi].type), value: num(r[yi]) ?? 0 })),
      label: { formatter: s.showLabels ? (p: Any) => `${p.name}: ${formatValue(p.value, fmt)}` : '{b}: {d}%' },
    }],
  } as unknown as EChartsOption
}

function scatterOption(result: QueryResult, s: VizSettings): EChartsOption | null {
  const idx = (n?: string) => result.columns.findIndex((c) => c.name === n)
  const xi = idx(s.x), yi = idx(s.y?.[0]), si = idx(s.series), zi = idx(s.size)
  if (xi < 0 || yi < 0) return null
  const fmt = s.format ?? {}

  const groups = new Map<string, (number | null)[][]>()
  for (const r of result.rows) {
    const key = si >= 0 ? label(r[si], result.columns[si].type) : s.y![0]
    if (!groups.has(key) && groups.size >= MAX_SERIES) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push([num(r[xi]), num(r[yi]), zi >= 0 ? num(r[zi]) : null])
  }

  let symbolSize: number | ((v: number[]) => number) = 8
  if (zi >= 0) {
    const sizes = result.rows.map((r) => num(r[zi])).filter((v): v is number => v !== null)
    const min = Math.min(...sizes), max = Math.max(...sizes)
    symbolSize = (v: number[]) => 6 + 34 * Math.sqrt(((v[2] ?? min) - min) / (max - min || 1))
  }

  const axis = (name: string) => ({
    type: 'value', scale: true, name, nameLocation: 'middle', nameGap: 30,
    axisLabel: { formatter: (v: number) => formatValue(v, { style: 'compact' }) },
    splitLine: { lineStyle: { color: '#eef0f5' } },
  })

  return {
    color: PALETTE,
    legend: groups.size > 1 ? { type: 'scroll', top: 0 } : undefined,
    tooltip: {
      trigger: 'item',
      formatter: (p: Any) => [
        groups.size > 1 ? `<b>${p.seriesName}</b>` : '',
        `${s.x}: ${formatValue(p.value[0])}`,
        `${s.y![0]}: ${formatValue(p.value[1], fmt)}`,
        zi >= 0 ? `${s.size}: ${formatValue(p.value[2])}` : '',
      ].filter(Boolean).join('<br/>'),
    },
    grid: { left: 24, right: 24, top: groups.size > 1 ? 36 : 16, bottom: 32, containLabel: true },
    xAxis: axis(s.x!),
    yAxis: axis(s.y![0]),
    series: [...groups.entries()].map(([name, data]) => ({
      name, type: 'scatter', data, symbolSize, large: data.length > 2000, itemStyle: { opacity: 0.7 },
    })),
  } as unknown as EChartsOption
}

function funnelOption(result: QueryResult, s: VizSettings): EChartsOption | null {
  const idx = (n?: string) => result.columns.findIndex((c) => c.name === n)
  const xi = idx(s.x), yi = idx(s.y?.[0])
  if (xi < 0 || yi < 0) return null
  const fmt = s.format ?? {}
  const data = result.rows.map((r) => ({ name: label(r[xi], result.columns[xi].type), value: num(r[yi]) ?? 0 }))
  const first = data[0]?.value || 1
  return {
    color: PALETTE,
    tooltip: { trigger: 'item', formatter: (p: Any) => `${p.name}: ${formatValue(p.value, fmt)} (${Math.round((p.value / first) * 100)}% of first step)` },
    series: [{
      type: 'funnel', sort: 'none', left: '8%', width: '84%', top: 8, bottom: 8, gap: 2, minSize: '8%',
      label: { show: true, position: 'inside', color: '#fff',
        formatter: (p: Any) => `${p.name}\n${formatValue(p.value, fmt)} · ${Math.round((p.value / first) * 100)}%` },
      data,
    }],
  } as unknown as EChartsOption
}

function waterfallOption(result: QueryResult, s: VizSettings): EChartsOption | null {
  const idx = (n?: string) => result.columns.findIndex((c) => c.name === n)
  const xi = idx(s.x), yi = idx(s.y?.[0])
  if (xi < 0 || yi < 0) return null
  const fmt = s.format ?? {}
  const categories = result.rows.map((r) => label(r[xi], result.columns[xi].type))
  let running = 0
  const items = result.rows.map((r, i) => {
    const d = num(r[yi]) ?? 0
    const item = { value: [i, running, running + d, d], itemStyle: { color: d >= 0 ? GOOD : BAD } }
    running += d
    return item
  })
  if (s.showTotal !== false) {
    items.push({ value: [categories.length, 0, running, running], itemStyle: { color: PALETTE[0] } })
    categories.push('Total')
  }
  return {
    tooltip: { trigger: 'item', formatter: (p: Any) => `${categories[p.value[0]]}: ${formatValue(p.value[3], fmt)}` },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: categories, axisLabel: { hideOverlap: true } },
    yAxis: {
      type: 'value', splitLine: { lineStyle: { color: '#eef0f5' } },
      axisLabel: { formatter: (v: number) => formatValue(v, { ...fmt, style: fmt.style === 'percent' ? 'percent' : 'compact' }) },
    },
    series: [{
      type: 'custom',
      encode: { x: 0, y: [1, 2] },
      data: items,
      renderItem: (_params: Any, api: Any) => {
        const start = api.coord([api.value(0), api.value(1)])
        const end = api.coord([api.value(0), api.value(2)])
        const width = api.size([1, 0])[0] * 0.6
        return {
          type: 'rect',
          shape: { x: start[0] - width / 2, y: Math.min(start[1], end[1]), width, height: Math.max(1, Math.abs(start[1] - end[1])) },
          style: api.style(),
        }
      },
      label: s.showLabels ? { show: true, position: 'top', formatter: (p: Any) => formatValue(p.value[3], fmt) } : undefined,
    }],
  } as unknown as EChartsOption
}

function gaugeOption(value: number | null, s: VizSettings): EChartsOption {
  const fmt = s.format ?? {}
  const v = value ?? 0
  const min = s.min ?? 0
  const max = s.max ?? (v >= 0 && v <= 1 ? 1 : v <= 100 ? 100 : niceCeil(v * 1.25))
  const bands = s.upIsGood === false
    ? [[0.3, GOOD], [0.7, '#f59f00'], [1, BAD]]
    : [[0.3, BAD], [0.7, '#f59f00'], [1, GOOD]]
  const axisFmt: NumberFormat = fmt.style === 'percent' ? { style: 'percent', decimals: 0 } : { ...fmt, style: 'compact', decimals: 1 }
  return {
    series: [{
      type: 'gauge', min, max, radius: '95%', center: ['50%', '58%'], startAngle: 200, endAngle: -20,
      axisLine: { lineStyle: { width: 14, color: bands } },
      pointer: { width: 5, itemStyle: { color: '#1f2a44' } },
      axisTick: { show: false },
      splitNumber: 4,
      splitLine: { length: 10, distance: 2, lineStyle: { width: 2, color: '#999' } },
      axisLabel: { distance: 20, fontSize: 10, color: '#8a8fa3', formatter: (x: number) => formatValue(x, axisFmt) },
      detail: { valueAnimation: true, formatter: (x: number) => formatValue(x, fmt), fontSize: 22, fontWeight: 700,
        offsetCenter: [0, '40%'], color: '#1f2a44' },
      title: { show: false },
      data: [{ value: v }],
    }],
  } as unknown as EChartsOption
}

// ---------- single-value views ----------

function TrendView({ result, s }: { result: QueryResult; s: VizSettings }) {
  const fmt = s.format ?? {}
  const xi = result.columns.findIndex((c) => c.name === s.x)
  const vi = result.columns.findIndex((c) => c.name === s.value)
  const rows = xi < 0 ? result.rows : [...result.rows].sort((a, b) => {
    const x = a[xi], y = b[xi]
    if (typeof x === 'number' && typeof y === 'number') return x - y
    return String(x).localeCompare(String(y))
  })
  const last = rows[rows.length - 1]
  const prev = rows.length > 1 ? rows[rows.length - 2] : null
  const lv = num(last?.[vi])
  const pv = prev ? num(prev[vi]) : null
  const change = lv !== null && pv !== null && pv !== 0 ? (lv - pv) / Math.abs(pv) : null
  const up = change !== null && change > 0
  const good = change === null || change === 0 ? null : up === (s.upIsGood !== false)
  const color = good === null ? '#8a8fa3' : good ? GOOD : BAD

  return (
    <div className="number-viz">
      <div className="value">{formatValue(lv, fmt)}</div>
      {change !== null && (
        <div style={{ color, fontWeight: 600, fontSize: 16 }}>
          {up ? <ArrowUpOutlined /> : change < 0 ? <ArrowDownOutlined /> : null}{' '}
          {formatValue(Math.abs(change), { style: 'percent', decimals: 1 })}
        </div>
      )}
      {prev && (
        <div className="label">
          vs {xi >= 0 ? label(prev[xi], result.columns[xi].type) : 'previous'}: {formatValue(pv, fmt)}
        </div>
      )}
    </div>
  )
}

function ProgressView({ value, s }: { value: number | null; s: VizSettings }) {
  const fmt = s.format ?? {}
  const goal = s.goal
  if (typeof goal !== 'number' || goal === 0) {
    return (
      <div className="number-viz">
        <div className="value">{formatValue(value, fmt)}</div>
        <div className="label">Set a goal in the chart settings</div>
      </div>
    )
  }
  const pct = ((value ?? 0) / goal) * 100
  return (
    <div className="number-viz" style={{ padding: '0 16px' }}>
      <div className="value">{formatValue(value, fmt)}</div>
      <Progress percent={Math.max(0, Math.min(pct, 100))} showInfo={false} strokeColor={pct >= 100 ? GOOD : PALETTE[0]}
        style={{ width: '90%', margin: '4px 0' }} />
      <Typography.Text type="secondary">
        {pct >= 100
          ? `Goal reached: ${formatValue(goal, fmt)} (${Math.round(pct)}%)`
          : `${Math.round(pct)}% of goal ${formatValue(goal, fmt)}`}
      </Typography.Text>
    </div>
  )
}

export default function Visualization({ result, vizType, settings, height = 360 }: Props) {
  const s = useMemo(() => resolveSettings(result, vizType, settings), [result, vizType, settings])

  const option = useMemo<EChartsOption | null>(() => {
    if (CARTESIAN.includes(vizType)) return cartesianOption(result, vizType, s)
    switch (vizType) {
      case 'PIE': return pieOption(result, s)
      case 'SCATTER': return scatterOption(result, s)
      case 'FUNNEL': return funnelOption(result, s)
      case 'WATERFALL': return waterfallOption(result, s)
      case 'GAUGE': {
        const vi = result.columns.findIndex((c) => c.name === s.value)
        return gaugeOption(num(result.rows[0]?.[vi >= 0 ? vi : 0]), s)
      }
      default: return null
    }
  }, [result, vizType, s])

  if (result.rows.length === 0) {
    return <Empty description="No rows" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  if (vizType === 'NUMBER' || vizType === 'PROGRESS') {
    const vi = result.columns.findIndex((c) => c.name === s.value)
    const value = num(result.rows[0][vi >= 0 ? vi : 0])
    if (vizType === 'PROGRESS') return <ProgressView value={value} s={s} />
    return (
      <div className="number-viz">
        <div className="value">{formatValue(value, s.format)}</div>
        <div className="label">{s.value}</div>
      </div>
    )
  }

  if (vizType === 'TREND') return <TrendView result={result} s={s} />

  if (vizType === 'TABLE' || !option) {
    return <ResultTable result={result} height={height} />
  }

  return <ReactECharts option={option} notMerge style={{ height, width: '100%' }} />
}
