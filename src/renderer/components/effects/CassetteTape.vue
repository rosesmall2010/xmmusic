<template>
  <div class="cassette" :class="{ 'is-light': light, 'is-playing': active }">
    <div class="cassette-shell">
      <div class="cassette-window">
        <div class="reel reel-left">
          <div class="reel-core"></div>
          <div class="reel-cover">
            <img v-if="coverUrl" :src="coverUrl" :alt="alt" @error="$emit('coverError')" />
            <div v-else class="reel-fallback"><slot name="fallback" /></div>
          </div>
        </div>
        <div class="tape-path"></div>
        <div class="reel reel-right">
          <div class="reel-core"></div>
          <div class="reel-cover">
            <img v-if="coverUrl" :src="coverUrl" :alt="alt" @error="$emit('coverError')" />
            <div v-else class="reel-fallback"><slot name="fallback" /></div>
          </div>
        </div>
      </div>
      <div class="cassette-label"></div>
      <div class="cassette-screws" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  coverUrl?: string | null
  active?: boolean
  light?: boolean
  alt?: string
}>(), {
  coverUrl: null,
  active: false,
  light: false,
  alt: ''
})

defineEmits<{ (e: 'coverError'): void }>()
</script>

<style scoped>
.cassette {
  width: 100%;
  max-width: min(100%, 360px);
  aspect-ratio: 1;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cassette-shell {
  width: 96%;
  aspect-ratio: 1 / 0.62;
  border-radius: 16px;
  position: relative;
  background: linear-gradient(145deg, #242831 0%, #14181f 100%);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.36), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.cassette.is-light .cassette-shell {
  background: linear-gradient(145deg, #313744 0%, #1f2531 100%);
  box-shadow: 0 12px 28px rgba(20, 22, 26, 0.26), inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.cassette-window {
  position: absolute;
  left: 8%;
  right: 8%;
  top: 16%;
  height: 46%;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10%;
}

.reel {
  width: 32%;
  aspect-ratio: 1;
  border-radius: 50%;
  position: relative;
  border: 2px solid rgba(255, 255, 255, 0.28);
  background: radial-gradient(circle, rgba(255, 255, 255, 0.18) 0%, rgba(0, 0, 0, 0.36) 70%);
}

.cassette.is-playing .reel-left {
  animation: reel-spin 2s linear infinite;
}

.cassette.is-playing .reel-right {
  animation: reel-spin 1.6s linear infinite reverse;
}

.reel-core {
  position: absolute;
  inset: 38%;
  border-radius: 50%;
  background: #10141b;
  border: 1px solid rgba(255, 255, 255, 0.24);
  z-index: 2;
}

.reel-cover {
  position: absolute;
  inset: 16%;
  border-radius: 50%;
  overflow: hidden;
}

.reel-cover img,
.reel-fallback {
  width: 100%;
  height: 100%;
}

.reel-cover img {
  object-fit: cover;
}

.reel-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
}

.reel-fallback :deep(*) {
  width: 100%;
  height: 100%;
}

.tape-path {
  flex: 1;
  margin: 0 6%;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.22));
}

.cassette-label {
  position: absolute;
  left: 10%;
  right: 10%;
  bottom: 14%;
  height: 22%;
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.06));
}

.cassette-screws span {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}

.cassette-screws span:nth-child(1) { top: 8px; left: 8px; }
.cassette-screws span:nth-child(2) { top: 8px; right: 8px; }
.cassette-screws span:nth-child(3) { bottom: 8px; left: 8px; }
.cassette-screws span:nth-child(4) { bottom: 8px; right: 8px; }

@keyframes reel-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
