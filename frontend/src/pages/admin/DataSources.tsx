import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { api, type DataSource, type Engine, type SaveDataSource } from '../../api'

const ENGINES: { value: Engine; label: string; example: string }[] = [
  { value: 'POSTGRES', label: 'PostgreSQL', example: 'jdbc:postgresql://host:5432/database' },
  { value: 'ORACLE', label: 'Oracle', example: 'jdbc:oracle:thin:@//host:1521/SERVICE' },
  { value: 'SQLSERVER', label: 'SQL Server', example: 'jdbc:sqlserver://host:1433;databaseName=db;encrypt=true' },
  { value: 'MYSQL', label: 'MySQL', example: 'jdbc:mysql://host:3306/database' },
  { value: 'MONGODB', label: 'MongoDB', example: 'mongodb://host:27017/database?authSource=admin (user and password go in the fields below)' },
]

export default function DataSources() {
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const [editing, setEditing] = useState<DataSource | 'new' | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [form] = Form.useForm<SaveDataSource>()
  const engine = Form.useWatch('engine', form)
  const list = useQuery({ queryKey: ['datasources'], queryFn: api.dataSources })
  const editId = editing && editing !== 'new' ? editing.id : undefined

  const open = (ds: DataSource | 'new') => {
    setTestResult(null)
    setEditing(ds)
    form.resetFields()
    form.setFieldsValue(ds === 'new' ? { engine: 'POSTGRES' } : {
      name: ds.name, engine: ds.engine, jdbcUrl: ds.jdbcUrl,
      username: ds.username ?? '', schemaFilter: ds.schemaFilter ?? '', password: '',
    })
  }

  const save = useMutation({
    mutationFn: (v: SaveDataSource) => (editId ? api.updateDataSource(editId, v) : api.createDataSource(v)),
    onSuccess: (ds) => {
      message.success('Data source saved')
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ['datasources'] })
      queryClient.invalidateQueries({ queryKey: ['schema', ds.id] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const test = useMutation({
    mutationFn: (v: SaveDataSource) => api.testDataSource(v, editId),
    onSuccess: setTestResult,
    onError: (e: Error) => setTestResult({ ok: false, message: e.message }),
  })

  const remove = useMutation({
    mutationFn: api.deleteDataSource,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['datasources'] }),
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Data sources</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>Add data source</Button>
      </Space>
      <Alert type="info" showIcon title="Connect with a read-only database user (for MongoDB, a user with only the read role). Only SELECT statements and read-only aggregation stages are allowed." />
      <Table<DataSource> rowKey="id" loading={list.isLoading} dataSource={list.data} pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'name', render: (n) => <b>{n}</b> },
          { title: 'Engine', dataIndex: 'engine', width: 120, render: (e) => <Tag>{e}</Tag> },
          { title: 'Connection URL', dataIndex: 'jdbcUrl', ellipsis: true, responsive: ['md'] },
          { title: 'User', dataIndex: 'username', responsive: ['lg'] },
          {
            title: '', key: 'a', width: 100, render: (_, ds) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => open(ds)} />
                <Popconfirm title="Delete this data source?" description="This fails while saved questions still use it."
                  onConfirm={() => remove.mutate(ds.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]} />

      <Modal title={editId ? 'Edit data source' : 'Add data source'} open={!!editing} onCancel={() => setEditing(null)}
        footer={null} destroyOnHidden width={600}>
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="name" label="Display name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="engine" label="Database" rules={[{ required: true }]}>
            <Select options={ENGINES.map((e) => ({ value: e.value, label: e.label }))} />
          </Form.Item>
          <Form.Item name="jdbcUrl" label={engine === 'MONGODB' ? 'Connection string' : 'JDBC URL'} rules={[{ required: true }]}
            extra={ENGINES.find((e) => e.value === engine)?.example}>
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="username" label="Username"><Input autoComplete="off" /></Form.Item>
            <Form.Item name="password" label="Password" extra={editId ? 'Leave empty to keep the current password' : undefined}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </Space>
          <Form.Item name="schemaFilter"
            label={engine === 'MONGODB' ? 'Collections to show (optional)' : 'Schemas to show (optional)'}
            extra={engine === 'MONGODB' ? 'Comma-separated collection names. Empty shows all collections.'
              : 'Comma-separated, e.g. public,reporting. Empty shows all non-system schemas.'}>
            <Input />
          </Form.Item>
          {testResult && <Alert style={{ marginBottom: 16 }} type={testResult.ok ? 'success' : 'error'} title={testResult.message} showIcon />}
          <Space>
            <Button loading={test.isPending} onClick={() => form.validateFields().then((v) => test.mutate(v))}>Test connection</Button>
            <Button type="primary" htmlType="submit" loading={save.isPending}>Save</Button>
          </Space>
        </Form>
      </Modal>
    </Space>
  )
}
