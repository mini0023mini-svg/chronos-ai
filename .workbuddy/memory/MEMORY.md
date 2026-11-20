# CHRONOS AI 项目长期笔记

## 项目定位
CHRONOS AI — 智能生活管理系统 PWA。React 18 + TypeScript strict + Vite 6 + Tailwind 3 + react-router-dom 6 + Supabase + Gemini（仅服务端）+ FullCalendar 6。默认中文、Asia/Singapore 可改；软删除；重复规则与实例分离；中英切换；RLS 用户隔离；AI 只生成草案、用户确认闸门。

## 关键路径
- 项目根：`D:/software/workBuddyspace/spaces/2026_11_18_22-29-17`
- 源码：`src/`（pages 页面、services 服务层、lib 规则引擎、components 组件、hooks、context）
- 成品：`dist/`（`npm run build` 产物，部署用；含 sw.js / manifest.webmanifest / icons / assets）
- 数据库：`supabase/migrations/0001_init.sql`（11 张表 + RLS + 触发器 + 默认分类 + 私有 imports bucket）
- 配置：`.env.example`、`vercel.json`、`.github/workflows/ci.yml`、`README.md`（含部署 7 步）

## 架构要点
- 服务双模式：`VITE_USE_MOCK !== 'false' || !isSupabaseConfigured` → mock / supabase。当前 mock 模式免后端可交互。
- 统一服务层：`Result<T>`、`CrudRepo<T>`、`PendingAction`、`ImportCandidate`；所有 AI/规划/导入只产草案，勾选确认才写入。
- 本地规则引擎：`importParser`、`assistantEngine`、`planningEngine`、`notification.scanDueItems`、`scheduleParser`（课程表：星期+节次+周次→精确日期事件）。
- 图片 OCR：`lib/ocr.ts` 用 tesseract.js 本地识别中文（免费无密钥，语言包走 CDN 约 2MB，动态 chunk）。
- 课程表导入（2026-11-21）：`lib/scheduleParser.ts`。周次锚点=第2周周一（默认 2026-09-07，第N周周一=锚点+(N-2)×7天）；支持 `1-18周`/`第N周`/`(双)`/`(单)`/`4-6周,8-11周`；节次按可编辑作息时间表映射（内置：1节08:30-09:10…7-8节15:40-17:00…11-12节19:50-21:10）。因周次不规则，展开成独立事件（非 weekly 规则）。AiImportPage 有「通用/课程表」Tab。示例课表展开 119 节。
- PWA：版本化 SW + BroadcastChannel/localStorage 跨标签页同步 + 到期提醒。
- 错误文案：`lib/errorMessages.ts` + `hooks/useErrorText.ts`，页面禁止直出 error.message。

## 验证状态（2026-11-21）
Phase 1–9 + 后续增强（PWA 子路径适配、本地 OCR、课程表导入）全部交付。`npm run typecheck` / `npm run lint` / `npm test`（62/62）/ `npm run build` 四绿。build 有 chunk>500KB 警告（xlsx/pdf 按需加载，非阻塞）。

## 部署状态（已上线）
- 已放弃 Vercel（用户手机号收不到验证码），改 **GitHub Pages**：线上 `https://mini0023mini-svg.github.io/chronos-ai/`，Settings→Pages Source=GitHub Actions，push 自动部署（`.github/workflows/deploy-pages.yml`）。
- 远程 `https://github.com/mini0023mini-svg/chronos-ai.git`，分支 main，本地与远程同步。
- 适配 HashRouter + base `/chronos-ai/`（静态托管无 history 回退）。GitHub Actions 构建哈希与本地不同属正常，验证线上看内容特征而非文件名。
- 线上为 mock 演示模式，无需 Supabase 即可完整体验；登录点「演示登录」。

## 待办（需用户本人账号，可选增强）
1. Supabase：建项目 → 跑 0001_init.sql → 验证 RLS/默认分类/私有 bucket → 填 VITE_* 环境变量切真实后端。
2. Gemini 服务端网关：项目内**无 Edge Function 源码**；AI 由本地规则引擎提供，免费离线，**无需部署网关**。若日后接真 AI 需另开发服务端网关（密钥不进前端）。

## 恢复上下文顺序
先读 `.workbuddy/memory/` 最近日志 → 本文件 → 需要时看对应 Phase 的日志条目。改动后重跑四关卡并 `npm run build` 更新 dist。
