<script setup lang="ts">
import { Building2, CloudSun } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const now = ref(new Date())
let timer = 0

onMounted(() => {
  timer = window.setInterval(() => { now.value = new Date() }, 1000)
})
onBeforeUnmount(() => window.clearInterval(timer))

const timeText = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))
const dateText = computed(() => now.value.toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
}))
</script>

<template>
  <header class="topbar">
    <div class="brand-mark"><Building2 :size="18" /><span>URBAN OS</span></div>
    <div class="title-wrap">
      <span class="title-line" />
      <h1>智慧城市 · 综合态势中心</h1>
      <span class="title-line" />
    </div>
    <div class="status-cluster">
      <span class="weather"><CloudSun :size="17" /> 26°C 晴</span>
      <span class="divider" />
      <div class="datetime"><strong>{{ timeText }}</strong><span>{{ dateText }}</span></div>
    </div>
  </header>
</template>

<style scoped>
.topbar { height: 62px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 20px; border-bottom: 1px solid rgba(70, 189, 255, .2); }
.brand-mark { display: flex; gap: 9px; align-items: center; color: #43d8ff; font-size: 11px; font-weight: 700; letter-spacing: .18em; }
.brand-mark svg { padding: 4px; box-sizing: content-box; border: 1px solid rgba(67, 216, 255, .35); background: rgba(67,216,255,.08); }
.title-wrap { display: flex; align-items: center; gap: 18px; margin-top: -4px; }
.title-wrap h1 { margin: 0; font-size: 32px; letter-spacing: .14em; font-weight: 600; color: #effbff; text-shadow: 0 0 28px rgba(78, 210, 255, .38); white-space: nowrap; }
.title-line { width: 64px; height: 1px; background: linear-gradient(90deg, transparent, #3ccfff); position: relative; }
.title-line:last-child { transform: scaleX(-1); }
.title-line::after { content: ''; position: absolute; right: 0; top: -2px; width: 5px; height: 5px; background: #72e6ff; box-shadow: 0 0 10px #3fd6ff; }
.status-cluster { justify-self: end; display: flex; align-items: center; gap: 14px; color: #91a9c1; font-size: 11px; }
.weather { display: flex; align-items: center; gap: 7px; }
.weather svg { color: #ffc967; }
.divider { width: 1px; height: 22px; background: rgba(102,171,211,.23); }
.datetime { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.15; }
.datetime strong { color: #e7f7ff; font-size: 17px; letter-spacing: .08em; }
.datetime span { margin-top: 4px; font-size: 9px; }
</style>
