<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { NInput, NInputNumber, NSelect, NSwitch, useMessage } from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { useSettingStore } from '../../store/settings'
import { encryptSecret, decryptSecret, isEncrypted } from '../../utils/secretStore'
import { getToken } from '../../utils/auth'

const message = useMessage()
const store = useSettingStore()

/* ============== WebDAV 配置表单（与 FeatureSettings 共享 store） ============== */
const webForm = ref({
  url: '',
  username: '',
  password: '',
  baseDir: '/SoftwareHub',
  uploadTimeout: 300,
  maxFileSize: 500,
})
const showPassword = ref(false)
const isConfigured = ref(false)

onMounted(async () => {
  store.refresh()
  const wd = store.settings.webdav
  const storedPwd = wd?.password ?? ''
  const plainPwd = isEncrypted(storedPwd) ? await decryptSecret(storedPwd) : storedPwd
  webForm.value = {
    url: wd?.url ?? '',
    username: wd?.username ?? '',
    password: plainPwd,
    baseDir: wd?.baseDir ?? '/SoftwareHub',
    uploadTimeout: wd?.uploadTimeout ?? 300,
    maxFileSize: wd?.maxFileSize ?? 500,
  }
  await refreshStatus()
})

/* ============== 备份参数 ============== */
const keepVersions = ref(2)
const keepOptions = [
  { label: '1 个版本', value: 1 },
  { label: '2 个版本（默认）', value: 2 },
  { label: '3 个版本', value: 3 },
  { label: '5 个版本', value: 5 },
]
const includeRelease = ref(true)

/* 加速代理状态提示 */
const proxyStatus = computed(() => {
  const enabled = !!store.settings.ghProxyEnabled
  const url = store.settings.ghProxyUrl || ''
  if (enabled && url) return { ok: true, label: `GitHub 代理加速已开启`, url }
  return { ok: false, label: 'GitHub 代理加速未开启（下载可能较慢）', url: '' }
})

/* ============== 状态 ============== */
const isRunning = ref(false)
const status = ref<{ configured: boolean; running: boolean }>({ configured: false, running: false })
const logs = ref<Array<{ type: 'log' | 'err' | 'system'; text: string; ts: number }>>([])
const result = ref<{ code: number | null; ok: boolean; msg: string } | null>(null)
let eventSource: EventSource | null = null

async function refreshStatus() {
  try {
    const r = await fetch('/__local-backup-status')
    const j = await r.json()
    status.value = j
    isConfigured.value = j.configured
  } catch { /* noop */ }
}

async function saveConfig() {
  const s = { ...store.settings }
  s.webdav = {
    ...(s.webdav || {}),
    url: webForm.value.url,
    username: webForm.value.username,
    password: webForm.value.password ? await encryptSecret(webForm.value.password) : '',
    baseDir: webForm.value.baseDir,
    uploadTimeout: webForm.value.uploadTimeout,
    maxFileSize: webForm.value.maxFileSize,
  }
  store.save(s)

  /* 同步到 vite 中间件 */
  const token = getToken() || ''
  const cfgRes = await fetch('/__local-backup-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webForm.value.url,
      username: webForm.value.username,
      password: webForm.value.password,
      baseDir: webForm.value.baseDir,
      maxFileSize: webForm.value.maxFileSize,
      uploadTimeout: webForm.value.uploadTimeout,
      ghToken: token,
      /* 加速设置 → GitHub 代理：开启后下载 release 走代理加速 */
      ghProxyEnabled: !!store.settings.ghProxyEnabled,
      ghProxyUrl: store.settings.ghProxyUrl || '',
    }),
  })
  const j = await cfgRes.json()
  if (!j.ok) {
    message.error('配置保存失败：' + (j.error || '未知错误'))
    return
  }
  const proxyStatus = store.settings.ghProxyEnabled && store.settings.ghProxyUrl ? '（GitHub 代理已开启）' : '（GitHub 代理未开启）'
  message.success('WebDAV 配置已保存并同步到本地备份服务 ' + proxyStatus)
  await refreshStatus()
}

async function testConnection() {
  if (!webForm.value.url || !webForm.value.username || !webForm.value.password) {
    message.warning('请先填写完整的服务地址、用户名、密码')
    return
  }
  try {
    const token = getToken() || ''
    const cfgRes = await fetch('/__local-backup-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webForm.value.url,
        username: webForm.value.username,
        password: webForm.value.password,
        baseDir: webForm.value.baseDir,
        maxFileSize: webForm.value.maxFileSize,
        uploadTimeout: webForm.value.uploadTimeout,
        ghToken: token,
        ghProxyEnabled: !!store.settings.ghProxyEnabled,
        ghProxyUrl: store.settings.ghProxyUrl || '',
      }),
    })
    const j = await cfgRes.json()
    if (!j.ok) throw new Error(j.error)
    message.success('配置已同步。点击「开始本地备份」实际测试上传')
    await refreshStatus()
  } catch (e: any) {
    message.error('配置失败：' + e.message)
  }
}

function pushLog(type: 'log' | 'err' | 'system', text: string) {
  logs.value.push({ type, text, ts: Date.now() })
  /* 限制最多 1000 行 */
  if (logs.value.length > 1000) logs.value = logs.value.slice(-1000)
}

function clearLogs() {
  logs.value = []
  result.value = null
}

async function startBackup() {
  if (isRunning.value) {
    message.warning('已有备份在运行中')
    return
  }
  if (!isConfigured.value) {
    message.error('请先保存 WebDAV 配置')
    return
  }
  clearLogs()
  isRunning.value = true
  result.value = null
  pushLog('system', `▶️ 启动本地备份（保留 ${keepVersions.value} 个版本）${includeRelease.value ? '（含同步 Release）' : '（仅备份）'}`)

  /* 使用 fetch 流式读取 */
  try {
    const res = await fetch(`/__local-backup?keepVersions=${keepVersions.value}`, { method: 'POST' })
    if (!res.ok || !res.body) {
      const txt = await res.text()
      throw new Error(`HTTP ${res.status}: ${txt}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''
      for (const chunk of lines) {
        const m = chunk.match(/^data: (.+)$/m)
        if (m) {
          try {
            const evt = JSON.parse(m[1])
            handleEvent(evt)
          } catch { /* ignore */ }
        }
      }
    }
  } catch (e: any) {
    pushLog('err', `请求失败：${e.message}`)
    result.value = { code: null, ok: false, msg: e.message }
  } finally {
    isRunning.value = false
    await refreshStatus()
  }
}

function handleEvent(evt: any) {
  if (evt.type === 'start') {
    pushLog('system', `📡 进程已启动（PID: ${evt.pid}）`)
  } else if (evt.type === 'log') {
    pushLog('log', evt.line)
  } else if (evt.type === 'err') {
    pushLog('err', evt.line)
  } else if (evt.type === 'done') {
    if (evt.code === 0) {
      pushLog('system', '✅ 备份完成')
      result.value = { code: 0, ok: true, msg: '备份完成' }
      message.success('备份完成')
    } else if (evt.signal === 'SIGTERM' || evt.code === null) {
      pushLog('system', '⏸ 备份已停止（Windows 终止子进程）。再次开始会自动跳过已备份版本。')
      result.value = { code: evt.code, ok: false, msg: '已停止' }
      message.warning('备份已停止')
    } else {
      pushLog('system', `❌ 备份失败（exit code: ${evt.code}）`)
      result.value = { code: evt.code, ok: false, msg: `exit code: ${evt.code}` }
      message.error('备份失败')
    }
  } else if (evt.type === 'error') {
    pushLog('err', evt.message)
  }
}

async function stopBackup() {
  if (!isRunning.value) return
  try {
    const r = await fetch('/__local-backup-stop', { method: 'POST' })
    const j = await r.json()
    if (!j.ok) {
      message.error('停止失败：' + (j.error || '未知错误'))
      return
    }
    pushLog('system', `⏸ 用户已停止（PID: ${j.pid}）`)
    message.info('正在停止...')
  } catch (e: any) {
    message.error('请求失败：' + e.message)
  }
}

onBeforeUnmount(() => {
  /* fetch ReadableStream 在组件卸载时由浏览器自动关闭 */
  void eventSource
})
</script>

<template>
  <AdminLayout>
    <div class="channel-page">
      <div class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">📡</span>渠道备份</h2>
          <p class="page-desc">在本地开发环境把数据直接备份到 WebDAV 云盘，复用 GitHub Actions 工作流</p>
        </div>
      </div>

      <!-- WebDAV 配置 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">☁️</div>
          <div>
            <h3 class="card-title">WebDAV 配置</h3>
            <p class="card-desc">和「功能设置 → Web 备份」共享同一份配置，这里只是快速入口</p>
          </div>
          <span class="status-tag" :class="isConfigured ? 'status-ok' : 'status-miss'">
            <span class="status-dot"></span>
            {{ isConfigured ? '已配置' : '未配置' }}
          </span>
        </header>

        <div class="form-grid-2">
          <div class="field">
            <label class="field-label">服务地址</label>
            <NInput v-model:value="webForm.url" placeholder="https://dav.jianguoyun.com/dav/" size="large" />
          </div>
          <div class="field">
            <label class="field-label">基础目录</label>
            <NInput v-model:value="webForm.baseDir" placeholder="/SoftwareHub" size="large" />
          </div>
          <div class="field">
            <label class="field-label">用户名</label>
            <NInput v-model:value="webForm.username" placeholder="WebDAV 账号" size="large" />
          </div>
          <div class="field">
            <label class="field-label">密码</label>
            <NInput
              v-model:value="webForm.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="WebDAV 密码"
              size="large"
            >
              <template #suffix>
                <button type="button" class="pwd-toggle" @click="showPassword = !showPassword">
                  {{ showPassword ? '隐藏' : '显示' }}
                </button>
              </template>
            </NInput>
          </div>
          <div class="field">
            <label class="field-label">上传超时（秒）</label>
            <NInputNumber v-model:value="webForm.uploadTimeout" :min="10" :max="1800" size="large" style="width: 100%;" />
          </div>
          <div class="field">
            <label class="field-label">文件大小限制（MB）</label>
            <NInputNumber v-model:value="webForm.maxFileSize" :min="1" :max="10000" size="large" style="width: 100%;" />
          </div>
        </div>

        <div class="webdav-actions">
          <button class="btn-primary" @click="saveConfig">保存配置</button>
          <button class="btn-secondary" @click="testConnection">同步到本地服务</button>
        </div>
      </section>

      <!-- 备份操作 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">🚀</div>
          <div>
            <h3 class="card-title">本地备份操作</h3>
            <p class="card-desc">点击下方按钮启动本地备份脚本，实时显示运行日志</p>
          </div>
        </header>

        <!-- GitHub 代理状态提示 -->
        <div class="proxy-bar" :class="proxyStatus.ok ? 'proxy-on' : 'proxy-off'">
          <span class="proxy-icon">{{ proxyStatus.ok ? '⚡' : '🐢' }}</span>
          <span class="proxy-label">{{ proxyStatus.label }}</span>
          <a v-if="!proxyStatus.ok" href="/admin/acceleration" class="proxy-link">前往开启 →</a>
        </div>

        <div class="backup-params">
          <div class="field">
            <label class="field-label">每个项目保留的版本数</label>
            <NSelect v-model:value="keepVersions" :options="keepOptions" size="large" style="width: 100%;" />
          </div>
        </div>

        <div class="action-buttons">
          <button class="btn-primary big" :disabled="isRunning" @click="startBackup">
            {{ isRunning ? '备份中...' : '开始本地备份' }}
          </button>
          <button
            class="btn-warning big"
            :disabled="!isRunning"
            :title="isRunning ? '停止当前备份（Windows 上实际为终止子进程，再次开始会自动跳过已备份版本）' : '请先开始备份'"
            @click="stopBackup"
          >
            ⏸ 停止
          </button>
          <button class="btn-secondary" :disabled="isRunning" @click="clearLogs">清空日志</button>
        </div>

        <div v-if="result" class="result-bar" :class="result.ok ? 'result-ok' : 'result-err'">
          <span class="result-icon">{{ result.ok ? '✓' : '✗' }}</span>
          <span>{{ result.msg }}</span>
        </div>
      </section>

      <!-- 实时日志 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">📜</div>
          <div>
            <h3 class="card-title">实时日志</h3>
            <p class="card-desc">从子进程 stdout/stderr 实时流式输出</p>
          </div>
        </header>

        <div class="log-box">
          <div v-if="logs.length === 0" class="log-empty">暂无日志，点击「开始本地备份」启动</div>
          <div
            v-for="(l, i) in logs"
            :key="i"
            class="log-line"
            :class="`log-${l.type}`"
          >
            <span class="log-time">{{ new Date(l.ts).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
            <span class="log-text">{{ l.text }}</span>
          </div>
        </div>
      </section>
    </div>
  </AdminLayout>
</template>

<style scoped>
.channel-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
  padding-left: 25px;
  padding-right: 25px;
}

.settings-card {
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  padding: 24px;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3478f6, #5b9bff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(52, 120, 246, 0.25);
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--admin-text);
  margin: 0 0 2px;
}

.card-desc {
  font-size: 13px;
  color: var(--admin-text-2);
  margin: 0;
}

.status-tag {
  margin-left: auto;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.status-ok { background: rgba(34, 197, 94, 0.12); color: #16a34a; }
.status-miss { background: rgba(239, 68, 68, 0.12); color: #dc2626; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; }
.status-ok .status-dot { background: #22c55e; }
.status-miss .status-dot { background: #ef4444; }

.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
@media (max-width: 768px) {
  .form-grid-2 { grid-template-columns: 1fr; }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--admin-text);
}

.webdav-actions,
.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.pwd-toggle {
  background: transparent;
  border: 0;
  color: #3478f6;
  font-size: 12px;
  cursor: pointer;
  padding: 0 4px;
}

.btn-primary,
.btn-secondary {
  padding: 8px 16px;
  border-radius: 8px;
  border: 0;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
}
.btn-primary {
  background: linear-gradient(135deg, #3478f6 0%, #5b9bff 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(52, 120, 246, 0.3);
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(52, 120, 246, 0.4);
}
.btn-primary.big {
  padding: 12px 28px;
  font-size: 15px;
}
.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-secondary {
  background: #fff;
  color: #3478f6;
  border: 1px solid #3478f6;
}
.btn-secondary:hover:not(:disabled) {
  background: rgba(52, 120, 246, 0.08);
}
.btn-warning {
  background: linear-gradient(135deg, #f59e0b 0%, #fb923c 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}
.btn-warning:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(245, 158, 11, 0.4);
}

.backup-params {
  margin-bottom: 16px;
}

.proxy-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 500;
}
.proxy-on { background: rgba(34, 197, 94, 0.1); color: #16a34a; }
.proxy-off { background: rgba(234, 179, 8, 0.12); color: #ca8a04; }
.proxy-icon { font-size: 18px; }
.proxy-label { flex: 1; }
.proxy-link {
  color: #3478f6;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
}
.proxy-link:hover { text-decoration: underline; }

.result-bar {
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.result-ok { background: rgba(34, 197, 94, 0.1); color: #16a34a; }
.result-err { background: rgba(239, 68, 68, 0.1); color: #dc2626; }
.result-icon { font-weight: bold; }

.log-box {
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 8px;
  padding: 12px 16px;
  height: 480px;
  overflow-y: auto;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12.5px;
  line-height: 1.55;
}
.log-empty {
  color: #888;
  text-align: center;
  padding: 40px 0;
}
.log-line {
  display: flex;
  gap: 10px;
  white-space: pre-wrap;
  word-break: break-all;
}
.log-time {
  color: #6b7280;
  flex-shrink: 0;
}
.log-text { flex: 1; }
.log-log .log-text { color: #d4d4d4; }
.log-err .log-text { color: #f87171; }
.log-system .log-text { color: #5b9bff; font-weight: 500; }

.log-box::-webkit-scrollbar { width: 8px; }
.log-box::-webkit-scrollbar-track { background: #1e1e1e; }
.log-box::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
</style>
