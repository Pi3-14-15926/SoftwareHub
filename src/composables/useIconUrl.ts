/** 统一解析软件图标的 composable
 *  - 自动应用 settings.iconCdnMode
 *  - 返回 { resolve, resolveProject }
 *  - 在所有需要显示 logo 的地方使用，确保 CDN 加速
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import { useSettingStore } from '../store/settings'
import { resolveIconUrl } from '../utils/iconUrl'

export function useIconUrl() {
  const settings = useSettingStore()

  function resolve(url: string): string {
    if (!url) return ''
    return resolveIconUrl(url, settings.settings)
  }

  function resolveProject(project: { logo?: string } | null | undefined): string {
    if (!project?.logo) return ''
    return resolveIconUrl(project.logo, settings.settings)
  }

  return { resolve, resolveProject, settings }
}

/** 包装响应式 project 列表，输出带解析后 logo 的对象 */
export function useResolvedLogos<T extends { logo?: string }>(list: Ref<T[]> | ComputedRef<T[]>) {
  return computed(() => list.value.map((p) => ({ ...p, _resolvedLogo: p.logo ? resolveIconUrl(p.logo, useSettingStore().settings) : '' })))
}
