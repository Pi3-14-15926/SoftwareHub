import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { isAuthenticated } from '../utils/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue'),
  },
  {
    path: '/software/:slug',
    name: 'ProjectDetail',
    component: () => import('../views/ProjectDetail.vue'),
  },
  {
    path: '/category/:slug',
    name: 'Category',
    component: () => import('../views/Category.vue'),
  },
  {
    path: '/search',
    name: 'Search',
    component: () => import('../views/Search.vue'),
  },
  {
    path: '/ranking',
    name: 'Ranking',
    component: () => import('../views/Ranking.vue'),
  },
  {
    path: '/admin',
    name: 'AdminLogin',
    component: () => import('../views/admin/Login.vue'),
  },
  {
    path: '/admin/dashboard',
    name: 'AdminDashboard',
    component: () => import('../views/admin/Dashboard.vue'),
    meta: { requiresAuth: true, title: '统计概览' },
  },
  {
    path: '/admin/projects',
    name: 'AdminProjects',
    component: () => import('../views/admin/ProjectList.vue'),
    meta: { requiresAuth: true, title: '软件管理' },
  },
  {
    path: '/admin/projects/new',
    name: 'AdminProjectNew',
    component: () => import('../views/admin/ProjectForm.vue'),
    meta: { requiresAuth: true, title: '新增软件' },
  },
  {
    path: '/admin/projects/:id/edit',
    name: 'AdminProjectEdit',
    component: () => import('../views/admin/ProjectForm.vue'),
    meta: { requiresAuth: true, title: '编辑软件' },
  },
  {
    path: '/admin/projects/:id/versions',
    name: 'AdminVersions',
    component: () => import('../views/admin/VersionList.vue'),
    meta: { requiresAuth: true, title: '版本管理' },
  },
  {
    path: '/admin/categories',
    name: 'AdminCategories',
    component: () => import('../views/admin/CategoryList.vue'),
    meta: { requiresAuth: true, title: '页面管理' },
  },
  {
    path: '/admin/categories/:id/projects',
    name: 'AdminCategoryProjects',
    component: () => import('../views/admin/ProjectList.vue'),
    meta: { requiresAuth: true, title: '页面下的软件' },
  },
  {
    path: '/admin/icons',
    name: 'AdminIcons',
    component: () => import('../views/admin/IconManager.vue'),
    meta: { requiresAuth: true, title: '图标管理' },
  },
  {
    path: '/admin/backup-files',
    name: 'AdminBackupFiles',
    component: () => import('../views/admin/BackupFiles.vue'),
    meta: { requiresAuth: true, title: '备份管理' },
  },
  {
    path: '/admin/settings',
    name: 'AdminSettings',
    component: () => import('../views/admin/SettingsForm.vue'),
    meta: { requiresAuth: true, title: '网站设置' },
  },
  {
    path: '/admin/acceleration',
    name: 'AdminAcceleration',
    component: () => import('../views/admin/AccelerationSettings.vue'),
    meta: { requiresAuth: true, title: '加速设置' },
  },
  {
    path: '/admin/channel-backup',
    name: 'AdminChannelBackup',
    component: () => import('../views/admin/ChannelBackup.vue'),
    meta: { requiresAuth: true, title: '渠道备份' },
  },
]

const router = createRouter({
  history: createWebHistory('/'),
  routes,
  scrollBehavior() { return { top: 0 } },
})

/* 路由守卫：保护后台路由 */
router.beforeEach((to, _from, next) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    next({ name: 'AdminLogin' })
  } else {
    next()
  }
})

export default router
