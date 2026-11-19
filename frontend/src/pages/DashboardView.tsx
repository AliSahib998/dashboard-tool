import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, App, Button, Card, Dropdown, Empty, Form, Input, Modal, Popconfirm, Select, Space, Spin, Tooltip, Typography,
} from 'antd'
import {
  CloseOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, FilterOutlined, MoreOutlined, PlusOutlined,
  ReloadOutlined, SaveOutlined, SettingOutlined,
} from '@ant-design/icons'
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import {
  api, parseSettings, type DashboardCard, type ParameterDef, type ParamValues, type QueryResult, type Question,
} from '../api'
import Visualization from '../components/Visualization'
import ParameterWidget from '../components/ParameterWidget'
import ParameterEditor from '../components/ParameterEditor'
import { canEdit, useAuth } from '../auth'
import { downloadCsv } from '../csv'
import { slugify } from '../params'

interface EditCard {
  key: string
  question: Question
  x: number
  y: number
  w: number
  h: number
  /** dashboard filter name -> question variable name */
  mappings: Record<string, string>
}

const REFRESH_OPTIONS = [
  { value: 0, label: 'Auto-refresh off' },
  { value: 60_000, label: 'Every 1 min' },
  { value: 300_000, label: 'Every 5 min' },
  { value: 900_000, label: 'Every 15 min' },
]

/** The values a card's question receives: each connected filter's value, under the card's variable name. */
function cardValues(card: EditCard, filterValues: ParamValues): ParamValues {
  const out: ParamValues = {}
  for (const [filter, variable] of Object.entries(card.mappings)) {
    const v = filterValues[filter]
    if (v && variable) out[variable] = v
  }
  return out
}

function CardContent({ question, values, refreshMs }: { question: Question; values: ParamValues; refreshMs: number }) {
  const result = useQuery({
    queryKey: ['run', question.id, values],
    queryFn: () => api.runQuestion(question.id, values),
    refetchInterval: refreshMs || false,
    staleTime: 30_000,
  })
  if (result.isLoading) return <Spin style={{ display: 'block', margin: 24 }} />
  if (result.error) return <Alert type="error" title={result.error.message} showIcon />
  if (!result.data) return null
  return <Visualization result={result.data} vizType={question.vizType}
    settings={parseSettings(question.vizSettings)} height="100%" />
}

export default function DashboardView() {
  const id = Number(useParams().id)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const { user } = useAuth()
  const { width, containerRef, mounted } = useContainerWidth()

  const dashboard = useQuery({ queryKey: ['dashboard', id], queryFn: () => api.dashboard(id) })
  const [editing, setEditing] = useState(searchParams.get('edit') === '1' && canEdit(user))
  const [cards, setCards] = useState<EditCard[]>([])
  const [filters, setFilters] = useState<ParameterDef[]>([])
  const [name, setName] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [refreshMs, setRefreshMs] = useState(0)
  // Filter being edited, whether it is new, and its card connections (card key -> variable).
  const [filterEdit, setFilterEdit] = useState<{ def: ParameterDef; isNew: boolean } | null>(null)
  const [filterLinks, setFilterLinks] = useState<Record<string, string | undefined>>({})

  const resetFromServer = () => {
    if (!dashboard.data) return
    setName(dashboard.data.name)
    setFilters(dashboard.data.filters ?? [])
    setCards(dashboard.data.cards.map((c: DashboardCard) => ({
      key: `c${c.id}`, question: c.question, x: c.x, y: c.y, w: c.w, h: c.h, mappings: c.mappings ?? {},
    })))
  }

  useEffect(resetFromServer, [dashboard.data])

  // Current filter values: from the URL (shareable), else each filter's default.
  const filterValues = useMemo(() => {
    const out: ParamValues = {}
    for (const f of filters) {
      const v = searchParams.get(f.name) ?? f.defaultValue ?? ''
      if (v) out[f.name] = v
    }
    return out
  }, [filters, searchParams])
  const hasUrlFilters = filters.some((f) => searchParams.has(f.name))

  const setFilterValue = (filterName: string, v?: string) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    next.delete('edit')
    // An explicitly cleared filter that has a default is stored as empty, so the default does not come back.
    if (v) next.set(filterName, v)
    else if (filters.find((f) => f.name === filterName)?.defaultValue) next.set(filterName, '')
    else next.delete(filterName)
    return next
  }, { replace: true })

  const questions = useQuery({ queryKey: ['questions'], queryFn: api.questions, enabled: addOpen })

  const save = useMutation({
    mutationFn: () => api.updateDashboard(id, {
      name: name.trim() || 'Untitled dashboard',
      description: dashboard.data?.description,
      filters,
      cards: cards.map((c) => ({ questionId: c.question.id, x: c.x, y: c.y, w: c.w, h: c.h, mappings: c.mappings })),
    }),
    onSuccess: (d) => {
      queryClient.setQueryData(['dashboard', id], d)
      queryClient.invalidateQueries({ queryKey: ['dashboards'] })
      setEditing(false)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('edit')
        return next
      })
      message.success('Dashboard saved')
    },
    onError: (e: Error) => message.error(e.message),
  })

  const layout: Layout = useMemo(() => cards.map((c) => ({
    i: c.key, x: c.x, y: c.y, w: c.w, h: c.h, minW: 2, minH: 2,
  })), [cards])

  const onLayoutChange = (next: Layout) => {
    if (!editing) return
    setCards((prev) => prev.map((c) => {
      const l = next.find((n) => n.i === c.key)
      return l ? { ...c, x: l.x, y: l.y, w: l.w, h: l.h } : c
    }))
  }

  const addQuestion = (q: Question) => {
    const bottom = cards.reduce((m, c) => Math.max(m, c.y + c.h), 0)
    // Connect existing filters to variables of the same name.
    const mappings: Record<string, string> = {}
    for (const f of filters) {
      if (q.parameters?.some((p) => p.name === f.name)) mappings[f.name] = f.name
    }
    setCards((prev) => [...prev, {
      key: `n${Date.now()}`, question: q, x: 0, y: bottom, mappings,
      w: ['NUMBER', 'TREND', 'PROGRESS', 'GAUGE'].includes(q.vizType) ? 3 : 6,
      h: ['NUMBER', 'TREND', 'PROGRESS', 'GAUGE'].includes(q.vizType) ? 3 : 7,
    }])
    setAddOpen(false)
  }

  const openFilter = (def: ParameterDef | null) => {
    if (def) {
      setFilterEdit({ def, isNew: false })
      setFilterLinks(Object.fromEntries(cards.map((c) => [c.key, c.mappings[def.name]])))
    } else {
      setFilterEdit({ def: { name: '', label: 'New filter', type: 'text', widget: 'input' }, isNew: true })
      setFilterLinks({})
    }
  }

  const saveFilter = (def: ParameterDef) => {
    const isNew = filterEdit?.isNew
    const finalName = isNew ? slugify(def.label || 'filter', filters.map((f) => f.name)) : def.name
    const final = { ...def, name: finalName }
    setFilters((prev) => isNew ? [...prev, final] : prev.map((f) => f.name === finalName ? final : f))
    setCards((prev) => prev.map((c) => {
      let variable = filterLinks[c.key]
      // New filters connect automatically to variables with the same name or label.
      if (isNew && variable === undefined) {
        variable = c.question.parameters?.find((p) => p.name === finalName
          || (p.label ?? '').toLowerCase() === (def.label ?? '').toLowerCase())?.name
      }
      const mappings = { ...c.mappings }
      if (variable) mappings[finalName] = variable
      else delete mappings[finalName]
      return { ...c, mappings }
    }))
    setFilterEdit(null)
  }

  const deleteFilter = (filterName: string) => {
    setFilters((prev) => prev.filter((f) => f.name !== filterName))
    setCards((prev) => prev.map((c) => {
      const mappings = { ...c.mappings }
      delete mappings[filterName]
      return { ...c, mappings }
    }))
    setFilterEdit(null)
  }

  const refreshAll = () => {
    cards.forEach((c) => queryClient.invalidateQueries({ queryKey: ['run', c.question.id] }))
  }

  if (dashboard.isLoading) return <Spin />
  if (dashboard.error) return <Alert type="error" title={dashboard.error.message} />

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
        {editing
          ? <Input value={name} onChange={(e) => setName(e.target.value)} style={{ fontSize: 18, fontWeight: 600, maxWidth: 420 }} />
          : <div>
              <Typography.Title level={4} style={{ margin: 0 }}>{dashboard.data?.name}</Typography.Title>
              {dashboard.data?.description && <Typography.Text type="secondary">{dashboard.data.description}</Typography.Text>}
            </div>}
        <Space wrap>
          {editing ? (
            <>
              <Button icon={<FilterOutlined />} onClick={() => openFilter(null)}>Add filter</Button>
              <Button icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>Add question</Button>
              <Button icon={<CloseOutlined />} onClick={() => { resetFromServer(); setEditing(false) }}>Cancel</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
            </>
          ) : (
            <>
              <Select value={refreshMs} options={REFRESH_OPTIONS} onChange={setRefreshMs} style={{ width: 160 }} />
              <Tooltip title="Refresh all cards"><Button icon={<ReloadOutlined />} onClick={refreshAll} /></Tooltip>
              {canEdit(user) && <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>Edit</Button>}
            </>
          )}
        </Space>
      </Space>

      {filters.length > 0 && (
        <Card size="small">
          <div className="filter-bar">
            {filters.map((f) => (
              <Space key={f.name} align="end" size={2}>
                <ParameterWidget def={f} value={searchParams.get(f.name) || undefined}
                  onChange={(v) => setFilterValue(f.name, v)}
                  loadOptions={() => (editing && f.source
                    ? api.columnValues(f.source.dataSourceId, f.source.table, f.source.column)
                    : api.dashboardFilterValues(id, f.name))}
                  optionsKey={['values', 'd', id, f.name, f.source?.table, f.source?.column]} />
                {editing && (
                  <Button type="text" size="small" icon={<SettingOutlined />} title="Filter settings"
                    onClick={() => openFilter(f)} />
                )}
              </Space>
            ))}
            {hasUrlFilters && !editing && (
              <Button type="link" onClick={() => setSearchParams({}, { replace: true })}>Reset filters</Button>
            )}
          </div>
        </Card>
      )}

      <div ref={containerRef}>
        {cards.length === 0 ? (
          <Empty description={editing ? 'Add a saved question to start' : 'This dashboard is empty'} />
        ) : mounted && (
          <ReactGridLayout
            layout={layout}
            width={width}
            gridConfig={{ cols: 12, rowHeight: 40, margin: [12, 12] }}
            dragConfig={{ enabled: editing, handle: '.drag-handle' }}
            resizeConfig={{ enabled: editing }}
            onLayoutChange={onLayoutChange}
          >
            {cards.map((c) => {
              const values = cardValues(c, filterValues)
              const connected = Object.keys(c.mappings).filter((f) => filters.some((x) => x.name === f)).length
              return (
                <div key={c.key} className="card-grid-item">
                  <div className="card-header">
                    <span className="drag-handle" title={c.question.name}
                      style={{ cursor: editing ? 'move' : 'pointer' }}
                      onClick={() => !editing && navigate(`/questions/${c.question.id}`)}>
                      {c.question.name}
                    </span>
                    {editing ? (
                      <Space size={2}>
                        {filters.length > 0 && (
                          <Tooltip title={`${connected} of ${filters.length} filters connected`}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              <FilterOutlined /> {connected}
                            </Typography.Text>
                          </Tooltip>
                        )}
                        <Button size="small" type="text" danger icon={<CloseOutlined />}
                          onClick={() => setCards((prev) => prev.filter((p) => p.key !== c.key))} />
                      </Space>
                    ) : (
                      <Dropdown trigger={['click']} menu={{
                        items: [
                          { key: 'open', label: 'Open question', onClick: () => navigate(`/questions/${c.question.id}`) },
                          { key: 'csv', icon: <DownloadOutlined />, label: 'Download CSV', onClick: () => {
                            const data = queryClient.getQueryData<QueryResult>(['run', c.question.id, values])
                            if (data) downloadCsv(data, c.question.name)
                          } },
                          { key: 'refresh', icon: <ReloadOutlined />, label: 'Refresh',
                            onClick: () => queryClient.invalidateQueries({ queryKey: ['run', c.question.id] }) },
                        ],
                      }}>
                        <Button size="small" type="text" icon={<MoreOutlined />} />
                      </Dropdown>
                    )}
                  </div>
                  <div className="card-body">
                    <CardContent question={c.question} values={values} refreshMs={refreshMs} />
                  </div>
                </div>
              )
            })}
          </ReactGridLayout>
        )}
      </div>

      <Modal title="Add a saved question" open={addOpen} onCancel={() => setAddOpen(false)} footer={null} destroyOnHidden>
        <Select showSearch style={{ width: '100%' }} placeholder="Search questions" loading={questions.isLoading}
          optionFilterProp="label" autoFocus
          options={questions.data?.map((q) => ({ value: q.id, label: q.name }))}
          onChange={(qid) => { const q = questions.data?.find((x) => x.id === qid); if (q) addQuestion(q) }} />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          Need a new one? <a onClick={() => navigate('/query')}>Write a query</a> and save it first.
        </Typography.Paragraph>
      </Modal>

      <ParameterEditor open={!!filterEdit} showVariable={false}
        title={filterEdit?.isNew ? 'Add dashboard filter' : 'Dashboard filter'}
        def={filterEdit?.def ?? null}
        defaultDataSourceId={cards[0]?.question.dataSourceId}
        onCancel={() => setFilterEdit(null)}
        onSave={saveFilter}
        footerExtra={filterEdit && !filterEdit.isNew && (
          <Popconfirm title="Remove this filter?" onConfirm={() => deleteFilter(filterEdit.def.name)}>
            <Button danger icon={<DeleteOutlined />}>Remove filter</Button>
          </Popconfirm>
        )}>
        <Form.Item label="Connected cards"
          extra={filterEdit?.isNew
            ? 'Cards with a variable of the same name are connected automatically. Cards without a choice ignore this filter.'
            : 'Choose which variable of each card this filter sets.'}>
          {cards.length === 0 && <Typography.Text type="secondary">No cards yet.</Typography.Text>}
          <Space orientation="vertical" style={{ width: '100%' }}>
            {cards.map((c) => {
              const vars = c.question.parameters ?? []
              return (
                <Space key={c.key} style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Typography.Text ellipsis style={{ maxWidth: 250 }}>{c.question.name}</Typography.Text>
                  <Select style={{ width: 200 }} allowClear placeholder={vars.length ? 'Not connected' : 'No variables'}
                    disabled={!vars.length} value={filterLinks[c.key]}
                    options={vars.map((p) => ({ value: p.name, label: `${p.label || p.name} (${p.type ?? 'text'})` }))}
                    onChange={(v) => setFilterLinks((prev) => ({ ...prev, [c.key]: v ?? '' }))} />
                </Space>
              )
            })}
          </Space>
        </Form.Item>
      </ParameterEditor>
    </Space>
  )
}
