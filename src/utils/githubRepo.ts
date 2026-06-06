/**
 * 通过 GitHub API 将数据提交回仓库
 * 使用管理员登录时保存的 Token 认证
 *
 * 新数据模型：分层 JSON 文件
 *  - public/data/index.json
 *  - public/data/categories.json
 *  - public/data/settings.json
 *  - public/data/iconAssets.json
 *  - public/data/backup-manifest.json
 *  - public/page/{slug}/software.json
 *  - public/page/{slug}/versions.json
 *  - public/page/{slug}/downloads.json
 * 上述每个文件都同步写一份到 data/ 路径（GitHub Pages 根目录）
 */
import type { Category, Settings } from '../types'
import * as api from './api'
import { getToken } from './auth'

const API_BASE = 'https://api.github.com'

interface RepoInfo {
  owner: string
  repo: string
}

const REPO_KEY = 'sh_admin_repo'
const DEFAULT_REPO: RepoInfo = { owner: 'Pi3-14-15926', repo: 'SoftwareHub' }

/** 保存仓库信息（owner/repo 格式） */
export function setRepoInfo(repo: string): void {
  const trimmed = repo.trim()
  if (trimmed && trimmed.includes('/')) {
    localStorage.setItem(REPO_KEY, trimmed)
  }
}

/** 清除自定义仓库配置（回退到派生/默认值） */
export function clearRepoInfo(): void {
  localStorage.removeItem(REPO_KEY)
}

/** 获取仓库信息
 *  解析顺序：
 *  1. localStorage 手动配置（最高优先，跨域名/子路径部署必须）
 *  2. dev 环境硬编码默认值
 *  3. 生产 + github.io 标准部署 → 从 URL 派生
 *  4. 其他（自定义域名 + 子路径）→ 硬编码默认值（需用户在 Dashboard 配置）
 */
export function getRepoInfo(): RepoInfo {
  try {
    const stored = localStorage.getItem(REPO_KEY)
    if (stored && stored.includes('/')) {
      const [owner, repo] = stored.split('/', 2)
      if (owner && repo) return { owner, repo }
    }
  } catch { /* localStorage 不可用时忽略 */ }

  if (!import.meta.env.PROD) return DEFAULT_REPO

  const hostname = window.location.hostname
  const pathname = window.location.pathname
  const owner = hostname.split('.')[0]
  if (hostname.endsWith('.github.io')) {
    const repo = pathname.split('/').filter(Boolean)[0]
    if (repo) return { owner, repo }
  }

  return DEFAULT_REPO
}

/** GitHub API 请求头 */
function headers() {
  const token = getToken()
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

/** 获取文件当前 SHA（用于更新已有文件） */
async function getFileSha(path: string): Promise<string | null> {
  const { owner, repo } = getRepoInfo()
  try {
    const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/contents/${path}`, {
      headers: headers(),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.sha || null
  } catch {
    return null
  }
}

/** 提交单个文件到仓库 */
async function commitFile(path: string, content: string, message: string): Promise<void> {
  const { owner, repo } = getRepoInfo()
  const sha = await getFileSha(path)
  const body: Record<string, any> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: 'main',
  }
  if (sha) body.sha = sha

  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
    throw new Error(err.message || '提交失败')
  }
}

/** 触发 GitHub Actions 工作流 */
export async function triggerWorkflow(workflow: string): Promise<void> {
  const token = getToken()
  if (!token) throw new Error('未登录，请先登录')
  const { owner, repo } = getRepoInfo()

  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ ref: 'main' }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
    throw new Error(err.message || '触发失败')
  }
}

/** 触发同步 Release 工作流 */
export async function triggerSync(): Promise<void> {
  await triggerWorkflow('sync.yml')
}

/** 触发同步 + WebDAV 备份工作流 */
export async function triggerSyncBackup(): Promise<void> {
  await triggerWorkflow('sync-backup.yml')
}

/** 将所有数据提交到仓库，触发 GitHub Pages 重新构建
 *  按新分层模型发布：data/ + page/{slug}/
 */
export async function commitAllData(): Promise<{ files: number; repo: string }> {
  const token = getToken()
  if (!token) throw new Error('未登录，请先登录')

  const d = api.loadAppData()
  const categories: Category[] = d.categories
  const settings: Settings = d.settings

  const swCount = Object.values(d.software).reduce((s, arr) => s + arr.length, 0)
  if (!swCount && !categories.length) {
    throw new Error('没有数据可提交')
  }

  d.backupManifest = {
    ...d.backupManifest,
    updatedAt: new Date().toISOString(),
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const message = `chore(data): 发布数据更新 ${timestamp}`

  /* 全局文件 */
  const globalFiles: { path: string; content: string }[] = [
    { path: 'public/data/index.json', content: JSON.stringify(d.index, null, 2) },
    { path: 'data/index.json', content: JSON.stringify(d.index, null, 2) },
    { path: 'public/data/categories.json', content: JSON.stringify(categories, null, 2) },
    { path: 'data/categories.json', content: JSON.stringify(categories, null, 2) },
    { path: 'public/data/settings.json', content: JSON.stringify(settings, null, 2) },
    { path: 'data/settings.json', content: JSON.stringify(settings, null, 2) },
    { path: 'public/data/iconAssets.json', content: JSON.stringify(d.iconAssets, null, 2) },
    { path: 'data/iconAssets.json', content: JSON.stringify(d.iconAssets, null, 2) },
    { path: 'public/data/backup-manifest.json', content: JSON.stringify(d.backupManifest, null, 2) },
    { path: 'data/backup-manifest.json', content: JSON.stringify(d.backupManifest, null, 2) },
  ]

  /* 每个分类目录下的 3 个文件 */
  const pageFiles: { path: string; content: string }[] = []
  for (const c of categories) {
    const slug = c.slug
    const sw = d.software[slug] || []
    const ver = d.versions[slug] || []
    const dl = d.downloads[slug] || []
    const enc = (obj: any) => JSON.stringify(obj, null, 2)
    pageFiles.push(
      { path: `public/page/${slug}/software.json`, content: enc(sw) },
      { path: `public/page/${slug}/versions.json`, content: enc(ver) },
      { path: `public/page/${slug}/downloads.json`, content: enc(dl) },
      { path: `data/page/${slug}/software.json`, content: enc(sw) },
      { path: `data/page/${slug}/versions.json`, content: enc(ver) },
      { path: `data/page/${slug}/downloads.json`, content: enc(dl) },
    )
  }

  const files = [...globalFiles, ...pageFiles]
  for (const file of files) {
    await commitFile(file.path, file.content, message)
  }

  const { owner, repo } = getRepoInfo()
  return { files: files.length, repo: `${owner}/${repo}` }
}
