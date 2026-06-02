/** 设置状态管理 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Settings } from '../types'
import * as api from '../utils/api'

export const useSettingStore = defineStore('settings', () => {
  const settings = ref<Settings>(api.getSettings())

  function refresh() {
    settings.value = api.getSettings()
  }

  function save(s: Settings) {
    api.saveSettings(s)
    refresh()
  }

  return { settings, refresh, save }
})
