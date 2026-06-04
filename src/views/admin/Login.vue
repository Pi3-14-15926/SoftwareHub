<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NInput, NButton, NCard, NAlert, useMessage } from 'naive-ui'
import { validateToken, saveLogin, isAuthenticated } from '../../utils/auth'
import { getSettings, saveSettings } from '../../utils/api'

const router = useRouter()
const message = useMessage()

const token = ref('')
const loading = ref(false)
const errorMsg = ref('')

/* 已经登录则直接跳转 */
if (isAuthenticated()) {
  router.replace('/admin/dashboard')
}

async function doLogin() {
  const trimmed = token.value.trim()
  if (!trimmed) {
    errorMsg.value = '请输入 GitHub Token'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    /* 第一步：验证 Token，获取用户信息 */
    const user = await validateToken(trimmed)

    /* 第二步：检查/注册管理员 */
    const settings = getSettings()
    const admins = settings.admins || []

    if (admins.length === 0) {
      /* 首次登录，自动注册为管理员 */
      settings.admins = [user.login]
      saveSettings(settings)
      message.success(`"${user.login}" 已自动注册为管理员`)
    } else if (!admins.includes(user.login)) {
      throw new Error(`"${user.login}" 不是管理员，无权访问后台`)
    }

    /* 第三步：保存登录状态 */
    saveLogin(trimmed, user)
    message.success('登录成功')
    router.replace('/admin/dashboard')
  } catch (e: any) {
    errorMsg.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <NCard title="管理后台登录" class="login-card">
      <p class="login-desc">使用 GitHub Personal Access Token 登录</p>

      <NAlert v-if="errorMsg" type="error" :bordered="false" closable @close="errorMsg = ''">
        {{ errorMsg }}
      </NAlert>

      <NInput
        v-model:value="token"
        type="password"
        show-password-on="click"
        placeholder="输入 GitHub Token..."
        :disabled="loading"
        @keyup.enter="doLogin"
      />

      <div class="login-hint">
        <p>Token 需要以下权限：</p>
        <ul>
          <li><code>public_repo</code>（读取公开仓库 Release）</li>
          <li><code>repo</code>（如需同步私有仓库）</li>
        </ul>
        <p>
          <a href="https://github.com/settings/tokens" target="_blank">创建 Token →</a>
        </p>
      </div>

      <NButton
        type="primary"
        block
        :loading="loading"
        :disabled="loading"
        @click="doLogin"
      >
        {{ loading ? '验证中...' : '登录' }}
      </NButton>
    </NCard>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color);
  padding: 20px;
}
.login-card {
  width: 100%;
  max-width: 420px;
}
.login-desc {
  font-size: 0.85rem;
  color: var(--text-secondary, #888);
  margin: 0 0 16px;
}
.login-card :deep(.n-input) {
  margin-top: 12px;
}
.login-hint {
  margin: 16px 0;
  font-size: 0.8rem;
  color: var(--text-secondary, #888);
  line-height: 1.6;
}
.login-hint ul {
  margin: 4px 0;
  padding-left: 20px;
}
.login-hint code {
  font-size: 0.75rem;
  background: var(--code-bg, #f5f5f5);
  padding: 1px 4px;
  border-radius: 3px;
}
.login-hint a {
  color: var(--primary-color, #18a058);
}
</style>
