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
  await loadRcloneRemotes()
})

function pushLog(type: 'log' | 'err' | 'system', text: string) {
  logs.value.push({ type, text, ts: Date.now() })
  if (logs.value.length > 1000) logs.value = logs.value.slice(-1000)
}

function clearLogs() {
  logs.value = []
  result.value = null
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
    <div class="channel-page">
      <div class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">📡</span>渠道备份</h2>
          <p class="page-desc">通过 rclone 将数据备份到云盘，支持 WebDAV、OneDrive、Google Drive 等</p>
        </div>
      </div>

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
        <div v-if="rcloneRemotes.length > 0" class="channel-list">
          <div class="channel-list-header">
            <span class="channel-list-title">已配置的渠道</span>
            <button class="btn-primary small" @click="openNewChannelForm">+ 添加渠道</button>
          </div>
          <div class="channel-items">
            <div
              v-for="remote in rcloneRemotes"
              :key="remote.name"
              class="channel-item"
              :class="{ active: selectedRemote === remote.name }"
              @click="selectedRemote = remote.name"
            >
              <div class="channel-item-icon">
                {{ remote.type === 'webdav' ? '☁️' : remote.type === 'onedrive' ? '📁' : remote.type === 'drive' ? '📗' : '💾' }}
              </div>
              <div class="channel-item-info">
                <div class="channel-item-name">{{ remote.name }}</div>
                <div class="channel-item-type">{{ remote.type }}</div>
              </div>
              <div class="channel-item-actions">
                <button class="btn-icon" @click.stop="editChannel(remote.name)" title="编辑">✏️</button>
                <button class="btn-icon btn-danger" @click.stop="deleteChannel(remote.name)" title="删除">🗑️</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="rcloneRemotes.length === 0" class="rclone-empty">
          <p>还没有配置任何渠道</p>
          <button class="btn-primary" @click="openNewChannelForm">+ 添加第一个渠道</button>
        </div>

        <!-- 选择渠道和路径 -->
        <div class="form-grid-2" style="margin-top: 16px;">
          <div class="field">
            <label class="field-label">选择渠道</label>
            <NSelect
              v-model:value="selectedRemote"
              :options="rcloneRemotes.map(r => ({ label: r.name, value: r.name }))"
              placeholder="选择渠道"
              size="large"
            />
          </div>
          <div class="field">
            <label class="field-label">远程路径</label>
            <NInput v-model:value="rclonePath" placeholder="/SoftwareHub" size="large" />
          </div>
        </div>

        <div class="rclone-actions">
          <button class="btn-primary" @click="testRcloneConnection" :disabled="rcloneTesting || !selectedRemote">
            {{ rcloneTesting ? '测试中...' : '测试连接' }}
          </button>
          <button class="btn-secondary" @click="loadRcloneRemotes">刷新列表</button>
        </div>
      </section>

      <!-- 渠道配置弹窗 -->
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
                2. 打开终端，运行以下命令：<br>
                <code>rclone config</code><br>
                3. 按提示选择 <code>onedrive</code> → 完成 OAuth 授权<br>
                4. 完成后运行 <code>rclone listremotes -v</code> 查看配置<br>
                5. 或者直接运行 <code>rclone authorize onedrive</code> 获取 token<br>
                6. 将 token 和 drive_id 填入下方</p>
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
                2. 在终端运行以下命令获取 token：<br>
                <code>rclone authorize drive</code><br>
                3. 浏览器会自动打开 Google 登录页面，完成授权<br>
                4. 终端会输出一段 JSON token，复制后粘贴到下方「Token」字段<br>
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
            <button class="btn-secondary" @click="channelFormVisible = false">取消</button>
            <button class="btn-primary" @click="saveChannelConfig" :disabled="channelSaving">
              {{ channelSaving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 备份操作 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">🚀</div>
          <div>
            <h3 class="card-title">备份操作</h3>
            <p class="card-desc">点击下方按钮启动备份，实时显示运行日志</p>
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
            class="btn-primary big"
            :disabled="isRunning || !selectedRemote"
            @click="startBackup"
          >
            {{ isRunning ? '备份中...' : `开始备份 → ${selectedRemote || '未选择'}` }}
          </button>
          <button
            class="btn-warning big"
            :disabled="!isRunning"
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
          <div v-if="logs.length === 0" class="log-empty">暂无日志，点击上方按钮启动</div>
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

.rclone-actions,
.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary,
.btn-warning {
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

/* 渠道列表 */
.channel-list {
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  overflow: hidden;
}
.channel-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(52, 120, 246, 0.05);
  border-bottom: 1px solid var(--admin-border);
}
.channel-list-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--admin-text);
}
.channel-items {
  display: flex;
  flex-direction: column;
}
.channel-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--admin-border);
  cursor: pointer;
  transition: background 0.15s ease;
}
.channel-item:last-child { border-bottom: none; }
.channel-item:hover { background: rgba(52, 120, 246, 0.05); }
.channel-item.active {
  background: rgba(52, 120, 246, 0.1);
  border-left: 3px solid #3478f6;
}
.channel-item-icon { font-size: 24px; }
.channel-item-info { flex: 1; }
.channel-item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--admin-text);
}
.channel-item-type {
  font-size: 12px;
  color: var(--admin-text-2);
}
.channel-item-actions {
  display: flex;
  gap: 4px;
}
.btn-icon {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s ease;
}
.btn-icon:hover { background: rgba(52, 120, 246, 0.1); }
.btn-icon.btn-danger:hover { background: rgba(239, 68, 68, 0.1); }
.btn-primary.small {
  padding: 6px 12px;
  font-size: 13px;
}

.rclone-tip {
  background: rgba(52, 120, 246, 0.08);
  border: 1px solid rgba(52, 120, 246, 0.2);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #3478f6;
}
.rclone-tip p { margin: 0; }
.rclone-tip code {
  background: rgba(52, 120, 246, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
}

.rclone-empty {
  text-align: center;
  padding: 20px;
  color: var(--admin-text-2);
  font-size: 14px;
}
.rclone-empty p { margin: 4px 0 12px; }

/* 弹窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: var(--admin-card);
  border-radius: 12px;
  width: 90%;
  max-width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
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
  font-size: 18px;
  font-weight: 600;
  color: var(--admin-text);
}
.modal-close {
  background: transparent;
  border: 0;
  font-size: 24px;
  color: var(--admin-text-2);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.modal-close:hover { background: rgba(239, 68, 68, 0.1); color: #dc2626; }
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
  font-size: 14px;
  font-weight: 600;
  color: var(--admin-text);
  margin: 16px 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--admin-border);
}
.required { color: #dc2626; }
.field-hint {
  font-size: 12px;
  color: var(--admin-text-2);
  margin: 4px 0 0;
}
</style>
