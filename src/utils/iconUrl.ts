/** 图标 URL 解析与 CDN 加速
 *  - owner/repo 动态从 getRepoInfo() 拉取（复用 githubRepo.ts）
 *  - 自动把 raw.githubusercontent.com 替换为 jsDelivr 等
 */
import type { Settings, IconCdnMode } from '../types'
import { getRepoInfo } from './githubRepo'
import { ICON_BRANCH, ICON_PATH } from './iconsApi'

const GH_RAW = 'raw.githubusercontent.com'
const GITHUB_RE = /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)/i

export interface ResolveOpts {
  mode?: IconCdnMode
  customBase?: string
}

export function getCdnSettings(s: Settings): ResolveOpts {
  return {
    mode: s.iconCdnMode,
    customBase: s.iconCdnCustomBase,
  }
}

function getRepo() {
  return getRepoInfo()
}

/** 把任意 logo URL 转成最终展示 URL（应用 CDN 加速） */
export function resolveIconUrl(url: string, settings: Settings | ResolveOpts): string {
  if (!url) return ''
  const opts: ResolveOpts = isSettings(settings) ? getCdnSettings(settings) : settings
  const { mode, customBase } = opts

  if (mode === 'none' || !mode) return url

  // 本仓库的图标：url 形如 raw.githubusercontent.com/owner/repo/branch/...
  // 或 github.com/owner/repo/blob/branch/...
  const { owner, repo } = getRepo()
  if (owner && repo) {
    // raw URL
    if (url.includes(`${GH_RAW}/${owner}/${repo}/`)) {
      return applyCdn(url, mode, customBase)
    }
    // github.com/owner/repo/blob|raw/branch/path
    const m = url.match(GITHUB_RE)
    if (m && m[1] === owner && m[2] === repo) {
      const [, , , br, path] = m
      return applyCdn(`https://${GH_RAW}/${owner}/${repo}/${br}/${path}`, mode, customBase)
    }
  }

  // 任何 raw.githubusercontent.com 链接（其他用户的图）也加速
  if (url.includes(GH_RAW)) {
    return applyCdn(url, mode, customBase)
  }

  return url
}

function applyCdn(rawUrl: string, mode: IconCdnMode, customBase?: string): string {
  if (mode === 'jsdelivr') return toJsdelivr(rawUrl)
  if (mode === 'statically') return toStatically(rawUrl)
  if (mode === 'githack') return toGithack(rawUrl)
  if (mode === 'custom') {
    if (!customBase) return rawUrl
    return customBase.replace(/\/+$/, '') + '/' + rawUrl.replace(/^https?:\/\//, '')
  }
  return rawUrl
}

function isSettings(s: Settings | ResolveOpts): s is Settings {
  return (s as Settings).siteName !== undefined
}

export function toJsdelivr(rawUrl: string): string {
  const m = rawUrl.match(/https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/)
  if (!m) return rawUrl
  return `https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3]}/${m[4]}`
}

export function toStatically(rawUrl: string): string {
  const m = rawUrl.match(/https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/)
  if (!m) return rawUrl
  return `https://cdn.statically.io/gh/${m[1]}/${m[2]}/${m[3]}/${m[4]}`
}

export function toGithack(rawUrl: string): string {
  const m = rawUrl.match(/https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/)
  if (!m) return rawUrl
  return `https://raw.githack.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`
}

/** CDN 模式说明 */
export function describeCdn(mode: IconCdnMode): string {
  switch (mode) {
    case 'jsdelivr': return 'jsDelivr（国内可用，免费）'
    case 'statically': return 'Statically'
    case 'githack': return 'GitHack'
    case 'custom': return '自定义 CDN'
    case 'none': return '不使用加速'
  }
}

/** 在 IconManager 里根据配置生成 raw + cdn URL */
export function buildIconUrls(filename: string, mode: IconCdnMode, customBase?: string) {
  const { owner, repo } = getRepo()
  const path = ICON_PATH.replace(/^\/+|\/+$/g, '')
  const branch = ICON_BRANCH
  const rawUrl = `https://${GH_RAW}/${owner}/${repo}/${branch}/${path}/${filename}`
  const cdnUrl = applyCdn(rawUrl, mode, customBase)
  return { rawUrl, cdnUrl, owner, repo, branch, path }
}
