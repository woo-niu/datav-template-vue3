<script setup lang="ts">
import type { EChartsCoreOption } from 'echarts/core'
import ChartView from '../ChartView.vue'
import DataPanel from '../DataPanel.vue'

const option: EChartsCoreOption = {
  tooltip: { trigger: 'item' },
  legend: {
    bottom: 0,
    textStyle: { color: '#8399b3', fontSize: 10 },
    itemWidth: 8,
    itemHeight: 8,
  },
  series: [{
    type: 'pie',
    radius: ['48%', '72%'],
    center: ['50%', '43%'],
    padAngle: 3,
    itemStyle: { borderRadius: 5 },
    label: { show: false },
    data: [
      { value: 38, name: '政务服务', itemStyle: { color: '#41d9ff' } },
      { value: 26, name: '交通出行', itemStyle: { color: '#4d7cff' } },
      { value: 21, name: '公共安全', itemStyle: { color: '#47e6a8' } },
      { value: 15, name: '城市治理', itemStyle: { color: '#ffc75c' } },
    ],
  }],
  graphic: [{
    type: 'text', left: 'center', top: '31%',
    style: { text: '1,286\n今日服务', fill: '#eaf8ff', fontSize: 13, fontWeight: 600, align: 'center', lineHeight: 20 },
  }],
}
</script>

<template>
  <DataPanel title="城市服务构成" subtitle="PUBLIC SERVICE MATRIX">
    <ChartView class="service-chart" :option="option" />
  </DataPanel>
</template>

<style scoped>
.service-chart { height: 100%; }
</style>
