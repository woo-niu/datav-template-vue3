<script setup lang="ts">
import type { EChartsCoreOption } from 'echarts/core'
import ChartView from '../ChartView.vue'
import DataPanel from '../DataPanel.vue'
import { axisStyle, axisTooltip } from './chartTheme'

const option: EChartsCoreOption = {
  tooltip: axisTooltip,
  grid: { left: 6, right: 8, top: 10, bottom: 0, containLabel: true },
  xAxis: { type: 'value', max: 100, show: false },
  yAxis: {
    type: 'category',
    inverse: true,
    data: ['公共建筑', '商业设施', '工业园区', '交通枢纽'],
    ...axisStyle,
    axisLabel: { color: '#9bb0c8', fontSize: 11 },
  },
  series: [{
    type: 'bar',
    data: [86, 72, 64, 51],
    barWidth: 6,
    showBackground: true,
    backgroundStyle: { color: 'rgba(92,136,173,.12)', borderRadius: 4 },
    itemStyle: {
      borderRadius: 4,
      color: {
        type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
        colorStops: [
          { offset: 0, color: '#196ce5' },
          { offset: 1, color: '#47e6d2' },
        ],
      },
    },
    label: { show: true, position: 'right', color: '#bfefff', formatter: '{c}%' },
  }],
}
</script>

<template>
  <DataPanel title="重点能耗监测" subtitle="ENERGY CONSUMPTION">
    <div class="energy-summary">
      <span>今日总能耗</span><strong>426.8</strong><small>MWh</small><em>同比 -8.6%</em>
    </div>
    <ChartView class="energy-chart" :option="option" />
  </DataPanel>
</template>

<style scoped>
.energy-summary { position: absolute; z-index: 2; top: 12px; left: 16px; display: flex; align-items: baseline; gap: 5px; }
.energy-summary span { position: absolute; bottom: 23px; color: #5f7b95; font-size: 8px; }
.energy-summary strong { font-size: 20px; color: #e8f8ff; }
.energy-summary small { color: #57738d; font-size: 8px; }
.energy-summary em { margin-left: 4px; color: #4cdcb0; font-style: normal; font-size: 8px; }
.energy-chart { height: calc(100% - 20px); margin-top: 20px; }
</style>
