/** 软件状态管理（基于分层数据模型） */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Software, Version, Download, Platform } from '../types'
import * as api from '../utils/api'
import { uid } from '../utils'

export const useProjectStore = defineStore('project', () => {
  const software = ref<Software[]>(api.getAllSoftware())

  function refresh() {
    software.value = api.getAllSoftware()
  }

  function save(s: Software) {
    api.saveSoftware(s)
    refresh()
  }

  function remove(id: string) {
    api.deleteSoftware(id)
    refresh()
  }

  function bySlug(slug: string): Software | undefined {
    return software.value.find((s) => s.slug === slug)
  }

  function byId(id: string): Software | undefined {
    return software.value.find((s) => s.id === id)
  }

  function byCategorySlug(slug: string): Software[] {
    return software.value.filter((s) => s.categorySlug === slug)
  }

  function search(keyword: string): Software[] {
    const kw = keyword.toLowerCase()
    return software.value.filter(
      (s) =>
        s.name.toLowerCase().includes(kw) ||
        s.description.toLowerCase().includes(kw) ||
        s.slug.toLowerCase().includes(kw) ||
        (s.githubRepo || '').toLowerCase().includes(kw),
    )
  }

  const featured = computed(() => software.value.filter((s) => s.featured))

  const latest = computed(() =>
    [...software.value].sort(
      (a, b) => new Date(b.latestUpdateTime).getTime() - new Date(a.latestUpdateTime).getTime(),
    ),
  )

  function slugExists(slug: string) {
    return software.value.some((s) => s.slug === slug)
  }

  function createGitHub(slug: string, name: string, repo: string, categorySlug: string): Software | null {
    if (slugExists(slug)) return null
    const s: Software = {
      id: uid(),
      slug,
      sourceType: 'github',
      name,
      description: '',
      logo: '',
      categorySlug,
      featured: false,
      githubRepo: repo,
      githubUrl: `https://github.com/${repo}`,
      latestUpdateTime: new Date().toISOString(),
    }
    save(s)
    return s
  }

  function createCustom(slug: string, name: string, categorySlug: string): Software | null {
    if (slugExists(slug)) return null
    const s: Software = {
      id: uid(),
      slug,
      sourceType: 'custom',
      name,
      description: '',
      logo: '',
      categorySlug,
      featured: false,
      latestUpdateTime: new Date().toISOString(),
    }
    save(s)
    return s
  }

  function addVersion(v: Version) {
    api.addVersion(v)
    refresh()
  }

  function removeVersion(versionId: string) {
    api.deleteVersion(versionId)
    refresh()
  }

  function addDownload(dl: Download) {
    api.addDownload(dl)
    refresh()
  }

  function removeDownload(dlId: string) {
    api.deleteDownload(dlId)
    refresh()
  }

  function getVersions(softwareId: string): Version[] {
    return api.getSoftwareVersions(softwareId)
  }

  function getDownloads(versionId: string): Download[] {
    return api.getVersionDownloads(versionId)
  }

  function getAllPlatforms(): Platform[] {
    const set = new Set<Platform>()
    for (const s of software.value) {
      for (const p of api.getSoftwarePlatforms(s.id)) set.add(p)
    }
    return Array.from(set)
  }

  return {
    software,
    featured,
    latest,
    refresh,
    save,
    remove,
    bySlug,
    byId,
    byCategorySlug,
    search,
    slugExists,
    createGitHub,
    createCustom,
    addVersion,
    removeVersion,
    addDownload,
    removeDownload,
    getVersions,
    getDownloads,
    getAllPlatforms,
  }
})
