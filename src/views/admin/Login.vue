<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NInput, useMessage } from 'naive-ui'
import { validateToken, saveLogin, isAuthenticated } from '../../utils/auth'
import { getSettings, saveSettings } from '../../utils/api'

const router = useRouter()
const message = useMessage()

const token = ref('')
const loading = ref(false)
const errorMsg = ref('')

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
    const user = await validateToken(trimmed)
    const settings = getSettings()
    const admins = settings.admins || []

    if (admins.length === 0) {
      settings.admins = [user.login]
      saveSettings(settings)
      message.success(`"${user.login}" 已自动注册为管理员`)
    } else if (!admins.includes(user.login)) {
      throw new Error(`"${user.login}" 不是管理员，无权访问后台`)
    }

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
    <div class="login-card">
      <header class="login-header">
        <div class="logo-mark">
          <span class="logo-glyph">🐺</span>
        </div>
        <h1 class="brand-name">Software Hub</h1>
        <p class="brand-sub">管理员登录</p>
      </header>

      <div v-if="errorMsg" class="error-banner">
        <span>⚠️</span>
        <span>{{ errorMsg }}</span>
      </div>

      <div class="form-field">
        <label class="form-label">GitHub Token</label>
        <NInput
          v-model:value="token"
          type="password"
          show-password-on="click"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          :disabled="loading"
          size="large"
          @keyup.enter="doLogin"
        />
      </div>

      <button
        class="btn-primary login-btn"
        :disabled="loading"
        @click="doLogin"
      >
        {{ loading ? '验证中...' : '登录' }}
      </button>

      <div class="login-hint">
        <div class="hint-head">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="shield-icon">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
          </svg>
          <span class="hint-title">安全认证</span>
        </div>
        <p class="hint-desc">Token 仅存储在本地浏览器，不会上传到任何服务器</p>
        <ul class="perm-list">
          <li><code>public_repo</code> — 读取公开仓库 Release</li>
          <li><code>repo</code> — 同步私有仓库</li>
        </ul>
        <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" class="hint-link">
          → 创建 Token
        </a>
      </div>
    </div>

    <!-- 装饰光斑 + 盾牌 -->
    <div class="login-decoration" aria-hidden="true">
      <div class="deco-orb deco-orb-1"></div>
      <div class="deco-orb deco-orb-2"></div>
      <div class="deco-orb deco-orb-3"></div>
      <svg class="deco-shield" viewBox="0 0 200 200" width="240" height="240" fill="none">
        <defs>
          <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4F8CFF" stop-opacity="0.18" />
            <stop offset="100%" stop-color="#8C6CFF" stop-opacity="0.06" />
          </linearGradient>
        </defs>
        <path
          d="M100 20 L170 50 L170 110 C170 145 138 175 100 185 C62 175 30 145 30 110 L30 50 Z"
          fill="url(#shieldGrad)"
          stroke="#4F8CFF"
          stroke-width="1.5"
          stroke-opacity="0.18"
        />
        <path
          d="M70 105 L92 127 L135 80"
          fill="none"
          stroke="#4F8CFF"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-opacity="0.22"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--admin-login-gradient);
  padding: 20px;
  overflow: hidden;
}

/* === 登录卡片 === */
.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  padding: 40px 36px;
  background: var(--admin-card);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 28px;
  box-shadow: 0 20px 60px rgba(79, 140, 255, 0.15);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  animation: card-rise 0.4s ease;
}
@keyframes card-rise {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.login-header {
  text-align: center;
  margin-bottom: 28px;
}
.logo-mark {
  width: 72px;
  height: 72px;
  margin: 0 auto 16px;
  border-radius: 20px;
  background: var(--admin-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 32px rgba(79, 140, 255, 0.32);
  position: relative;
}
.logo-mark::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 24px;
  background: var(--admin-gradient);
  opacity: 0.2;
  filter: blur(12px);
  z-index: -1;
}
.logo-glyph {
  font-size: 2.2rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}
.brand-name {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
  background: var(--admin-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.brand-sub {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  margin: 0;
  letter-spacing: 0.5px;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 18px;
  background: rgba(255, 107, 107, 0.08);
  color: var(--color-error);
  border: 1px solid rgba(255, 107, 107, 0.2);
  border-radius: 14px;
  font-size: 0.85rem;
}

.form-field { margin-bottom: 18px; }
.form-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-sec);
  margin-bottom: 8px;
}

.login-btn {
  width: 100%;
  height: 48px;
  font-size: 0.98rem;
  margin-bottom: 22px;
}

.login-hint {
  font-size: 0.82rem;
  color: var(--text-sec);
  line-height: 1.6;
  background: var(--color-card-soft);
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--admin-border);
}
.hint-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.shield-icon { color: var(--color-primary); }
.hint-title {
  font-weight: 700;
  color: var(--text-main);
  font-size: 0.85rem;
}
.hint-desc {
  margin: 0 0 8px;
  color: var(--text-tertiary);
  font-size: 0.78rem;
}
.perm-list {
  margin: 6px 0;
  padding-left: 20px;
  font-size: 0.78rem;
}
.perm-list code {
  font-family: var(--font-mono);
  background: var(--admin-card);
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--color-primary);
  font-size: 0.75rem;
}
.hint-link {
  display: inline-block;
  margin-top: 4px;
  color: var(--color-primary);
  font-weight: 500;
  font-size: 0.8rem;
}

/* === 装饰 === */
.login-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.deco-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.55;
}
.deco-orb-1 {
  width: 420px; height: 420px;
  top: -120px; right: -120px;
  background: radial-gradient(circle, rgba(140, 108, 255, 0.6) 0%, transparent 70%);
}
.deco-orb-2 {
  width: 360px; height: 360px;
  bottom: -120px; left: -100px;
  background: radial-gradient(circle, rgba(79, 140, 255, 0.5) 0%, transparent 70%);
}
.deco-orb-3 {
  width: 280px; height: 280px;
  top: 40%; left: 60%;
  background: radial-gradient(circle, rgba(140, 108, 255, 0.3) 0%, transparent 70%);
}
.deco-shield {
  position: absolute;
  right: 6%;
  bottom: 8%;
  opacity: 0.85;
  filter: drop-shadow(0 8px 24px rgba(79, 140, 255, 0.18));
  animation: float-shield 8s ease-in-out infinite;
}
@keyframes float-shield {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50%      { transform: translateY(-12px) rotate(2deg); }
}

@media (max-width: 768px) {
  .login-card { padding: 32px 24px; border-radius: 24px; }
  .logo-mark { width: 60px; height: 60px; }
  .logo-glyph { font-size: 1.8rem; }
  .deco-shield { display: none; }
}
</style>
