/** 软件/分类启用状态共享 composable
 *  - 状态存在 localStorage('sh_project_disabled' / 'sh_page_disabled')
 *  - 暴露 ref 包装，前台 computed 自动响应
 *  - admin 修改后调 refreshEnabledState() 触发更新
 */
import { ref } from 'vue'

export const PROJECT_DISABLED_KEY = 'sh_project_disabled'
export const PAGE_DISABLED_KEY = 'sh_page_disabled'

function load(key: string): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch { return new Set() }
}

const projectDisabled = ref<Set<string>>(load(PROJECT_DISABLED_KEY))
const pageDisabled = ref<Set<string>>(load(PAGE_DISABLED_KEY))

/** admin 改完后调用，让前台响应式 ref 同步 */
export function refreshEnabledState() {
  projectDisabled.value = load(PROJECT_DISABLED_KEY)
  pageDisabled.value = load(PAGE_DISABLED_KEY)
}

export function useEnabled() {
  function isProjectEnabled(id: string): boolean {
    return !projectDisabled.value.has(id)
  }
  function isPageEnabled(id: string): boolean {
    return !pageDisabled.value.has(id)
  }
  return { projectDisabled, pageDisabled, refreshEnabledState, isProjectEnabled, isPageEnabled }
}
