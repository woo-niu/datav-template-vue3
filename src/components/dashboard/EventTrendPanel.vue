<script setup lang="ts">
import type { EChartsCoreOption } from 'echarts/core'
import { computed, ref } from 'vue'
import ChartView from '../ChartView.vue'
import DataPanel from '../DataPanel.vue'
import { axisStyle, axisTooltip } from './chartTheme'

const activePeriod = ref<'今日' | '本周'>('今日')

const option = computed<EChartsCoreOption>(() => {
  const weekly = activePeriod.value === '本周'
  return {
    tooltip: axisTooltip,
    grid: { left: 5, right: 10, top: 22, bottom: 2, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: weekly ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] : ['00', '04', '08', '12', '16', '20', '24'],
      ...axisStyle,
    },
    yAxis: { type: 'value', ...axisStyle },
    series: [{
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: weekly ? [182, 235, 208, 312, 286, 198, 226] : [12, 18, 42, 36, 57, 48, 31],
      lineStyle: { color: '#41d9ff', width: 2 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(65,217,255,.38)' },
            { offset: 1, color: 'rgba(65,217,255,0)' },
          ],
        },
      },
    }],
  }
})
</script>

<template>
  <DataPanel title="城市事件趋势" subtitle="CITY EVENT TREND">
    <div class="period-tabs">
      <button
        v-for="period in ['今日', '本周'] as const"
        :key="period"
        :class="{ active: activePeriod === period }"
        @click="activePeriod = period"
      >{{ period }}</button>
    </div>
    <ChartView class="trend-chart" :option="option" />
  </DataPanel>
</template>

<style scoped>
.trend-chart { height: calc(100% - 20px); }
.period-tabs { position: absolute; z-index: 2; top: 9px; right: 12px; display: flex; gap: 3px; }
.period-tabs button { border: 0; padding: 3px 7px; border-radius: 2px; background: transparent; color: #617b96; font-size: 9px; cursor: pointer; }
.period-tabs button.active { color: #4ad9ff; background: rgba(60,205,255,.1); }
</style>
