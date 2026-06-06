/* 数据迁移脚本：把老的 projects.json (Project[]) 拆分成新的分层结构 */
const fs = require('fs')
const path = require('path')

const ROOT = 'D:\\APP\\Study\\SoftwareHub'
const OLD_FILE = path.join(ROOT, 'public', 'data', 'projects.json')
const NEW_DATA = path.join(ROOT, 'public', 'data')
const NEW_PAGE = path.join(ROOT, 'public', 'page')

// 读取老数据
const oldProjects = JSON.parse(fs.readFileSync(OLD_FILE, 'utf-8'))

// slug 推断 (旧数据用的是 categoryId，我们要按 category.slug 找到 categorySlug)
const categories = JSON.parse(fs.readFileSync(path.join(NEW_DATA, 'categories.json'), 'utf-8'))
const catIdToSlug = Object.fromEntries(categories.map(c => [c.id, c.slug]))

// 平台推断：根据 downloads 的 platform 聚合
function inferPlatforms(downloads) {
  const set = new Set(downloads.map(d => d.platform))
  return [...set]
}

// 累计器
const softwareByCategory = {}     // slug -> Software[]
const versionsByCategory = {}     // slug -> Version[]
const downloadsByCategory = {}    // slug -> Download[]
const indexEntries = []           // IndexEntry[]

for (const p of oldProjects) {
  const categorySlug = catIdToSlug[p.categoryId] || 'uncategorized'

  if (!softwareByCategory[categorySlug]) {
    softwareByCategory[categorySlug] = []
    versionsByCategory[categorySlug] = []
    downloadsByCategory[categorySlug] = []
  }

  // 收集所有 downloads 来推断 platforms
  const allDownloads = []
  for (const v of p.versions || []) {
    for (const d of v.downloads || []) {
      allDownloads.push(d)
    }
  }
  const platforms = inferPlatforms(allDownloads)
  if (platforms.length === 0) platforms.push('Other')

  // 1) Software
  const software = {
    id: p.id,
    slug: p.slug,
    sourceType: p.sourceType || 'github',
    name: p.name,
    description: p.description || '',
    logo: p.logo || '',
    categorySlug,
    featured: !!p.featured,
    githubRepo: p.githubRepo,
    githubUrl: p.githubUrl,
    website: p.website,
    stars: p.stars,
    forks: p.forks,
    platforms,
    latestVersionId: (p.versions && p.versions[0]) ? p.versions[0].id : undefined,
    latestUpdateTime: p.latestUpdateTime || new Date().toISOString(),
  }
  softwareByCategory[categorySlug].push(software)

  // 2) Versions + Downloads
  for (const v of p.versions || []) {
    const downloadIds = []
    for (const d of v.downloads || []) {
      downloadsByCategory[categorySlug].push({
        id: d.id || `dl_${Math.random().toString(36).slice(2, 12)}`,
        versionId: v.id,
        platform: d.platform,
        filename: d.filename,
        size: d.size,
        url: d.url,
      })
      downloadIds.push(d.id)
    }
    versionsByCategory[categorySlug].push({
      id: v.id,
      projectId: p.id,
      version: v.version,
      publishedAt: v.publishedAt,
      changelog: v.changelog || '',
      downloadIds,
    })
  }

  // 3) Index
  indexEntries.push({
    id: p.id,
    name: p.name,
    slug: p.slug,
    categorySlug,
    description: p.description || '',
    logo: p.logo || '',
    featured: !!p.featured,
    platforms,
    latestVersionId: software.latestVersionId,
    latestUpdateTime: software.latestUpdateTime,
    githubRepo: p.githubRepo,
    githubUrl: p.githubUrl,
    website: p.website,
    stars: p.stars,
    forks: p.forks,
  })
}

// 写入新文件
fs.mkdirSync(NEW_PAGE, { recursive: true })

// 1) index.json
fs.writeFileSync(
  path.join(NEW_DATA, 'index.json'),
  JSON.stringify(indexEntries, null, 2),
  'utf-8'
)

// 2) iconAssets.json (空)
fs.writeFileSync(
  path.join(NEW_DATA, 'iconAssets.json'),
  JSON.stringify([], null, 2),
  'utf-8'
)

// 3) 每个分类的 software.json / versions.json / downloads.json
for (const slug of Object.keys(softwareByCategory)) {
  const dir = path.join(NEW_PAGE, slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'software.json'), JSON.stringify(softwareByCategory[slug], null, 2), 'utf-8')
  fs.writeFileSync(path.join(dir, 'versions.json'), JSON.stringify(versionsByCategory[slug], null, 2), 'utf-8')
  fs.writeFileSync(path.join(dir, 'downloads.json'), JSON.stringify(downloadsByCategory[slug], null, 2), 'utf-8')
}

// 4) 给没有任何 software 的分类创建空目录
for (const c of categories) {
  const dir = path.join(NEW_PAGE, c.slug)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'software.json'), '[]', 'utf-8')
    fs.writeFileSync(path.join(dir, 'versions.json'), '[]', 'utf-8')
    fs.writeFileSync(path.join(dir, 'downloads.json'), '[]', 'utf-8')
  }
}

// 5) 删除老 projects.json
fs.unlinkSync(OLD_FILE)

// 摘要
console.log('===== 迁移完成 =====')
console.log(`Index 条目: ${indexEntries.length}`)
for (const slug of Object.keys(softwareByCategory)) {
  console.log(`分类 ${slug}: ${softwareByCategory[slug].length} 个软件, ${versionsByCategory[slug].length} 个版本, ${downloadsByCategory[slug].length} 个下载`)
}
