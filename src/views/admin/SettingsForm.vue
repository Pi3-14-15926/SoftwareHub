<script setup lang="ts">
/* ===== 网站设置 ===== */
import { ref, onMounted } from 'vue'
import { NButton, NInput, NCard, NForm, NFormItem, NSpace, NAlert, NInputNumber, useMessage } from 'naive-ui'
import { useSettingStore } from '../../store/settings'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const store = useSettingStore()
const message = useMessage()

const form = ref({
  siteName: '',
  logo: '',
  announcement: '',
  footer: '',
  admins: '',
  seoTitle: '',
  seoDesc: '',
  seoKeywords: '',
})

onMounted(() => {
  store.refresh()
  const s = store.settings
  form.value = {
    siteName: s.siteName,
    logo: s.logo,
    announcement: s.announcement || '',
    footer: s.footer || '',
    admins: (s.admins || []).join(', '),
    seoTitle: s.seo?.title || '',
    seoDesc: s.seo?.description || '',
    seoKeywords: (s.seo?.keywords || []).join(', '),
  }
})

function doSave() {
  store.save({
    siteName: form.value.siteName,
    logo: form.value.logo,
    announcement: form.value.announcement || undefined,
    footer: form.value.footer || undefined,
    admins: form.value.admins
      .split(/[,，]/)
      .map((a) => a.trim())
      .filter(Boolean),
    seo: {
      title: form.value.seoTitle || undefined,
      description: form.value.seoDesc || undefined,
      keywords: form.value.seoKeywords
        .split(/[,，]/)
        .map((k) => k.trim())
        .filter(Boolean),
    },
  })
  message.success('设置已保存')
}
</script>

<template>
  <AdminLayout>
    <h2 class="page-title">⚙️ 网站设置</h2>

    <NCard class="form-card">
      <NForm :model="form" label-placement="top">
        <NFormItem label="站点名称">
          <NInput v-model:value="form.siteName" placeholder="Software Hub" />
        </NFormItem>

        <NFormItem label="Logo URL">
          <NInput v-model:value="form.logo" placeholder="Logo 图片链接（可选）" />
        </NFormItem>

        <NFormItem label="公告">
          <NInput v-model:value="form.announcement" type="textarea" rows="2" placeholder="显示在首页顶部的公告" />
        </NFormItem>

        <NFormItem label="页脚文字">
          <NInput v-model:value="form.footer" type="textarea" rows="2" placeholder="Powered by Software Hub" />
        </NFormItem>

        <NFormItem label="管理员（GitHub 用户名，逗号分隔）">
          <NInput v-model:value="form.admins" placeholder="如: user1, user2" />
        </NFormItem>

        <NFormItem label="SEO 标题">
          <NInput v-model:value="form.seoTitle" placeholder="浏览器标题" />
        </NFormItem>

        <NFormItem label="SEO 描述">
          <NInput v-model:value="form.seoDesc" type="textarea" rows="2" placeholder="页面描述" />
        </NFormItem>

        <NFormItem label="SEO 关键词（逗号分隔）">
          <NInput v-model:value="form.seoKeywords" placeholder="如: 软件下载, 多版本, 聚合" />
        </NFormItem>
      </NForm>

      <NSpace>
        <NButton type="primary" @click="doSave">保存设置</NButton>
      </NSpace>
    </NCard>
  </AdminLayout>
</template>

<style scoped>
.page-title { margin: 0 0 20px; font-size: 1.3rem; }
.form-card { max-width: 680px; }
@media (max-width: 768px) { .form-card { max-width: 100%; } }
</style>
