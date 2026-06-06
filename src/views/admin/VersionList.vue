<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NButton, NInput, NDataTable, NSpace, NPopconfirm, NModal, NForm, NFormItem } from 'naive-ui'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import type { Version, Download, Platform } from '../../types'
import { uid, fmtDate } from '../../utils'
import * as api from '../../utils/api'
import { latestVersionText } from '../../utils/api'
import { getToken } from '../../utils/auth'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const route = useRoute()
const projects = useProjectStore()
const categories = useCategoryStore()

const projectId = computed(() => route.params.id as string)
const software = computed(() => projects.byId(projectId.value))
const versions = computed(() => (projectId.value ? api.getSoftwareVersions(projectId.value) : []))

/* 表单中的下载项（编辑态） */
interface DownloadForm {
  id: string
  versionId: string
  platform: Platform
  filename: string
  size: string
  url: string
}
const showModal = ref(false)
const editingVersion = ref<Version | null>(null)
const versionForm = ref({ version: '', changelog: '', publishedAt: '' })
const downloadList = ref<DownloadForm[]>([])

/* GitHub Release 链接导入 */
const showImport = ref(false)
const importUrl = ref('')
const importing = ref(false)
const importMsg = ref<{ ok: boolean; text: string } | null>(null)

function openNew() {
  editingVersion.value = null
  versionForm.value = { version: '', changelog: '', publishedAt: new Date().toISOString().slice(0, 10) }
  downloadList.value = []
  showModal.value = true
}
function openEdit(v: Version) {
  editingVersion.value = v
  versionForm.value = { version: v.version, changelog: v.changelog, publishedAt: v.publishedAt.slice(0, 10) }
  const dls = api.getVersionDownloads(v.id)
  downloadList.value = dls.map((d) => ({
    id: d.id,
    versionId: d.versionId,
    platform: d.platform,
    filename: d.filename,
    size: d.size,
    url: d.url,
  }))
  showModal.value = true
}
function addDownloadRow() {
  downloadList.value.push({
    id: '',
    versionId: editingVersion.value?.id || '',
    platform: 'Android',
    filename: '',
    size: '',
    url: '',
  })
}
function removeDownload(idx: number) { downloadList.value.splice(idx, 1) }

function doSaveVersion() {
  if (!software.value) return
  const validDownloads = downloadList.value.filter((d) => d.url && d.filename)
  const isEdit = !!editingVersion.value
  let v: Version
  if (isEdit) {
    /* 编辑：先删旧版本（连带下载），再以相同 id 重新添加 */
    const oldId = editingVersion.value!.id
    api.deleteVersion(oldId)
    v = {
      id: oldId,
      projectId: software.value.id,
      version: versionForm.value.version,
      publishedAt: new Date(versionForm.value.publishedAt).toISOString(),
      changelog: versionForm.value.changelog,
      downloadIds: [],
    }
  } else {
    v = {
      id: uid(),
      projectId: software.value.id,
      version: versionForm.value.version,
      publishedAt: new Date(versionForm.value.publishedAt).toISOString(),
      changelog: versionForm.value.changelog,
      downloadIds: [],
    }
  }
  /* 先 addVersion（让 software 的 latest 指向它） */
  api.addVersion(v)
  /* 再 addDownload 各项（api 内部会同步 v.downloadIds） */
  for (const d of validDownloads) {
    api.addDownload({
      id: uid(),
      versionId: v.id,
      platform: d.platform,
      filename: d.filename,
      size: d.size,
      url: d.url,
    })
  }
  projects.refresh()
  showModal.value = false

  /* 异步拉取真实下载量（仅 GitHub 来源；非 GitHub 自动跳过 → 显示 —） */
  if (validDownloads.some((d) => /github\.com/.test(d.url))) {
    const token = getToken() || undefined
    const allDownloads = api.getVersionDownloads(v.id)
    api.enrichDownloadCounts(allDownloads, token).then((counts) => {
      let updated = 0
      for (const dl of allDownloads) {
        const c = counts.get(dl.id)
        if (c) {
          api.updateDownload({ ...dl, downloadCount: c.count, downloadCountSyncedAt: c.syncedAt })
          updated++
        }
      }
      if (updated) projects.refresh()
    }).catch(() => { /* 静默：限速/网络/无 token */ })
  }
}

function doDeleteVersion(id: string) {
  if (!software.value) return
  api.deleteVersion(id)
  projects.refresh()
}

async function doImport() {
  const url = importUrl.value.trim()
  if (!url) {
    importMsg.value = { ok: false, text: '请填写 GitHub Release 链接' }
    return
  }
  if (editingVersion.value) {
    const ok = window.confirm('导入会覆盖当前编辑的版本号、发布日期、更新日志和下载文件，确定继续？')
    if (!ok) return
  }
  importing.value = true
  importMsg.value = null
  try {
    const token = getToken() || undefined
    const result = await api.importReleaseFromUrl(url, token)
    versionForm.value = {
      version: result.version,
      changelog: result.changelog,
      publishedAt: (result.publishedAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    }
    downloadList.value = result.downloads.map((d) => ({
      id: '',
      versionId: '',
      platform: d.platform,
      filename: d.filename,
      size: d.size,
      url: d.url,
    }))
    importMsg.value = {
      ok: true,
      text: `导入成功：${result.version}，${result.downloads.length} 个文件${result.downloads.length === 0 ? '（该 Release 无 assets）' : ''}`,
    }
    importUrl.value = ''
  } catch (e: any) {
    importMsg.value = { ok: false, text: e.message || '导入失败' }
  } finally {
    importing.value = false
  }
}

const columns = [
  {
    title: '版本号', key: 'version', width: 130,
    render: (row: Version) => h('span', { class: 'version-badge' }, row.version),
  },
  {
    title: '发布日期', key: 'publishedAt', width: 130,
    render: (row: Version) => fmtDate(row.publishedAt),
  },
  {
    title: '下载项数', key: 'downloadCount', width: 100,
    render: (row: Version) => h('span', { class: 'count-pill' }, `${row.downloadIds.length} 个`),
  },
  {
    title: '操作', key: 'actions', width: 180,
    render: (row: Version) => h(NSpace, { size: 'small' }, () => [
      h(NButton, { size: 'small', type: 'primary', onClick: () => openEdit(row) }, () => '编辑'),
      h(NPopconfirm, { positiveText: '确认', negativeText: '取消', onPositiveClick: () => doDeleteVersion(row.id) }, {
        default: () => '确定删除此版本？',
        trigger: () => h(NButton, { size: 'small', type: 'error', tertiary: true }, () => '删除'),
      }),
    ]),
  },
]

onMounted(() => {
  projects.refresh()
  categories.refresh()
})
</script>

<template>
  <AdminLayout>
    <div class="list-page">
      <div class="page-header">
        <div>
          <h2 class="page-title">📋 版本管理</h2>
          <p v-if="software" class="page-desc">项目: {{ software.name }} · 最新版本: {{ latestVersionText(software) || '—' }}</p>
        </div>
        <div class="header-actions">
          <button class="btn-secondary" @click="router.push('/admin/projects')">返回列表</button>
          <button class="btn-primary" @click="openNew">➕ 新增版本</button>
        </div>
      </div>

      <div class="content-card">
        <template v-if="versions.length">
          <NDataTable
            :columns="columns"
            :data="versions"
            :row-key="(row: Version) => row.id"
            :bordered="false"
            size="medium"
            striped
          />
        </template>
        <div v-else class="empty-state">
          <div class="empty-icon">📋</div>
          <p>暂无版本</p>
          <button class="btn-primary" @click="openNew">添加第一个版本</button>
        </div>
      </div>
    </div>

    <NModal v-model:show="showModal" preset="card" :title="editingVersion ? '编辑版本' : '新增版本'" style="max-width: 640px; border-radius: var(--radius-lg);">
      <!-- 从 GitHub Release 链接导入 -->
      <div class="import-section">
        <div class="import-head" @click="showImport = !showImport">
          <span class="import-icon">🔗</span>
          <span class="import-title">从 GitHub Release 链接导入</span>
          <span class="import-hint">（支持任意 owner/repo，含 fork）</span>
          <span class="import-toggle">{{ showImport ? '▴' : '▾' }}</span>
        </div>
        <div v-if="showImport" class="import-body">
          <NInput
            v-model:value="importUrl"
            placeholder="https://github.com/owner/repo/releases/tag/v1.2.3"
            :disabled="importing"
            @keyup.enter="doImport"
          />
          <button
            class="btn-primary import-btn"
            :disabled="importing || !importUrl.trim()"
            @click="doImport"
          >
            {{ importing ? '导入中...' : '确定' }}
          </button>
          <div v-if="importMsg" :class="['import-msg', importMsg.ok ? 'ok' : 'err']">
            <span>{{ importMsg.ok ? '✅' : '⚠️' }}</span>
            <span>{{ importMsg.text }}</span>
          </div>
        </div>
      </div>

      <NForm :model="versionForm" label-placement="top">
        <div class="form-grid">
          <NFormItem label="版本号">
            <NInput v-model:value="versionForm.version" placeholder="如: v3.26.11" />
          </NFormItem>
          <NFormItem label="发布日期">
            <NInput v-model:value="versionForm.publishedAt" :input-props="{ type: 'date' }" />
          </NFormItem>
        </div>
        <NFormItem label="更新日志">
          <NInput v-model:value="versionForm.changelog" type="textarea" rows="4" placeholder="更新内容..." />
        </NFormItem>
      </NForm>

      <div class="dl-section">
        <h4 class="dl-title">下载文件</h4>
        <div v-for="(dl, idx) in downloadList" :key="idx" class="dl-row">
          <NSelect
            v-model:value="dl.platform"
            :options="[
              { label: '🤖 Android', value: 'Android' },
              { label: '🪟 Windows', value: 'Windows' },
              { label: '🍎 MacOS', value: 'MacOS' },
              { label: '🐧 Linux', value: 'Linux' },
              { label: '📱 iOS', value: 'iOS' },
              { label: '🌐 Web', value: 'Web' },
              { label: '📁 Other', value: 'Other' },
            ]"
            size="small"
            style="width: 130px"
          />
          <NInput v-model:value="dl.filename" placeholder="文件名" size="small" />
          <NInput v-model:value="dl.size" placeholder="大小" size="small" style="width: 100px" />
          <NInput v-model:value="dl.url" placeholder="下载 URL" size="small" />
          <button class="btn-icon" @click="removeDownload(idx)">×</button>
        </div>
        <button class="btn-secondary dl-add" @click="addDownloadRow">+ 添加下载文件</button>
      </div>

      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="doSaveVersion">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </AdminLayout>
</template>

<style scoped>
.list-page { display: flex; flex-direction: column; gap: 16px; flex: 1; min-height: 0; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
.page-title { margin: 0; font-size: 1.4rem; font-weight: 700; color: var(--text-main); }
.page-desc { margin: 4px 0 0; font-size: 0.88rem; color: var(--text-tertiary); }
.header-actions { display: flex; gap: 8px; }
.content-card {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 20px;
  flex: 1;
  min-height: 0;
}
.empty-state { text-align: center; padding: 60px 20px; }
.empty-icon { font-size: 3rem; margin-bottom: 12px; opacity: 0.5; }
.empty-state p { color: var(--text-tertiary); margin: 0 0 16px; }

:deep(.version-badge) {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
  font-size: 0.85rem;
  font-family: var(--font-mono);
}
:deep(.count-pill) {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
  color: var(--text-sec);
  font-size: 0.8rem;
}

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

/* === GitHub Release 链接导入 === */
.import-section {
  background: linear-gradient(135deg, rgba(79, 140, 255, 0.06) 0%, rgba(140, 108, 255, 0.04) 100%);
  border: 1px dashed rgba(79, 140, 255, 0.28);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  margin-bottom: 18px;
}
.import-head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  color: var(--text-main);
  font-weight: 600;
  font-size: 0.88rem;
}
.import-icon { font-size: 1rem; }
.import-title { flex-shrink: 0; }
.import-hint {
  color: var(--text-tertiary);
  font-weight: 400;
  font-size: 0.78rem;
  flex: 1;
}
.import-toggle {
  color: var(--text-tertiary);
  font-size: 0.85rem;
  font-weight: 700;
}
.import-body {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.import-body :deep(.n-input) { flex: 1; min-width: 240px; }
.import-btn { white-space: nowrap; }
.import-msg {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  font-weight: 500;
}
.import-msg.ok {
  background: rgba(60, 179, 113, 0.1);
  color: #2A8C56;
  border: 1px solid rgba(60, 179, 113, 0.2);
}
.import-msg.err {
  background: rgba(229, 83, 83, 0.08);
  color: #E55353;
  border: 1px solid rgba(229, 83, 83, 0.2);
}
.dl-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-soft); }
.dl-title { font-size: 0.95rem; font-weight: 700; margin: 0 0 10px; color: var(--text-main); }
.dl-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.dl-add { margin-top: 4px; }
.btn-icon {
  width: 28px; height: 28px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--color-card);
  color: var(--text-sec);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  transition: background 0.18s, color 0.18s, border-color 0.18s;
}
.btn-icon:hover { background: rgba(255, 107, 107, 0.08); color: var(--color-error); border-color: var(--color-error); }

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
  .header-actions { width: 100%; }
  .header-actions .btn-primary, .header-actions .btn-secondary { flex: 1; }
  .dl-row { flex-wrap: wrap; }
  .dl-row :deep(.n-input), .dl-row :deep(.n-select) { min-width: 100px; }
  .import-body :deep(.n-input) { min-width: 100%; }
  .import-btn { width: 100%; }
}
</style>
