<script setup lang="ts">
/* ===== 背景装饰浮动光球 ===== */
</script>

<template>
  <div class="ambient" aria-hidden="true">
    <span class="orb orb-1"></span>
    <span class="orb orb-2"></span>
    <span class="orb orb-3"></span>
  </div>
</template>

<style scoped>
.ambient {
  position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0;
}
.orb {
  position: absolute;
  width: 420px; height: 420px;
  border-radius: 50%;
  opacity: 0.45;
  mix-blend-mode: multiply;
  animation: float 14s ease-in-out infinite;
}
.orb-1 {
  top: -120px; left: -80px;
  background: radial-gradient(circle at 30% 30%, #f2b39b, transparent 70%);
}
.orb-2 {
  top: 20%; right: -160px;
  background: radial-gradient(circle at 30% 30%, #9fd3c7, transparent 70%);
  animation-delay: 1.5s;
}
.orb-3 {
  bottom: -180px; left: 30%;
  background: radial-gradient(circle at 40% 40%, #f5d76e, transparent 70%);
  animation-delay: 3s;
}
@keyframes float {
  0%, 100% { transform: translateY(0) translateX(0) scale(1); }
  50%      { transform: translateY(30px) translateX(-20px) scale(1.05); }
}
</style>
