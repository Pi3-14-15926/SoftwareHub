<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NInputNumber, NUpload, NProgress, NAlert, useMessage } from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { useSettingStore } from '../../store/settings'
import { getProjects, getCategories, getSettings, saveSettings, saveJSON } from '../../utils/api'
import { DEFAULT_SETTINGS } from '../../defaults'
import { commitAllData } from '../../utils/githubRepo'

const store = useSettingStore()
const message = useMessage()

/* ============== Web 备份设置 ============== */
const webForm = ref({
  uploadTimeout: 300,
  maxFileSize: 500,
})

onMounted(() => {
  store.refresh()
  const wd = store.settings.webdav
  webForm.value = {
    uploadTimeout: wd?.uploadTimeout ?? 300,
    maxFileSize: wd?.maxFileSize ?? 500,
  }
})

function saveWeb() {
  const s = { ...store.settings }
  s.webdav = {
    ...(s.webdav || {}),
    url: s.webdav?.url || '',
    username: s.webdav?.username || '',
    password: s.webdav?.password || '',
    baseDir: s.webdav?.baseDir || '/SoftwareHub',
    uploadTimeout: webForm.value.uploadTimeout,
    maxFileSize: webForm.value.maxFileSize,
  }
  store.save(s)
  message.success('Web 备份设置已保存')
}

/* ============== 导入导出 ============== */
const exporting = ref(false)
const importing = ref(false)
const importProgress = ref(0)
const baking = ref(false)
const publishing = ref(false)
const commitUrl = ref('')

function exportData() {
  exporting.value = true
  try {
    const data = {
      exportTime: new Date().toISOString(),
      version: '1.0.0',
      projects: getProjects(),
      categories: getCategories(),
      settings: getSettings(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `softwarehub-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (e: any) {
    message.error('导出失败: ' + e.message)
  } finally {
    exporting.value = false
  }
}

function importFromJSON({ file }: { file: UploadFileInfo }) {
  if (importing.value || !file.file) return
  importing.value = true
  importProgress.value = 0
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const text = e.target?.result as string
      const data = JSON.parse(text)
      if (!data.projects || !data.categories || !data.settings) {
        message.error('无效的备份文件：缺少必需字段')
        importing.value = false
        return
      }
      saveJSON('sh_projects', data.projects)
      importProgress.value = 33
      saveJSON('sh_categories', data.categories)
      importProgress.value = 66
      saveJSON('sh_settings', data.settings)
      importProgress.value = 100
      message.success(`导入成功！共 ${data.projects.length} 个项目、${data.categories.length} 个分类`)
    } catch (e: any) {
      message.error('导入失败: ' + e.message)
    } finally {
      importing.value = false
    }
  }
  reader.onerror = () => { message.error('文件读取失败'); importing.value = false }
  reader.readAsText(file.file as Blob)
}

async function bakeDefaults() {
  baking.value = true
  try {
    const settings = getSettings()
    const res = await fetch('/__bake-defaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '未知错误' }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    message.success('默认配置已写入 src/defaults.ts')
  } catch (e: any) {
    message.error('写入失败: ' + e.message)
  } finally {
    baking.value = false
  }
}

function resetDefaults() {
  saveSettings(DEFAULT_SETTINGS)
  message.success('设置已恢复为默认值')
}

async function publishToRepo() {
  publishing.value = true
  commitUrl.value = ''
  try {
    const result = await commitAllData()
    commitUrl.value = `https://github.com/${result.repo}/commits/main`
    message.success(`已提交 ${result.files} 个文件到 ${result.repo}，等待构建部署...`)
  } catch (e: any) {
    message.error('发布失败: ' + e.message)
  } finally { publishing.value = false }
}
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

      <!-- 导入导出 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon io">📋</div>
          <div>
            <h3 class="card-title">导入导出</h3>
            <p class="card-desc">数据备份、迁移、发布到 GitHub 仓库</p>
          </div>
        </header>

        <div class="io-grid">
          <div class="io-card">
            <div class="io-mini-icon">📤</div>
            <div class="io-content">
              <h4 class="io-title">导出数据</h4>
              <p class="io-desc">将项目、分类、设置打包为 JSON 文件下载到本地</p>
              <button class="btn-primary" :disabled="exporting" @click="exportData">
                {{ exporting ? '导出中...' : '导出数据' }}
              </button>
            </div>
          </div>

          <div class="io-card">
            <div class="io-mini-icon">📥</div>
            <div class="io-content">
              <h4 class="io-title">导入数据</h4>
              <p class="io-desc">从备份 JSON 文件恢复所有数据到 localStorage</p>
              <NUpload accept=".json" :max="1" :show-file-list="false" :disabled="importing" @change="importFromJSON">
                <button class="btn-primary" :disabled="importing">
                  {{ importing ? '导入中...' : '选择备份文件' }}
                </button>
              </NUpload>
              <NProgress v-if="importing" type="line" :percentage="importProgress" :height="6" :border-radius="999" class="import-progress" />
            </div>
          </div>

          <div class="io-card">
            <div class="io-mini-icon">🔧</div>
            <div class="io-content">
              <h4 class="io-title">写入默认配置</h4>
              <p class="io-desc">将当前设置烘焙到 src/defaults.ts，构建后所有设备样式一致</p>
              <div class="action-row">
                <button class="btn-secondary" :disabled="baking" @click="bakeDefaults">
                  {{ baking ? '写入中...' : '写入当前设置' }}
                </button>
                <button class="btn-ghost" @click="resetDefaults">恢复默认</button>
              </div>
            </div>
          </div>

          <div class="io-card">
            <div class="io-mini-icon">🚀</div>
            <div class="io-content">
              <h4 class="io-title">发布到 GitHub</h4>
              <p class="io-desc">将 localStorage 中的所有数据提交到仓库，触发 GitHub Pages 重新构建</p>
              <div class="action-row">
                <button class="btn-primary" :disabled="publishing" @click="publishToRepo">
                  {{ publishing ? '提交中...' : '立即发布' }}
                </button>
                <a v-if="commitUrl" :href="commitUrl" target="_blank" rel="noopener" class="commit-link">
                  查看提交记录 →
                </a>
              </div>
            </div>
          </div>
        </div>

        <NAlert type="info" :bordered="false" class="info-alert">
          <strong>注意：</strong>「写入默认配置」会把当前后台设置覆盖到 <code>src/defaults.ts</code> 文件中。执行 <code>npm run build</code> 后新用户将自动使用此配置。
        </NAlert>
      </section>

      <!-- Web 备份设置 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">☁️</div>
          <div>
            <h3 class="card-title">Web 备份设置</h3>
            <p class="card-desc">控制 WebDAV 备份时的上传行为（连接信息由服务端配置）</p>
          </div>
        </header>

        <div class="form-grid-2">
          <div class="field">
            <label class="field-label">上传超时</label>
            <NInputNumber v-model:value="webForm.uploadTimeout" :min="10" :max="1800" size="large" style="width: 100%;" />
            <span class="hint-text">秒（默认 300）</span>
          </div>
          <div class="field">
            <label class="field-label">文件限制</label>
            <NInputNumber v-model:value="webForm.maxFileSize" :min="1" :max="10000" size="large" style="width: 100%;" />
            <span class="hint-text">MB（默认 500）</span>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn-primary" @click="saveWeb">保存</button>
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
  max-width: 1080px;
  width: 100%;
  margin: 0 auto;
  padding-left: 25px;
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
.card-icon.io { background: rgba(140, 108, 255, 0.12); }
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

/* === 导入导出 内部 2x2 子卡 === */
.io-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.io-card {
  display: flex;
  gap: 14px;
  padding: 18px 20px;
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: 18px;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.io-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.05);
}
.io-mini-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--admin-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  flex-shrink: 0;
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(79, 140, 255, 0.24);
}
.io-content { flex: 1; min-width: 0; }
.io-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
}
.io-desc {
  font-size: 0.82rem;
  color: var(--text-sec);
  margin: 0 0 12px;
  line-height: 1.5;
}
.action-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.commit-link {
  font-size: 0.85rem;
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.18s ease;
}
.commit-link:hover { text-decoration: underline; }
.import-progress { margin-top: 10px; }

.info-alert {
  background: rgba(79, 140, 255, 0.06) !important;
  border: 1px solid rgba(79, 140, 255, 0.18) !important;
  border-radius: var(--radius-lg);
  margin-top: 16px;
}
.info-alert code {
  font-size: 0.8rem;
  background: var(--admin-card);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  color: var(--color-primary);
}

/* === Web 备份设置 === */
.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-sec);
}
.hint-text {
  font-size: 0.78rem;
  color: var(--text-tertiary);
}

.card-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 20px;
}

@media (max-width: 768px) {
  .io-grid { grid-template-columns: 1fr; }
  .form-grid-2 { grid-template-columns: 1fr; }
  .io-card { padding: 16px; }
  .io-mini-icon { width: 36px; height: 36px; font-size: 1.1rem; }
}
</style>
