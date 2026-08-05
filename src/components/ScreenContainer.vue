<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// 以 1920 × 1080 作为大屏设计稿基准；需要时可由外部传入不同尺寸。
const props = withDefaults(defineProps<{
  width?: number
  height?: number
}>(), {
  width: 1920,
  height: 1080,
})

// 容器实际尺寸由浏览器视口决定，用于计算设计稿的等比缩放比例。
const container = ref<HTMLDivElement>()
const viewportWidth = ref(0)
const viewportHeight = ref(0)
let observer: ResizeObserver | undefined

// 取宽、高两个缩放比中的较小值：完整展示设计稿，剩余空间自然形成留白。
const scale = computed(() => {
  if (!viewportWidth.value || !viewportHeight.value) return 1
  return Math.min(viewportWidth.value / props.width, viewportHeight.value / props.height)
})

// 固定内部设计稿尺寸，仅通过 transform 缩放，避免各模块在不同分辨率下重排。
const screenStyle = computed(() => ({
  width: `${props.width}px`,
  height: `${props.height}px`,
  transform: `translate(-50%, -50%) scale(${scale.value})`,
}))

onMounted(() => {
  if (!container.value) return

  // 监听容器尺寸变化，支持窗口缩放、全屏切换及不同显示器分辨率。
  const updateSize = () => {
    if (!container.value) return
    viewportWidth.value = container.value.clientWidth
    viewportHeight.value = container.value.clientHeight
  }

  // ResizeObserver 比 window.resize 更准确，容器自身尺寸变化也能触发更新。
  observer = new ResizeObserver(updateSize)
  observer.observe(container.value)
  updateSize()
})

// 组件销毁时解除监听，避免残留观察器。
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="container" class="screen-container">
    <div class="screen-content" :style="screenStyle">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.screen-container {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #02050d;
}

.screen-content {
  position: absolute;
  top: 50%;
  left: 50%;
  overflow: hidden;
  /* 配合 translate(-50%, -50%)，始终以屏幕中心为缩放原点。 */
  transform-origin: center center;
}
</style>
