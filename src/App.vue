<script setup lang="ts">
import ScreenContainer from './components/ScreenContainer.vue'
import AlertTicker from './components/dashboard/AlertTicker.vue'
import CitySensingCore from './components/dashboard/CitySensingCore.vue'
import DashboardHeader from './components/dashboard/DashboardHeader.vue'
import DistrictIndexPanel from './components/dashboard/DistrictIndexPanel.vue'
import EnergyPanel from './components/dashboard/EnergyPanel.vue'
import EventTrendPanel from './components/dashboard/EventTrendPanel.vue'
import MetricOverview from './components/dashboard/MetricOverview.vue'
import ServiceMatrixPanel from './components/dashboard/ServiceMatrixPanel.vue'
</script>

<template>
  <ScreenContainer>
    <main class="dashboard-shell">
      <div class="grid-bg" />
      <DashboardHeader />
      <MetricOverview />

      <section class="content-grid">
        <div class="column side-column">
          <EventTrendPanel />
          <DistrictIndexPanel />
        </div>

        <CitySensingCore />

        <div class="column side-column">
          <EnergyPanel />
          <ServiceMatrixPanel />
        </div>
      </section>

      <AlertTicker />
    </main>
  </ScreenContainer>
</template>

<style scoped>
.dashboard-shell { position: relative; isolation: isolate; width: 100%; height: 100%; padding: 28px; overflow: hidden; background: radial-gradient(circle at 50% 42%, rgba(20, 86, 137, .26), transparent 37%), linear-gradient(145deg, #030713 0%, #071225 52%, #030813 100%); }
/* 用两个伪元素创建背景氛围光，不额外增加页面节点；层级位于内容与网格背景之间。 */
.dashboard-shell::before, .dashboard-shell::after { content: ''; position: absolute; z-index: -1; width: 691px; height: 691px; border-radius: 50%; filter: blur(100px); opacity: .1; }
/* 左侧蓝色光晕。 */
.dashboard-shell::before { left: -384px; top: 108px; background: #0e8ef7; }
/* 右下角绿色光晕，与左侧冷色光形成层次。 */
.dashboard-shell::after { right: -346px; bottom: -269px; background: #26efd0; }
.grid-bg { position: absolute; inset: 0; z-index: -2; opacity: .2; background-image: linear-gradient(rgba(49, 137, 194, .09) 1px, transparent 1px), linear-gradient(90deg, rgba(49, 137, 194, .09) 1px, transparent 1px); background-size: 48px 48px; mask-image: linear-gradient(to bottom, transparent 2%, #000 22%, #000 78%, transparent 100%); }

.content-grid { display: grid; grid-template-columns: minmax(250px, 1fr) minmax(460px, 1.7fr) minmax(250px, 1fr); gap: 12px; min-height: calc(100% - 206px); }
.column { display: grid; grid-template-rows: 1fr 1fr; gap: 12px; min-height: 0; }
</style>
