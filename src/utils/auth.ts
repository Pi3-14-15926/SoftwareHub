/** GitHub Token 认证管理 */

const TOKEN_KEY = 'sh_admin_token'
const USER_KEY = 'sh_admin_user'

export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  name: string | null
}

/** 保存 Token 到 sessionStorage */
export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

/** 获取保存的 Token */
export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

/** 清除 Token */
export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}

/** 保存用户信息 */
function setUser(user: GitHubUser): void {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
}

/** 获取已认证用户信息 */
export function getCurrentUser(): GitHubUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** 是否已登录 */
export function isAuthenticated(): boolean {
  return !!getToken()
}

/** 用 GitHub API 验证 Token 有效性，成功返回用户信息 */
export async function validateToken(token: string): Promise<GitHubUser> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token 无效或已过期')
    if (res.status === 403) throw new Error('API 频率限制，请稍后重试')
    throw new Error(`验证失败 (HTTP ${res.status})`)
  }
  return await res.json()
}

/** 登录成功：保存 token 和用户信息 */
export function saveLogin(token: string, user: GitHubUser): void {
  setToken(token)
  setUser(user)
}
