<script setup lang="ts">
import { Bell, ChevronRight } from '@lucide/vue'

const alerts = [
  { time: '10:42', level: '中', text: '滨江大道车流密度持续升高' },
  { time: '10:31', level: '低', text: '科创园区 3 号传感器离线' },
  { time: '10:18', level: '低', text: '北部新城工单响应临近阈值' },
]
</script>

<template>
  <section class="bottom-bar">
    <div class="alert-title"><Bell :size="15" /><span>实时告警</span><b>{{ alerts.length }}</b></div>
    <div class="alerts">
      <div v-for="alert in alerts" :key="alert.time" class="alert-item">
        <time>{{ alert.time }}</time>
        <span :class="['level', alert.level]">{{ alert.level }}</span>
        <p>{{ alert.text }}</p>
      </div>
    </div>
    <button class="more-btn">查看全部 <ChevronRight :size="14" /></button>
  </section>
</template>

<style scoped>
.bottom-bar { min-height: 42px; margin-top: 12px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; padding: 0 12px; border: 1px solid rgba(68,157,204,.14); background: rgba(5,17,32,.82); overflow: hidden; }
.alert-title { display: flex; align-items: center; gap: 7px; color: #a9c4d8; font-size: 10px; }
.alert-title svg { color: #ffbd5d; }
.alert-title b { display: grid; place-items: center; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 8px; background: rgba(255,174,65,.12); color: #ffc66a; font-size: 8px; }
.alerts { min-width: 0; display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
.alert-item { display: flex; align-items: center; min-width: 0; gap: 7px; font-size: 9px; }
.alert-item time { color: #5b7890; }
.alert-item p { overflow: hidden; margin: 0; color: #839bb1; white-space: nowrap; text-overflow: ellipsis; }
.level { padding: 2px 4px; border-radius: 2px; background: rgba(255,196,82,.12); color: #ffc45c; }
.level.低 { background: rgba(58,210,255,.09); color: #49d4f6; }
.more-btn { display: flex; align-items: center; gap: 3px; border: 0; background: none; color: #4e8baa; font-size: 9px; cursor: pointer; }
</style>
