<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NPopconfirm, NSwitch, NCheckbox, NProgress, NTag, useMessage } from 'naive-ui'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import type { Project, Version } from '../../types'
import { fmtDate } from '../../utils'
import { syncGitHubProject } from '../../utils/api'
import { useIconUrl } from '../../composables/useIconUrl'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const projects = useProjectStore()
const categories = useCategoryStore()
const { resolveProject } = useIconUrl()

const categoryId = computed(() => route.params.id as string | undefined)
const category = computed(() => categories.categories.find((c) => c.id === categoryId.value))

const keyword = ref('')
const selectedIds = ref<Set<string>>(new Set())
const page = ref(1)
const pageSize = 9

/* 版本展开状态：projectId */
const expandedProjs = ref<Set<string>>(new Set())

/* 同步状态：projectId -> { state: 'idle'|'syncing'|'success'|'error', percent: number, msg: string } */
interface SyncState { state: 'idle' | 'syncing' | 'success' | 'error'; msg: string }
const syncStates = ref<Record<string, SyncState>>({})

/* 禁用状态：localStorage 持久化，键 'sh_project_disabled' */
const DISABLED_KEY = 'sh_project_disabled'
const disabledIds = ref<Set<string>>(new Set(JSON.parse(localStorage.getItem(DISABLED_KEY) || '[]')))
function toggleEnabled(id: string) {
  if (disabledIds.value.has(id)) disabledIds.value.delete(id)
  else disabledIds.value.add(id)
  localStorage.setItem(DISABLED_KEY, JSON.stringify([...disabledIds.value]))
}
function isEnabled(id: string) { return !disabledIds.value.has(id) }

/* 推荐状态同步：基于 Project.featured，但增加批量切换 */
function toggleFeatured(p: Project) {
  projects.save({ ...p, featured: !p.featured })
}

/* 分类查找 */
function categoryName(catId: string) {
  return categories.categories.find((c) => c.id === catId)?.name || '未分类'
}
function categoryIcon(catId: string) {
  return categories.categories.find((c) => c.id === catId)?.icon || '📦'
}

/* 平台集合：合并所有版本 downloads 的 platform */
function platformList(p: Project): string[] {
  const set = new Set<string>()
  for (const v of p.versions) for (const d of v.downloads) set.add(d.platform)
  return Array.from(set)
}

function platformClass(platform: string): string {
  const map: Record<string, string> = {
    Windows: 'plat-win',
    MacOS: 'plat-mac',
    Android: 'plat-and',
    Linux: 'plat-lin',
    Other: 'plat-other',
  }
  return map[platform] || 'plat-other'
}
function platformIcon(platform: string): string {
  const map: Record<string, string> = {
    Windows: '🪟',
    MacOS: '🍎',
    Android: '🤖',
    Linux: '🐧',
    Other: '📁',
  }
  return map[platform] || '📁'
}

/* 过滤 */
const filteredList = computed(() => {
  let list = projects.projects
  if (categoryId.value) list = list.filter((p) => p.categoryId === categoryId.value)
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        p.slug.toLowerCase().includes(kw) ||
        p.description.toLowerCase().includes(kw) ||
        p.githubRepo?.toLowerCase().includes(kw) ||
        categoryName(p.categoryId).toLowerCase().includes(kw),
    )
  }
  return [...list].sort((a, b) => {
    /* 推荐优先，再按更新时间 */
    if (a.featured !== b.featured) return a.featured ? -1 : 1
    return new Date(b.latestUpdateTime || 0).getTime() - new Date(a.latestUpdateTime || 0).getTime()
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredList.value.length / pageSize)))
const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredList.value.slice(start, start + pageSize)
})
function jumpPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
}
const pageNumbers = computed(() => {
  const total = totalPages.value
  const cur = page.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set<number>([1, total, cur, cur - 1, cur + 1])
  return [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
})

const allSelected = computed(() => pagedList.value.length > 0 && pagedList.value.every((p) => selectedIds.value.has(p.id)))
const someSelected = computed(() => pagedList.value.some((p) => selectedIds.value.has(p.id)) && !allSelected.value)
function toggleSelectAll() {
  if (allSelected.value) pagedList.value.forEach((p) => selectedIds.value.delete(p.id))
  else pagedList.value.forEach((p) => selectedIds.value.add(p.id))
}
function toggleSelectOne(id: string) {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
}
function clearSelection() { selectedIds.value.clear() }

function bulkDelete() {
  if (selectedIds.value.size === 0) return
  if (!confirm(`确定要删除选中的 ${selectedIds.value.size} 个软件吗？此操作不可恢复。`)) return
  selectedIds.value.forEach((id) => projects.remove(id))
  message.success(`已删除 ${selectedIds.value.size} 个软件`)
  clearSelection()
}
function bulkFeature(feature: boolean) {
  const ids = [...selectedIds.value]
  ids.forEach((id) => {
    const p = projects.projects.find((x) => x.id === id)
    if (p && p.featured !== feature) projects.save({ ...p, featured: feature })
  })
  message.success(feature ? `已推荐 ${ids.length} 个软件` : `已取消推荐 ${ids.length} 个软件`)
}
function bulkToggleEnabled(enable: boolean) {
  selectedIds.value.forEach((id) => {
    if (enable) disabledIds.value.delete(id)
    else disabledIds.value.add(id)
  })
  localStorage.setItem(DISABLED_KEY, JSON.stringify([...disabledIds.value]))
  message.success(enable ? `已启用 ${selectedIds.value.size} 个软件` : `已禁用 ${selectedIds.value.size} 个软件`)
}

function goEdit(id: string) { router.push(`/admin/projects/${id}/edit`) }
function goVersions(id: string) { router.push(`/admin/projects/${id}/versions`) }
function goNew() {
  const q = categoryId.value ? `?categoryId=${categoryId.value}` : ''
  router.push(`/admin/projects/new${q}`)
}

function toggleExpand(pid: string) {
  if (expandedProjs.value.has(pid)) expandedProjs.value.delete(pid)
  else expandedProjs.value.add(pid)
}

function doSync(project: Project) {
  if (project.sourceType !== 'github') return
  syncStates.value[project.id] = { state: 'syncing', msg: '正在同步...' }
  syncGitHubProject(project)
    .then((res) => {
      if (res.success) {
        syncStates.value[project.id] = { state: 'success', msg: res.newVersions ? `+${res.newVersions} 个新版本` : '已是最新' }
        projects.refresh()
        message.success(`「${project.name}」同步完成`)
      } else {
        syncStates.value[project.id] = { state: 'error', msg: res.error || '失败' }
        message.error(`「${project.name}」同步失败：${res.error}`)
      }
    })
    .catch((e: any) => {
      syncStates.value[project.id] = { state: 'error', msg: e.message || '请求失败' }
      message.error(`「${project.name}」同步失败：${e.message}`)
    })
}

function deleteVersion(project: Project, v: Version) {
  if (!confirm(`确定删除版本「${v.version}」？`)) return
  projects.removeVersion(project.id, v.id)
  message.success('版本已删除')
}

function setAsLatest(project: Project, v: Version) {
  projects.addVersion(project.id, v)
  message.success(`已将 ${v.version} 标记为最新`)
}

const featuredCount = computed(() => projects.projects.filter((p) => p.featured).length)
const githubCount = computed(() => projects.projects.filter((p) => p.sourceType === 'github').length)
const customCount = computed(() => projects.projects.filter((p) => p.sourceType === 'custom').length)

onMounted(() => {
  projects.refresh()
  categories.refresh()
})
</script>

<template>
  <AdminLayout>
    <div class="projects-page">
      <!-- 顶部操作区 -->
      <header class="page-head">
        <div class="head-left">
          <span v-if="categoryId" class="back-link" @click="router.push('/admin/categories')">← 返回页面管理</span>
          <h2 class="page-title">
            <span class="page-title-emoji">{{ category ? (category.icon || '📂') : '📦' }}</span>
            {{ category ? `${category.name} — 软件列表` : '软件管理' }}
          </h2>
          <p class="page-desc">
            {{ category ? `该页面下所有软件的统一管理` : `共 ${projects.projects.length} 个软件 · 推荐 ${featuredCount} · GitHub ${githubCount} · 自定义 ${customCount}` }}
          </p>
        </div>
        <div class="head-actions">
          <div class="search-bar">
            <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z"/>
            </svg>
            <input v-model="keyword" placeholder="搜索名称 / Slug / 仓库 / 分类..." class="search-input" />
            <button v-if="keyword" class="search-clear" @click="keyword = ''">×</button>
          </div>
          <button class="btn-primary btn-add" @click="goNew">
            <span class="add-icon">＋</span>
            新增软件
          </button>
        </div>
      </header>

      <!-- 批量操作条 -->
      <transition name="bulk-bar">
        <div v-if="selectedIds.size > 0" class="bulk-bar">
          <div class="bulk-info">
            <span class="bulk-count">{{ selectedIds.size }}</span>
            <span>个软件已选中</span>
          </div>
          <div class="bulk-actions">
            <button class="btn-ghost" @click="bulkFeature(true)">⭐ 批量推荐</button>
            <button class="btn-ghost" @click="bulkFeature(false)">取消推荐</button>
            <button class="btn-ghost" @click="bulkToggleEnabled(true)">✓ 批量启用</button>
            <button class="btn-ghost" @click="bulkToggleEnabled(false)">⏸ 批量禁用</button>
            <NPopconfirm positive-text="确认删除" negative-text="取消" @positive-click="bulkDelete">
              <template #trigger>
                <button class="btn-ghost bulk-danger">🗑 批量删除</button>
              </template>
              确定要删除选中的 {{ selectedIds.size }} 个软件吗？此操作不可恢复。
            </NPopconfirm>
            <button class="btn-ghost" @click="clearSelection">取消</button>
          </div>
        </div>
      </transition>

      <!-- 列表 -->
      <div v-if="projects.projects.length === 0" class="empty-state">
        <div class="empty-icon">📦</div>
        <p>还没有任何软件，点击右上角"新增软件"开始添加</p>
      </div>
      <div v-else-if="pagedList.length === 0" class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>没有匹配 "{{ keyword }}" 的软件</p>
      </div>
      <div v-else class="project-grid">
        <article
          v-for="p in pagedList"
          :key="p.id"
          :class="['proj-card', { disabled: !isEnabled(p.id) }]"
        >
          <!-- 顶部：复选框 + 推荐星标 + 来源标签 -->
          <div class="pc-top">
            <NCheckbox
              :checked="selectedIds.has(p.id)"
              @update:checked="toggleSelectOne(p.id)"
            />
            <button
              :class="['star-btn', { starred: p.featured }]"
              :title="p.featured ? '取消推荐' : '设为推荐'"
              @click.stop="toggleFeatured(p)"
            >
              {{ p.featured ? '⭐' : '☆' }}
            </button>
            <span :class="['src-tag', p.sourceType === 'github' ? 'src-github' : 'src-custom']">
              <span class="src-dot"></span>
              {{ p.sourceType === 'github' ? 'GitHub' : '自定义' }}
            </span>
            <button
              v-if="!isEnabled(p.id)"
              class="ribbon-disabled"
              title="已禁用"
            >已禁用</button>
          </div>

          <!-- 中部：图标 + 名称 + 描述 -->
          <div class="pc-mid">
            <div class="pc-icon">
              <img v-if="p.logo" :src="resolveProject(p)" :alt="p.name" @error="(e: any) => (e.target.style.display = 'none')" />
              <span v-else class="pc-icon-fallback">{{ p.name[0]?.toUpperCase() || '?' }}</span>
            </div>
            <div class="pc-info">
              <h3 class="pc-name" @click="goEdit(p.id)">{{ p.name }}</h3>
              <div class="pc-slug-row">
                <code class="pc-slug">/software/{{ p.slug }}</code>
                <span v-if="p.githubRepo" class="pc-repo" :title="p.githubRepo">🐙 {{ p.githubRepo }}</span>
              </div>
              <p v-if="p.description" class="pc-desc" :title="p.description">{{ p.description }}</p>
              <p v-else class="pc-desc pc-desc-empty">暂无描述</p>
            </div>
          </div>

          <!-- 标签区：分类 + 平台 -->
          <div class="pc-tags">
            <span class="cat-tag">
              <span class="cat-icon">{{ categoryIcon(p.categoryId) }}</span>
              {{ categoryName(p.categoryId) }}
            </span>
            <div v-if="platformList(p).length > 0" class="plat-row">
              <span
                v-for="pl in platformList(p)"
                :key="pl"
                :class="['plat-tag', platformClass(pl)]"
              >
                <span>{{ platformIcon(pl) }}</span>
                {{ pl }}
              </span>
            </div>
            <div v-else class="plat-empty">无下载文件</div>
          </div>

          <!-- 底部：最新版本 + 状态开关 -->
          <footer class="pc-foot">
            <div class="version-info">
              <div class="vi-row">
                <span class="vi-label">最新版本</span>
                <span class="vi-version">{{ p.latestVersion || '—' }}</span>
              </div>
              <div class="vi-row">
                <span class="vi-label">更新时间</span>
                <span class="vi-date">{{ p.latestUpdateTime ? fmtDate(p.latestUpdateTime) : '—' }}</span>
              </div>
              <div class="vi-row">
                <span class="vi-label">版本数</span>
                <span class="vi-count">{{ p.versions.length }}</span>
              </div>
            </div>
            <div class="pc-status">
              <span class="status-text">{{ isEnabled(p.id) ? '已启用' : '已禁用' }}</span>
              <NSwitch
                :value="isEnabled(p.id)"
                size="small"
                @update:value="toggleEnabled(p.id)"
              />
            </div>
          </footer>

          <!-- 同步状态条 -->
          <div v-if="syncStates[p.id] && syncStates[p.id].state !== 'idle'" :class="['sync-bar', `sync-${syncStates[p.id].state}`]">
            <span class="sync-icon">
              <template v-if="syncStates[p.id].state === 'syncing'">⏳</template>
              <template v-else-if="syncStates[p.id].state === 'success'">✓</template>
              <template v-else>⚠️</template>
            </span>
            <span class="sync-msg">{{ syncStates[p.id].msg }}</span>
            <NProgress
              v-if="syncStates[p.id].state === 'syncing'"
              type="line"
              :percentage="60"
              :show-indicator="false"
              :height="3"
              :border-radius="999"
              color="#3478F6"
              style="flex: 1;"
            />
          </div>

          <!-- 操作按钮：一行等宽 -->
          <div class="pc-actions">
            <button class="pc-btn pc-btn-primary" title="编辑" @click="goEdit(p.id)">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
              编辑
            </button>
            <button class="pc-btn" title="版本管理" @click="goVersions(p.id)">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/>
              </svg>
              版本
              <span class="badge-count">{{ p.versions.length }}</span>
            </button>
            <button
              v-if="p.sourceType === 'github'"
              class="pc-btn pc-btn-sync"
              :disabled="syncStates[p.id]?.state === 'syncing'"
              title="同步 GitHub Release"
              @click="doSync(p)"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
              </svg>
              同步
            </button>
            <NPopconfirm positive-text="确认删除" negative-text="取消" @positive-click="projects.remove(p.id)">
              <template #trigger>
                <button class="pc-btn pc-btn-danger" title="删除">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                    <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                  删除
                </button>
              </template>
              确定删除「{{ p.name }}」？<br />
              <small style="color: var(--text-tertiary);">所有版本和下载文件都会一并删除</small>
            </NPopconfirm>
            <button
              class="pc-btn pc-btn-toggle"
              :title="expandedProjs.has(p.id) ? '收起版本' : '展开版本'"
              @click="toggleExpand(p.id)"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" :style="{ transform: expandedProjs.has(p.id) ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
              </svg>
              预览
            </button>
          </div>

          <!-- 版本折叠面板 -->
          <transition name="version-panel">
            <div v-if="expandedProjs.has(p.id)" class="version-panel">
              <div class="vp-head">
                <span class="vp-title">📦 版本历史（{{ p.versions.length }}）</span>
              </div>
              <div v-if="p.versions.length === 0" class="vp-empty">暂无版本数据</div>
              <ul v-else class="vp-list">
                <li
                  v-for="(v, idx) in p.versions.slice(0, 8)"
                  :key="v.id"
                  :class="['vp-item', { latest: idx === 0 }]"
                >
                  <div class="vp-item-left">
                    <span :class="['vp-version-tag', idx === 0 ? 'vp-latest' : 'vp-hist']">
                      v{{ v.version }}
                    </span>
                    <span v-if="idx === 0" class="vp-latest-badge">最新</span>
                    <span class="vp-date">{{ fmtDate(v.publishedAt) }}</span>
                  </div>
                  <div class="vp-item-right">
                    <span class="vp-files">{{ v.downloads.length }} 个文件</span>
                    <button v-if="idx !== 0" class="vp-btn" title="设为最新" @click="setAsLatest(p, v)">↑ 置顶</button>
                    <NPopconfirm positive-text="确认" negative-text="取消" @positive-click="deleteVersion(p, v)">
                      <template #trigger>
                        <button class="vp-btn vp-btn-danger" title="删除版本">🗑</button>
                      </template>
                      确定删除版本「{{ v.version }}」？
                    </NPopconfirm>
                  </div>
                </li>
                <li v-if="p.versions.length > 8" class="vp-more">
                  还有 {{ p.versions.length - 8 }} 个历史版本，
                  <a class="vp-link" @click="goVersions(p.id)">前往完整版本管理 →</a>
                </li>
              </ul>
            </div>
          </transition>
        </article>
      </div>

      <!-- 分页 -->
      <nav v-if="totalPages > 1" class="pager">
        <button class="pg-btn" :disabled="page === 1" @click="jumpPage(page - 1)">‹</button>
        <template v-for="(n, i) in pageNumbers" :key="i">
          <span v-if="i > 0 && n - pageNumbers[i - 1] > 1" class="pg-ellipsis">…</span>
          <button :class="['pg-btn', { active: n === page }]" @click="jumpPage(n)">{{ n }}</button>
        </template>
        <button class="pg-btn" :disabled="page === totalPages" @click="jumpPage(page + 1)">›</button>
        <span class="pg-info">第 {{ page }} / {{ totalPages }} 页 · 共 {{ filteredList.length }} 个</span>
      </nav>
    </div>
  </AdminLayout>
</template>

<style scoped>
.projects-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
  padding-left: 25px;
  margin-right: -3px;
}

/* === 顶部 === */
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.head-left { flex: 1; min-width: 0; }
.back-link {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  font-size: 0.8rem;
  color: var(--text-sec);
  cursor: pointer;
  margin-bottom: 10px;
  transition: background 0.18s;
}
.back-link:hover { background: var(--color-primary-soft); color: var(--color-primary); }
.head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.btn-add {
  height: 48px;
  padding: 0 24px;
  font-size: 1rem;
  font-weight: 700;
  gap: 6px;
}
.add-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  font-size: 0.95rem;
  font-weight: 800;
}

.search-bar {
  position: relative;
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--radius-full);
  box-shadow: var(--admin-shadow-card);
  display: flex;
  align-items: center;
  padding: 0 18px;
  height: 48px;
  width: 320px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.search-bar:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4px var(--color-primary-soft);
}
.search-icon { color: var(--text-tertiary); flex-shrink: 0; }
.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.92rem;
  color: var(--text-main);
  margin-left: 10px;
  height: 100%;
}
.search-input::placeholder { color: var(--text-tertiary); }
.search-clear {
  width: 22px; height: 22px;
  border: none;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
}
.search-clear:hover { background: var(--color-primary-soft); color: var(--color-primary); }

/* === 批量操作 === */
.bulk-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  background: linear-gradient(135deg, rgba(79, 140, 255, 0.08), rgba(140, 108, 255, 0.08));
  border: 1px solid rgba(79, 140, 255, 0.22);
  border-radius: 18px;
  box-shadow: 0 4px 20px rgba(79, 140, 255, 0.08);
}
.bulk-info { display: flex; align-items: center; gap: 6px; font-size: 0.9rem; color: var(--text-sec); }
.bulk-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--radius-full);
  background: var(--admin-gradient);
  color: #FFFFFF;
  font-weight: 700;
  font-size: 0.82rem;
}
.bulk-actions { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.bulk-danger:hover { color: #E55353 !important; background: rgba(229, 83, 83, 0.1) !important; }
.bulk-bar-enter-active, .bulk-bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bulk-bar-enter-from, .bulk-bar-leave-to { opacity: 0; transform: translateY(-4px); }

/* === 卡片网格 === */
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.proj-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.2s ease;
  position: relative;
  overflow: hidden;
}
.proj-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--admin-shadow-card-hover);
}
.proj-card.disabled { opacity: 0.6; }

/* 卡片顶部 */
.pc-top {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 2;
}
.star-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.18s, transform 0.18s;
}
.star-btn:hover { background: var(--color-primary-soft); transform: scale(1.1); }
.star-btn.starred { background: linear-gradient(135deg, rgba(255, 200, 0, 0.15), rgba(255, 165, 0, 0.15)); border-color: rgba(255, 200, 0, 0.3); }

.src-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 600;
  margin-left: auto;
}
.src-tag .src-dot { width: 6px; height: 6px; border-radius: 50%; }
.src-github { background: linear-gradient(135deg, rgba(79, 140, 255, 0.12), rgba(52, 120, 246, 0.12)); color: #2563EB; }
.src-github .src-dot { background: #3478F6; }
.src-custom { background: linear-gradient(135deg, rgba(140, 108, 255, 0.12), rgba(140, 108, 255, 0.12)); color: #6D4FD6; }
.src-custom .src-dot { background: #8C6CFF; }

.ribbon-disabled {
  position: absolute;
  top: 14px; right: -36px;
  width: 120px;
  text-align: center;
  background: var(--text-tertiary);
  color: #FFFFFF;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 0;
  transform: rotate(35deg);
  z-index: 3;
  border: none;
  cursor: default;
  letter-spacing: 0.5px;
}

/* 卡片中部 */
.pc-mid { display: flex; align-items: flex-start; gap: 10px; }
.pc-icon {
  width: 40px; height: 40px;
  border-radius: 12px;
  background: var(--admin-gradient);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(79, 140, 255, 0.28);
  overflow: hidden;
}
.pc-icon img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pc-icon-fallback { font-size: 1.15rem; font-weight: 700; }
.pc-info { flex: 1; min-width: 0; }
.pc-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 2px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.18s ease;
  line-height: 1.3;
}
.pc-name:hover { color: var(--color-primary); }
.pc-slug-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }
.pc-slug {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  background: var(--color-card-soft);
  padding: 1px 6px;
  border-radius: 5px;
  color: var(--color-primary);
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pc-repo {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}
.pc-desc {
  font-size: 0.78rem;
  color: var(--text-sec);
  line-height: 1.45;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pc-desc-empty { color: var(--text-tertiary); font-style: italic; }

/* 标签区 */
.pc-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-height: 22px;
}
.cat-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 8px;
  border-radius: 10px;
  background: var(--color-card-soft);
  color: var(--text-sec);
  font-size: 0.7rem;
  font-weight: 600;
  border: 1px solid var(--admin-border);
}
.cat-icon { font-size: 0.8rem; }
.plat-row { display: flex; gap: 3px; flex-wrap: wrap; }
.plat-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 20px;
  padding: 0 7px;
  border-radius: 7px;
  font-size: 0.65rem;
  font-weight: 600;
  color: #FFFFFF;
}
.plat-win { background: linear-gradient(135deg, #0078D4, #00A4EF); }
.plat-mac { background: linear-gradient(135deg, #555555, #888888); }
.plat-and { background: linear-gradient(135deg, #3CB371, #2A8C56); }
.plat-lin { background: linear-gradient(135deg, #E95420, #F0A020); }
.plat-other { background: linear-gradient(135deg, #6B7280, #9CA3AF); }
.plat-empty {
  font-size: 0.68rem;
  color: var(--text-tertiary);
  font-style: italic;
}

/* 卡片底部 */
.pc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--admin-border);
}
.version-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.vi-row { display: flex; align-items: center; gap: 5px; font-size: 0.72rem; }
.vi-label { color: var(--text-tertiary); }
.vi-version { font-family: var(--font-mono); color: var(--color-primary); font-weight: 600; }
.vi-date { color: var(--text-sec); }
.vi-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 16px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
  font-size: 0.68rem;
}
.pc-status { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
.status-text { font-size: 0.72rem; font-weight: 600; color: var(--text-sec); }

/* 同步条 */
.sync-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 0.8rem;
}
.sync-syncing { background: rgba(52, 120, 246, 0.08); color: #2563EB; }
.sync-success { background: rgba(60, 179, 113, 0.08); color: #2A8C56; }
.sync-error { background: rgba(255, 107, 107, 0.08); color: #E55353; }
.sync-icon { font-size: 0.9rem; flex-shrink: 0; }
.sync-msg { font-weight: 500; white-space: nowrap; }

/* 操作按钮：一行等宽 */
.pc-actions {
  display: flex;
  align-items: stretch;
  gap: 4px;
  flex-wrap: nowrap;
}
.pc-btn {
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 28px;
  padding: 0 6px;
  background: var(--color-card-soft);
  color: var(--text-sec);
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s, color 0.18s, transform 0.18s, border-color 0.18s;
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pc-btn:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-color: var(--color-primary-soft);
  transform: translateY(-1px);
}
.pc-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.pc-btn svg { display: block; flex-shrink: 0; }
.pc-btn-primary {
  background: var(--admin-gradient);
  color: #FFFFFF;
  border-color: transparent;
  box-shadow: 0 3px 10px rgba(79, 140, 255, 0.24);
}
.pc-btn-primary:hover {
  background: var(--admin-gradient);
  color: #FFFFFF;
  border-color: transparent;
  box-shadow: 0 5px 14px rgba(79, 140, 255, 0.32);
}
.pc-btn-sync:hover {
  background: rgba(52, 120, 246, 0.1);
  color: #2563EB;
  border-color: rgba(52, 120, 246, 0.3);
}
.pc-btn-danger:hover {
  background: rgba(229, 83, 83, 0.1);
  color: #E55353;
  border-color: rgba(229, 83, 83, 0.2);
}
.badge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 14px;
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.25);
  color: #FFFFFF;
  font-size: 0.65rem;
  font-weight: 700;
  margin-left: 2px;
  flex-shrink: 0;
}
.pc-btn:not(.pc-btn-primary) .badge-count {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

/* 版本折叠面板 */
.version-panel {
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: 14px;
  padding: 12px 14px;
}
.vp-head { margin-bottom: 8px; }
.vp-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-sec);
}
.vp-empty {
  font-size: 0.82rem;
  color: var(--text-tertiary);
  text-align: center;
  padding: 12px 0;
  font-style: italic;
}
.vp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.vp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: 10px;
  transition: background 0.18s;
}
.vp-item:hover { background: var(--color-primary-soft); }
.vp-item.latest { border-color: rgba(79, 140, 255, 0.3); background: linear-gradient(135deg, rgba(79, 140, 255, 0.04), rgba(140, 108, 255, 0.04)); }
.vp-item-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.vp-item-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.vp-version-tag {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
}
.vp-latest { background: var(--admin-gradient); color: #FFFFFF; }
.vp-hist { background: var(--color-card-soft); color: var(--text-sec); border: 1px solid var(--admin-border); }
.vp-latest-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: rgba(60, 179, 113, 0.15);
  color: #2A8C56;
  font-size: 0.68rem;
  font-weight: 700;
}
.vp-date { font-size: 0.72rem; color: var(--text-tertiary); }
.vp-files { font-size: 0.72rem; color: var(--text-tertiary); }
.vp-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  font-size: 0.78rem;
  color: var(--text-sec);
  cursor: pointer;
  transition: background 0.18s, color 0.18s, transform 0.18s;
}
.vp-btn:hover { background: var(--color-primary-soft); color: var(--color-primary); transform: scale(1.08); }
.vp-btn-danger:hover { background: rgba(229, 83, 83, 0.1); color: #E55353; }
.vp-more {
  text-align: center;
  font-size: 0.78rem;
  color: var(--text-tertiary);
  padding: 6px 0;
}
.vp-link {
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}
.vp-link:hover { text-decoration: underline; }
.version-panel-enter-active, .version-panel-leave-active { transition: opacity 0.2s ease, transform 0.2s ease, max-height 0.3s ease; overflow: hidden; }
.version-panel-enter-from, .version-panel-leave-to { opacity: 0; transform: translateY(-4px); max-height: 0; }
.version-panel-enter-to, .version-panel-leave-from { max-height: 800px; }

/* === 空状态 === */
.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-tertiary);
  font-size: 0.95rem;
  background: var(--admin-card);
  border: 1px dashed var(--admin-border);
  border-radius: var(--admin-radius-card);
}
.empty-icon { font-size: 3.5rem; margin-bottom: 8px; }

/* === 分页 === */
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 0 4px;
}
.pg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 10px;
  background: var(--admin-card);
  color: var(--text-sec);
  border: 1px solid var(--admin-border);
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s, color 0.18s, transform 0.18s;
  font-variant-numeric: tabular-nums;
}
.pg-btn:hover:not(:disabled) {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  transform: scale(1.05);
}
.pg-btn.active {
  background: var(--admin-gradient);
  color: #FFFFFF;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(79, 140, 255, 0.28);
}
.pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pg-ellipsis { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 36px; color: var(--text-tertiary); }
.pg-info { margin-left: 12px; font-size: 0.78rem; color: var(--text-tertiary); }

@media (max-width: 1024px) {
  .project-grid { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
}
@media (max-width: 768px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .head-actions { width: 100%; }
  .search-bar { width: 100%; flex: 1; }
  .btn-add { flex: 1; }
  .project-grid { grid-template-columns: 1fr; }
  .pc-actions { justify-content: flex-end; }
  .pc-foot { flex-direction: column; align-items: flex-start; gap: 10px; }
  .pc-status { width: 100%; justify-content: space-between; }
  .pager { gap: 4px; }
  .pg-info { width: 100%; text-align: center; margin-left: 0; margin-top: 4px; }
}
</style>
