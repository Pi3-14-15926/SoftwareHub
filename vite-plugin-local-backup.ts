import { Plugin } from 'vite'
import { spawn, execSync } from 'child_process'
import { resolve } from 'path'
import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Vite dev 中间件：rclone 备份
 *  - POST /__local-backup-stop    停止正在运行的备份
 *  - GET  /__rclone-config        读取 rclone.conf 配置
 *  - POST /__rclone-config        写入 rclone.conf 配置
 *  - DELETE /__rclone-config      删除 rclone 远程存储
 *  - POST /__rclone-test          测试 rclone 远程存储连接
 *  - POST /__rclone-backup        触发 rclone 备份流程（SSE 推日志）
 */
export function localBackupPlugin(): Plugin {
  let running = false
  let currentChild: import('child_process').ChildProcess | null = null

  /** 获取 rclone 可执行文件路径 */
  function getRclonePath(): string {
    const localPath = resolve(__dirname, 'scripts/bin/rclone.exe')
    if (fs.existsSync(localPath)) return localPath
    try {
      if (process.platform === 'win32') {
        return execSync('where rclone', { encoding: 'utf-8' }).trim().split('\n')[0]
      }
      return execSync('which rclone', { encoding: 'utf-8' }).trim()
    } catch {
      throw new Error('未找到 rclone')
    }
  }

  /** 获取 rclone.conf 文件路径 */
  function getRcloneConfPath(): string {
    // 优先使用项目目录下的 rclone.conf
    const localPath = resolve(__dirname, 'rclone.conf')
    if (fs.existsSync(localPath)) return localPath
    // 否则使用系统默认路径
    if (process.platform === 'win32') {
      return path.join(os.homedir(), 'AppData', 'Roaming', 'rclone', 'rclone.conf')
    }
    return path.join(os.homedir(), '.config', 'rclone', 'rclone.conf')
  }

  /** 解析请求体 JSON */
  function parseBody(req: import('http').IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
        } catch (e: any) {
          reject(e)
        }
      })
      req.on('error', reject)
    })
  }

  /** 读取 rclone.conf 并解析为对象 */
  function readRcloneConf(): Record<string, Record<string, string>> {
    const confPath = getRcloneConfPath()
    const config: Record<string, Record<string, string>> = {}
    if (!fs.existsSync(confPath)) return config
    const content = fs.readFileSync(confPath, 'utf-8')
    let currentSection = ''
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue
      const sectionMatch = trimmed.match(/^\[(.+)\]$/)
      if (sectionMatch) {
        currentSection = sectionMatch[1]
        config[currentSection] = {}
        continue
      }
      if (currentSection) {
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim()
          const value = trimmed.slice(eqIdx + 1).trim()
          config[currentSection][key] = value
        }
      }
    }
    return config
  }

  /** 写入 rclone.conf */
  function writeRcloneConf(config: Record<string, Record<string, string>>): void {
    const confPath = getRcloneConfPath()
    const dir = path.dirname(confPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    let content = '; SoftwareHub rclone 配置文件\n'
    content += '; 此文件由管理后台自动生成，请勿手动编辑\n\n'
    for (const [section, values] of Object.entries(config)) {
      content += `[${section}]\n`
      for (const [key, value] of Object.entries(values)) {
        content += `${key} = ${value}\n`
      }
      content += '\n'
    }
    fs.writeFileSync(confPath, content, 'utf-8')
  }

  /** 使用 rclone obscure 加密密码 */
  function obscurePassword(password: string): string {
    try {
      const rclone = getRclonePath()
      const result = execSync(`${rclone} obscure "${password}"`, { encoding: 'utf-8', timeout: 5000 })
      return result.trim()
    } catch {
      // 如果 obscure 失败，返回原始密码（rclone 会尝试明文）
      return password
    }
  }

  return {
    name: 'local-backup',
    configureServer(server) {
      /* 停止正在运行的备份 */
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
          currentChild.kill('SIGTERM')
          setTimeout(() => {
            if (currentChild && !currentChild.killed) {
              try { currentChild.kill('SIGKILL') } catch { /* noop */ }
            }
          }, 500)
          res.end(JSON.stringify({ ok: true, pid, message: '已发送停止信号' }))
        } catch (e: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ ok: false, error: e.message }))
        }
      })

      /* ============== rclone 功能 ============== */

      /* 读取 rclone.conf 配置 */
      server.middlewares.use('/__rclone-config', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          // 读取配置
          const config = readRcloneConf()
          const confPath = getRcloneConfPath()
          const remotes = Object.entries(config).map(([name, values]) => ({
            name,
            type: values.type || 'unknown',
            // 不返回密码明文
            config: Object.fromEntries(
              Object.entries(values).filter(([k]) => k !== 'pass')
            ),
          }))
          res.end(JSON.stringify({ ok: true, remotes, confPath }))
          return
        }

        if (req.method === 'POST') {
          // 写入配置
          parseBody(req).then(body => {
            const { name, type, config: remoteConfig } = body
            if (!name || !type) {
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: '名称和类型不能为空' }))
              return
            }

            // 验证名称格式（只能包含字母、数字、下划线、连字符）
            if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: '名称只能包含字母、数字、下划线和连字符' }))
              return
            }

            const config = readRcloneConf()

            // 构建配置项
            const sectionConfig: Record<string, string> = { type }

            // 根据类型添加配置
            if (type === 'webdav') {
              sectionConfig.url = remoteConfig.url || ''
              sectionConfig.vendor = remoteConfig.vendor || 'other'
              sectionConfig.user = remoteConfig.user || ''
              // 加密密码
              if (remoteConfig.pass) {
                sectionConfig.pass = obscurePassword(remoteConfig.pass)
              }
              // 额外选项
              if (remoteConfig.exclude) sectionConfig.exclude = remoteConfig.exclude
              if (remoteConfig.include) sectionConfig.include = remoteConfig.include
            } else if (type === 'onedrive') {
              // OneDrive 需要 OAuth，保存 token
              sectionConfig.client_id = remoteConfig.client_id || ''
              sectionConfig.client_secret = remoteConfig.client_secret || ''
              sectionConfig.token = remoteConfig.token || ''
              sectionConfig.drive_id = remoteConfig.drive_id || ''
              if (remoteConfig.drive_type) sectionConfig.drive_type = remoteConfig.drive_type
            } else if (type === 'drive') {
              // Google Drive
              sectionConfig.client_id = remoteConfig.client_id || ''
              sectionConfig.client_secret = remoteConfig.client_secret || ''
              sectionConfig.token = remoteConfig.token || ''
              sectionConfig.scope = remoteConfig.scope || 'drive'
            } else if (type === 's3') {
              // S3 兼容存储
              sectionConfig.provider = remoteConfig.provider || 'AWS'
              sectionConfig.access_key_id = remoteConfig.access_key_id || ''
              sectionConfig.secret_access_key = remoteConfig.secret_access_key || ''
              sectionConfig.region = remoteConfig.region || ''
              sectionConfig.endpoint = remoteConfig.endpoint || ''
            } else {
              // 通用：直接复制配置
              Object.assign(sectionConfig, remoteConfig)
            }

            config[name] = sectionConfig
            writeRcloneConf(config)

            res.end(JSON.stringify({ ok: true, message: `远程存储 "${name}" 已保存` }))
          }).catch(e => {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: e.message }))
          })
          return
        }

        if (req.method === 'DELETE') {
          // 删除配置
          parseBody(req).then(body => {
            const { name } = body
            if (!name) {
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: '请指定要删除的远程存储' }))
              return
            }
            const config = readRcloneConf()
            if (!config[name]) {
              res.statusCode = 404
              res.end(JSON.stringify({ ok: false, error: `远程存储 "${name}" 不存在` }))
              return
            }
            delete config[name]
            writeRcloneConf(config)
            res.end(JSON.stringify({ ok: true, message: `远程存储 "${name}" 已删除` }))
          }).catch(e => {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: e.message }))
          })
          return
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      })

      /* 列出所有已配置的 rclone 远程存储 */
      server.middlewares.use('/__rclone-list', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        try {
          const rclone = getRclonePath()
          let output: string
          try {
            output = execSync(`${rclone} listremotes`, { encoding: 'utf-8', timeout: 10000 })
          } catch {
            output = ''
          }
          const remotes = output.trim().split('\n')
            .filter(Boolean)
            .map(line => ({ name: line.replace(':', '').trim() }))
          res.end(JSON.stringify({ ok: true, remotes }))
        } catch (e: any) {
          res.end(JSON.stringify({ ok: false, error: e.message, remotes: [] }))
        }
      })

      /* 测试 rclone 远程存储连接 */
      server.middlewares.use('/__rclone-test', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        res.setHeader('Content-Type', 'application/json')
        try {
          const body = await parseBody(req)
          const remoteName = body.remote
          if (!remoteName) {
            res.end(JSON.stringify({ ok: false, error: '请选择远程存储' }))
            return
          }
          const rclone = getRclonePath()
          const remote = remoteName.endsWith(':') ? remoteName : `${remoteName}:`
          try {
            const output = execSync(`${rclone} lsd ${remote}`, { encoding: 'utf-8', timeout: 30000 })
            const dirs = output.trim().split('\n').filter(Boolean).length
            res.end(JSON.stringify({ ok: true, message: `连接成功，根目录下有 ${dirs} 个文件夹` }))
          } catch (e: any) {
            res.end(JSON.stringify({ ok: false, error: e.stderr || e.message }))
          }
        } catch (e: any) {
          res.end(JSON.stringify({ ok: false, error: e.message }))
        }
      })

      /* 触发 rclone 备份：SSE 流式推送日志 */
      server.middlewares.use('/__rclone-backup', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
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

        // 从请求体或 query 读取 rclone 配置
        const url = new URL(req.url || '/', 'http://localhost')
        const rcloneRemote = url.searchParams.get('remote') || ''
        const rclonePath = url.searchParams.get('path') || '/SoftwareHub'
        const keepVersions = url.searchParams.get('keepVersions') || '2'
        const ghToken = url.searchParams.get('ghToken') || ''
        const ghProxyEnabled = url.searchParams.get('ghProxyEnabled') === 'true'
        const ghProxyUrl = url.searchParams.get('ghProxyUrl') || ''

        if (!rcloneRemote) {
          send({ type: 'error', message: '请选择 rclone 远程存储' })
          res.end()
          running = false
          return
        }

        const env: NodeJS.ProcessEnv = {
          ...process.env,
          LOCAL_MODE: '1',
          RCLONE_REMOTE: rcloneRemote,
          RCLONE_PATH: rclonePath,
          KEEP_VERSIONS: keepVersions,
          GH_TOKEN: ghToken,
          ...(ghProxyEnabled && ghProxyUrl ? { GH_PROXY: ghProxyUrl } : {}),
        }

        const scriptPath = resolve(__dirname, 'scripts/rclone-backup.mjs')
        const child = spawn('node', [scriptPath], {
          env,
          cwd: resolve(__dirname, '.'),
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        currentChild = child

        send({ type: 'start', pid: child.pid, remote: rcloneRemote, path: rclonePath })

        let stdoutBuf = ''
        let stderrBuf = ''
        child.stdout.on('data', (chunk) => {
          const text = chunk.toString('utf-8')
          stdoutBuf += text
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

        req.on('close', () => {
          if (!child.killed) {
            try { child.kill() } catch { /* noop */ }
          }
        })
      })
    },
  }
}
