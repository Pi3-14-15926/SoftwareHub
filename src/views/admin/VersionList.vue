<script setup lang="ts">
/* ===== 版本管理 ===== */
import { ref, computed, onMounted, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NButton, NInput, NDataTable, NSpace, NPopconfirm, NCard, NModal, NForm, NFormItem,
} from 'naive-ui'
import { useProjectStore } from '../../store/project'
import type { Version, Download } from '../../types'
import { uid } from '../../utils'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const route = useRoute()
const projects = useProjectStore()

const project = computed(() => projects.projects.find((p) => p.id === route.params.id))
const versions = computed(() => project.value?.versions ?? [])

// 新增/编辑版本弹窗
const showModal = ref(false)
const editingVersion = ref<Version | null>(null)
const versionForm = ref({
  version: '',
  changelog: '',
  publishedAt: '',
})

// 当前编辑版本的下载列表
const downloadList = ref<Download[]>([])

function openNew() {
  editingVersion.value = null
  versionForm.value = { version: '', changelog: '', publishedAt: new Date().toISOString().slice(0, 10) }
  downloadList.value = []
  showModal.value = true
}

function openEdit(v: Version) {
  editingVersion.value = v
  versionForm.value = {
    version: v.version,
    changelog: v.changelog,
    publishedAt: v.publishedAt.slice(0, 10),
  }
  downloadList.value = [...v.downloads]
  showModal.value = true
}

function addDownload() {
  downloadList.value.push({
    platform: 'Android',
    filename: '',
    size: '',
    url: '',
  })
}

function removeDownload(idx: number) {
  downloadList.value.splice(idx, 1)
}

function doSaveVersion() {
  if (!project.value) return

  const v: Version = {
    id: editingVersion.value?.id || uid(),
    version: versionForm.value.version,
    publishedAt: new Date(versionForm.value.publishedAt).toISOString(),
    changelog: versionForm.value.changelog,
    downloads: downloadList.value.filter((d) => d.url && d.filename),
  }

  if (editingVersion.value) {
    // 编辑：替换现有版本
    const idx = project.value.versions.findIndex((x) => x.id === v.id)
    if (idx >= 0) project.value.versions[idx] = v
  } else {
    // 新增
    project.value.versions.unshift(v)
  }

  // 更新最新版本信息
  if (project.value.versions.length > 0) {
    project.value.latestVersion = project.value.versions[0].version
    project.value.latestUpdateTime = project.value.versions[0].publishedAt
  }

  projects.save(project.value)
  showModal.value = false
}

function doDeleteVersion(id: string) {
  if (!project.value) return
  projects.removeVersion(project.value.id, id)
}

const columns = [
  { title: '版本号', key: 'version', width: 110 },
  {
    title: '发布日期',
    key: 'publishedAt',
    width: 120,
    render(row: Version) {
      return new Date(row.publishedAt).toLocaleDateString('zh-CN')
    },
  },
  {
    title: '下载项数',
    key: 'downloadCount',
    width: 90,
    render(row: Version) {
      return row.downloads.length
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 160,
    render(row: Version) {
      return h(NSpace, { size: 'small' }, () => [
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => openEdit(row) }, () => '编辑'),
        h(NPopconfirm, { onPositiveClick: () => doDeleteVersion(row.id) }, {
          default: () => '确定删除此版本？',
          trigger: () => h(NButton, { size: 'tiny', type: 'error', tertiary: true }, () => '删除'),
        }),
      ])
    },
  },
]

onMounted(() => {
  projects.refresh()
})
</script>

<template>
  <AdminLayout>
    <div class="page-header">
      <div>
        <h2 class="page-title">📋 版本管理</h2>
        <p class="page-sub" v-if="project">项目：{{ project.name }}</p>
      </div>
      <NSpace>
        <NButton @click="router.push('/admin/projects')">返回列表</NButton>
        <NButton type="primary" @click="openNew">新增版本</NButton>
      </NSpace>
    </div>

    <NCard>
      <template v-if="versions.length">
        <NDataTable
          :columns="columns"
          :data="versions"
          :row-key="(row: Version) => row.id"
          size="small"
          striped
        />
      </template>
      <p v-else class="empty">暂无版本，点击"新增版本"添加</p>
    </NCard>

    <!-- 新增/编辑版本弹窗 -->
    <NModal v-model:show="showModal" title="版本信息" preset="card" style="max-width: 600px">
      <NForm :model="versionForm" label-placement="top">
        <NFormItem label="版本号">
          <NInput v-model:value="versionForm.version" placeholder="如: v3.26.11" />
        </NFormItem>
        <NFormItem label="发布日期">
          <NInput v-model:value="versionForm.publishedAt" :input-props="{ type: 'date' }" />
        </NFormItem>
        <NFormItem label="更新日志">
          <NInput v-model:value="versionForm.changelog" type="textarea" rows="4" placeholder="更新内容..." />
        </NFormItem>
      </NForm>

      <h4>下载文件</h4>
      <div v-for="(dl, idx) in downloadList" :key="idx" class="dl-row">
        <NInput v-model:value="dl.filename" placeholder="文件名" size="small" style="flex: 1" />
        <NInput v-model:value="dl.size" placeholder="大小" size="small" style="width: 80px" />
        <NInput v-model:value="dl.url" placeholder="下载 URL" size="small" style="flex: 1" />
        <NButton size="tiny" type="error" @click="removeDownload(idx)">×</NButton>
      </div>
      <NButton size="small" @click="addDownload" class="add-dl-btn">+ 添加下载文件</NButton>

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
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-title { margin: 0; font-size: 1.3rem; }
.page-sub { margin: 4px 0 0; color: var(--text-sec, #6b5f52); font-size: 0.9rem; }
.empty { text-align: center; padding: 40px; color: var(--text-sec, #6b5f52); }
.dl-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.add-dl-btn { margin-top: 8px; }
@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 12px; }
  .page-header .n-space { width: 100%; }
  .page-header .n-button { flex: 1; }
  .dl-row { flex-wrap: wrap; }
  .dl-row .n-input { min-width: 100px; }
}
</style>
