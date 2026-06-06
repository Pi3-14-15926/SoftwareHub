<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import { syncAllGitHub } from '../../utils/api'
import { triggerSyncBackup } from '../../utils/githubRepo'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const message = useMessage()
const projects = useProjectStore()
const categories = useCategoryStore()

const syncing = ref(false)
const syncResult = ref('')
const backingUp = ref(false)

const githubCount = computed(() => projects.projects.filter(p => p.sourceType === 'github').length)
const customCount = computed(() => projects.projects.filter(p => p.sourceType === 'custom').length)
const totalVersions = computed(() =>
  projects.projects.reduce((sum, p) => sum + p.versions.length, 0),
)

async function doSync() {
  syncing.value = true
  syncResult.value = ''
  try {
    const results = await syncAllGitHub()
    const ok = results.filter((r) => r.success).length
    syncResult.value = `同步完成：${ok}/${results.length} 个项目成功`
    message.success(syncResult.value)
  } catch (e: any) {
    syncResult.value = `同步失败：${e.message}`
    message.error(syncResult.value)
  }
  syncing.value = false
}

async function doSyncBackup() {
  backingUp.value = true
  try {
    await triggerSyncBackup()
    message.success('已触发同步 + WebDAV 备份工作流')
  } catch (e: any) {
    message.error('触发失败：' + e.message)
  }
  backingUp.value = false
}

const stats = computed(() => [
  { label: '软件总数', value: projects.projects.length, desc: '所有已添加的软件', color: 'blue', icon: '📦' },
  {
    label: '项目总数',
    value: projects.projects.length,
    desc: `GitHub ${githubCount.value} · 自定义 ${customCount.value}`,
    color: 'purple',
    icon: '🔗',
  },
  { label: '页面总数', value: categories.categories.length, desc: '用于分类聚合', color: 'green', icon: '📂' },
  { label: '版本总数', value: totalVersions.value, desc: '所有项目累计', color: 'pink', icon: '🚀' },
])

onMounted(() => {
  projects.refresh()
  categories.refresh()
})
</script>

<template>
  <AdminLayout>
    <div class="dash-scroll">
      <div class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">📊</span>统计概览</h2>
          <p class="page-desc">Software Hub 管理后台概览</p>
        </div>
      </div>

      <div class="stats-grid">
        <div
          v-for="s in stats"
          :key="s.label"
          :class="['stat-card', `stat-${s.color}`]"
        >
          <div class="stat-icon">{{ s.icon }}</div>
          <div class="stat-content">
            <div class="stat-value">{{ s.value }}</div>
            <div class="stat-title">{{ s.label }}</div>
            <div class="stat-desc">{{ s.desc }}</div>
          </div>
        </div>
      </div>

      <div class="action-grid">
        <div class="action-card">
          <div class="action-icon">🔄</div>
          <div class="action-content">
            <h3 class="action-title">GitHub 同步</h3>
            <p class="action-desc">在 GitHub 服务器上自动拉取 Release 信息</p>
            <div class="action-buttons">
              <button class="btn-primary" :disabled="syncing" @click="doSync">
                {{ syncing ? '同步中...' : '同步Release' }}
              </button>
            </div>
            <div v-if="syncResult" class="action-result">{{ syncResult }}</div>
          </div>
        </div>

        <div class="action-card">
          <div class="action-icon">☁️</div>
          <div class="action-content">
            <h3 class="action-title">GitHub 同步 + 备份</h3>
            <p class="action-desc">同步 Release 同时执行 WebDAV 云盘备份</p>
            <div class="action-buttons">
              <button class="btn-primary" :disabled="backingUp" @click="doSyncBackup">
                {{ backingUp ? '触发中...' : '同步 + WebDAV 备份' }}
              </button>
            </div>
            <p class="action-result">每 6 小时自动执行，也可手动触发</p>
          </div>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
.dash-scroll {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-left: 25px;
  margin-right: -3px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 24px;
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  position: relative;
  overflow: hidden;
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0; right: 0;
  width: 110px; height: 110px;
  border-radius: 50%;
  filter: blur(45px);
  opacity: 0.4;
  transform: translate(30%, -30%);
}
.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--admin-shadow-card-hover);
}
.stat-blue::before   { background: rgba(52, 120, 246, 0.4); }
.stat-purple::before { background: rgba(140, 108, 255, 0.4); }
.stat-green::before  { background: rgba(60, 179, 113, 0.4); }
.stat-orange::before { background: rgba(240, 160, 32, 0.4); }
.stat-pink::before   { background: rgba(255, 107, 107, 0.4); }
.stat-cyan::before   { background: rgba(79, 193, 255, 0.4); }

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--color-card-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.stat-content { flex: 1; min-width: 0; position: relative; z-index: 1; }
.stat-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.stat-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-main);
  margin-top: 2px;
}
.stat-desc {
  font-size: 0.74rem;
  color: var(--text-tertiary);
  margin-top: 1px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}
.action-card {
  display: flex;
  gap: 16px;
  padding: 22px 24px;
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.action-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--admin-shadow-card-hover);
}
.action-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--admin-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
  color: #FFFFFF;
  box-shadow: 0 6px 20px rgba(79, 140, 255, 0.28);
}
.action-content { flex: 1; min-width: 0; }
.action-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
}
.action-desc {
  font-size: 0.88rem;
  color: var(--text-sec);
  margin: 0 0 14px;
  line-height: 1.5;
}
.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.action-result {
  margin-top: 10px;
  font-size: 0.85rem;
  color: var(--color-success);
  font-weight: 500;
}

@media (max-width: 768px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .stat-card { padding: 16px 18px; }
  .stat-value { font-size: 1.3rem; }
  .action-grid { grid-template-columns: 1fr; }
  .action-card { flex-direction: column; }
  .action-buttons .btn-primary,
  .action-buttons .btn-secondary { width: 100%; }
}
</style>
