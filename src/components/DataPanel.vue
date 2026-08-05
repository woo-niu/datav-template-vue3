<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <section class="data-panel">
    <header class="panel-header">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <span class="panel-signal"><i /><i /><i /></span>
    </header>
    <div class="panel-body"><slot /></div>
  </section>
</template>

<style scoped>
.data-panel { position: relative; min-height: 0; overflow: hidden; background: linear-gradient(145deg, rgba(8, 25, 48, .9), rgba(4, 15, 30, .74)); border: 1px solid rgba(71, 159, 207, .16); box-shadow: inset 0 0 40px rgba(13, 85, 128, .05); clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%); }
.data-panel::before { content: ''; position: absolute; left: 0; top: 0; width: 78px; height: 1px; background: linear-gradient(90deg, #42d9ff, transparent); }
.panel-header { height: 53px; display: flex; align-items: center; justify-content: space-between; padding: 11px 14px 7px; border-bottom: 1px solid rgba(85, 164, 204, .11); }
.panel-header h2 { margin: 0; color: #dff4ff; font-size: 13px; font-weight: 600; letter-spacing: .06em; }
.panel-header p { margin: 3px 0 0; color: #45637d; font-size: 7px; letter-spacing: .13em; }
.panel-signal { display: flex; align-items: flex-end; gap: 2px; height: 12px; }
.panel-signal i { display: block; width: 2px; height: 4px; background: #3bd6ff; box-shadow: 0 0 5px #3bd6ff; }
.panel-signal i:nth-child(2) { height: 8px; opacity: .7; }
.panel-signal i:nth-child(3) { height: 12px; opacity: .35; }
.panel-body { position: relative; height: calc(100% - 53px); min-height: 130px; padding: 9px 12px; }
</style>
