import { Plugin } from 'vite'
import { spawn } from 'child_process'
import { resolve } from 'path'

/**
 * Vite dev 中间件：本地 WebDAV 备份
 *  - POST /__local-backup-config  接收前端传的 webdav 配置（写入子进程 env）
 *  - POST /__local-backup         触发 backupVersion 备份流程（SSE 推日志）
 *
 *  复用 scripts/sync-backup.mjs 的全部备份逻辑，通过 LOCAL_MODE=1 跳过 commit/push
 */
export function localBackupPlugin(): Plugin {
  let savedConfig: { url: string; username: string; password: string; baseDir: string; maxFileSize: number; uploadTimeout: number; ghToken: string; ghProxyEnabled: boolean; ghProxyUrl: string } | null = null
  let running = false
  let currentChild: import('child_process').ChildProcess | null = null

  return {
    name: 'local-backup',
    configureServer(server) {
      /* 接收 webdav 配置 */
      server.middlewares.use('/__local-backup-config', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          try {
            const cfg = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
            if (!cfg.url || !cfg.username || !cfg.password) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'url/username/password 不能为空' }))
              return
            }
            savedConfig = cfg
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (e: any) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: e.message }))
          }
        })
      })

      /* 查询配置状态 */
      server.middlewares.use('/__local-backup-status', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ configured: !!savedConfig, running }))
      })

      /* 停止正在运行的备份（Windows 不支持 SIGSTOP 真正暂停，只能 kill 子进程；再次开始时会自动跳过已备份版本） */
      server.middlewares.use('/__local-backup-stop', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        res.setHeader('Content-Type', 'application/json')
        if (!currentChild || !running) {
          res.end(JSON.stringify({ ok: false, error: '没有正在运行的备份' }))
          return
        }
        const pid = currentChild.pid
        try {
          /* Windows 上 SIGTERM 会被 Node.js 模拟为 taskkill /F（强杀） */
          currentChild.kill('SIGTERM')
          /* 兜底：500ms 内未退出，SIGKILL 强杀 */
          setTimeout(() => {
            if (currentChild && !currentChild.killed) {
              try { currentChild.kill('SIGKILL') } catch { /* noop */ }
            }
          }, 500)
          res.end(JSON.stringify({ ok: true, pid, message: '已发送停止信号（Windows 实际为终止子进程）' }))
        } catch (e: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ ok: false, error: e.message }))
        }
      })

      /* 触发备份：SSE 流式推送日志 */
      server.middlewares.use('/__local-backup', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        if (!savedConfig) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: '请先配置 WebDAV' }))
          return
        }
        if (running) {
          res.statusCode = 409
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: '已有备份在运行中' }))
          return
        }

        running = true
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.flushHeaders()

        const send = (data: any) => {
          res.write(`data: ${JSON.stringify(data)}\n\n`)
        }

        /* 解析 query：可指定 KEEP_VERSIONS 默认 2（与 GitHub Actions 一致） */
        const url = new URL(req.url || '/', 'http://localhost')
        const keepVersions = url.searchParams.get('keepVersions') || '2'

        const env: NodeJS.ProcessEnv = {
          ...process.env,
          LOCAL_MODE: '1',
          WEBDAV_URL: savedConfig.url,
          WEBDAV_USERNAME: savedConfig.username,
          WEBDAV_PASSWORD: savedConfig.password,
          WEBDAV_BASE_DIR: savedConfig.baseDir || '/SoftwareHub',
          MAX_FILE_SIZE_MB: String(savedConfig.maxFileSize || 500),
          WEBDAV_TIMEOUT: String((savedConfig.uploadTimeout || 300) * 1000),
          KEEP_VERSIONS: keepVersions,
          GH_TOKEN: savedConfig.ghToken || '',
          /* 加速设置 → GitHub 代理：开启后所有 GitHub Release 下载走代理 */
          ...(savedConfig.ghProxyEnabled && savedConfig.ghProxyUrl
            ? { GH_PROXY: savedConfig.ghProxyUrl }
            : {}),
        }

        const scriptPath = resolve(__dirname, 'scripts/sync-backup.mjs')
        const child = spawn('node', [scriptPath], {
          env,
          cwd: resolve(__dirname, '.'),
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        currentChild = child

        send({ type: 'start', pid: child.pid, keepVersions })

        let stdoutBuf = ''
        let stderrBuf = ''
        child.stdout.on('data', (chunk) => {
          const text = chunk.toString('utf-8')
          stdoutBuf += text
          /* 尝试按行切分推送 */
          const lines = stdoutBuf.split('\n')
          stdoutBuf = lines.pop() || ''
          for (const line of lines) {
            if (line.trim()) send({ type: 'log', line: line.replace(/\x1b\[[0-9;]*m/g, '') })
          }
        })
        child.stderr.on('data', (chunk) => {
          const text = chunk.toString('utf-8')
          stderrBuf += text
          const lines = stderrBuf.split('\n')
          stderrBuf = lines.pop() || ''
          for (const line of lines) {
            if (line.trim()) send({ type: 'err', line: line.replace(/\x1b\[[0-9;]*m/g, '') })
          }
        })
        child.on('close', (code, signal) => {
          if (stdoutBuf.trim()) send({ type: 'log', line: stdoutBuf.trim() })
          if (stderrBuf.trim()) send({ type: 'err', line: stderrBuf.trim() })
          send({ type: 'done', code, signal })
          res.end()
          running = false
          currentChild = null
        })
        child.on('error', (err) => {
          send({ type: 'error', message: err.message })
          res.end()
          running = false
          currentChild = null
        })

        /* 客户端断开时杀子进程 */
        req.on('close', () => {
          if (!child.killed) {
            try { child.kill() } catch { /* noop */ }
          }
        })
      })
    },
  }
}
