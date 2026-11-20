# CHRONOS AI — Your Intelligent Life Management System

个人 AI 生活管理系统：理解生活安排、整理日程、管理任务、识别文件、智能规划时间。

> **当前状态：Phase 9 完成 — 9 个 Phase 全部交付，V1.0 达成。**
> 测试：Vitest 42 个用例覆盖全部纯函数引擎与总线/错误映射，CI 自动跑 typecheck→lint→test→build。
> 错误处理：所有错误码按中英 i18n 展示用户可读文案（不再暴露英文技术信息），ErrorBoundary 路由切换自动恢复。
> 部署：主路径为 GitHub Pages（含 `deploy-pages.yml` 自动部署，HashRouter 适配子路径）；Vercel 为可选（`vercel.json`）。Supabase 上线检查清单齐备。
> Phase 3–8 的日历/任务/重复/截止/软删除/时区/AI Import/AI Assistant/Smart Planning/PWA 离线/实时同步/通知全部可用。
> **本地规则引擎**为 AI 网关未部署时的降级核心（离线、免费），网关部署后自动优先使用 AI。
> 未配置 Supabase 密钥时自动降级到 mock 演示模式（localStorage 持久化），网站始终可运行。
> 实际启用 GitHub Pages / 创建 Supabase 项目 / 部署 Vercel 需用户账号授权，本项目已备好全部配置与文档。

---

## 技术栈（全部免费）

React 18 · TypeScript（严格模式）· Tailwind CSS 3 · Vite 6 · react-router-dom 6 ·
FullCalendar 6（免费基础功能）· Zustand · date-fns + date-fns-tz ·
react-hook-form + zod · lucide-react · Supabase 免费层（Phase 2+）·
Google Gemini 免费额度（Phase 5+，经服务端代理）· Vercel Hobby · PWA。

---

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发（默认 mock 模式，无需任何后端）
npm run dev
# 打开 http://localhost:5173 ；server.host=true，同网络手机可直接访问

# 类型检查 / 代码检查 / 构建
npm run typecheck
npm run lint
npm run build

# 预览生产构建（验证 PWA manifest / service worker）
npm run preview
```

默认环境变量位于 `.env.local`（`VITE_USE_MOCK=true`），无需修改即可运行演示模式：打开后会进入登录页，点击「演示登录」即可体验完整应用（本地示例数据，可增改任务/日程）。配置 Supabase 后即可切换为真实账户与云端持久化。

---

## 目录结构

```
.
├── public/                    # PWA manifest / service worker / 图标
├── src/
│   ├── main.tsx / App.tsx     # 入口与全局 Provider
│   ├── router/                # 路由表 + ProtectedRoute 守卫
│   ├── layouts/               # 响应式外壳：桌面侧栏 / 移动底栏 / 顶栏
│   ├── components/            # ui 通用组件 / 三态 / 日历包装 / 错误边界
│   │   ├── calendar/          # CalendarShell / EventForm / ScopeDialog（影响范围）
│   │   ├── tasks/             # TaskForm
│   │   ├── deadlines/         # DeadlineForm
│   │   ├── recovery/          # RecoveryCenter（软删除恢复）
│   │   ├── recurrence/        # RuleManager（重复规则管理）
│   │   ├── pwa/               # InstallPrompt（PWA 安装横幅）
│   │   └── settings/          # NotificationSettings（通知偏好面板）
│   ├── pages/                 # 10 个功能模块页面
│   ├── context/               # I18n / Theme / Auth / Preferences（全局时区）/ Sync（实时同步状态）Context
│   ├── i18n/                  # 中英文案（类型对齐）
│   ├── services/              # interfaces + mock / supabase 实现 + calendarService + importService + assistantService + planningService + realtimeService（Supabase Realtime）
│   ├── hooks/                 # useAsync / useMediaQuery / useDataSync / useDueReminders / usePwaInstall / context hooks
│   ├── types/                 # 领域模型 / 枚举 / API 类型
│   ├── lib/                   # 时区 / 错误 / 工具 / recurrence / deadline / importParser / assistantEngine / planningEngine / syncBus（数据变更总线）/ notification（通知与到期扫描）
│   └── styles/                # Tailwind 与全局样式
├── supabase/migrations/       # 0001_init.sql（11 表 + RLS + 软删除 + 时区）
├── .env.example               # 公开环境变量示例
└── .github/workflows/ci.yml   # CI：typecheck / lint / build
```

架构原则：**UI 只依赖 `services/interfaces.ts`**，不直接引用数据源。切换 mock → Supabase 时页面零改动。

---

## Phase 路线与当前进度

| Phase | 目标 | 状态 |
|---|---|---|
| 1 | 项目初始化 / UI 框架 / 路由 / 响应式布局 | ✅ 完成 |
| 2 | 登录 + Supabase + RLS + profiles | ✅ 完成 |
| 3 | Calendar + Tasks CRUD | ✅ 完成 |
| 4 | 重复课程 / 截止 / 软删除 / 时区 | ✅ 完成 |
| 5 | AI Import 上传 / 预览 / 确认 / 冲突检测 | ✅ 完成 |
| 6 | AI Assistant 聊天管理（确认闸门 / 本地引擎） | ✅ 完成 |
| 7 | Smart Planning / Plan My Day / Reschedule | ✅ 完成 |
| 8 | PWA 离线增强 / 实时同步 / 通知增强 | ✅ 本版本 |
| 9 | 测试 / 错误处理 / Vercel 部署 | ✅ 本版本 |

---

## 环境变量与安全

### 前端公开变量（`.env.example`，可进 Git，只有 `VITE_` 前缀）

```dotenv
VITE_APP_NAME=CHRONOS AI
VITE_DEFAULT_LOCALE=zh-CN
VITE_DEFAULT_TIMEZONE=Asia/Singapore
VITE_USE_MOCK=true
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_AI_GATEWAY_URL=/api/ai
```

### 服务端机密（绝不进前端 / 绝不提交 GitHub）

| 变量 | 存放位置 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function secrets / Vercel 环境变量 |
| `GEMINI_API_KEY` | Supabase Edge Function secrets / Vercel 环境变量 |

`.gitignore` 已忽略 `.env`、`.env.local`、`.env.*.local`。

**AI 降级保证**：AI 服务不可用（如免费额度耗尽返回 429）时，前端自动切换「手动输入 / 手动导入」路径，日历与任务核心功能不受影响。

---

## Supabase 接入指引（切换到真实后端）

Phase 2 已写好全部 Supabase 集成代码（Auth / RLS 数据服务 / profiles / storage）。按以下步骤从演示模式切换到真实后端：

1. 访问 [supabase.com](https://supabase.com)，用 GitHub 账号登录，New project（选择 Free 层）。
2. SQL Editor 中粘贴执行 `supabase/migrations/0001_init.sql`（或安装 Supabase CLI 后 `supabase db push`）。
3. Project Settings → API，复制 `URL` 与 `anon public` key，填入 `.env.local`：
   ```dotenv
   VITE_USE_MOCK=false
   VITE_SUPABASE_URL=https://<你的项目>.supabase.co
   VITE_SUPABASE_ANON_KEY=<你的-anon-public-key>
   ```
4. Authentication → Providers → Email 开启（如需邮箱验证，注册后到邮箱完成验证）。
5. 重启 `npm run dev`，此时登录页显示真实邮箱/密码表单；注册账户后：
   - `profiles` 自动创建一行；
   - `categories` 自动生成 6 个默认分类；
   - 用第二个账号登录，确认无法读取第一账号的数据（RLS 按 `auth.uid()` 隔离）。
6. Edge Functions（Phase 5+）：
   ```bash
   supabase secrets set GEMINI_API_KEY=你的密钥
   supabase functions deploy ai-chat
   supabase functions deploy ai-import
   ```

**双模式说明**：`services/index.ts` 依据 `VITE_USE_MOCK` 与配置完整性自动选择实现。未填 Supabase 配置时始终用 mock，因此即使误设 `VITE_USE_MOCK=false` 也不会白屏。

> 注意：Supabase 免费项目在长期（约 1 周）无访问后会被暂停，登录控制台恢复即可。

---

## 时区与设计约定

- 数据库时间列统一 `timestamptz`；业务显示时区记录在每行 `timezone` 字段，默认 `Asia/Singapore`。
- 前端用 `date-fns-tz` 做 UTC ↔ 本地转换，「今天」按用户时区判断，不使用服务器 UTC。
- 主色板：背景 `#F7F8FA`、卡片 `#FFFFFF`、主文字 `#252525`、次文字 `#8B9099`、主色 `#829CC4`、成功 `#A0BDA7`、警告 `#E8C77B`、错误 `#D98C8C`。
- 桌面：左侧固定导航 + 右侧内容；平板：折叠侧栏；手机：底部导航 + 触屏卡片。
- 所有页面均含 loading / empty / error 三态；中英文覆盖主要文案。

---

## 部署（GitHub Pages 为主，Vercel 可选）

> 主部署路径为 **GitHub Pages**：复用已有 GitHub 账号，免费、自动 HTTPS，无需注册第三方平台或手机号验证。
> 仓库已包含 `.github/workflows/deploy-pages.yml`（自动构建并部署）与 `ci.yml`（`typecheck → lint → test → build`）。
> 以下步骤需要你自己的 GitHub / Supabase 账号授权，无法代做。

### A. GitHub Pages 部署（推荐）

应用为纯静态前端，采用 **HashRouter**（URL 形如 `https://<账号>.github.io/chronos-ai/#/calendar`），
因此无需服务端 SPA 回退；Vite 生产 `base` 设为 `/chronos-ai/`，资源与 Service Worker 均按子路径解析。

1. **推送代码**：在 GitHub 新建名为 `chronos-ai` 的仓库（若仓库名不同，需同步修改 `vite.config.ts` 的 `base`），本地执行
   ```bash
   git remote add origin https://github.com/<你的账号>/chronos-ai.git
   git branch -M main && git push -u origin main
   ```
2. **启用 Pages**：GitHub 仓库 → Settings → Pages → Build and deployment，
   Source 选择 **GitHub Actions**。推送会触发 `deploy-pages.yml`：四关卡验证通过后自动构建并发布。
3. **查看网址**：部署完成后，Actions 页 `deploy` 步骤输出 `page_url`，
   或仓库 Settings → Pages 顶部显示 `https://<你的账号>.github.io/chronos-ai/`。
4. **PWA 已就绪**：HTTPS 自动启用；manifest 使用相对路径、`sw.js` 从 scope 推导子路径，离线与安装均正常。
5. **配置后端（可选）**：如需真实登录与云端持久化，见下方「Supabase 接入指引」；
   未在 GitHub Actions 配置 `VITE_` 环境变量时默认演示模式，无需任何密钥。

### B. Vercel 部署（可选替代）

> 若你更偏好 Vercel，仓库同样兼容：`vercel.json` 含 SPA fallback rewrite 与 PWA 缓存头。
> 该路径需注册 Vercel 账号（部分注册流程要求手机号验证）。

1. vercel.com → Add New → Project → Import 仓库，框架预设 Vite，`vercel.json` 自动生效。
2. Project Settings → Environment Variables 只填 `VITE_` 公开变量；演示模式可留空。
3. 服务端密钥 `GEMINI_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 只放服务端环境，**绝不写入前端或提交 GitHub**。
4. 自定义域名在 Vercel → Settings → Domains 添加。

### C. 通用上线检查清单

- **AI 网关**：Phase 5–7 的 AI 能力由本地规则引擎提供（免费、离线），**无需部署网关**；
  项目当前未含 Edge Function 源码，README 早期提到的 `ai-chat` / `ai-import` 为预留描述，非现役步骤。
- **Supabase（可选）**：执行 `supabase/migrations/0001_init.sql`；确认 11 张表 RLS 按 `auth.uid()` 隔离；
  `profiles` 触发器与 6 个默认分类种子生效；Storage bucket `imports` 设为私有。

---

## 验证清单（Phase 1–9）

演示模式（无需后端）：

- [ ] `npm install`、`npm run typecheck`、`npm run lint`、`npm test`（42 用例）、`npm run build` 全绿
- [ ] **测试覆盖**：timezone / recurrence / deadline / errors / errorMessages / importParser / assistantEngine / planningEngine / notification / syncBus 均有断言
- [ ] `npm run dev` 打开后进入登录页，点「演示登录」进入应用
- [ ] **Calendar**：点「新建日程」创建事件，含标题/起止时间/分类/地点/备注
- [ ] **Calendar**：勾选「重复」创建每周课程，日历出现多个周次实例
- [ ] **Calendar**：点击重复课程，删除时选择「仅此次」——其他周次仍在
- [ ] **Calendar**：编辑重复课程选择「此后全部 / 全部」，批量更新生效
- [ ] **Calendar**：拖动日程改期；复制日程生成副本
- [ ] **Calendar**：创建与已有时段重叠的事件，出现冲突提示，可选「仍然保存」
- [ ] **Calendar**：年 / 月 / 周 / 日 四视图切换正常（年视图点日期可新建）
- [ ] **Tasks**：新建任务填全字段（分类/优先级/耗时/截止/提醒/父任务/备注）
- [ ] **Tasks**：添加子任务、勾选完成；父任务完成后隐藏，勾选「显示已完成」可见并恢复
- [ ] **Tasks**：编辑 / 删除任务，刷新页面数据仍在（localStorage 持久化）
- [ ] **Deadlines**：新建/编辑/删除截止事项；状态颜色按截止时间自动计算（蓝/绿/黄/红/灰）；标记完成与重新开启
- [ ] **软删除恢复**：History 页「已删除」Tab 或 Settings「软删除恢复」，恢复日程/任务/截止
- [ ] **重复规则**：Settings「重复规则」查看规则、停用后不再生成新实例（已有实例保留）
- [ ] **时区**：Settings 切换时区（如 Asia/Shanghai），Dashboard/日历/任务/通知时间显示即时变化，刷新后保持
- [ ] **AI Import**：点「填入示例」→「开始识别」，预览列出 3 门课程（含每周重复规则与地点）、1 个截止、1 个缺日期任务
- [ ] **AI Import**：识别结果带置信度与「待确认 / 缺日期 / 冲突 / 疑似重复」标记；可改标题、补日期
- [ ] **AI Import**：勾选条目→「确认写入」，日历/任务/截止页出现对应新数据；缺日期项被跳过
- [ ] **AI Import**：上传 TXT/DOCX/XLSX/PDF 可提取文字并识别；图片上传给出「手动输入」降级提示（不报错瘫痪）
- [ ] **AI Assistant**：点快捷指令「今天安排 / 查空闲」得到日程与空闲时段回答（本地引擎，无需 AI 网关）
- [ ] **AI Assistant**：输入「明天 14:00-15:00 和张三开会」，生成带「确认写入」卡片的待确认操作，**此时日历无变化**；点确认后日历出现该日程
- [ ] **AI Assistant**：输入「创建任务：买牛奶」/「提醒我周五前交报告」，确认后任务/截止页出现对应数据
- [ ] **AI Assistant**：待确认卡片支持全选/取消、时间冲突提示、忽略；刷新页面会话与未确认项仍保留
- [ ] **Smart Planning**：点「生成今日计划」，草案按优先级列出专注时段；**此时日历无变化**；勾选后点「确认写入日历」，日历出现专注时段
- [ ] **Smart Planning**：生成计划时不会排入已占用课程时段（专注时段不与已有日程重叠）
- [ ] **Smart Planning**：「重新规划未完成任务」把逾期/未完成任务分散到未来 7 天的空闲时段
- [ ] **Dashboard**：点「Plan My Day」跳转到智能规划页并自动生成今日计划草案
- [ ] **PWA**：生产构建后 Service Worker 注册成功；断网刷新仍能打开应用外壳（离线 fallback）；manifest 含安装快捷方式
- [ ] **PWA**：支持的浏览器在内容顶部出现「安装 CHRONOS AI」横幅，可安装/关闭（关闭后本次会话不再出现）
- [ ] **实时同步**：打开两个标签页，在一个标签页新建/编辑日程，另一个标签页在约 150ms 后静默刷新看到变更（无需手动刷新）
- [ ] **通知**：设置页开启浏览器通知并授权后，发送测试通知可见；提前提醒分钟数可切换（5/10/15/30/60/120）
- [ ] **通知**：未授权或不支持通知的浏览器，到期提醒只写入应用内通知页，不报错
- [ ] 顶栏或设置页「退出登录」后回到登录页；语言与主题切换生效

真实后端模式（配置 Supabase 后）：

- [ ] 邮箱注册/登录成功，profiles 与 6 个默认分类自动创建
- [ ] 两个账号数据互相隔离（RLS）
- [ ] 新建任务写入数据库，刷新后仍存在
- [ ] 软删除任务后从列表隐藏，数据库 `deleted_at` 有值
