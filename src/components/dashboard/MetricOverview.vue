<script setup lang="ts">
import { CarFront, Radio, ShieldCheck, Users } from '@lucide/vue'

const stats = [
  { label: '常住人口', value: '326.8', unit: '万人', delta: '+2.4%', icon: Users, color: '#41d9ff' },
  { label: '今日车流', value: '82.6', unit: '万辆', delta: '+6.8%', icon: CarFront, color: '#6f8cff' },
  { label: '在线设备', value: '18,429', unit: '个', delta: '99.2%', icon: Radio, color: '#48e5ac' },
  { label: '处置事件', value: '1,286', unit: '件', delta: '-12.3%', icon: ShieldCheck, color: '#ffcb6b' },
]
</script>

<template>
  <section class="metric-row">
    <article
      v-for="item in stats"
      :key="item.label"
      class="metric-card"
      :style="{ '--accent': item.color }"
    >
      <div class="metric-icon"><component :is="item.icon" :size="20" /></div>
      <div>
        <span class="metric-label">{{ item.label }}</span>
        <div class="metric-value">{{ item.value }} <small>{{ item.unit }}</small></div>
      </div>
      <span class="metric-delta">{{ item.delta }}</span>
    </article>
  </section>
</template>

<style scoped>
.metric-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0 12px; }
.metric-card { --accent: #41d9ff; min-width: 0; height: 72px; display: flex; align-items: center; gap: 12px; padding: 12px 15px; position: relative; background: linear-gradient(100deg, color-mix(in srgb, var(--accent) 8%, transparent), rgba(6,18,36,.78)); border: 1px solid rgba(105, 181, 222, .14); border-left-color: color-mix(in srgb, var(--accent) 60%, transparent); clip-path: polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%); }
.metric-card::after { content: ''; position: absolute; width: 14px; height: 1px; right: 1px; top: 5px; background: var(--accent); transform: rotate(45deg); opacity: .5; }
.metric-icon { flex: 0 0 39px; width: 39px; height: 39px; display: grid; place-items: center; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 4px; }
.metric-label { color: #778fa9; font-size: 10px; }
.metric-value { color: #f0fbff; font-size: 26px; font-weight: 600; margin-top: 2px; letter-spacing: .02em; }
.metric-value small { font-size: 9px; color: #7088a2; font-weight: 400; }
.metric-delta { margin-left: auto; align-self: flex-start; color: var(--accent); font-size: 9px; background: color-mix(in srgb, var(--accent) 8%, transparent); padding: 3px 5px; border-radius: 2px; }
</style>
