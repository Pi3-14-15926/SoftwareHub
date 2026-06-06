/** 分类状态管理 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Category } from '../types'
import * as api from '../utils/api'
import { uid } from '../utils'

export const useCategoryStore = defineStore('category', () => {
  const categories = ref<Category[]>(api.getCategories())

  function refresh() {
    categories.value = api.getCategories()
  }

  function save(c: Category) {
    api.saveCategory(c)
    refresh()
  }

  function remove(id: string) {
    api.deleteCategory(id)
    refresh()
  }

  function bySlug(slug: string): Category | undefined {
    return categories.value.find((c) => c.slug === slug)
  }

  function create(name: string, slug: string, icon?: string, description?: string): Category {
    const c: Category = {
      id: uid(),
      slug,
      name,
      icon,
      description,
      sortOrder: categories.value.length,
    }
    save(c)
    return c
  }

  return { categories, refresh, save, remove, bySlug, create }
})
