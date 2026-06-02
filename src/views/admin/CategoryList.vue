<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NInput, NDataTable, NSpace, NPopconfirm, NCard, NModal, NForm, NFormItem, NInputNumber } from 'naive-ui'
import { useCategoryStore } from '../../store/category'
import { useProjectStore } from '../../store/project'
import type { Category } from '../../types'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const catStore = useCategoryStore()
const projStore = useProjectStore()

const showModal = ref(false)
const editingCat = ref<Category | null>(null)
const form = ref({ name: '', slug: '', icon: '', description: '', sortOrder: 0 })

/** 每个页面的软件数 */
function projectCount(catId: string) {
  return projStore.projects.filter((p) => p.categoryId === catId).length
}

function openNew() {
  editingCat.value = null
  form.value = { name: '', slug: '', icon: '', description: '', sortOrder: catStore.categories.length }
  showModal.value = true
}

function openEdit(c: Category) {
  editingCat.value = c
  form.value = { name: c.name, slug: c.slug, icon: c.icon || '', description: c.description || '', sortOrder: c.sortOrder ?? 0 }
  showModal.value = true
}

function doSave() {
  if (!form.value.name.trim() || !form.value.slug.trim()) return

  if (editingCat.value) {
    const cat = { ...editingCat.value, ...form.value, description: form.value.description.trim() || undefined }
    catStore.save(cat)
  } else {
    catStore.create(form.value.name.trim(), form.value.slug.trim(), form.value.icon || undefined, form.value.description.trim() || undefined)
  }
  showModal.value = false
}

function doDelete(id: string) {
  catStore.remove(id)
}

const pageColumns = [
  { title: '排序', key: 'sortOrder', width: 60 },
  { title: '图标', key: 'icon', width: 60, render(row: Category) { return row.icon || '—' } },
    {
      title: '名称', key: 'name', width: 140,
      render(row: Category) {
        return h('span', {
          style: { cursor: 'pointer', color: 'var(--accent-teal)', fontWeight: 600 },
          onClick: () => router.push(`/admin/categories/${row.id}/projects`),
        }, row.name)
      },
    },
  { title: '描述', key: 'description', width: 200, ellipsis: { tooltip: true }, render(row: Category) { return row.description || '—' } },
  { title: 'Slug', key: 'slug', width: 100 },
  {
    title: '软件数', key: 'projectCount', width: 80,
    render(row: Category) { return projectCount(row.id) },
  },
  {
    title: '操作',
    key: 'actions',
    width: 160,
    render(row: Category) {
      return h(NSpace, { size: 'small' }, () => [
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => openEdit(row) }, () => '编辑'),
        h(NPopconfirm, { onPositiveClick: () => doDelete(row.id) }, {
          default: () => '确定删除此页面？',
          trigger: () => h(NButton, { size: 'tiny', type: 'error', tertiary: true }, () => '删除'),
        }),
      ])
    },
  },
]

onMounted(() => {
  catStore.refresh()
  projStore.refresh()
})
</script>

<template>
  <AdminLayout>
    <div class="category-page">
    <div class="page-header">
      <h2 class="page-title">📂 页面管理</h2>
      <NButton type="primary" @click="openNew">新增页面</NButton>
    </div>

    <div class="card-wrap">
      <div class="card-title-bar">所有页面</div>
      <div class="card-scroll">
        <NDataTable
          :columns="pageColumns"
          :data="catStore.categories"
          :row-key="(row: Category) => row.id"
          size="small"
          striped
        />
      </div>
    </div>
    </div>

    <NModal v-model:show="showModal" title="页面信息" preset="card" style="max-width: 520px">
      <NForm :model="form" label-placement="top">
        <NFormItem label="名称">
          <NInput v-model:value="form.name" placeholder="如: 阅读工具" />
        </NFormItem>
        <NFormItem label="Slug">
          <NInput v-model:value="form.slug" placeholder="如: reader" />
        </NFormItem>
        <NFormItem label="图标（Emoji）">
          <NInput v-model:value="form.icon" placeholder="如: 📖" />
        </NFormItem>
        <NFormItem label="描述">
          <NInput v-model:value="form.description" type="textarea" rows="2" placeholder="此页面聚合了哪些软件..." />
        </NFormItem>
        <NFormItem label="排序">
          <NInputNumber v-model:value="form.sortOrder" :min="0" />
        </NFormItem>
      </NForm>

      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="doSave">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </AdminLayout>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { margin: 0; font-size: 1.3rem; }
.category-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.card-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--card-bg);
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}
.card-title-bar {
  padding: 14px 20px;
  font-weight: 700;
  font-size: 0.95rem;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.card-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 12px; align-items: stretch; }
  .page-header .n-button { width: 100%; }
}
</style>
