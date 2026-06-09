<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NInput, NSwitch, NSelect, useMessage } from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { useSettingStore } from '../../store/settings'

const store = useSettingStore()
const message = useMessage()

/* ============== 定时任务 ============== */
const taskForm = ref({
  syncEnabled: false,
  syncIntervalHours: 6,
  backupEnabled: false,
  backupIntervalHours: 24,
})
const intervalOptions = [
  { label: '每 1 小时', value: 1 },
  { label: '每 6 小时', value: 6 },
  { label: '每 12 小时', value: 12 },
  { label: '每天', value: 24 },
]
const backupIntervalOptions = [
  { label: '每 1 小时', value: 1 },
  { label: '每 6 小时', value: 6 },
  { label: '每 12 小时', value: 12 },
  { label: '每天', value: 24 },
  { label: '每 3 天', value: 72 },
  { label: '每周', value: 168 },
]
function intervalLabel(list: { label: string; value: number }[], v: number) {
  return list.find((o) => o.value === v)?.label || `${v} 小时`
}
function saveTask() {
  const cur = store.settings
  store.save({
    ...cur,
    schedule: {
      ...(cur.schedule || {}),
      syncEnabled: taskForm.value.syncEnabled,
      syncIntervalHours: taskForm.value.syncIntervalHours,
      backupEnabled: taskForm.value.backupEnabled,
      backupIntervalHours: taskForm.value.backupIntervalHours,
    },
  })
  message.success('定时任务已保存')
}

onMounted(() => {
  store.refresh()
  const sc = store.settings.schedule
  taskForm.value = {
    syncEnabled: sc?.syncEnabled ?? false,
    syncIntervalHours: sc?.syncIntervalHours ?? 6,
    backupEnabled: sc?.backupEnabled ?? false,
    backupIntervalHours: sc?.backupIntervalHours ?? 24,
  }
})
</script>

<template>
  <AdminLayout>
    <div class="features-page">
      <div class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">🛠️</span>功能设置</h2>
          <p class="page-desc">按功能分类的可选配置项</p>
        </div>
      </div>

      <!-- 导入导出 已迁移至「统计概览」页面 -->

      <!-- 定时任务 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">⏰</div>
          <div>
            <h3 class="card-title">定时任务</h3>
            <p class="card-desc">在 GitHub Actions 上自动执行同步与备份</p>
          </div>
        </header>

        <div class="task-list">
          <div class="task-card">
            <div class="task-info">
              <div class="task-name">Release 同步</div>
              <div class="task-desc">
                拉取所有 GitHub 项目的最新 Release 信息
                <span v-if="taskForm.syncEnabled" class="task-interval">· {{ intervalLabel(intervalOptions, taskForm.syncIntervalHours) }}</span>
              </div>
            </div>
            <div class="task-control">
              <NSelect
                v-if="taskForm.syncEnabled"
                v-model:value="taskForm.syncIntervalHours"
                :options="intervalOptions"
                size="small"
                style="width: 120px;"
              />
              <NSwitch v-model:value="taskForm.syncEnabled" />
            </div>
          </div>

          <div class="task-card">
            <div class="task-info">
              <div class="task-name">WebDAV 备份</div>
              <div class="task-desc">
                将 Release 文件备份到 WebDAV 云盘
                <span v-if="taskForm.backupEnabled" class="task-interval">· {{ intervalLabel(backupIntervalOptions, taskForm.backupIntervalHours) }}</span>
              </div>
            </div>
            <div class="task-control">
              <NSelect
                v-if="taskForm.backupEnabled"
                v-model:value="taskForm.backupIntervalHours"
                :options="backupIntervalOptions"
                size="small"
                style="width: 120px;"
              />
              <NSwitch v-model:value="taskForm.backupEnabled" />
            </div>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn-primary" @click="saveTask">保存</button>
        </div>
      </section>
    </div>
  </AdminLayout>
</template>

<style scoped>
.features-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
  padding-left: 25px;
  padding-right: 25px;
  margin-right: -3px;
}

.settings-card {
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  padding: 24px;
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--admin-border);
}
.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  flex-shrink: 0;
  background: rgba(52, 120, 246, 0.12);
}
.card-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 2px;
}
.card-desc {
  font-size: 0.82rem;
  color: var(--text-tertiary);
  margin: 0;
}

/* === 任务卡（HyperOS 风格） === */
.task-list { display: flex; flex-direction: column; gap: 12px; }
.task-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: 18px;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.task-card:hover {
  background: #FFFFFF;
  border-color: var(--color-primary-soft);
}
.task-info { flex: 1; min-width: 0; }
.task-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 2px;
}
.task-desc {
  font-size: 0.82rem;
  color: var(--text-tertiary);
}
.task-interval {
  color: var(--color-primary);
  font-weight: 600;
  margin-left: 4px;
}
.task-control {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.card-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 20px;
}

@media (max-width: 768px) {
  .task-card { flex-direction: column; align-items: flex-start; }
  .task-control { width: 100%; justify-content: space-between; }
}
</style>
