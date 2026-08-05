<script setup lang="ts">
import { ref } from 'vue'
import DataPanel from '../DataPanel.vue'

const selectedDistrict = ref('中央商务区')
const districts = [
  { name: '中央商务区', score: 96, state: '畅通' },
  { name: '北部新城', score: 89, state: '良好' },
  { name: '滨江新区', score: 86, state: '良好' },
  { name: '南部枢纽', score: 78, state: '关注' },
]
</script>

<template>
  <DataPanel title="重点区域运行指数" subtitle="DISTRICT OPERATION INDEX">
    <div class="district-list">
      <button
        v-for="(item, index) in districts"
        :key="item.name"
        :class="{ selected: selectedDistrict === item.name }"
        @click="selectedDistrict = item.name"
      >
        <span class="rank">0{{ index + 1 }}</span>
        <span class="district-name">{{ item.name }}</span>
        <span class="score">{{ item.score }}</span>
        <span class="state">{{ item.state }}</span>
      </button>
    </div>
  </DataPanel>
</template>

<style scoped>
.district-list { display: grid; gap: 6px; height: 100%; align-content: center; }
.district-list button { display: grid; grid-template-columns: 28px 1fr 36px 38px; align-items: center; min-height: 32px; border: 1px solid transparent; border-radius: 2px; background: rgba(42,99,139,.06); color: #89a1b9; text-align: left; cursor: pointer; transition: .2s ease; }
.district-list button:hover, .district-list button.selected { border-color: rgba(60,205,255,.22); background: linear-gradient(90deg, rgba(48,195,239,.13), rgba(48,195,239,.02)); }
.rank { color: #3d708e; font-size: 9px; }
.district-name { font-size: 10px; }
.score { color: #c5edff; font-size: 13px; font-weight: 600; }
.state { font-size: 8px; color: #53dbb5; }
.district-list button:last-child .state { color: #ffc35a; }
</style>
