import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Form, Input, Modal, Segmented, Select, Space, Typography } from 'antd'
import { api, type ParameterDef } from '../api'
import { describeDate } from '../params'

interface Props {
  open: boolean
  title: string
  def: ParameterDef | null
  /** Data source to suggest for "values from a column". */
  defaultDataSourceId?: number | null
  onSave: (def: ParameterDef) => void
  onCancel: () => void
  /** Extra content under the form, e.g. which dashboard cards the filter is connected to. */
  children?: ReactNode
  footerExtra?: ReactNode
  /** Dashboard filters are not query variables, so the {{name}} hint is hidden for them. */
  showVariable?: boolean
}

type OptionsMode = 'static' | 'column'

export default function ParameterEditor({
  open, title, def, defaultDataSourceId, onSave, onCancel, children, footerExtra, showVariable = true,
}: Props) {
  const [draft, setDraft] = useState<ParameterDef | null>(def)
  const [mode, setMode] = useState<OptionsMode>(def?.source ? 'column' : 'static')

  useEffect(() => {
    setDraft(def)
    setMode(def?.source ? 'column' : 'static')
  }, [def])

  const dataSources = useQuery({ queryKey: ['datasources'], queryFn: api.dataSources, enabled: open })
  const sourceDs = draft?.source?.dataSourceId ?? defaultDataSourceId ?? dataSources.data?.[0]?.id
  const schema = useQuery({
    queryKey: ['schema', sourceDs],
    queryFn: () => api.schema(sourceDs!),
    enabled: open && mode === 'column' && draft?.widget === 'dropdown' && !!sourceDs,
    staleTime: 5 * 60_000,
  })

  if (!draft) return null
  const set = (patch: Partial<ParameterDef>) => setDraft({ ...draft, ...patch })
  const table = schema.data?.find((t) => (t.schema ? `${t.schema}.${t.name}` : t.name) === draft.source?.table
    || t.name === draft.source?.table)

  const save = () => {
    const clean: ParameterDef = { ...draft }
    if (clean.widget !== 'dropdown') {
      clean.options = null
      clean.source = null
    } else if (mode === 'static') {
      clean.source = null
    } else {
      clean.options = null
    }
    onSave(clean)
  }

  return (
    <Modal open={open} title={title} onCancel={onCancel} onOk={save} okText="Done" width={560} destroyOnHidden
      footer={(_, { OkBtn, CancelBtn }) => (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>{footerExtra}</span>
          <Space><CancelBtn /><OkBtn /></Space>
        </Space>
      )}>
      <Form layout="vertical">
        <Form.Item label="Label" extra={showVariable ? <>Variable: <code>{`{{${draft.name}}}`}</code></> : undefined}>
          <Input value={draft.label ?? ''} onChange={(e) => set({ label: e.target.value })} />
        </Form.Item>
        <Space size="large" wrap>
          <Form.Item label="Type">
            <Segmented value={draft.type ?? 'text'}
              onChange={(v) => set({ type: v as ParameterDef['type'], widget: v === 'date' ? 'input' : draft.widget })}
              options={[{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }]} />
          </Form.Item>
          {draft.type !== 'date' && (
            <Form.Item label="Input">
              <Segmented value={draft.widget ?? 'input'} onChange={(v) => set({ widget: v as ParameterDef['widget'] })}
                options={[{ value: 'input', label: 'Free input' }, { value: 'dropdown', label: 'Dropdown' }]} />
            </Form.Item>
          )}
        </Space>

        {draft.widget === 'dropdown' && draft.type !== 'date' && (
          <>
            <Form.Item label="Dropdown values">
              <Segmented value={mode} onChange={(v) => setMode(v as OptionsMode)}
                options={[{ value: 'column', label: 'From a column' }, { value: 'static', label: 'Fixed list' }]} />
            </Form.Item>
            {mode === 'static' ? (
              <Form.Item extra="Type a value and press Enter.">
                <Select mode="tags" value={draft.options ?? []} onChange={(options) => set({ options })}
                  placeholder="e.g. mobile, web, atm" open={false} />
              </Form.Item>
            ) : (
              <Space wrap align="start">
                <Form.Item label="Data source">
                  <Select style={{ width: 170 }} value={sourceDs} loading={dataSources.isLoading}
                    options={dataSources.data?.map((d) => ({ value: d.id, label: d.name }))}
                    onChange={(id) => set({ source: { dataSourceId: id, table: '', column: '' } })} />
                </Form.Item>
                <Form.Item label="Table">
                  <Select style={{ width: 150 }} showSearch value={draft.source?.table || undefined} loading={schema.isLoading}
                    options={schema.data?.map((t) => {
                      const full = t.schema ? `${t.schema}.${t.name}` : t.name
                      return { value: full, label: t.name }
                    })}
                    onChange={(t) => set({ source: { dataSourceId: sourceDs!, table: t, column: '' } })} />
                </Form.Item>
                <Form.Item label="Column">
                  <Select style={{ width: 150 }} showSearch value={draft.source?.column || undefined}
                    options={table?.columns.map((c) => ({ value: c.name, label: c.name }))}
                    onChange={(c) => set({ source: { dataSourceId: sourceDs!, table: draft.source!.table, column: c } })} />
                </Form.Item>
              </Space>
            )}
          </>
        )}

        <Form.Item label="Default value"
          extra={draft.type === 'date'
            ? <>YYYY-MM-DD or relative: <code>today</code>, <code>yesterday</code>, <code>-30d</code>, <code>-6m</code>,{' '}
                <code>start_of_month</code>, <code>start_of_year</code>.
                {draft.defaultValue && <> Now means: <b>{describeDate(draft.defaultValue)}</b>.</>}</>
            : 'Used when nobody picks a value. Leave empty to show everything.'}>
          <Input value={draft.defaultValue ?? ''} allowClear placeholder={draft.type === 'date' ? '-30d' : ''}
            onChange={(e) => set({ defaultValue: e.target.value || null })} />
        </Form.Item>
        {children}
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
          Filter values are always sent to the database as parameters, never pasted into the query text.
        </Typography.Paragraph>
      </Form>
    </Modal>
  )
}
