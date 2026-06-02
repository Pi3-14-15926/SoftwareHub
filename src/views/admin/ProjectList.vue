<script setup lang="ts">
/* ===== 后台软件列表 ===== */
import { ref, computed, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NButton, NInput, NTag, NDataTable, NSpace, NPopconfirm, NCard,
} from 'naive-ui'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import type { Project } from '../../types'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const route = useRoute()
const projects = useProjectStore()
const categories = useCategoryStore()

const categoryId = computed(() => route.params.id as string | undefined)
const category = computed(() => categories.categories.find((c) => c.id === categoryId.value))

const keyword = ref('')

const filteredList = computed(() => {
  let list = projects.projects
  if (categoryId.value) {
    list = list.filter((p) => p.categoryId === categoryId.value)
  }
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        p.slug.toLowerCase().includes(kw) ||
        p.githubRepo?.toLowerCase().includes(kw),
    )
  }
  return list
})

function doDelete(id: string) {
  projects.remove(id)
}

function goEdit(id: string) {
  router.push(`/admin/projects/${id}/edit`)
}

function goVersions(id: string) {
  router.push(`/admin/projects/${id}/versions`)
}

function doSync(project: Project) {
  // 只对 GitHub 项目执行同步
  if (project.sourceType !== 'github') return
  import('../../utils/api').then((api) => {
    api.syncGitHubProject(project).then(() => projects.refresh())
  })
}

const columns = [
  { title: '名称', key: 'name', width: 160 },
  {
    title: '类型',
    key: 'sourceType',
    width: 90,
    render(row: Project) {
      return h(NTag, { type: row.sourceType === 'github' ? 'info' : 'warning', size: 'small' }, () =>
        row.sourceType === 'github' ? 'GitHub' : '自定义',
      )
    },
  },
  {
    title: '最新版本',
    key: 'latestVersion',
    width: 110,
  },
  {
    title: '更新时间',
    key: 'latestUpdateTime',
    width: 120,
    render(row: Project) {
      return row.latestUpdateTime ? new Date(row.latestUpdateTime).toLocaleDateString('zh-CN') : '—'
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 240,
    render(row: Project) {
      return h(NSpace, { size: 'small' }, () => [
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => goEdit(row.id) }, () => '编辑'),
        h(NButton, { size: 'tiny', onClick: () => goVersions(row.id) }, () => '版本'),
        row.sourceType === 'github'
          ? h(NButton, { size: 'tiny', tertiary: true, onClick: () => doSync(row) }, () => '同步')
          : null,
        h(NPopconfirm, { onPositiveClick: () => doDelete(row.id) }, {
          default: () => '确定删除此项目？',
          trigger: () => h(NButton, { size: 'tiny', type: 'error', tertiary: true }, () => '删除'),
        }),
      ])
    },
  },
]
</script>

<template>
  <AdminLayout>
    <div class="page-header">
      <div class="header-left">
        <span v-if="categoryId" class="back-link" @click="router.push('/admin/categories')">← 返回页面管理</span>
        <h2 class="page-title">{{ category ? `${category.icon} ${category.name} — 软件列表` : '📦 软件管理' }}</h2>
      </div>
      <NButton type="primary" @click="router.push(categoryId ? `/admin/projects/new?categoryId=${categoryId}` : '/admin/projects/new')">新增软件</NButton>
    </div>

    <NCard>
      <div class="toolbar">
        <NInput v-model:value="keyword" placeholder="搜索名称 / slug / 仓库" clearable class="search-input" />
        <span class="count">{{ filteredList.length }}{{ categoryId ? '' : ` / ${projects.projects.length}` }}</span>
      </div>

      <NDataTable
        :columns="columns"
        :data="filteredList"
        :row-key="(row: Project) => row.id"
        :bordered="false"
        :single-line="false"
        size="small"
        striped
      />
    </NCard>
  </AdminLayout>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.header-left { display: flex; align-items: center; gap: 12px; }
.page-title { margin: 0; font-size: 1.3rem; }
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.search-input { width: 260px; }
.count { font-size: 0.85rem; color: var(--text-sec, #6b5f52); }
.back-link {
  font-size: 0.85rem;
  color: var(--text-sec);
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(46, 42, 36, 0.06);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.18s;
  white-space: nowrap;
}
.back-link:hover { background: rgba(46, 42, 36, 0.12); }

@media (max-width: 768px) {
  .search-input { width: 100%; }
  .page-header { flex-direction: column; gap: 12px; align-items: stretch; }
  .page-header .n-button { width: 100%; }
}
</style>
