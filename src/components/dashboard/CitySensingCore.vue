<script setup lang="ts">
import type { EChartsCoreOption } from 'echarts/core'
import { Activity, ShieldCheck, Zap } from '@lucide/vue'
import ChartView from '../ChartView.vue'

const nodes = [
  { name: '北部新城', x: 46, y: 18, value: 82 },
  { name: '科创园', x: 68, y: 29, value: 64 },
  { name: '中央商务区', x: 51, y: 51, value: 96 },
  { name: '滨江新区', x: 75, y: 63, value: 76 },
  { name: '智慧港', x: 31, y: 67, value: 58 },
  { name: '南部枢纽', x: 52, y: 82, value: 71 },
]
const links = [[0, 2], [1, 2], [2, 3], [2, 4], [2, 5], [3, 5]]

const option: EChartsCoreOption = {
  tooltip: {
    trigger: 'item',
    formatter: (params: unknown) => {
      const data = (params as { data?: { name?: string; value?: number[] } }).data
      return data?.name ? `${data.name}<br/>运行指数 ${data.value?.[2] ?? '--'}` : ''
    },
  },
  grid: { left: 0, right: 0, top: 0, bottom: 0 },
  xAxis: { min: 10, max: 90, show: false },
  yAxis: { min: 0, max: 100, inverse: true, show: false },
  series: [
    ...links.map(([start, end]) => ({
      type: 'line' as const,
      data: [[nodes[start].x, nodes[start].y], [nodes[end].x, nodes[end].y]],
      showSymbol: false,
      silent: true,
      lineStyle: { color: 'rgba(58,187,255,.28)', width: 1.5, type: 'dashed' as const },
    })),
    {
      type: 'effectScatter',
      coordinateSystem: 'cartesian2d',
      rippleEffect: { scale: 3, brushType: 'stroke' },
      symbolSize: (value: number[]) => value[2] / 4,
      itemStyle: { color: '#38d9ff', shadowBlur: 20, shadowColor: '#37cfff' },
      label: { show: true, position: 'bottom', formatter: '{b}', color: '#bfe9ff', fontSize: 11, distance: 8 },
      data: nodes.map(node => ({ name: node.name, value: [node.x, node.y, node.value] })),
    },
  ],
}
</script>

<template>
  <section class="city-core">
    <div class="core-header">
      <div><span>城市生命体征</span><strong>91.8</strong><small>综合指数</small></div>
      <div class="running"><i />系统运行正常</div>
    </div>
    <div class="map-stage">
      <div class="radar-ring ring-one" />
      <div class="radar-ring ring-two" />
      <div class="radar-scan" />
      <ChartView :option="option" />
      <div class="map-label">实时感知网络 <span>LIVE SENSING NETWORK</span></div>
    </div>
    <div class="core-footer">
      <div><Activity :size="17" /><span>接入数据</span><strong>2.46 TB</strong></div>
      <div><Zap :size="17" /><span>计算任务</span><strong>8,642</strong></div>
      <div><ShieldCheck :size="17" /><span>安全指数</span><strong>98.6</strong></div>
    </div>
  </section>
</template>

<style scoped>
.city-core { position: relative; min-height: 0; overflow: hidden; border: 1px solid rgba(76, 171, 219, .13); background: radial-gradient(circle at 50% 53%, rgba(14, 106, 153, .2), transparent 37%), linear-gradient(180deg, rgba(7,23,43,.58), rgba(4,13,26,.65)); }
.city-core::before, .city-core::after { content: ''; position: absolute; inset: 10px; pointer-events: none; background: linear-gradient(#42cfff,#42cfff) left top/28px 1px no-repeat, linear-gradient(#42cfff,#42cfff) left top/1px 28px no-repeat, linear-gradient(#42cfff,#42cfff) right bottom/28px 1px no-repeat, linear-gradient(#42cfff,#42cfff) right bottom/1px 28px no-repeat; opacity: .45; }
.city-core::after { inset: 17px; opacity: .12; }
.core-header { position: absolute; z-index: 4; top: 22px; left: 28px; right: 28px; display: flex; justify-content: space-between; align-items: flex-start; }
.core-header > div:first-child { display: grid; grid-template-columns: auto auto; align-items: baseline; column-gap: 9px; }
.core-header span { grid-column: 1 / -1; color: #7894ad; font-size: 10px; }
.core-header strong { color: #e8faff; font-size: 48px; line-height: 1.08; text-shadow: 0 0 25px rgba(67,213,255,.3); }
.core-header small { color: #5c7893; font-size: 9px; }
.running { display: flex!important; align-items: center!important; gap: 7px!important; padding: 6px 9px; border: 1px solid rgba(68,218,172,.17); background: rgba(51,195,152,.05); color: #62ddb8!important; font-size: 9px!important; }
.running i { width: 5px; height: 5px; background: #4ce1ad; border-radius: 50%; box-shadow: 0 0 8px #4ce1ad; animation: pulse 1.8s infinite; }
.map-stage { position: absolute; inset: 76px 10px 53px; overflow: hidden; }
.map-stage::before { content: ''; position: absolute; inset: 10% 12%; opacity: .16; background-image: linear-gradient(30deg, #45cfff 1px, transparent 1px), linear-gradient(150deg, #45cfff 1px, transparent 1px); background-size: 38px 66px; mask-image: radial-gradient(circle, #000 20%, transparent 72%); transform: perspective(600px) rotateX(54deg) scale(1.5); }
.map-stage :deep(.chart-view) { position: relative; z-index: 3; }
.radar-ring { position: absolute; z-index: 1; left: 50%; top: 52%; border: 1px solid rgba(63,204,255,.13); border-radius: 50%; transform: translate(-50%,-50%) rotateX(55deg); }
.ring-one { width: 62%; height: 62%; box-shadow: 0 0 45px rgba(53,201,255,.06); }
.ring-two { width: 39%; height: 39%; border-style: dashed; }
.radar-scan { position: absolute; z-index: 2; left: 50%; top: 52%; width: 1px; height: 28%; transform-origin: bottom center; background: linear-gradient(transparent,#50ddff); opacity: .4; animation: scan 8s linear infinite; }
.map-label { position: absolute; z-index: 4; left: 50%; bottom: 4px; transform: translateX(-50%); font-size: 10px; letter-spacing: .14em; color: #88b4cb; white-space: nowrap; }
.map-label span { color: #365a71; font-size: 7px; margin-left: 6px; }
.core-footer { position: absolute; z-index: 4; bottom: 0; left: 0; right: 0; height: 48px; display: grid; grid-template-columns: repeat(3,1fr); border-top: 1px solid rgba(70,161,210,.12); background: rgba(4,15,29,.75); }
.core-footer > div { display: grid; grid-template-columns: 28px 1fr; align-content: center; padding: 0 16px; border-right: 1px solid rgba(70,161,210,.11); }
.core-footer svg { grid-row: 1 / 3; align-self: center; color: #42d9ff; }
.core-footer span { color: #5b7891; font-size: 8px; }
.core-footer strong { font-size: 11px; color: #caedff; margin-top: 2px; }

@keyframes pulse { 50% { opacity: .35; box-shadow: 0 0 2px #4ce1ad; } }
@keyframes scan { to { transform: rotate(360deg); } }
</style>
