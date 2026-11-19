import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Empty, Form, Input, Modal, Popconfirm, Row, Space, Spin, Typography } from 'antd'
import { AppstoreOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { api } from '../api'
import { canEdit, useAuth } from '../auth'

export default function DashboardsList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const dashboards = useQuery({ queryKey: ['dashboards'], queryFn: api.dashboards })

  const create = useMutation({
    mutationFn: (v: { name: string; description?: string }) => api.createDashboard({ ...v, cards: [] }),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] })
      navigate(`/dashboards/${d.id}?edit=1`)
    },
    onError: (e: Error) => message.error(e.message),
  })

  const remove = useMutation({
    mutationFn: api.deleteDashboard,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboards'] }),
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Dashboards</Typography.Title>
        {canEdit(user) && <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>New dashboard</Button>}
      </Space>
      {dashboards.isLoading ? <Spin /> : dashboards.data?.length === 0 ? <Empty description="No dashboards yet" /> : (
        <Row gutter={[16, 16]}>
          {dashboards.data?.map((d) => (
            <Col key={d.id} xs={24} sm={12} lg={8} xl={6}>
              <Card hoverable onClick={() => navigate(`/dashboards/${d.id}`)}
                actions={canEdit(user) ? [
                  <Popconfirm key="del" title="Delete this dashboard?" onConfirm={(e) => { e?.stopPropagation(); remove.mutate(d.id) }}
                    onCancel={(e) => e?.stopPropagation()}>
                    <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>,
                ] : undefined}>
                <Card.Meta avatar={<AppstoreOutlined style={{ fontSize: 24, color: '#5b3fd9' }} />}
                  title={d.name}
                  description={<>{d.description && <div>{d.description}</div>}<div>{d.cardCount} cards</div></>} />
              </Card>
            </Col>
          ))}
        </Row>
      )}
      <Modal title="New dashboard" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnHidden>
        <Form layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input autoFocus /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending}>Create</Button>
        </Form>
      </Modal>
    </Space>
  )
}
