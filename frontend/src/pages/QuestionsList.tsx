import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Input, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { api, type Question } from '../api'
import { canEdit, useAuth } from '../auth'

export default function QuestionsList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')
  const questions = useQuery({ queryKey: ['questions'], queryFn: api.questions })
  const dataSources = useQuery({ queryKey: ['datasources'], queryFn: api.dataSources })
  const dsName = (id: number) => dataSources.data?.find((d) => d.id === id)?.name ?? `#${id}`

  const remove = useMutation({
    mutationFn: api.deleteQuestion,
    onSuccess: () => {
      message.success('Question deleted')
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const data = (questions.data ?? []).filter((q) => q.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Questions</Typography.Title>
        <Space>
          <Input.Search placeholder="Search" allowClear onChange={(e) => setFilter(e.target.value)} />
          {canEdit(user) && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/query')}>New</Button>}
        </Space>
      </Space>
      <Table<Question> rowKey="id" loading={questions.isLoading} dataSource={data} pagination={{ pageSize: 20 }}
        onRow={(q) => ({ onClick: () => navigate(`/questions/${q.id}`), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Name', dataIndex: 'name', render: (n, q) => <><b>{n}</b>{q.description && <div style={{ color: '#888' }}>{q.description}</div>}</> },
          { title: 'Chart', dataIndex: 'vizType', width: 100, render: (v) => <Tag>{v.toLowerCase()}</Tag> },
          { title: 'Data source', dataIndex: 'dataSourceId', render: dsName, responsive: ['md'] },
          { title: 'Updated', dataIndex: 'updatedAt', width: 180, render: (d) => new Date(d).toLocaleString(), responsive: ['lg'] },
          ...(canEdit(user) ? [{
            title: '', key: 'actions', width: 100,
            render: (_: unknown, q: Question) => (
              <Space onClick={(e) => e.stopPropagation()}>
                <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/questions/${q.id}/edit`)} />
                <Popconfirm title="Delete this question?" description="It will also be removed from dashboards."
                  onConfirm={() => remove.mutate(q.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          }] : []),
        ]} />
    </Space>
  )
}
