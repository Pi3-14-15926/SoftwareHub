<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { NInput, NInputNumber, NSelect, NSwitch, useMessage } from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { useSettingStore } from '../../store/settings'
import { getToken } from '../../utils/auth'

const message = useMessage()
const store = useSettingStore()

/* ============== 备份参数 ============== */
const keepVersions = ref(2)
const keepOptions = [
  { label: '1 个版本', value: 1 },
  { label: '2 个版本（默认）', value: 2 },
  { label: '3 个版本', value: 3 },
  { label: '5 个版本', value: 5 },
]

const uploadTimeout = ref(600)
const timeoutOptions = [
  { label: '5 分钟', value: 300 },
  { label: '10 分钟（默认）', value: 600 },
  { label: '20 分钟', value: 1200 },
  { label: '30 分钟', value: 1800 },
  { label: '60 分钟', value: 3600 },
]

const maxFileSizeMB = ref(500)
const fileSizeOptions = [
  { label: '100 MB', value: 100 },
  { label: '200 MB', value: 200 },
  { label: '500 MB（默认）', value: 500 },
  { label: '1 GB', value: 1024 },
  { label: '2 GB', value: 2048 },
  { label: '不限制', value: 99999 },
]

/* 加速代理状态提示 */
const proxyStatus = computed(() => {
  const enabled = !!store.settings.ghProxyEnabled
  const url = store.settings.ghProxyUrl || ''
  if (enabled && url) return { ok: true, label: `GitHub 代理加速已开启`, url }
  return { ok: false, label: 'GitHub 代理加速未开启（下载可能较慢）', url: '' }
})

/* ============== rclone 相关状态 ============== */
const rcloneRemotes = ref<Array<{ name: string; type: string; config?: Record<string, string> }>>([])
const selectedRemote = ref('')
const rclonePath = ref('/SoftwareHub')
const rcloneTesting = ref(false)
const rcloneConfigured = ref(false)

/* rclone 渠道配置表单 */
const channelTypes = [
  { label: 'WebDAV（坚果云等）', value: 'webdav' },
  { label: 'OneDrive', value: 'onedrive' },
  { label: 'Google Drive', value: 'drive' },
  { label: 'S3 兼容存储（阿里云OSS等）', value: 's3' },
  { label: '其他 rclone 支持的类型', value: 'other' },
]

const channelFormVisible = ref(false)
const channelForm = ref({
  name: '',
  type: 'webdav',
  config: {} as Record<string, string>,
})
const channelSaving = ref(false)
const editingChannel = ref<string | null>(null)

const webdavVendors = [
  { label: '其他（通用 WebDAV）', value: 'other' },
  { label: '坚果云', value: '坚果云' },
  { label: 'NextCloud', value: 'NextCloud' },
  { label: 'ownCloud', value: 'ownCloud' },
  { label: '123云盘', value: '123云盘' },
]

/* 加载 rclone 远程存储列表 */
async function loadRcloneRemotes() {
  try {
    const res = await fetch('/__rclone-config')
    const j = await res.json()
    if (j.ok) {
      rcloneRemotes.value = j.remotes || []
      if (rcloneRemotes.value.length > 0 && !selectedRemote.value) {
        selectedRemote.value = rcloneRemotes.value[0].name
      }
    }
  } catch { /* noop */ }
}

/* 测试 rclone 连接 */
async function testRcloneConnection() {
  if (!selectedRemote.value) {
    message.warning('请先选择渠道')
    return
  }
  rcloneTesting.value = true
  try {
    const res = await fetch('/__rclone-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remote: selectedRemote.value }),
    })
    const j = await res.json()
    if (j.ok) {
      message.success(j.message)
      rcloneConfigured.value = true
    } else {
      message.error('连接失败：' + (j.error || '未知错误'))
      rcloneConfigured.value = false
    }
  } catch (e: any) {
    message.error('请求失败：' + e.message)
    rcloneConfigured.value = false
  } finally {
    rcloneTesting.value = false
  }
}

/* 打开新建渠道表单 */
function openNewChannelForm() {
  editingChannel.value = null
  channelForm.value = {
    name: '',
    type: 'webdav',
    config: {},
  }
  channelFormVisible.value = true
}

/* 编辑已有渠道 */
function editChannel(name: string) {
  const remote = rcloneRemotes.value.find(r => r.name === name)
  if (!remote) return
  editingChannel.value = name
  channelForm.value = {
    name: remote.name,
    type: remote.type,
    config: { ...(remote.config || {}) },
  }
  channelFormVisible.value = true
}

/* 保存渠道配置 */
async function saveChannelConfig() {
  if (!channelForm.value.name) {
    message.warning('请填写渠道名称')
    return
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(channelForm.value.name)) {
    message.warning('渠道名称只能包含字母、数字、下划线和连字符')
    return
  }
  channelSaving.value = true
  try {
    const res = await fetch('/__rclone-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: channelForm.value.name,
        type: channelForm.value.type,
        config: channelForm.value.config,
      }),
    })
    const j = await res.json()
    if (j.ok) {
      message.success(j.message)
      channelFormVisible.value = false
      await loadRcloneRemotes()
      selectedRemote.value = channelForm.value.name
    } else {
      message.error('保存失败：' + (j.error || '未知错误'))
    }
  } catch (e: any) {
    message.error('请求失败：' + e.message)
  } finally {
    channelSaving.value = false
  }
}

/* 删除渠道 */
async function deleteChannel(name: string) {
  if (!confirm(`确定要删除渠道 "${name}" 吗？`)) return
  try {
    const res = await fetch('/__rclone-config', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const j = await res.json()
    if (j.ok) {
      message.success(j.message)
      if (selectedRemote.value === name) selectedRemote.value = ''
      await loadRcloneRemotes()
    } else {
      message.error('删除失败：' + (j.error || '未知错误'))
    }
  } catch (e: any) {
    message.error('请求失败：' + e.message)
  }
}

/* ============== 状态 ============== */
const isRunning = ref(false)
const logs = ref<Array<{ type: 'log' | 'err' | 'system'; text: string; ts: number }>>([])
const result = ref<{ code: number | null; ok: boolean; msg: string } | null>(null)

onMounted(async () => {
  store.refresh()
  uploadTimeout.value = store.settings.uploadTimeout || 600
  maxFileSizeMB.value = store.settings.maxFileSizeMB || 500
  await loadRcloneRemotes()
  // 恢复上次选择的渠道
  const saved = store.settings.defaultChannel
  if (saved && rcloneRemotes.value.some(r => r.name === saved)) {
    selectedRemote.value = saved
  }
})

function pushLog(type: 'log' | 'err' | 'system', text: string) {
  logs.value.push({ type, text, ts: Date.now() })
  if (logs.value.length > 1000) logs.value = logs.value.slice(-1000)
}

function clearLogs() {
  logs.value = []
  result.value = null
}

function selectChannel(name: string) {
  selectedRemote.value = name
  const s = { ...store.settings }
  s.defaultChannel = name
  store.save(s)
}

function saveUploadSettings() {
  const s = { ...store.settings }
  s.uploadTimeout = uploadTimeout.value
  s.maxFileSizeMB = maxFileSizeMB.value
  store.save(s)
  message.success('上传设置已保存')
}

/* ============== rclone 备份 ============== */
async function startBackup() {
  if (isRunning.value) {
    message.warning('已有备份在运行中')
    return
  }
  if (!selectedRemote.value) {
    message.error('请先选择渠道')
    return
  }
  clearLogs()
  isRunning.value = true
  result.value = null
  pushLog('system', `▶️ 启动备份 → ${selectedRemote.value}:${rclonePath.value}`)

  try {
    const token = getToken() || ''
    const params = new URLSearchParams({
      remote: selectedRemote.value,
      path: rclonePath.value,
      keepVersions: String(keepVersions.value),
      ghToken: token,
      ghProxyEnabled: String(!!store.settings.ghProxyEnabled),
      ghProxyUrl: store.settings.ghProxyUrl || '',
      uploadTimeout: String(uploadTimeout.value),
      maxFileSizeMB: String(maxFileSizeMB.value),
    })
    const res = await fetch(`/__rclone-backup?${params}`, { method: 'POST' })
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
      pushLog('system', '⏸ 备份已停止')
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

onBeforeUnmount(() => {})
</script>

<template>
  <AdminLayout>
    <div class="backup-page">
      <div class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">📡</span>渠道备份</h2>
          <p class="page-desc">通过 rclone 将数据备份到云盘，支持 WebDAV、OneDrive、Google Drive 等</p>
        </div>
      </div>

      <!-- 上传设置 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon card-icon-purple">⚙️</div>
          <div>
            <h3 class="card-title">上传设置</h3>
            <p class="card-desc">控制备份文件的超时和大小限制</p>
          </div>
        </header>

        <div class="form-grid-2">
          <div class="field">
            <label class="field-label">文件超时时间</label>
            <NSelect v-model:value="uploadTimeout" :options="timeoutOptions" size="large" />
            <p class="field-hint">单个文件上传超过此时间将自动跳过，开始处理下一个文件</p>
          </div>
          <div class="field">
            <label class="field-label">文件大小限制</label>
            <NSelect v-model:value="maxFileSizeMB" :options="fileSizeOptions" size="large" />
            <p class="field-hint">超过此大小的文件将自动跳过，不进行下载和上传</p>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn btn-primary" @click="saveUploadSettings">保存设置</button>
        </div>
      </section>

      <!-- 渠道配置 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">☁️</div>
          <div>
            <h3 class="card-title">云盘渠道</h3>
            <p class="card-desc">配置要备份到的云盘渠道</p>
          </div>
        </header>

        <!-- 已配置的渠道列表 -->
        <div v-if="rcloneRemotes.length > 0" class="channel-grid">
          <div
            v-for="remote in rcloneRemotes"
            :key="remote.name"
            class="channel-card"
            :class="{ active: selectedRemote === remote.name }"
            @click="selectChannel(remote.name)"
          >
            <div class="channel-card-top">
              <div class="channel-card-icon" :class="`icon-${remote.type}`">
                {{ remote.type === 'webdav' ? '☁️' : remote.type === 'onedrive' ? '📁' : remote.type === 'drive' ? '📗' : '💾' }}
              </div>
              <div class="channel-card-actions">
                <button class="btn-icon" @click.stop="editChannel(remote.name)" title="编辑">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn-icon btn-icon-danger" @click.stop="deleteChannel(remote.name)" title="删除">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
            <div class="channel-card-name">{{ remote.name }}</div>
            <div class="channel-card-type">{{ remote.type }}</div>
            <div v-if="selectedRemote === remote.name" class="channel-card-check">✓</div>
          </div>

          <div class="channel-card channel-card-add" @click="openNewChannelForm">
            <div class="channel-card-add-icon">+</div>
            <div class="channel-card-name">添加渠道</div>
          </div>
        </div>

        <div v-if="rcloneRemotes.length === 0" class="rclone-empty">
          <div class="rclone-empty-icon">📂</div>
          <p class="rclone-empty-title">还没有配置任何渠道</p>
          <p class="rclone-empty-desc">添加一个云盘渠道开始备份</p>
          <button class="btn btn-primary" @click="openNewChannelForm">+ 添加第一个渠道</button>
        </div>

        <!-- 选择渠道和路径 -->
        <div v-if="rcloneRemotes.length > 0" class="form-grid-2" style="margin-top: 20px;">
          <div class="field">
            <label class="field-label">当前渠道</label>
            <NSelect
              v-model:value="selectedRemote"
              :options="rcloneRemotes.map(r => ({ label: r.name, value: r.name }))"
              placeholder="选择渠道"
              size="large"
              @update:value="selectChannel"
            />
          </div>
          <div class="field">
            <label class="field-label">远程路径</label>
            <NInput v-model:value="rclonePath" placeholder="/SoftwareHub" size="large" />
          </div>
        </div>

        <div v-if="rcloneRemotes.length > 0" class="card-actions">
          <button class="btn btn-primary" @click="testRcloneConnection" :disabled="rcloneTesting || !selectedRemote">
            {{ rcloneTesting ? '测试中...' : '测试连接' }}
          </button>
          <button class="btn btn-ghost" @click="loadRcloneRemotes">刷新列表</button>
        </div>
      </section>

      <!-- 渠道配置弹窗 -->
      <Teleport to="body">
        <div v-if="channelFormVisible" class="modal-overlay" @click.self="channelFormVisible = false">
          <div class="modal-content">
            <div class="modal-header">
              <h3>{{ editingChannel ? '编辑渠道' : '添加渠道' }}</h3>
              <button class="modal-close" @click="channelFormVisible = false">&times;</button>
            </div>
            <div class="modal-body">
              <div class="form-grid-2">
                <div class="field">
                  <label class="field-label">渠道名称 <span class="required">*</span></label>
                  <NInput
                    v-model:value="channelForm.name"
                    :disabled="!!editingChannel"
                    placeholder="如 jianguoyun、onedrive"
                    size="large"
                  />
                  <p class="field-hint">只能包含字母、数字、下划线和连字符</p>
                </div>
                <div class="field">
                  <label class="field-label">渠道类型 <span class="required">*</span></label>
                  <NSelect
                    v-model:value="channelForm.type"
                    :options="channelTypes"
                    :disabled="!!editingChannel"
                    size="large"
                  />
                </div>
              </div>

              <!-- WebDAV 配置 -->
              <template v-if="channelForm.type === 'webdav'">
                <div class="form-section-title">WebDAV 配置</div>
                <div class="form-grid-2">
                  <div class="field">
                    <label class="field-label">服务地址 <span class="required">*</span></label>
                    <NInput v-model:value="channelForm.config.url" placeholder="https://dav.jianguoyun.com/dav/" size="large" />
                  </div>
                  <div class="field">
                    <label class="field-label">厂商</label>
                    <NSelect v-model:value="channelForm.config.vendor" :options="webdavVendors" size="large" />
                  </div>
                  <div class="field">
                    <label class="field-label">用户名 <span class="required">*</span></label>
                    <NInput v-model:value="channelForm.config.user" placeholder="WebDAV 账号" size="large" />
                  </div>
                  <div class="field">
                    <label class="field-label">密码 <span class="required">*</span></label>
                    <NInput v-model:value="channelForm.config.pass" type="password" placeholder="WebDAV 密码" size="large" />
                  </div>
                </div>
              </template>

              <!-- OneDrive 配置 -->
              <template v-if="channelForm.type === 'onedrive'">
                <div class="form-section-title">OneDrive 配置</div>
                <div class="rclone-tip">
                  <p>💡 配置步骤：<br>
                  1. 先填写渠道名称（如 <code>onedrive</code>）并点击保存<br>
                  2. 打开终端，运行 <code>rclone config</code><br>
                  3. 按提示选择 <code>onedrive</code> → 完成 OAuth 授权<br>
                  4. 完成后运行 <code>rclone listremotes -v</code> 查看配置<br>
                  5. 将 token 和 drive_id 填入下方</p>
                </div>
                <div class="form-grid-2" style="margin-top: 12px;">
                  <div class="field">
                    <label class="field-label">账户类型</label>
                    <NSelect v-model:value="channelForm.config.drive_type" :options="[
                      { label: 'OneDrive 个人版', value: 'personal' },
                      { label: 'OneDrive 商业版', value: 'business' },
                      { label: 'SharePoint', value: 'sharepoint' },
                    ]" size="large" />
                  </div>
                  <div class="field">
                    <label class="field-label">Drive ID <span class="required">*</span></label>
                    <NInput v-model:value="channelForm.config.drive_id" placeholder="你的 OneDrive drive_id" size="large" />
                    <p class="field-hint">运行 <code>rclone listremotes -v</code> 可查看</p>
                  </div>
                </div>
                <div class="form-grid-2">
                  <div class="field">
                    <label class="field-label">Client ID</label>
                    <NInput v-model:value="channelForm.config.client_id" placeholder="可留空（使用 rclone 默认）" size="large" />
                  </div>
                  <div class="field">
                    <label class="field-label">Client Secret</label>
                    <NInput v-model:value="channelForm.config.client_secret" type="password" placeholder="可留空（使用 rclone 默认）" size="large" />
                  </div>
                </div>
                <div class="field" style="margin-top: 12px;">
                  <label class="field-label">Token（JSON）<span class="required">*</span></label>
                  <NInput v-model:value="channelForm.config.token" type="textarea" :rows="4" placeholder='粘贴 rclone authorize 输出的 JSON' size="large" />
                </div>
              </template>

              <!-- Google Drive 配置 -->
              <template v-if="channelForm.type === 'drive'">
                <div class="form-section-title">Google Drive 配置</div>
                <div class="rclone-tip">
                  <p>💡 配置步骤：<br>
                  1. 先填写渠道名称（如 <code>gdrive</code>）并点击保存<br>
                  2. 在终端运行 <code>rclone authorize drive</code><br>
                  3. 浏览器会自动打开 Google 登录页面，完成授权<br>
                  4. 终端会输出一段 JSON token，复制后粘贴到下方<br>
                  5. 再次点击保存</p>
                </div>
                <div class="form-grid-2" style="margin-top: 12px;">
                  <div class="field">
                    <label class="field-label">Client ID</label>
                    <NInput v-model:value="channelForm.config.client_id" placeholder="可留空" size="large" />
                  </div>
                  <div class="field">
                    <label class="field-label">Client Secret</label>
                    <NInput v-model:value="channelForm.config.client_secret" type="password" placeholder="可留空" size="large" />
                  </div>
                </div>
                <div class="field" style="margin-top: 12px;">
                  <label class="field-label">Token（JSON）</label>
                  <NInput v-model:value="channelForm.config.token" type="textarea" :rows="3" placeholder='{"access_token":"..."}' size="large" />
                </div>
              </template>

              <!-- S3 配置 -->
              <template v-if="channelForm.type === 's3'">
                <div class="form-section-title">S3 兼容存储配置</div>
                <div class="form-grid-2">
                  <div class="field">
                    <label class="field-label">提供商</label>
                    <NSelect v-model:value="channelForm.config.provider" :options="[
                      { label: 'AWS', value: 'AWS' },
                      { label: '阿里云 OSS', value: 'Alibaba' },
                      { label: '腾讯云 COS', value: 'Tencent' },
                      { label: 'MinIO', value: 'MinIO' },
                    ]" size="large" />
                  </div>
                  <div class="field">
                    <label class="field-label">区域</label>
                    <NInput v-model:value="channelForm.config.region" placeholder="如 oss-cn-beijing" size="large" />
                  </div>
                  <div class="field">
                    <label class="field-label">Access Key ID <span class="required">*</span></label>
                    <NInput v-model:value="channelForm.config.access_key_id" size="large" />
                  </div>
                  <div class="field">
                    <label class="field-label">Secret Access Key <span class="required">*</span></label>
                    <NInput v-model:value="channelForm.config.secret_access_key" type="password" size="large" />
                  </div>
                  <div class="field" style="grid-column: span 2;">
                    <label class="field-label">端点</label>
                    <NInput v-model:value="channelForm.config.endpoint" placeholder="如 oss-cn-beijing.aliyuncs.com" size="large" />
                  </div>
                </div>
              </template>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" @click="channelFormVisible = false">取消</button>
              <button class="btn btn-primary" @click="saveChannelConfig" :disabled="channelSaving">
                {{ channelSaving ? '保存中...' : '保存' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- 备份操作 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon card-icon-orange">🚀</div>
          <div>
            <h3 class="card-title">备份操作</h3>
            <p class="card-desc">选择渠道和参数，点击按钮启动备份</p>
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
          <button
            class="btn btn-primary btn-large"
            :disabled="isRunning || !selectedRemote"
            @click="startBackup"
          >
            <span v-if="isRunning" class="btn-spinner"></span>
            {{ isRunning ? '备份中...' : `开始备份 → ${selectedRemote || '未选择'}` }}
          </button>
          <button
            class="btn btn-warning btn-large"
            :disabled="!isRunning"
            @click="stopBackup"
          >
            ⏸ 停止
          </button>
        </div>

        <div v-if="result" class="result-bar" :class="result.ok ? 'result-ok' : 'result-err'">
          <span class="result-icon">{{ result.ok ? '✓' : '✗' }}</span>
          <span>{{ result.msg }}</span>
        </div>
      </section>

      <!-- 实时日志 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon card-icon-green">📜</div>
          <div>
            <h3 class="card-title">实时日志</h3>
            <p class="card-desc">备份过程的实时输出</p>
          </div>
        </header>

        <div class="log-box">
          <div v-if="logs.length === 0" class="log-empty">
            <div class="log-empty-icon">📋</div>
            <p>暂无日志</p>
            <p class="log-empty-hint">点击上方「开始备份」按钮启动</p>
          </div>
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
.backup-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
  padding-left: 25px;
  padding-right: 25px;
}

/* ============== 卡片 ============== */
.settings-card {
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  padding: 24px;
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}
.settings-card:hover {
  box-shadow: var(--admin-shadow-card-hover);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.card-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--admin-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  flex-shrink: 0;
  box-shadow: 0 6px 20px rgba(79, 140, 255, 0.28);
  color: #FFFFFF;
}
.card-icon-orange {
  background: linear-gradient(135deg, #f59e0b, #fb923c);
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.28);
}
.card-icon-green {
  background: linear-gradient(135deg, #3CB371, #2ecc71);
  box-shadow: 0 6px 20px rgba(60, 179, 113, 0.28);
}
.card-icon-purple {
  background: linear-gradient(135deg, #8C6CFF, #a78bfa);
  box-shadow: 0 6px 20px rgba(140, 108, 255, 0.28);
}

.card-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 2px;
}
.card-desc {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  margin: 0;
}

/* ============== 渠道卡片网格 ============== */
.channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}

.channel-card {
  position: relative;
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: 18px;
  padding: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.channel-card:hover {
  border-color: rgba(79, 140, 255, 0.3);
  box-shadow: 0 4px 20px rgba(79, 140, 255, 0.08);
  transform: translateY(-2px);
}
.channel-card.active {
  background: linear-gradient(135deg, rgba(79, 140, 255, 0.06), rgba(140, 108, 255, 0.06));
  border-color: rgba(79, 140, 255, 0.35);
  box-shadow: 0 4px 24px rgba(79, 140, 255, 0.12);
}

.channel-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.channel-card-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  background: var(--admin-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.icon-webdav { background: linear-gradient(135deg, #e0f2fe, #bae6fd); }
.icon-onedrive { background: linear-gradient(135deg, #dbeafe, #bfdbfe); }
.icon-drive { background: linear-gradient(135deg, #dcfce7, #bbf7d0); }
.icon-s3 { background: linear-gradient(135deg, #fef3c7, #fde68a); }

.channel-card-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.channel-card:hover .channel-card-actions {
  opacity: 1;
}

.btn-icon {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 6px;
  cursor: pointer;
  color: var(--text-sec);
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-icon:hover {
  background: var(--admin-card);
  color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.btn-icon-danger:hover {
  color: var(--color-error);
}

.channel-card-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 2px;
}
.channel-card-type {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.channel-card-check {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(52, 120, 246, 0.3);
}

.channel-card-add {
  border-style: dashed;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 120px;
}
.channel-card-add:hover {
  border-color: var(--color-primary);
  background: rgba(52, 120, 246, 0.04);
}
.channel-card-add-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--admin-card);
  border: 2px dashed var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: var(--text-sec);
  transition: all 0.2s ease;
}
.channel-card-add:hover .channel-card-add-icon {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: rgba(52, 120, 246, 0.08);
}

/* ============== 空状态 ============== */
.rclone-empty {
  text-align: center;
  padding: 40px 20px;
}
.rclone-empty-icon {
  font-size: 3rem;
  margin-bottom: 12px;
  opacity: 0.6;
}
.rclone-empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 0 0 4px;
}
.rclone-empty-desc {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  margin: 0 0 20px;
}

/* ============== 表单 ============== */
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
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-sec);
}
.field-hint {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin: 2px 0 0;
}
.field-hint code {
  font-family: var(--font-mono);
  background: var(--color-card-soft);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.72rem;
  color: var(--color-primary);
}

.required { color: var(--color-error); }

/* ============== 按钮 ============== */
.btn {
  padding: 10px 20px;
  border-radius: var(--admin-radius-btn);
  border: 0;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--admin-gradient);
  color: #fff;
  box-shadow: 0 4px 14px rgba(79, 140, 255, 0.3);
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 140, 255, 0.4);
}
.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}
.btn-ghost {
  background: var(--color-card-soft);
  color: var(--text-main);
  border: 1px solid var(--border-strong);
}
.btn-ghost:hover:not(:disabled) {
  background: var(--color-bg);
}
.btn-warning {
  background: linear-gradient(135deg, #f59e0b, #fb923c);
  color: #fff;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
}
.btn-warning:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
}
.btn-large {
  height: 48px;
  padding: 0 32px;
  font-size: 1rem;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.card-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}

.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}
.action-buttons .btn { flex: 1; min-width: 0; }

/* ============== 代理状态 ============== */
.proxy-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  margin-bottom: 16px;
  font-size: 0.88rem;
  font-weight: 500;
}
.proxy-on {
  background: rgba(60, 179, 113, 0.08);
  color: #16a34a;
}
.proxy-off {
  background: rgba(234, 179, 8, 0.1);
  color: #ca8a04;
}
.proxy-icon { font-size: 1.1rem; }
.proxy-label { flex: 1; }
.proxy-link {
  color: var(--color-primary);
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 600;
}
.proxy-link:hover { text-decoration: underline; }

/* ============== 结果条 ============== */
.result-bar {
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 500;
}
.result-ok {
  background: rgba(60, 179, 113, 0.08);
  color: #16a34a;
}
.result-err {
  background: rgba(255, 107, 107, 0.08);
  color: #dc2626;
}
.result-icon { font-weight: 700; }

/* ============== 日志 ============== */
.log-box {
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 14px;
  padding: 16px 18px;
  height: 420px;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
}
.log-empty {
  color: #666;
  text-align: center;
  padding: 60px 0;
}
.log-empty-icon {
  font-size: 2.5rem;
  margin-bottom: 12px;
  opacity: 0.5;
}
.log-empty p {
  margin: 4px 0;
  font-size: 0.9rem;
}
.log-empty-hint {
  font-size: 0.8rem !important;
  color: #555 !important;
}
.log-line {
  display: flex;
  gap: 10px;
  white-space: pre-wrap;
  word-break: break-all;
}
.log-time {
  color: #555;
  flex-shrink: 0;
  font-size: 0.8em;
}
.log-text { flex: 1; }
.log-log .log-text { color: #d4d4d4; }
.log-err .log-text { color: #f87171; }
.log-system .log-text { color: #5b9bff; font-weight: 500; }

.log-box::-webkit-scrollbar { width: 6px; }
.log-box::-webkit-scrollbar-track { background: transparent; }
.log-box::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
.log-box::-webkit-scrollbar-thumb:hover { background: #555; }

/* ============== 提示框 ============== */
.rclone-tip {
  background: rgba(52, 120, 246, 0.06);
  border: 1px solid rgba(52, 120, 246, 0.15);
  border-radius: 12px;
  padding: 14px 18px;
  margin-bottom: 16px;
  font-size: 0.85rem;
  color: var(--color-primary);
  line-height: 1.7;
}
.rclone-tip p { margin: 0; }
.rclone-tip code {
  background: rgba(52, 120, 246, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.82rem;
}

/* ============== 弹窗 ============== */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.modal-content {
  background: var(--admin-card);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 640px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
  animation: modalIn 0.2s ease;
}
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--admin-border);
}
.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
}
.modal-close {
  background: transparent;
  border: 0;
  font-size: 1.5rem;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  line-height: 1;
  transition: all 0.15s ease;
}
.modal-close:hover {
  background: rgba(255, 107, 107, 0.1);
  color: var(--color-error);
}
.modal-body {
  padding: 24px;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--admin-border);
}

.form-section-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 20px 0 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--admin-border);
}

/* ============== 备份参数 ============== */
.backup-params {
  margin-bottom: 16px;
}

/* ============== 响应式 ============== */
@media (max-width: 768px) {
  .backup-page { padding-left: 16px; padding-right: 16px; }
  .settings-card { padding: 20px; border-radius: 20px; }
  .channel-grid { grid-template-columns: 1fr 1fr; }
  .modal-content { max-width: 100%; }
  .action-buttons { flex-direction: column; }
  .btn-large { width: 100%; }
}
</style>
