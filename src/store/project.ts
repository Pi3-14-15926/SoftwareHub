/** 项目状态管理 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project, Version, Download } from '../types'
import * as api from '../utils/api'
import { uid } from '../utils'

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>(api.getProjects())

  function refresh() {
    projects.value = api.getProjects()
  }

  function save(p: Project) {
    api.saveProject(p)
    refresh()
  }

  function remove(id: string) {
    api.deleteProject(id)
    refresh()
  }

  /** 按 slug 查找 */
  function bySlug(slug: string) {
    return projects.value.find((p) => p.slug === slug)
  }

  /** 按分类筛选 */
  function byCategory(categoryId: string) {
    return projects.value.filter((p) => p.categoryId === categoryId)
  }

  /** 搜索 */
  function search(keyword: string) {
    const kw = keyword.toLowerCase()
    return projects.value.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        p.description.toLowerCase().includes(kw),
    )
  }

  /** 推荐项目 */
  const featured = computed(() => projects.value.filter((p) => p.featured))

  /** 最新更新 */
  const latest = computed(() =>
    [...projects.value].sort((a, b) => new Date(b.latestUpdateTime).getTime() - new Date(a.latestUpdateTime).getTime()),
  )

  /** 新建 GitHub 项目 */
  function createGitHub(slug: string, name: string, repo: string, categoryId: string): Project {
    const p: Project = {
      id: uid(),
      slug,
      sourceType: 'github',
      name,
      description: '',
      logo: '',
      categoryId,
      featured: false,
      githubRepo: repo,
      githubUrl: `https://github.com/${repo}`,
      latestVersion: '',
      latestUpdateTime: '',
      versions: [],
    }
    save(p)
    return p
  }

  /** 新建自定义项目 */
  function createCustom(slug: string, name: string, categoryId: string): Project {
    const p: Project = {
      id: uid(),
      slug,
      sourceType: 'custom',
      name,
      description: '',
      logo: '',
      categoryId,
      featured: false,
      latestVersion: '',
      latestUpdateTime: '',
      versions: [],
    }
    save(p)
    return p
  }

  /** 添加版本 */
  function addVersion(projectId: string, v: Version) {
    const p = projects.value.find((x) => x.id === projectId)
    if (!p) return
    p.versions.unshift(v)
    p.latestVersion = v.version
    p.latestUpdateTime = v.publishedAt
    save(p)
  }

  /** 删除版本 */
  function removeVersion(projectId: string, versionId: string) {
    const p = projects.value.find((x) => x.id === projectId)
    if (!p) return
    p.versions = p.versions.filter((v) => v.id !== versionId)
    if (p.versions.length > 0) {
      p.latestVersion = p.versions[0].version
      p.latestUpdateTime = p.versions[0].publishedAt
    } else {
      p.latestVersion = ''
      p.latestUpdateTime = ''
    }
    save(p)
  }

  return {
    projects,
    featured,
    latest,
    refresh,
    save,
    remove,
    bySlug,
    byCategory,
    search,
    createGitHub,
    createCustom,
    addVersion,
    removeVersion,
  }
})
