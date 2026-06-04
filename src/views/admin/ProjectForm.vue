<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NInput, NButton, NSelect, NSpace, NCard, NAlert, useMessage } from 'naive-ui'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import { fetchReleases, releaseToVersion, fetchRepoDetail } from '../../utils/github'
import type { Version } from '../../types'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const route = useRoute()
const msg = useMessage()
const projects = useProjectStore()
const categories = useCategoryStore()

const isEdit = computed(() => !!route.params.id)
const existingProject = computed(() => projects.projects.find((p) => p.id === route.params.id))

const step = ref<'input' | 'review'>('input')
const repoInput = ref('')
const fetching = ref(false)
const fetchError = ref('')

const form = ref({
  slug: '',
  name: '',
  description: '',
  logo: '',
  sourceType: 'github' as 'github' | 'custom',
  categoryId: '',
  githubRepo: '',
  website: '',
  featured: false,
})

const saving = ref(false)
const error = ref('')

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function parseRepo(input: string): string {
  const match = input.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/) || input.match(/^([\w.-]+\/[\w.-]+)/)
  return match ? match[1].replace(/\.git$/, '') : input.trim()
}

async function doFetch() {
  const repo = parseRepo(repoInput.value)
  if (!repo) {
    fetchError.value = '请输入 GitHub 仓库地址或 owner/repo'
    return
  }
  fetchError.value = ''
  fetching.value = true

  try {
    const [detail, releases] = await Promise.all([
      fetchRepoDetail(repo),
      fetchReleases(repo),
    ])

    const versions = releases.map((r) => releaseToVersion(r))
    versions.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

    form.value = {
      slug: slugify(detail.name),
      name: detail.name,
      description: detail.description || '',
      logo: detail.owner.avatar_url || '',
      sourceType: 'github',
      categoryId: form.value.categoryId,
      githubRepo: repo,
      website: '',
      featured: false,
    }

    // track fetched data for save step
    fetchedVersions.value = versions
    fetchedStars.value = detail.stargazers_count
    fetchedForks.value = detail.forks_count

    step.value = 'review'
    msg.success(`已获取 ${detail.name} 的信息，共 ${versions.length} 个版本`)
  } catch (e: any) {
    fetchError.value = `获取失败: ${e.message}`
  }
  fetching.value = false
}

const fetchedVersions = ref<Version[]>([])
const fetchedStars = ref(0)
const fetchedForks = ref(0)
const latestVersionDisplay = computed(() => fetchedVersions.value[0]?.version || '—')
const versionCount = computed(() => fetchedVersions.value.length)

onMounted(() => {
  categories.refresh()
  // 从页面管理跳转过来时，自动选中所属页面
  if (route.query.categoryId) {
    form.value.categoryId = route.query.categoryId as string
  }
  if (existingProject.value) {
    const p = existingProject.value
    form.value = {
      slug: p.slug,
      name: p.name,
      description: p.description,
      logo: p.logo,
      sourceType: p.sourceType,
      categoryId: p.categoryId,
      githubRepo: p.githubRepo || '',
      website: p.website || '',
      featured: p.featured,
    }
    step.value = 'review'
  }
})

async function doSave() {
  error.value = ''
  if (!form.value.name.trim() || !form.value.slug.trim()) {
    error.value = '名称和 Slug 不能为空'
    return
  }

  saving.value = true

  if (isEdit.value) {
    const p = existingProject.value
    if (p) {
      const newSlug = form.value.slug.trim()
      if (newSlug !== p.slug && projects.slugExists(newSlug)) {
        error.value = 'slug 已被其他项目使用'
        saving.value = false
        return
      }
      p.slug = newSlug
      p.name = form.value.name.trim()
      p.description = form.value.description.trim()
      p.logo = form.value.logo.trim()
      p.sourceType = form.value.sourceType
      p.categoryId = form.value.categoryId
      p.githubRepo = form.value.githubRepo.trim() || undefined
      p.githubUrl = form.value.githubRepo.trim() ? `https://github.com/${form.value.githubRepo.trim()}` : undefined
      p.website = form.value.website.trim() || undefined
      p.featured = form.value.featured
      projects.save(p)
    }
    saving.value = false
    msg.success('保存成功')
    router.push('/admin/projects')
    return
  }

  const p = projects.createGitHub(form.value.slug.trim(), form.value.name.trim(), form.value.githubRepo.trim(), form.value.categoryId)
  if (!p) {
    saving.value = false
    error.value = '创建项目失败，slug 可能已存在'
    return
  }

  p.description = form.value.description.trim()
  p.logo = form.value.logo.trim()
  p.website = form.value.website.trim() || undefined
  p.featured = form.value.featured
  p.stars = fetchedStars.value || undefined
  p.forks = fetchedForks.value || undefined
  p.versions = fetchedVersions.value
  if (fetchedVersions.value.length > 0) {
    p.latestVersion = fetchedVersions.value[0].version
    p.latestUpdateTime = fetchedVersions.value[0].publishedAt
  }

  projects.save(p)
  saving.value = false
  msg.success(`项目「${p.name}」创建成功`)
  setTimeout(() => router.push('/admin/projects'), 800)
}
</script>

<template>
  <AdminLayout>
    <h2 class="page-title">{{ isEdit ? '✏️ 编辑软件' : '➕ 新增软件' }}</h2>

    <NAlert v-if="error" type="error" closable>{{ error }}</NAlert>

    <!-- 第一步：输入 GitHub 仓库 -->
    <NCard v-if="!isEdit && step === 'input'" class="form-card">
      <div class="form">
        <div class="field">
          <label>GitHub 仓库地址</label>
          <NInput
            v-model:value="repoInput"
            placeholder="例如: gedoor/legado  或  https://github.com/gedoor/legado"
            size="large"
          />
          <p class="field-hint">输入 GitHub 仓库地址或 owner/repo，系统将自动获取软件信息</p>
        </div>
        <NAlert v-if="fetchError" type="error" closable>{{ fetchError }}</NAlert>
        <NSpace>
          <NButton type="primary" :loading="fetching" @click="doFetch">
            {{ fetching ? '获取中...' : '获取信息' }}
          </NButton>
          <NButton @click="router.push('/admin/projects')">取消</NButton>
        </NSpace>
      </div>
    </NCard>

    <!-- 第二步：审核 & 保存 -->
    <NCard v-if="step === 'review'" class="form-card">
      <div class="form">
        <div class="field">
          <label>软件名称 *</label>
          <NInput v-model:value="form.name" placeholder="软件名称" />
        </div>

        <div class="field">
          <label>Slug（URL 标识） *</label>
          <NInput v-model:value="form.slug" placeholder="url 标识" />
        </div>

        <div class="field">
          <label>所属页面</label>
          <NSelect
            v-model:value="form.categoryId"
            :options="categories.categories.map((c) => ({ label: `${c.icon || ''} ${c.name}`, value: c.id }))"
            placeholder="选择页面"
            clearable
          />
        </div>

        <div class="field">
          <label>描述</label>
          <NInput v-model:value="form.description" type="textarea" rows="3" placeholder="软件简介" />
        </div>

        <div class="field">
          <label>Logo URL</label>
          <NInput v-model:value="form.logo" placeholder="图片链接" />
        </div>

        <div class="field">
          <label>GitHub 仓库</label>
          <NInput v-model:value="form.githubRepo" placeholder="owner/repo" />
        </div>

        <!-- 从 GitHub 获取的版本信息预览 -->
        <div v-if="!isEdit && fetchedVersions.length > 0" class="versions-preview">
          <div class="preview-title">从 GitHub 获取的版本信息</div>
          <div class="preview-stats">
            <span>⭐ {{ fetchedStars?.toLocaleString() || '—' }}</span>
            <span>最新版本: {{ latestVersionDisplay }}</span>
            <span>共 {{ versionCount }} 个版本</span>
          </div>
        </div>

        <NSpace>
          <NButton type="primary" :loading="saving" @click="doSave">
            {{ isEdit ? '保存修改' : '创建项目' }}
          </NButton>
          <NButton v-if="!isEdit" @click="step = 'input'">返回修改仓库地址</NButton>
          <NButton @click="router.push('/admin/projects')">取消</NButton>
        </NSpace>
      </div>
    </NCard>
  </AdminLayout>
</template>

<style scoped>
.page-title { margin: 0 0 20px; font-size: 1.3rem; }
.form-card { max-width: 680px; }
.form { display: flex; flex-direction: column; gap: 16px; }
.field label { font-size: 0.88rem; font-weight: 600; margin-bottom: 4px; display: block; }
.field-hint { font-size: 0.82rem; color: var(--text-sec, #6b5f52); margin: 4px 0 0; }
.versions-preview {
  background: #f7f3ee;
  padding: 14px;
  border-radius: 12px;
  border-left: 3px solid #2a9d8f;
}
.preview-title { font-weight: 700; font-size: 0.92rem; margin-bottom: 8px; }
.preview-stats { display: flex; gap: 16px; font-size: 0.88rem; color: #3a332c; flex-wrap: wrap; }

@media (max-width: 768px) {
  .form-card { max-width: 100%; }
  .page-title { font-size: 1.1rem; }
}
</style>
