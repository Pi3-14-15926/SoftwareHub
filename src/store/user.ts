import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  const username = ref('本地开发者')
  const isLoggedIn = computed(() => true)
  const isAdmin = computed(() => true)

  function login(_tok: string, user: string) {
    username.value = user
  }

  function logout() {
    // no-op
  }

  return { username, isLoggedIn, isAdmin, login, logout }
})
