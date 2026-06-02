<script setup lang="ts">
import { useSettingStore } from '../store/settings'
const settings = useSettingStore()
</script>

<template>
  <footer class="site-footer">
    <p>{{ settings.settings.footer || 'Powered by Software Hub' }}</p>
    <p class="footer-note">数据存储在 GitHub JSON 文件，零服务器成本</p>
  </footer>
</template>

<style scoped>
.site-footer {
  text-align: center;
  padding: 24px 20px;
  color: var(--text-sec);
  font-size: 0.85rem;
  border-top: 1px solid var(--border-color);
  margin-top: 60px;
}
.footer-note {
  font-size: 0.78rem;
  opacity: 0.7;
  margin-top: 4px;
}
</style>
