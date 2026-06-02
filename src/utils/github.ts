/** GitHub API 工具 */
import type { GitHubRelease, Project, Version, Download } from '../types'
import { uid } from './index'

const GITHUB_API = 'https://api.github.com'

/** 从 GitHub Release API 获取版本列表 */
export async function fetchReleases(repo: string, token?: string): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${GITHUB_API}/repos/${repo}/releases?per_page=20`, { headers })
  if (!res.ok) throw new Error(`GitHub API 错误: ${res.status} ${res.statusText}`)
  return res.json()
}

/** 将 GitHub Release 转换为内部 Version 格式 */
export function releaseToVersion(release: GitHubRelease): Version {
  return {
    id: uid(),
    version: release.tag_name,
    publishedAt: release.published_at,
    changelog: release.body || '该版本未提供更新日志。',
    downloads: release.assets.map((a) => ({
      platform: guessPlatform(a.name),
      filename: a.name,
      size: `${(a.size / 1024 / 1024).toFixed(1)} MB`,
      url: a.browser_download_url,
    })),
  }
}

/** 根据文件名猜测平台 */
function guessPlatform(name: string): Download['platform'] {
  const lower = name.toLowerCase()
  if (lower.includes('android') || lower.includes('apk')) return 'Android'
  if (lower.includes('windows') || lower.includes('exe') || lower.includes('msi')) return 'Windows'
  if (lower.includes('macos') || lower.includes('darwin') || lower.includes('dmg')) return 'MacOS'
  if (lower.includes('linux') || lower.includes('deb') || lower.includes('appimage')) return 'Linux'
  return 'Other'
}

/** 从 GitHub API 获取仓库信息（Star/Fork 数） */
export async function fetchRepoInfo(repo: string): Promise<{ stars: number; forks: number }> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}`)
  if (!res.ok) return { stars: 0, forks: 0 }
  const data = await res.json()
  return { stars: data.stargazers_count ?? 0, forks: data.forks_count ?? 0 }
}

/** 仓库详细信息（用于自动填充表单） */
export interface RepoDetail {
  name: string
  full_name: string
  description: string
  html_url: string
  owner: { login: string; avatar_url: string }
  topics: string[]
  language: string | null
  stargazers_count: number
  forks_count: number
  default_branch: string
}

/** 从 GitHub API 获取仓库详细信息 */
export async function fetchRepoDetail(repo: string): Promise<RepoDetail> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}`)
  if (!res.ok) throw new Error(`获取仓库信息失败 (${res.status})`)
  return res.json()
}
