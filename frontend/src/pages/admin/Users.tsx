import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import { api, type Role, type User } from '../../api'

const ROLES = [
  { value: 'ADMIN', label: 'Admin: users, data sources, audit log, everything else' },
  { value: 'ANALYST', label: 'Analyst: write SQL, build questions and dashboards' },
  { value: 'VIEWER', label: 'Viewer: open dashboards and saved questions only' },
]

interface FormValues { email: string; fullName: string; password?: string; role: Role; active: boolean }

export default function Users() {
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [form] = Form.useForm<FormValues>()
  const users = useQuery({ queryKey: ['users'], queryFn: api.users })
  const editId = editing && editing !== 'new' ? editing.id : undefined

  const open = (u: User | 'new') => {
    setEditing(u)
    form.resetFields()
    form.setFieldsValue(u === 'new' ? { role: 'VIEWER', active: true }
      : { email: u.email, fullName: u.fullName, role: u.role, active: u.active, password: '' })
  }

  const save = useMutation({
    mutationFn: (v: FormValues) => editId
      ? api.updateUser(editId, { fullName: v.fullName, role: v.role, active: v.active, password: v.password || undefined })
      : api.createUser({ email: v.email, fullName: v.fullName, password: v.password!, role: v.role }),
    onSuccess: () => {
      message.success('User saved')
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Users</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>Add user</Button>
      </Space>
      <Table<User> rowKey="id" loading={users.isLoading} dataSource={users.data} pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'fullName' },
          { title: 'Email', dataIndex: 'email' },
          { title: 'Role', dataIndex: 'role', render: (r) => <Tag color={r === 'ADMIN' ? 'purple' : r === 'ANALYST' ? 'blue' : undefined}>{r}</Tag> },
          { title: 'Status', dataIndex: 'active', render: (a) => a ? <Tag color="green">active</Tag> : <Tag>disabled</Tag> },
          { title: '', key: 'a', width: 60, render: (_, u) => <Button size="small" icon={<EditOutlined />} onClick={() => open(u)} /> },
        ]} />
      <Modal title={editId ? 'Edit user' : 'Add user'} open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input disabled={!!editId} />
          </Form.Item>
          <Form.Item name="fullName" label="Full name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="password" label={editId ? 'New password (optional)' : 'Password'}
            rules={[{ required: !editId }, { min: 8, message: 'At least 8 characters' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}><Select options={ROLES} /></Form.Item>
          {editId && <Form.Item name="active" label="Active" valuePropName="checked"><Switch /></Form.Item>}
          <Button type="primary" htmlType="submit" loading={save.isPending}>Save</Button>
        </Form>
      </Modal>
    </Space>
  )
}
