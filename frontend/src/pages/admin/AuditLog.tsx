import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Space, Table, Tag, Typography } from 'antd'
import { api, type AuditEntry } from '../../api'

export default function AuditLog() {
  const [page, setPage] = useState(0)
  const pageSize = 50
  const audit = useQuery({ queryKey: ['audit', page], queryFn: () => api.audit(page, pageSize) })

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Audit log</Typography.Title>
      <Table<AuditEntry> rowKey="id" size="small" loading={audit.isLoading} dataSource={audit.data?.items}
        pagination={{ current: page + 1, pageSize, total: audit.data?.total, showSizeChanger: false,
          onChange: (p) => setPage(p - 1) }}
        expandable={{
          expandedRowRender: (r) => (
            <div>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.sqlText}</pre>
              {r.errorMessage && <Typography.Text type="danger">{r.errorMessage}</Typography.Text>}
            </div>
          ),
        }}
        columns={[
          { title: 'Time', dataIndex: 'createdAt', width: 180, render: (d) => new Date(d).toLocaleString() },
          { title: 'User', dataIndex: 'userEmail' },
          { title: 'Action', dataIndex: 'action', render: (a) => <Tag>{a}</Tag> },
          { title: 'Question', dataIndex: 'questionId', responsive: ['md'] },
          { title: 'Rows', dataIndex: 'rowCount', align: 'right' },
          { title: 'ms', dataIndex: 'durationMs', align: 'right', responsive: ['md'] },
          { title: 'Result', dataIndex: 'success', render: (s) => s ? <Tag color="green">ok</Tag> : <Tag color="red">failed</Tag> },
        ]} />
    </Space>
  )
}
