/** 平台标签共享工具
 *  - platformClass: 平台名 → 渐变色 CSS 类名
 *  - platformIcon: 平台名 → emoji
 */
import type { Platform } from '../types'

export function platformClass(platform: string): string {
  const map: Record<string, string> = {
    Windows: 'plat-win',
    MacOS: 'plat-mac',
    Android: 'plat-and',
    Linux: 'plat-lin',
    iOS: 'plat-ios',
    Web: 'plat-web',
    Other: 'plat-other',
  }
  return map[platform] || 'plat-other'
}

export function platformIcon(platform: string): string {
  const map: Record<string, string> = {
    Windows: '🪟',
    MacOS: '🍎',
    Android: '🤖',
    Linux: '🐧',
    iOS: '📱',
    Web: '🌐',
    Other: '📁',
  }
  return map[platform] || '📁'
}
