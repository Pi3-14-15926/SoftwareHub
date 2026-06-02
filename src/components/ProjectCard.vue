<script setup lang="ts">
/* ===== 项目卡片 — 完全匹配目标站设计 ===== */
import { ref } from 'vue'
import type { Project } from '../types'
import { fmtDate, relTime, fmtCompact } from '../utils'

const props = defineProps<{ project: Project }>()
const expanded = ref(false)
</script>

<template>
  <router-link :to="`/software/${project.slug}`" class="card">
    <!-- 右上角 GitHub 图标 + Star 计数 -->
    <div class="card-meta">
      <a
        v-if="project.githubRepo"
        :href="`https://github.com/${project.githubRepo}`"
        target="_blank"
        rel="noopener noreferrer"
        class="github-icon-btn"
        :title="project.githubRepo"
        @click.stop
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" width="15" height="15">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
        </svg>
      </a>
      <span
        v-if="project.stars !== undefined"
        class="download-count"
        :title="`Star ${project.stars?.toLocaleString('zh-CN')}`"
      >
        ⭐ {{ fmtCompact(project.stars ?? 0) }}
      </span>
    </div>

    <!-- 卡片头部：图标 + 名称 -->
    <div class="card-header">
      <div class="icon">
        <img v-if="project.logo" :src="project.logo" :alt="project.name" />
        <span v-else>{{ project.name[0] }}</span>
      </div>
      <h2 class="card-title">{{ project.name }}</h2>
    </div>

    <!-- 描述 -->
    <div class="source-desc">{{ project.description || '暂无描述。' }}</div>

    <!-- 有版本信息 -->
    <template v-if="project.versions.length > 0">
      <div class="release-info">
        <div class="release-header">
          <span class="release-title">{{ project.versions[0].version }}</span>
          <span class="release-date">
            {{ fmtDate(project.versions[0].publishedAt) }} · {{ relTime(project.versions[0].publishedAt) }}
          </span>
        </div>

        <div class="release-notes">{{ project.versions[0].changelog || '该版本未提供更新日志。' }}</div>

        <div class="download-list">
          <template v-if="project.versions[0].downloads.length > 0">
            <div
              v-for="dl in (expanded ? project.versions[0].downloads : project.versions[0].downloads.slice(0, 2))"
              :key="dl.filename"
              class="download-btn"
              @click.stop
            >
              <span class="apk-name">{{ dl.filename }}</span>
              <span class="apk-size">{{ dl.size }}</span>
            </div>
            <button
              v-if="project.versions[0].downloads.length > 2"
              class="expand-btn"
              @click.prevent="expanded = !expanded"
            >
              {{ expanded ? '收起' : `展开全部 (${project.versions[0].downloads.length})` }}
            </button>
          </template>
          <div v-else class="error-msg" style="display:block;background:#f0f4f9;color:#596775">
            该版本暂无文件
          </div>
        </div>
      </div>
    </template>

    <!-- 无版本 -->
    <div v-else class="loading-placeholder" style="margin-top:12px">
      暂无版本信息
    </div>
  </router-link>
</template>

<style scoped>
.card {
  border-radius: var(--border-radius);
  padding: 24px;
  background: var(--card-bg);
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  display: flex;
  flex-direction: column;
  position: relative;
  border: 1px solid var(--border-color);
  animation: riseFade 0.6s ease both;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
.card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: rgba(38, 70, 83, 0.35);
}

.card-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}
.icon {
  width: 42px;
  height: 42px;
  background: var(--icon-bg-start);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--icon-fg);
  font-weight: 700;
  font-size: 20px;
  flex-shrink: 0;
  border: 1px solid rgba(31, 57, 70, 0.14);
  overflow: hidden;
}
.icon img { width: 100%; height: 100%; object-fit: cover; }
.card-title {
  font-size: 1.18rem;
  font-weight: 700;
  margin: 0;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.source-desc {
  font-size: 0.92rem;
  color: var(--text-sec);
  margin-bottom: 15px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 15px;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.card-meta {
  position: absolute;
  top: 14px;
  right: 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.download-count {
  background: rgba(46, 42, 36, 0.08);
  color: #2a241f;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(46, 42, 36, 0.16);
  white-space: nowrap;
}
.github-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid rgba(31, 57, 70, 0.22);
  background: rgba(46, 42, 36, 0.08);
  color: var(--primary-color);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.12s ease;
  flex: 0 0 auto;
}
.github-icon-btn:hover {
  background: #ffffff;
  border-color: rgba(31, 57, 70, 0.42);
  transform: translateY(-1px);
}
.github-icon-btn svg { fill: currentColor; }

.release-info {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}
.release-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 6px;
}
.release-title {
  font-weight: 700;
  font-size: 1rem;
  color: #2a241f;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.release-date {
  font-size: 0.85rem;
  color: #8c7f73;
}
.release-notes {
  background: var(--log-bg);
  padding: 12px;
  border-radius: 12px;
  font-size: 0.9rem;
  color: #3a332c;
  max-height: 130px;
  overflow-y: auto;
  white-space: pre-wrap;
  margin-bottom: 15px;
  border-left: 3px solid var(--accent-teal);
  scrollbar-width: thin;
  scrollbar-color: #d7c8b4 #f3eee6;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.release-notes::-webkit-scrollbar { width: 6px; }
.release-notes::-webkit-scrollbar-track { background: #f3eee6; }
.release-notes::-webkit-scrollbar-thumb { background-color: #d7c8b4; border-radius: 3px; }

.download-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}
.download-btn {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
  background: var(--btn-bg);
  color: #fffaf2;
  text-decoration: none;
  padding: 10px 16px;
  border-radius: 20px;
  font-weight: 600;
  transition: opacity 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease;
  border: none;
  font-size: 0.95rem;
  box-shadow: var(--btn-shadow);
  cursor: default;
}
.download-btn:hover {
  background: var(--btn-bg-hover);
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: var(--btn-shadow-hover);
}
.apk-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.95rem;
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  text-overflow: clip;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.apk-name::-webkit-scrollbar { width: 0; height: 0; }
.apk-size {
  font-size: 0.82rem;
  opacity: 0.92;
  white-space: nowrap;
  flex: 0 0 auto;
  background: rgba(255, 255, 255, 0.2);
  padding: 3px 9px;
  border-radius: 999px;
}

.expand-btn {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px;
  border: 1px dashed var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-sec);
  font-size: 0.82rem;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.18s, color 0.18s;
}
.expand-btn:hover {
  background: rgba(46, 42, 36, 0.06);
  color: var(--text-main);
}

.error-msg {
  color: var(--accent-warm);
  font-size: 0.9rem;
  margin-top: 10px;
  text-align: center;
  background: #fff0ec;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(221, 94, 67, 0.35);
}
.loading-placeholder {
  color: var(--text-sec);
  font-style: italic;
  text-align: center;
  padding: 20px 0;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 14px;
  border: 1px dashed var(--border-color);
}

.card:nth-child(1) { animation-delay: 0.05s; }
.card:nth-child(2) { animation-delay: 0.1s; }
.card:nth-child(3) { animation-delay: 0.15s; }
.card:nth-child(4) { animation-delay: 0.2s; }
.card:nth-child(5) { animation-delay: 0.25s; }
.card:nth-child(6) { animation-delay: 0.3s; }

@media (max-width: 480px) {
  .card { padding: 18px; }
  .icon { width: 38px; height: 38px; font-size: 18px; }
  .download-btn { padding: 8px 12px; }
  .github-icon-btn { width: 28px; height: 28px; }
  .apk-name { font-size: 0.9rem; }
  .apk-size { font-size: 0.78rem; }
}
</style>
