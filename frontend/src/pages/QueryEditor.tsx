import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Col, Empty, Form, Input, Modal, Row, Select, Space, Spin, Tag, Typography } from 'antd'
import { CaretRightOutlined, DownloadOutlined, FilterOutlined, SaveOutlined, SettingOutlined } from '@ant-design/icons'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { keymap } from '@codemirror/view'
import { json } from '@codemirror/lang-json'
import { PostgreSQL, MySQL, MSSQL, PLSQL, sql as sqlLang, type SQLDialect } from '@codemirror/lang-sql'
import {
  api, parseSettings, type Engine, type ParameterDef, type ParamValues, type QueryResult, type VizSettings, type VizType,
} from '../api'
import ParameterWidget from '../components/ParameterWidget'
import ParameterEditor from '../components/ParameterEditor'
import { cleanValues, extractVariables, syncParams } from '../params'
import Visualization from '../components/Visualization'
import VizSettingsForm from '../components/VizSettingsForm'
import SchemaBrowser from '../components/SchemaBrowser'
import { downloadCsv } from '../csv'

const SQL_DIALECTS: Partial<Record<Engine, SQLDialect>> = {
  POSTGRES: PostgreSQL, MYSQL: MySQL, SQLSERVER: MSSQL, ORACLE: PLSQL,
}
const SQL_DEFAULT = 'SELECT *\nFROM '
const MONGO_DEFAULT = '[\n  { "$match": {} },\n  { "$limit": 100 }\n]'

export default function QueryEditor() {
  const { id } = useParams()
  const questionId = id ? Number(id) : null
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const editorRef = useRef<ReactCodeMirrorRef>(null)

  const [dataSourceId, setDataSourceId] = useState<number | null>(null)
  const [query, setQuery] = useState(SQL_DEFAULT)
  const [collection, setCollection] = useState<string | undefined>()
  const [vizType, setVizType] = useState<VizType>('TABLE')
  const [settings, setSettings] = useState<VizSettings>({})
  const [result, setResult] = useState<QueryResult | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [params, setParams] = useState<ParameterDef[]>([])
  const [values, setValues] = useState<ParamValues>({})
  const [editingParam, setEditingParam] = useState<ParameterDef | null>(null)
  const [form] = Form.useForm()

  const dataSources = useQuery({ queryKey: ['datasources'], queryFn: api.dataSources })
  const question = useQuery({ queryKey: ['question', questionId], queryFn: () => api.question(questionId!), enabled: !!questionId })
  const engineOf = (dsId: number | null) => dataSources.data?.find((d) => d.id === dsId)?.engine
  const engine = engineOf(dataSourceId) ?? 'POSTGRES'
  const isMongo = engine === 'MONGODB'

  useEffect(() => {
    if (question.data) {
      setDataSourceId(question.data.dataSourceId)
      setQuery(question.data.sql)
      setCollection(question.data.collection ?? undefined)
      setVizType(question.data.vizType)
      setSettings(parseSettings(question.data.vizSettings))
      setParams(question.data.parameters ?? [])
    }
  }, [question.data])

  const variableNames = useMemo(() => extractVariables(query), [query])
  const effectiveParams = useMemo(() => syncParams(params, variableNames), [params, variableNames])

  useEffect(() => {
    if (!questionId && dataSourceId === null && dataSources.data?.length) {
      const fromUrl = Number(searchParams.get('ds'))
      const ds = dataSources.data.find((d) => d.id === fromUrl) ?? dataSources.data[0]
      setDataSourceId(ds.id)
      if (ds.engine === 'MONGODB') setQuery(MONGO_DEFAULT)
    }
  }, [dataSources.data, dataSourceId, questionId, searchParams])

  const schema = useQuery({
    queryKey: ['schema', dataSourceId],
    queryFn: () => api.schema(dataSourceId!),
    enabled: !!dataSourceId,
    staleTime: 5 * 60_000,
  })

  // Pick the first collection automatically for a new MongoDB query.
  useEffect(() => {
    if (isMongo && !collection && schema.data?.length) setCollection(schema.data[0].name)
  }, [isMongo, collection, schema.data])

  const changeDataSource = (newId: number) => {
    const wasMongo = engineOf(dataSourceId) === 'MONGODB'
    const nowMongo = engineOf(newId) === 'MONGODB'
    setDataSourceId(newId)
    setResult(null)
    setCollection(undefined)
    if (wasMongo !== nowMongo) setQuery(nowMongo ? MONGO_DEFAULT : SQL_DEFAULT)
  }

  const run = useMutation({
    mutationFn: () => api.runSql(dataSourceId!, query, isMongo ? collection : undefined, effectiveParams,
      cleanValues(values)),
    onSuccess: (r) => {
      setResult(r)
      setRunError(null)
    },
    onError: (e: Error) => setRunError(e.message),
  })

  const runRef = useRef<() => void>(() => {})
  useEffect(() => {
    runRef.current = () => run.mutate()
  })

  const extensions = useMemo(() => {
    const runKey = keymap.of([{ key: 'Mod-Enter', run: () => { runRef.current(); return true } }])
    if (engine === 'MONGODB') return [json(), runKey]
    const completionSchema: Record<string, string[]> = {}
    for (const t of schema.data ?? []) {
      const cols = t.columns.map((c) => c.name)
      completionSchema[t.name] = cols
      if (t.schema) completionSchema[`${t.schema}.${t.name}`] = cols
    }
    return [
      sqlLang({ dialect: SQL_DIALECTS[engine] ?? PostgreSQL, schema: completionSchema, upperCaseKeywords: true }),
      runKey,
    ]
  }, [schema.data, engine])

  const save = useMutation({
    mutationFn: async (values: { name: string; description?: string; asNew?: boolean }) => {
      const body = {
        name: values.name,
        description: values.description,
        dataSourceId: dataSourceId!,
        sql: query,
        collection: isMongo ? collection : undefined,
        parameters: effectiveParams,
        vizType,
        vizSettings: JSON.stringify(settings),
      }
      return questionId && !values.asNew ? api.updateQuestion(questionId, body) : api.createQuestion(body)
    },
    onSuccess: (q) => {
      message.success('Question saved')
      setSaveOpen(false)
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['question', q.id] })
      queryClient.invalidateQueries({ queryKey: ['run', q.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate(`/questions/${q.id}`)
    },
    onError: (e: Error) => message.error(e.message),
  })

  const onSchemaPick = (text: string, kind: 'table' | 'column') => {
    if (isMongo && kind === 'table') {
      setCollection(text)
      return
    }
    const view = editorRef.current?.view
    if (!view) return
    view.dispatch(view.state.replaceSelection(isMongo ? `"${text}"` : text))
    view.focus()
  }

  const openSave = () => {
    form.setFieldsValue({ name: question.data?.name ?? '', description: question.data?.description ?? '' })
    setSaveOpen(true)
  }

  if (questionId && question.isLoading) return <Spin />
  if (question.error) return <Alert type="error" title={question.error.message} />
  if (dataSources.data && dataSources.data.length === 0) {
    return <Empty description="No data sources yet. Ask an admin to add one." />
  }

  const canRun = !!dataSourceId && (!isMongo || !!collection)

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {question.data ? `Edit: ${question.data.name}` : 'New query'}
        </Typography.Title>
        <Space wrap>
          <Select style={{ minWidth: 220 }} placeholder="Data source" value={dataSourceId ?? undefined}
            loading={dataSources.isLoading}
            options={dataSources.data?.map((d) => ({ value: d.id, label: d.name }))}
            onChange={changeDataSource} />
          {isMongo && (
            <Select style={{ minWidth: 180 }} placeholder="Collection" value={collection} showSearch
              loading={schema.isLoading}
              options={schema.data?.map((t) => ({ value: t.name, label: t.name }))}
              onChange={(c) => { setCollection(c); setResult(null) }} />
          )}
          <Button type="primary" icon={<CaretRightOutlined />} loading={run.isPending}
            disabled={!canRun} onClick={() => run.mutate()}>
            Run (Ctrl/⌘ + Enter)
          </Button>
          <Button icon={<SaveOutlined />} disabled={!canRun || !query.trim()} onClick={openSave}>Save</Button>
        </Space>
      </Space>

      <Row gutter={16}>
        <Col xs={24} lg={6}>
          <Card size="small" title={isMongo ? 'Collections' : 'Tables'}
            extra={isMongo && <Typography.Text type="secondary" style={{ fontSize: 12 }}>fields from a sample</Typography.Text>}>
            <SchemaBrowser tables={schema.data} loading={schema.isLoading} error={schema.error} onInsert={onSchemaPick} />
          </Card>
        </Col>
        <Col xs={24} lg={18}>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Card size="small" styles={{ body: { padding: 0 } }}
              title={isMongo
                ? <Space><Tag color="green">MongoDB</Tag><Typography.Text type="secondary">
                    Aggregation pipeline on <b>{collection ?? '…'}</b>. JSON array of stages; ISODate(…) and ObjectId(…) work too.
                  </Typography.Text></Space>
                : undefined}>
              <CodeMirror ref={editorRef} value={query} height="260px" extensions={extensions}
                onChange={setQuery} basicSetup={{ lineNumbers: true, foldGutter: isMongo }} />
            </Card>
            {effectiveParams.length > 0 ? (
              <Card size="small" title={<Space><FilterOutlined />Filters</Space>}
                extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>Change a value, then Run</Typography.Text>}>
                <div className="filter-bar">
                  {effectiveParams.map((p) => (
                    <Space key={p.name} align="end" size={2}>
                      <ParameterWidget def={p} value={values[p.name]}
                        onChange={(v) => setValues((prev) => ({ ...prev, [p.name]: v ?? '' }))}
                        loadOptions={p.source ? () => api.columnValues(p.source!.dataSourceId, p.source!.table, p.source!.column) : undefined}
                        optionsKey={['values', 'col', p.source?.dataSourceId, p.source?.table, p.source?.column]} />
                      <Button type="text" size="small" icon={<SettingOutlined />} title="Filter settings"
                        onClick={() => setEditingParam(p)} />
                    </Space>
                  ))}
                </div>
              </Card>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Tip: add a filter with <code>{'{{name}}'}</code>, for example{' '}
                <code>{isMongo ? '{ "$match": { "platform": {{platform}} } }' : 'WHERE channel = {{channel}}'}</code>.
                Wrap optional parts in <code>[[ ]]</code>
                {isMongo ? '' : <>, e.g. <code>{'[[AND created_at >= {{date_from}}]]'}</code></>}: they are left out when the filter is empty.
              </Typography.Text>
            )}
            {runError && <Alert type="error" title="Query error" description={runError} showIcon closable
              onClose={() => setRunError(null)} />}
            <Card size="small"
              title={<VizSettingsForm result={result} vizType={vizType} settings={settings}
                onChange={(t, s) => { setVizType(t); setSettings(s) }} />}
              extra={result && (
                <Space>
                  <Typography.Text type="secondary">
                    {result.rowCount.toLocaleString()} rows{result.truncated ? ' (limit reached)' : ''} · {result.durationMs} ms
                  </Typography.Text>
                  <Button size="small" icon={<DownloadOutlined />}
                    onClick={() => downloadCsv(result, question.data?.name ?? 'query-result')}>CSV</Button>
                </Space>
              )}>
              {run.isPending ? <Spin style={{ display: 'block', margin: 48 }} />
                : result ? <Visualization result={result} vizType={vizType} settings={settings} height={420} />
                : <Empty description="Run a query to see results" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            </Card>
          </Space>
        </Col>
      </Row>

      <ParameterEditor open={!!editingParam} title="Filter settings" def={editingParam}
        defaultDataSourceId={dataSourceId}
        onCancel={() => setEditingParam(null)}
        onSave={(def) => {
          setParams((prev) => [...prev.filter((p) => p.name !== def.name), def])
          setEditingParam(null)
        }} />

      <Modal title="Save question" open={saveOpen} onCancel={() => setSaveOpen(false)} footer={null} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              {questionId ? 'Save changes' : 'Save'}
            </Button>
            {questionId && (
              <Button onClick={() => form.validateFields().then((v) => save.mutate({ ...v, asNew: true }))}>
                Save as new question
              </Button>
            )}
          </Space>
        </Form>
      </Modal>
    </Space>
  )
}
