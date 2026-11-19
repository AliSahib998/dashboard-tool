import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DatePicker, Input, InputNumber, Select } from 'antd'
import dayjs from 'dayjs'
import type { ParameterDef } from '../api'
import { describeDate } from '../params'

interface Props {
  def: ParameterDef
  value: string | undefined
  onChange: (value: string | undefined) => void
  /** Loads dropdown values from the server, when the parameter reads them from a column. */
  loadOptions?: () => Promise<string[]>
  optionsKey?: unknown[]
}

/** Text input that only commits on Enter or blur, so typing does not re-run every card. */
function CommitInput({ value, onCommit, placeholder }: { value?: string; onCommit: (v?: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])
  const commit = () => onCommit(draft.trim() || undefined)
  return (
    <Input value={draft} placeholder={placeholder} allowClear style={{ width: 170 }}
      onChange={(e) => {
        setDraft(e.target.value)
        if (e.type === 'click') onCommit(undefined) // clear button
      }}
      onPressEnter={commit} onBlur={commit} />
  )
}

export default function ParameterWidget({ def, value, onChange, loadOptions, optionsKey }: Props) {
  const fromColumn = def.widget === 'dropdown' && !!def.source && !!loadOptions
  const options = useQuery({
    queryKey: optionsKey ?? ['values', def.name],
    queryFn: () => loadOptions!(),
    enabled: fromColumn,
    staleTime: 5 * 60_000,
  })
  const placeholder = def.defaultValue
    ? `Default: ${def.type === 'date' ? describeDate(def.defaultValue) : def.defaultValue}`
    : 'All'

  let control
  if (def.widget === 'dropdown') {
    const values = fromColumn ? options.data ?? [] : def.options ?? []
    control = (
      <Select showSearch allowClear style={{ width: 190 }} placeholder={placeholder} value={value}
        loading={options.isLoading} options={values.map((v) => ({ value: v, label: v }))}
        onChange={(v) => onChange(v ?? undefined)} popupMatchSelectWidth={false} />
    )
  } else if (def.type === 'date') {
    const parsed = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? dayjs(value) : null
    control = (
      <DatePicker style={{ width: 170 }} value={parsed} placeholder={value && !parsed ? describeDate(value) ?? value : placeholder}
        onChange={(d) => onChange(d ? d.format('YYYY-MM-DD') : undefined)} />
    )
  } else if (def.type === 'number') {
    control = (
      <InputNumber style={{ width: 150 }} placeholder={placeholder} value={value === undefined ? null : Number(value)}
        onChange={(v) => onChange(v === null || v === undefined ? undefined : String(v))} />
    )
  } else {
    control = <CommitInput value={value} onCommit={onChange} placeholder={placeholder} />
  }

  return (
    <div className="filter-widget">
      <div className="filter-label">{def.label || def.name}</div>
      {control}
    </div>
  )
}
