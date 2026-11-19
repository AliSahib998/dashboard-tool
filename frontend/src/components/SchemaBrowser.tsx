import { Input, Spin, Tree, Typography, Alert } from 'antd'
import { TableOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'
import type { SchemaTable } from '../api'

interface Props {
  tables: SchemaTable[] | undefined
  loading: boolean
  error: Error | null
  onInsert: (text: string, kind: 'table' | 'column') => void
}

export default function SchemaBrowser({ tables, loading, error, onInsert }: Props) {
  const [filter, setFilter] = useState('')

  const treeData = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (tables ?? [])
      .filter((t) => !f || t.name.toLowerCase().includes(f) || t.columns.some((c) => c.name.toLowerCase().includes(f)))
      .map((t) => {
        const full = t.schema ? `${t.schema}.${t.name}` : t.name
        return {
          key: full,
          title: <span title="Double-click to insert">{t.name}</span>,
          icon: <TableOutlined />,
          insert: full,
          kind: 'table',
          children: t.columns.map((c) => ({
            key: `${full}.${c.name}`,
            title: (
              <span title="Double-click to insert">
                {c.name} <Typography.Text type="secondary" style={{ fontSize: 11 }}>{c.type.toLowerCase()}</Typography.Text>
              </span>
            ),
            isLeaf: true,
            insert: c.name,
            kind: 'column',
          })),
        }
      })
  }, [tables, filter])

  if (loading) return <Spin style={{ display: 'block', margin: 24 }} />
  if (error) return <Alert type="error" title={error.message} showIcon />

  return (
    <div className="schema-tree">
      <Input.Search size="small" placeholder="Search" allowClear
        onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 8 }} />
      <Tree showIcon blockNode treeData={treeData} height={520}
        onDoubleClick={(_, node) => {
          const n = node as unknown as { insert: string; kind: 'table' | 'column' }
          onInsert(n.insert, n.kind)
        }} />
    </div>
  )
}
