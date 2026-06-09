/**
 * rclone 工具脚本
 *
 * 提供以下功能：
 *  - 列出所有已配置的 rclone 远程存储
 *  - 测试远程存储连接
 *  - 将本地文件同步到远程存储
 *
 * 通过子进程调用 rclone CLI，不需要安装额外依赖
 */

import { execSync, spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

/** 获取 rclone 可执行文件路径 */
function getRclonePath() {
  // 优先使用项目内置的 rclone
  const localPath = path.resolve('scripts/bin/rclone.exe')
  if (fs.existsSync(localPath)) return localPath

  // 尝试系统 PATH 中的 rclone
  try {
    if (process.platform === 'win32') {
      return execSync('where rclone', { encoding: 'utf-8' }).trim().split('\n')[0]
    }
    return execSync('which rclone', { encoding: 'utf-8' }).trim()
  } catch {
    throw new Error('未找到 rclone，请安装 rclone 或将 rclone.exe 放到 scripts/bin/ 目录')
  }
}

/**
 * 列出所有已配置的 rclone 远程存储
 * @returns {Promise<Array<{name: string, type: string}>>} 远程存储列表
 */
export async function listRemotes() {
  const rclone = getRclonePath()
  return new Promise((resolve, reject) => {
    exec(`${rclone} listremotes --json`, (err, stdout) => {
      if (err) {
        // 回退到非 JSON 格式
        try {
          const output = execSync(`${rclone} listremotes`, { encoding: 'utf-8' })
          const remotes = output.trim().split('\n')
            .filter(Boolean)
            .map(line => ({ name: line.replace(':', ''), type: 'unknown' }))
          resolve(remotes)
        } catch (e) {
          reject(new Error(`列出远程存储失败: ${e.message}`))
        }
        return
      }
      try {
        const data = JSON.parse(stdout)
        const remotes = Object.entries(data).map(([name, info]) => ({
          name,
          type: info.Type || info.type || 'unknown',
        }))
        resolve(remotes)
      } catch {
        // JSON 解析失败，用简单格式
        try {
          const output = execSync(`${rclone} listremotes`, { encoding: 'utf-8' })
          const remotes = output.trim().split('\n')
            .filter(Boolean)
            .map(line => ({ name: line.replace(':', ''), type: 'unknown' }))
          resolve(remotes)
        } catch (e) {
          reject(new Error(`列出远程存储失败: ${e.message}`))
        }
      }
    })
  })
}

/**
 * 测试远程存储连接
 * @param {string} remoteName - 远程存储名称（如 "jianguoyun:"）
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function testRemote(remoteName) {
  const rclone = getRclonePath()
  const remote = remoteName.endsWith(':') ? remoteName : `${remoteName}:`

  return new Promise((resolve) => {
    exec(`${rclone} lsd ${remote}`, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, message: stderr || err.message })
      } else {
        const dirs = stdout.trim().split('\n').filter(Boolean).length
        resolve({ ok: true, message: `连接成功，根目录下有 ${dirs} 个文件夹` })
      }
    })
  })
}

/**
 * 将本地文件同步到远程存储
 * @param {string} localPath - 本地源目录
 * @param {string} remoteName - 远程存储名称（如 "jianguoyun:"）
 * @param {string} remotePath - 远程目标路径（如 "/SoftwareHub"）
 * @param {object} options - 可选参数
 * @param {function} onProgress - 进度回调 (line: string) => void
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function rcloneCopy(localPath, remoteName, remotePath = '/', options = {}, onProgress = null) {
  const rclone = getRclonePath()
  const remote = remoteName.endsWith(':') ? remoteName : `${remoteName}:`
  const dest = `${remote}${remotePath}`

  // 构建命令参数
  const args = [
    'copy', localPath, dest,
    '--progress',
    '--stats', '5s',
    '--stats-one-line',
    '-v',
  ]

  // 增量同步：只传输新文件或修改过的文件
  if (options.checksum) args.push('--checksum')
  if (options.transfers) args.push('--transfers', String(options.transfers))
  if (options.fastList) args.push('--fast-list')
  if (options.dryRun) args.push('--dry-run')

  return new Promise((resolve, reject) => {
    const proc = spawn(rclone, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      const text = data.toString('utf-8')
      stdout += text
      if (onProgress) {
        text.split('\n').filter(Boolean).forEach(line => onProgress(line))
      }
    })

    proc.stderr.on('data', (data) => {
      const text = data.toString('utf-8')
      stderr += text
      if (onProgress) {
        text.split('\n').filter(Boolean).forEach(line => onProgress(line))
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, message: `同步完成: ${localPath} → ${dest}` })
      } else {
        resolve({ ok: false, message: stderr || `rclone 退出码: ${code}` })
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`启动 rclone 失败: ${err.message}`))
    })
  })
}

/**
 * 获取远程存储的目录列表
 * @param {string} remoteName - 远程存储名称
 * @param {string} remotePath - 远程路径
 * @returns {Promise<Array<{name: string, type: string, size: number}>>}
 */
export async function listRemoteDir(remoteName, remotePath = '/') {
  const rclone = getRclonePath()
  const remote = remoteName.endsWith(':') ? remoteName : `${remoteName}:`
  const fullPath = `${remote}${remotePath}`

  return new Promise((resolve, reject) => {
    exec(`${rclone} lsjson ${fullPath}`, { timeout: 30000 }, (err, stdout) => {
      if (err) {
        // 尝试简单格式
        try {
          const output = execSync(`${rclone} ls ${fullPath} --max-depth 1`, { encoding: 'utf-8' })
          const items = output.trim().split('\n')
            .filter(Boolean)
            .map(line => {
              const parts = line.trim().split(/\s+/)
              return { name: parts.slice(-1)[0], type: 'file', size: parseInt(parts[0]) || 0 }
            })
          resolve(items)
        } catch (e) {
          reject(new Error(`列出远程目录失败: ${e.message}`))
        }
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch {
        resolve([])
      }
    })
  })
}

// 如果直接运行此脚本，列出所有远程存储
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const remotes = await listRemotes()
    console.log('已配置的远程存储:')
    for (const r of remotes) {
      console.log(`  - ${r.name} (${r.type})`)
    }
  } catch (e) {
    console.error('错误:', e.message)
    process.exit(1)
  }
}
