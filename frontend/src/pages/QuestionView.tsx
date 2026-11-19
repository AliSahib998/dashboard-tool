import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Space, Spin, Typography } from 'antd'
import { DownloadOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import { api, parseSettings } from '../api'
import Visualization from '../components/Visualization'
import ParameterWidget from '../components/ParameterWidget'
import { canEdit, useAuth } from '../auth'
import { downloadCsv } from '../csv'
import { cleanValues } from '../params'

export default function QuestionView() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const question = useQuery({ queryKey: ['question', id], queryFn: () => api.question(id) })
  const params = useMemo(() => question.data?.parameters ?? [], [question.data])

  // Filter values live in the URL so a filtered view can be shared as a link.
  const values = useMemo(
    () => cleanValues(Object.fromEntries(params.map((p) => [p.name, searchParams.get(p.name) ?? '']))),
    [params, searchParams])

  const result = useQuery({
    queryKey: ['run', id, values],
    queryFn: () => api.runQuestion(id, values),
    enabled: !!question.data,
  })

  const setValue = (name: string, v?: string) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    if (v) next.set(name, v)
    else next.delete(name)
    return next
  }, { replace: true })

  if (question.isLoading) return <Spin />
  if (question.error) return <Alert type="error" title={question.error.message} />
  const q = question.data!

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>{q.name}</Typography.Title>
          {q.description && <Typography.Text type="secondary">{q.description}</Typography.Text>}
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} loading={result.isFetching} onClick={() => result.refetch()}>Refresh</Button>
          {result.data && (
            <Button icon={<DownloadOutlined />} onClick={() => downloadCsv(result.data!, q.name)}>CSV</Button>
          )}
          {canEdit(user) && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/questions/${id}/edit`)}>Edit</Button>
          )}
        </Space>
      </Space>
      {params.length > 0 && (
        <Card size="small">
          <div className="filter-bar">
            {params.map((p) => (
              <ParameterWidget key={p.name} def={p} value={values[p.name]} onChange={(v) => setValue(p.name, v)}
                loadOptions={() => api.questionParamValues(id, p.name)} optionsKey={['values', 'q', id, p.name]} />
            ))}
            {Object.keys(values).length > 0 && (
              <Button type="link" onClick={() => setSearchParams({}, { replace: true })}>Clear filters</Button>
            )}
          </div>
        </Card>
      )}
      <Card>
        {result.isLoading ? <Spin style={{ display: 'block', margin: 48 }} />
          : result.error ? <Alert type="error" title={result.error.message} showIcon />
          : result.data && <Visualization result={result.data} vizType={q.vizType}
              settings={parseSettings(q.vizSettings)} height={480} />}
      </Card>
    </Space>
  )
}
