import { Layout, Menu, Dropdown, Avatar, Typography } from 'antd'
import {
  AppstoreOutlined, AuditOutlined, CodeOutlined, DatabaseOutlined, FileSearchOutlined, LogoutOutlined, TeamOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { MenuProps } from 'antd'
import { canEdit, hasRole, useAuth } from '../auth'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const items: MenuProps['items'] = [
    { key: '/dashboards', icon: <AppstoreOutlined />, label: 'Dashboards' },
    { key: '/questions', icon: <FileSearchOutlined />, label: 'Questions' },
    ...(canEdit(user) ? [{ key: '/query', icon: <CodeOutlined />, label: 'New query' }] : []),
    ...(hasRole(user, 'ADMIN')
      ? [{
          type: 'group' as const,
          label: 'Admin',
          children: [
            { key: '/admin/datasources', icon: <DatabaseOutlined />, label: 'Data sources' },
            { key: '/admin/users', icon: <TeamOutlined />, label: 'Users' },
            { key: '/admin/audit', icon: <AuditOutlined />, label: 'Audit log' },
          ],
        }]
      : []),
  ]

  const selected = '/' + location.pathname.split('/').filter(Boolean).slice(0, location.pathname.startsWith('/admin') ? 2 : 1).join('/')

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider breakpoint="lg" collapsedWidth={0} theme="light" width={220}
        style={{ borderRight: '1px solid #ececf2' }}>
        <div style={{ padding: '16px 20px', fontWeight: 700, fontSize: 16, color: '#5b3fd9' }}>Birbank Dashboards</div>
        <Menu mode="inline" selectedKeys={[selected]} items={items} onClick={(e) => navigate(e.key)}
          style={{ borderInlineEnd: 0 }} />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: '#fff', borderBottom: '1px solid #ececf2', padding: '0 16px',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Dropdown menu={{ items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Sign out', onClick: logout }] }}>
            <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar style={{ background: '#5b3fd9' }}>{user?.fullName.charAt(0).toUpperCase()}</Avatar>
              <Typography.Text>{user?.fullName}</Typography.Text>
              <Typography.Text type="secondary">({user?.role.toLowerCase()})</Typography.Text>
            </span>
          </Dropdown>
        </Layout.Header>
        <Layout.Content style={{ padding: 16 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
