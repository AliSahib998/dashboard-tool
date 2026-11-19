import { useState, type ReactNode } from 'react'
import { Button, Divider, Drawer, Form, Input, InputNumber, Segmented, Select, Space, Switch, Typography } from 'antd'
import {
  AreaChartOutlined, BarChartOutlined, BarsOutlined, DashboardOutlined, DotChartOutlined, FieldNumberOutlined,
  FundOutlined, FunnelPlotOutlined, LineChartOutlined, PieChartOutlined, RiseOutlined, SettingOutlined,
  StockOutlined, TableOutlined, ColumnWidthOutlined,
} from '@ant-design/icons'
import type { NumberFormat, QueryResult, VizSettings, VizType } from '../api'
import { CARTESIAN, SINGLE_VALUE, STACKABLE, resolveSettings } from './Visualization'

interface Props {
  result: QueryResult | null
  vizType: VizType
  settings: VizSettings
  onChange: (vizType: VizType, settings: VizSettings) => void
}

export const VIZ_TYPES: { value: VizType; label: string; icon: ReactNode; group: string }[] = [
  { value: 'TABLE', label: 'Table', icon: <TableOutlined />, group: 'Values' },
  { value: 'NUMBER', label: 'Number', icon: <FieldNumberOutlined />, group: 'Values' },
  { value: 'TREND', label: 'Trend', icon: <RiseOutlined />, group: 'Values' },
  { value: 'PROGRESS', label: 'Progress', icon: <ColumnWidthOutlined />, group: 'Values' },
  { value: 'GAUGE', label: 'Gauge', icon: <DashboardOutlined />, group: 'Values' },
  { value: 'BAR', label: 'Bar', icon: <BarChartOutlined />, group: 'Charts' },
  { value: 'ROW', label: 'Row', icon: <BarsOutlined />, group: 'Charts' },
  { value: 'LINE', label: 'Line', icon: <LineChartOutlined />, group: 'Charts' },
  { value: 'AREA', label: 'Area', icon: <AreaChartOutlined />, group: 'Charts' },
  { value: 'COMBO', label: 'Combo (bar + line)', icon: <FundOutlined />, group: 'Charts' },
  { value: 'PIE', label: 'Pie', icon: <PieChartOutlined />, group: 'Charts' },
  { value: 'SCATTER', label: 'Scatter / bubble', icon: <DotChartOutlined />, group: 'Charts' },
  { value: 'FUNNEL', label: 'Funnel', icon: <FunnelPlotOutlined />, group: 'Charts' },
  { value: 'WATERFALL', label: 'Waterfall', icon: <StockOutlined />, group: 'Charts' },
]

const typeOptions = ['Values', 'Charts'].map((group) => ({
  label: group,
  options: VIZ_TYPES.filter((t) => t.group === group).map((t) => ({
    value: t.value,
    label: <Space size={6}>{t.icon}{t.label}</Space>,
  })),
}))

export default function VizSettingsForm({ result, vizType, settings, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const s = result ? resolveSettings(result, vizType, settings) : settings
  const set = (patch: Partial<VizSettings>) => onChange(vizType, { ...settings, ...patch })
  const setFormat = (patch: Partial<NumberFormat>) => set({ format: { ...settings.format, ...patch } })

  const all = result?.columns.map((c) => ({ value: c.name, label: c.name })) ?? []
  const numeric = result?.columns.filter((c) => c.type === 'number').map((c) => ({ value: c.name, label: c.name })) ?? []
  const nonNumeric = result?.columns.filter((c) => c.type !== 'number').map((c) => ({ value: c.name, label: c.name })) ?? []
  const valueCols = numeric.length ? numeric : all

  const isCartesian = CARTESIAN.includes(vizType)
  const xLabel = vizType === 'PIE' ? 'Slice label' : vizType === 'FUNNEL' ? 'Step' : vizType === 'WATERFALL' ? 'Category'
    : vizType === 'SCATTER' ? 'X axis (number)' : vizType === 'TREND' ? 'Time column' : 'X axis'
  const singleY = ['PIE', 'FUNNEL', 'WATERFALL', 'SCATTER'].includes(vizType) || (isCartesian && !!s.series)

  const changeType = (t: VizType) => {
    // Keep formatting and goal when switching type; column choices are re-picked for the new type.
    onChange(t, { format: settings.format, goal: settings.goal, goalLabel: settings.goalLabel })
  }

  return (
    <Space wrap size="middle" align="center">
      <Select style={{ width: 210 }} value={vizType} options={typeOptions} onChange={changeType}
        popupMatchSelectWidth={false} listHeight={420} />
      {vizType !== 'TABLE' && (
        <Button icon={<SettingOutlined />} onClick={() => setOpen(true)} disabled={!result}>Chart settings</Button>
      )}

      <Drawer title="Chart settings" open={open} onClose={() => setOpen(false)} mask={false} size={340}
        styles={{ body: { paddingTop: 8 } }}>
        {result && (
          <Form layout="vertical" size="small">
            <Divider titlePlacement="start" plain style={{ marginTop: 0 }}>Data</Divider>

            {SINGLE_VALUE.includes(vizType) && (
              <>
                {vizType === 'TREND' && (
                  <Form.Item label={xLabel} extra="The latest row is compared with the one before it.">
                    <Select value={s.x} options={all} onChange={(x) => set({ x })} />
                  </Form.Item>
                )}
                <Form.Item label="Value">
                  <Select value={s.value} options={all} onChange={(value) => set({ value })} />
                </Form.Item>
              </>
            )}

            {!SINGLE_VALUE.includes(vizType) && (
              <>
                <Form.Item label={xLabel}>
                  <Select value={s.x} options={vizType === 'SCATTER' ? valueCols : all} onChange={(x) => set({ x })} />
                </Form.Item>
                <Form.Item label={vizType === 'SCATTER' ? 'Y axis (number)' : singleY ? 'Value' : 'Values'}>
                  <Select mode={singleY ? undefined : 'multiple'} options={valueCols}
                    value={singleY ? s.y?.[0] : s.y}
                    onChange={(y: string | string[]) => set({ y: Array.isArray(y) ? y : [y] })} />
                </Form.Item>
              </>
            )}

            {(isCartesian && vizType !== 'COMBO') || vizType === 'SCATTER' ? (
              <Form.Item label={vizType === 'SCATTER' ? 'Color by' : 'Split into series by'}
                extra={vizType === 'SCATTER' ? undefined : 'For data like month, channel, count: one series per channel.'}>
                <Select allowClear placeholder="None" value={s.series || undefined}
                  options={nonNumeric.filter((o) => o.value !== s.x)}
                  onChange={(v) => set({ series: v ?? '' })} />
              </Form.Item>
            ) : null}

            {vizType === 'SCATTER' && (
              <Form.Item label="Bubble size (optional)">
                <Select allowClear placeholder="Same size" value={s.size} options={numeric}
                  onChange={(v) => set({ size: v })} />
              </Form.Item>
            )}

            {vizType === 'COMBO' && (
              <Form.Item label="Show as lines" extra="Lines use the right-hand axis; other values are bars.">
                <Select mode="multiple" value={s.lineSeries} options={(s.y ?? []).map((y) => ({ value: y, label: y }))}
                  onChange={(lineSeries) => set({ lineSeries })} />
              </Form.Item>
            )}

            <Divider titlePlacement="start" plain>Display</Divider>

            {STACKABLE.includes(vizType) && (
              <Form.Item label="Stacking">
                <Segmented value={s.stack ?? 'none'} onChange={(v) => set({ stack: v as VizSettings['stack'] })}
                  options={[{ value: 'none', label: 'Off' }, { value: 'normal', label: 'Stacked' }, { value: 'percent', label: '100%' }]} />
              </Form.Item>
            )}

            {(isCartesian || vizType === 'PROGRESS') && (
              <Space align="start">
                <Form.Item label={vizType === 'PROGRESS' ? 'Goal' : 'Goal line'}>
                  <InputNumber value={settings.goal} onChange={(v) => set({ goal: v ?? undefined })} style={{ width: 130 }} />
                </Form.Item>
                {isCartesian && (
                  <Form.Item label="Goal label">
                    <Input value={settings.goalLabel} placeholder="Goal" onChange={(e) => set({ goalLabel: e.target.value })} />
                  </Form.Item>
                )}
              </Space>
            )}

            {vizType === 'GAUGE' && (
              <Space align="start">
                <Form.Item label="Min">
                  <InputNumber value={settings.min} placeholder="0" onChange={(v) => set({ min: v ?? undefined })} />
                </Form.Item>
                <Form.Item label="Max">
                  <InputNumber value={settings.max} placeholder="auto" onChange={(v) => set({ max: v ?? undefined })} />
                </Form.Item>
              </Space>
            )}

            {(vizType === 'TREND' || vizType === 'GAUGE') && (
              <Form.Item label="Higher is better" extra="Turn off for metrics like failures or costs.">
                <Switch checked={settings.upIsGood !== false} onChange={(upIsGood) => set({ upIsGood })} />
              </Form.Item>
            )}

            {vizType === 'WATERFALL' && (
              <Form.Item label="Show total bar">
                <Switch checked={settings.showTotal !== false} onChange={(showTotal) => set({ showTotal })} />
              </Form.Item>
            )}

            {(isCartesian || vizType === 'PIE' || vizType === 'WATERFALL') && (
              <Form.Item label="Show values on chart">
                <Switch checked={!!settings.showLabels} onChange={(showLabels) => set({ showLabels })} />
              </Form.Item>
            )}

            <Divider titlePlacement="start" plain>Number format</Divider>
            <Form.Item label="Style">
              <Segmented value={settings.format?.style ?? 'number'}
                onChange={(v) => setFormat({ style: v as NumberFormat['style'] })}
                options={[{ value: 'number', label: '1,234' }, { value: 'percent', label: '%' }, { value: 'compact', label: '1.2K' }]} />
            </Form.Item>
            {settings.format?.style === 'percent' && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -8 }}>
                Values are multiplied by 100: 0.25 shows as 25%.
              </Typography.Paragraph>
            )}
            <Space align="start">
              <Form.Item label="Decimals">
                <InputNumber min={0} max={6} value={settings.format?.decimals} placeholder="auto"
                  onChange={(v) => setFormat({ decimals: v ?? undefined })} style={{ width: 80 }} />
              </Form.Item>
              <Form.Item label="Prefix">
                <Input value={settings.format?.prefix} placeholder="₼ " onChange={(e) => setFormat({ prefix: e.target.value })} style={{ width: 80 }} />
              </Form.Item>
              <Form.Item label="Suffix">
                <Input value={settings.format?.suffix} placeholder=" AZN" onChange={(e) => setFormat({ suffix: e.target.value })} style={{ width: 80 }} />
              </Form.Item>
            </Space>
          </Form>
        )}
      </Drawer>
    </Space>
  )
}
