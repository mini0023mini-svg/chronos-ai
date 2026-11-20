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
- 本地规则引擎：`importParser`、`assistantEngine`、`planningEngine`、`notification.scanDueItems`。
- PWA：版本化 SW + BroadcastChannel/localStorage 跨标签页同步 + 到期提醒。
- 错误文案：`lib/errorMessages.ts` + `hooks/useErrorText.ts`，页面禁止直出 error.message。

## 验证状态（2026-11-19）
Phase 1–9 全部交付，V1.0 达成。`npm run typecheck` / `npm run lint` / `npm test`（42/42）/ `npm run build` 四绿。build 有 chunk>500KB 警告（xlsx/pdf 按需加载，非阻塞）。

## 待办（需用户本人账号，无法代做）
1. Git：本地仓库已初始化（2026-11-20，分支 main，占位身份，首次提交 e5764ce）；剩余需用户账号建 GitHub 远程仓库并 push。
2. Supabase：建项目 → 跑 0001_init.sql → 验证 RLS/默认分类/私有 bucket。
3. Gemini 服务端网关：项目内**无 Edge Function 源码**（supabase/ 下仅 0001_init.sql；aiService.ts 为占位、返回 aiUnavailable）。AI 由本地规则引擎提供，免费离线，**当前无需部署网关**；README 中 `supabase functions deploy ai-chat/ai-import` 两行属预留描述，非现役步骤。若日后接入真 AI 需另行开发网关。
4. Vercel：import 仓库 + 配 `VITE_*` 环境变量 + 自定义域名（PWA 必须 HTTPS）。
5. 按 README 部署章节 7 步清单验收。

## 恢复上下文顺序
先读 `.workbuddy/memory/` 最近日志 → 本文件 → 需要时看对应 Phase 的日志条目。改动后重跑四关卡并 `npm run build` 更新 dist。
