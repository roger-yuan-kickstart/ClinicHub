# ClinicHub — Story Backlog

> **Story 规范说明**
>
> 每个 Story 代表一个可独立交付的功能单元，由 Agent 独立完成后提交。
> Story 之间的依赖关系通过 `depends on` 字段明确标注。
>
> **Story 状态：**
> - `[ ]` 待开发
> - `[~]` 进行中
> - `[x]` 已完成
> - `[!]` 阻塞中（原因标注在 Story 内）
>
> **Story 字段说明：**
> - **As a**：谁需要这个功能
> - **I want**：要做什么
> - **So that**：为了什么目的
> - **Acceptance Criteria**：完成标准（Agent 交付前必须全部满足）
> - **Depends on**：必须先完成的 Story
> - **Assigned to**：由哪个 Agent 负责

---

## Phase 1 Stories — 打通核心自动化链路

> Phase 1 目标：用最简单的技术栈，让一名医生能完整跑通"登录 → 查看报告 → 填写回复 → 发邮件"这条链路，全程有截图存档，有 Dry-Run 保护，有人工确认关卡。
>
> Phase 1 禁止引入：Redis、PostgreSQL、BullMQ、Fastify、Next.js、Docker。
>
> **语言规范：所有代码（变量名、注释、日志、错误消息、UI 文案）必须使用英文，禁止在代码文件中出现中文字符。文档（`docs/`）除外。**

---

### STORY-001 — 项目脚手架与基础配置

**状态：** `[ ]`

**As a** developer setting up the project for the first time,
**I want** a properly initialized TypeScript project with all configuration files in place,
**So that** any agent can clone the repo and immediately start writing code without setup friction.

**Acceptance Criteria:**
- [ ] `package.json` 存在，包含 `scripts.start`（`ts-node src/runner.ts`）和 `scripts.dev`（`ts-node-dev src/runner.ts`）
- [ ] `tsconfig.json` 配置正确，`strict: true`，`target: ES2020`，`moduleResolution: node`
- [ ] `pnpm` 为包管理器，`package.json` 中有 `packageManager` 字段锁定版本
- [ ] `.gitignore` 包含：`.env`、`node_modules/`、`screenshots/`、`logs/`、`*.har`
- [ ] `.env.example` 包含所有必需的环境变量（含注释说明），**不含任何真实值**
- [ ] `README.md` 包含：项目简介、如何安装依赖、如何运行（Dry-Run 和真实模式）、目录结构说明
- [ ] 依赖安装：`typescript`、`ts-node`、`ts-node-dev`、`playwright`、`@playwright/test`、`dotenv`、`pino`

**Depends on:** 无（第一个 Story）

---

### STORY-002 — 环境变量加载与校验模块

**状态：** `[ ]`

**As a** developer running the automation script,
**I want** all environment variables to be loaded and validated at startup,
**So that** the script fails fast with a clear error message if any required config is missing, rather than crashing midway through a patient report.

**Acceptance Criteria:**
- [ ] `src/config.ts` 导出一个 `config` 对象，包含所有环境变量字段（TypeScript 强类型）
- [ ] 启动时检查所有必填字段：`THIRD_PARTY_URL`、`THIRD_PARTY_USERNAME`、`THIRD_PARTY_PASSWORD`、`WEBMAIL_URL`、`WEBMAIL_USERNAME`、`WEBMAIL_PASSWORD`、`TEST_EMAIL_RECIPIENT`
- [ ] 缺少任意必填字段时，启动立即失败，错误信息明确列出所有缺失的变量名
- [ ] `DRY_RUN`、`STEP_MODE`、`BROWSER_HEADLESS` 等布尔值字段有合理默认值（`DRY_RUN` 默认 `true`，`BROWSER_HEADLESS` 默认 `false`）
- [ ] `SLOW_MO_MS` 默认 `500`，可在 `.env` 中覆盖
- [ ] `SCREENSHOT_DIR` 和 `LOG_DIR` 在 `config.ts` 中读取，默认值分别为 `./screenshots` 和 `./logs`

**Depends on:** STORY-001

---

### STORY-003 — 统一日志工具

**状态：** `[ ]`

**As a** developer debugging automation runs,
**I want** structured, timestamped log output to both console and a local file,
**So that** I can review exactly what the script did during any given run, even after the terminal is closed.

**Acceptance Criteria:**
- [ ] `src/logger.ts` 导出一个 `logger` 实例（基于 `pino`）
- [ ] 日志同时输出到：控制台（human-readable 格式）和本地文件（`./logs/YYYY-MM-DD.log`，JSON 格式）
- [ ] 日志级别：`info`、`warn`、`error`，通过 `LOG_LEVEL` 环境变量控制（默认 `info`）
- [ ] 每条日志包含：时间戳（ISO 格式）、级别、消息
- [ ] 应用启动时自动创建 `logs/` 目录（如不存在）
- [ ] `logger.error` 传入 `Error` 对象时，自动输出 `stack trace`

**Depends on:** STORY-002

---

### STORY-004 — Dry-Run 安全机制

**状态：** `[ ]`

**As a** developer testing against the production environment,
**I want** all write operations to be intercepted and logged instead of executed when `DRY_RUN=true`,
**So that** I can safely run the full automation flow against the real system without accidentally submitting or sending anything.

**Acceptance Criteria:**
- [ ] `src/automation/dryRun.ts` 导出：`safeClick`、`safeFill`、`confirmAction` 三个函数
- [ ] `DRY_RUN=true` 时，`safeClick` 和 `safeFill` 只打日志，不执行任何 Playwright 操作
- [ ] `DRY_RUN=true` 时，`confirmAction` 直接返回 `false`（跳过人工确认步骤）
- [ ] `DRY_RUN=false` 时，`confirmAction` 在控制台打印操作描述，等待用户输入 `yes` 才继续；输入其他任何内容则跳过
- [ ] `STEP_MODE=true` 时，即使 `DRY_RUN=false`，每个 `safeClick` 和 `safeFill` 操作前也先调用 `confirmAction` 确认
- [ ] 所有 Dry-Run 日志带有 `[DRY-RUN]` 前缀，便于日志过滤

**Depends on:** STORY-003

---

### STORY-005 — 截图工具模块

**状态：** `[ ]`

**As a** developer auditing automation behavior,
**I want** every key step of the workflow to automatically capture a screenshot with a meaningful filename,
**So that** I can replay any run visually and identify exactly where something went wrong.

**Acceptance Criteria:**
- [ ] `src/automation/screenshot.ts` 导出 `screenshot(page, stepName)` 函数
- [ ] 截图文件名格式：`{YYYY-MM-DD_HH-mm-ss}_{stepName}.png`（时间戳在前，保证按时间排序）
- [ ] 截图保存到 `config.SCREENSHOT_DIR`（默认 `./screenshots/`）
- [ ] 首次截图时自动创建 `screenshots/` 目录（如不存在）
- [ ] 截图失败时（例如页面已关闭），只打 `warn` 日志，不抛出异常（不能因截图失败中断主流程）
- [ ] 截图成功后，日志输出文件保存路径

**Depends on:** STORY-003

---

### STORY-006 — 共享类型定义

**状态：** `[ ]`

**As a** developer reading or writing automation code,
**I want** all shared data structures to be defined in one place with TypeScript types,
**So that** every part of the codebase speaks the same language and I catch data shape errors at compile time, not runtime.

**Acceptance Criteria:**
- [ ] `src/types/index.ts` 包含以下类型定义：
  - `TaskConfig`：包含所有运行时配置（credentials、模式开关、路径等）
  - `PatientReport`：患者报告的数据结构（`id`、`patientId`、`reportContent`、`replyContent` 等字段）
  - `TaskResult`：任务执行结果（`success: boolean`、`processedCount: number`、`errors: string[]`）
  - `StepContext`：包含 `page`、`config`、`logger` 的组合对象，方便传参
- [ ] 所有类型通过 `export` 导出，其他模块从 `../types` 统一导入
- [ ] 没有 `any` 类型

**Depends on:** STORY-002

---

### STORY-007 — Playwright 浏览器初始化模块

**状态：** `[ ]`

**As a** developer launching the automation,
**I want** a reusable function that initializes Playwright with the correct settings,
**So that** the rest of the code doesn't need to worry about browser configuration, and every run behaves consistently.

**Acceptance Criteria:**
- [ ] `src/automation/browser.ts` 导出 `createBrowserContext(config: TaskConfig)` 函数
- [ ] 函数返回：`{ browser, context, page }` 对象（TypeScript 强类型）
- [ ] 根据 `config.headless` 决定是否无头模式
- [ ] 根据 `config.slowMo` 设置操作间隔（防封号）
- [ ] `BrowserContext` 的 `userAgent` 设置为真实浏览器 UA（不使用 Playwright 默认值）
- [ ] `viewport` 设置为 `1280x720`
- [ ] 导出 `closeBrowser({ browser, context })` 函数，安全关闭所有资源
- [ ] 浏览器启动成功/失败都有日志记录

**Depends on:** STORY-006

---

### STORY-008 — Page Object: 第三方系统登录页

**状态：** `[ ]`

**As a** developer automating the clinic workflow,
**I want** the third-party system login logic encapsulated in a Page Object,
**So that** if the login page UI changes, I only need to update one file—not hunt through workflow code.

**Acceptance Criteria:**
- [ ] `src/automation/pages/ThirdPartyLoginPage.ts` 导出 `ThirdPartyLoginPage` 类
- [ ] 构造函数接收 `page: Page` 参数
- [ ] `navigate()` 方法：导航到 `THIRD_PARTY_URL`，等待页面加载完成
- [ ] `login(username, password)` 方法：填写用户名、密码、点击登录按钮，等待登录成功
- [ ] 登录成功判断：等待登录后才出现的特征元素（例如导航栏、Dashboard 标题）
- [ ] 登录失败时（超时或出现错误提示）抛出描述性 `Error`，包含失败原因
- [ ] 所有选择器定义为类的 `private readonly` 属性（集中管理，禁止硬编码在方法中）
- [ ] **注意：此 Story 中选择器是 placeholder，需在 STORY-012（录制）完成后用真实选择器替换**

**Depends on:** STORY-007

---

### STORY-009 — Page Object: 患者报告列表页

**状态：** `[ ]`

**As a** developer automating patient report processing,
**I want** the report list page logic encapsulated in a Page Object,
**So that** fetching the list of pending reports is a single method call with a typed return value.

**Acceptance Criteria:**
- [ ] `src/automation/pages/PatientReportListPage.ts` 导出 `PatientReportListPage` 类
- [ ] `navigate()` 方法：导航到报告列表页（已登录状态下）
- [ ] `getReportList()` 方法：返回 `PatientReport[]`，包含页面上所有待处理报告的基础信息（`id`、`patientId`）
- [ ] 列表为空时返回空数组，日志打印 "未找到待处理报告"，不抛出异常
- [ ] 所有选择器定义为类的 `private readonly` 属性
- [ ] **注意：此 Story 中选择器是 placeholder，需在 STORY-012（录制）完成后用真实选择器替换**

**Depends on:** STORY-007

---

### STORY-010 — Page Object: 患者报告详情页

**状态：** `[ ]`

**As a** developer automating patient report replies,
**I want** the report detail page logic encapsulated in a Page Object,
**So that** extracting report data and filling the reply field is a clean, testable operation.

**Acceptance Criteria:**
- [ ] `src/automation/pages/PatientReportDetailPage.ts` 导出 `PatientReportDetailPage` 类
- [ ] `open(reportId: string)` 方法：导航到指定报告详情页
- [ ] `extractData()` 方法：提取报告数据，返回完整的 `PatientReport` 对象（含 `reportContent`、`replyContent`）
- [ ] 暴露 `replySelector` 和 `saveButtonSelector` 属性（供 `dryRun.ts` 的 `safeClick/safeFill` 使用）
- [ ] 数据提取失败（元素不存在）时抛出描述性 `Error`
- [ ] 所有选择器定义为类的 `private readonly` 属性
- [ ] **注意：此 Story 中选择器是 placeholder，需在 STORY-012（录制）完成后用真实选择器替换**

**Depends on:** STORY-007

---

### STORY-011 — Page Object: Web 邮件撰写页

**状态：** `[ ]`

**As a** developer automating email sending,
**I want** the webmail compose page logic encapsulated in a Page Object,
**So that** sending an email is a single method call, and the recipient sandbox protection is enforced at the Page Object level.

**Acceptance Criteria:**
- [ ] `src/automation/pages/WebMailComposePage.ts` 导出 `WebMailComposePage` 类
- [ ] `navigate()` 方法：导航到 Web 邮件平台并登录（如需要）
- [ ] `composeEmail({ to, subject, body })` 方法：填写收件人、主题、正文
- [ ] **收件人沙箱强制保护**：当 `DRY_RUN=true` 或 `TEST_EMAIL_RECIPIENT` 不为空时，实际填写的收件人必须替换为 `TEST_EMAIL_RECIPIENT`，日志明确打印 "⚠️ 收件人已替换为测试邮箱: {TEST_EMAIL_RECIPIENT}"
- [ ] `sendEmail()` 方法：点击发送按钮（通过 `safeClick` 执行，受 Dry-Run 保护）
- [ ] 所有选择器定义为类的 `private readonly` 属性
- [ ] **注意：此 Story 中选择器是 placeholder，需在 STORY-012（录制）完成后用真实选择器替换**

**Depends on:** STORY-004, STORY-007

---

### STORY-012 — Playwright Codegen 录制会话

**状态：** `[ ]`

> ⚠️ **这个 Story 由人类完成，不是 Agent 任务。**
>
> 这是 Phase 1 开发的关键节点：需要开发者手动操作第三方系统，让 Playwright 录制真实的选择器和操作流程。

**As a** developer who has access to the real clinic system,
**I want** to record a complete manual walkthrough of the full workflow using Playwright Codegen,
**So that** all subsequent Page Objects can be filled with real, working selectors.

**Acceptance Criteria:**
- [ ] 执行 `pnpm exec playwright codegen --save-har=./recordings/session.har {THIRD_PARTY_URL}` 启动录制
- [ ] 录制覆盖完整流程：登录 → 报告列表 → 打开报告 → 填写回复 → 跳转邮件平台 → 撰写邮件 → 发送
- [ ] 录制生成的 TypeScript 代码保存到 `./recordings/codegen-output.ts`（提交 Git，供 Agent 参考）
- [ ] HAR 文件保存到 `./recordings/session.har`（加入 `.gitignore`，因可能含敏感数据）
- [ ] 录制完成后，在 `./recordings/SELECTORS.md` 中手工整理所有关键元素的选择器和页面跳转 URL
- [ ] 将 `SELECTORS.md` 中的选择器同步更新到 STORY-008 ~ STORY-011 的 Page Object 中

**Depends on:** STORY-008, STORY-009, STORY-010, STORY-011（Page Object 骨架需先建好，录制后填入真实选择器）

---

### STORY-013 — Feature 1 主工作流编排

**状态：** `[ ]`

**As a** developer running the complete automation,
**I want** a single workflow function that orchestrates the full end-to-end process,
**So that** the runner just calls one function and the entire feature executes with proper error handling and logging.

**Acceptance Criteria:**
- [ ] `src/automation/workflows/ReviewAndReplyWorkflow.ts` 导出 `runReviewAndReply(config: TaskConfig): Promise<TaskResult>` 函数
- [ ] 严格按照以下步骤编排（每步之间截图）：
  1. 初始化浏览器 & BrowserContext
  2. 登录第三方系统（截图：`01-before-login`、`02-after-login`）
  3. 获取报告列表（截图：`03-report-list`）
  4. 遍历每条报告：
     - 打开报告详情（截图：`04-report-{patientId}`）
     - 提取报告数据
     - 填写回复（通过 `safeFill`）（截图：`05-reply-filled-{patientId}`）
     - Human-in-loop 确认保存
     - 点击保存（通过 `safeClick`）（截图：`06-saved-{patientId}`）
     - 发送邮件（调用 `sendEmailForReport`，独立函数）
  5. 写入汇总日志
  6. 关闭浏览器
- [ ] 任何步骤抛出异常时：截图（`ERROR-{timestamp}`），日志记录详细错误，然后抛出
- [ ] `TaskResult` 包含：`success`、`processedCount`、`errors[]`
- [ ] `finally` 块确保浏览器总是被关闭，即使中途抛出异常

**Depends on:** STORY-008, STORY-009, STORY-010, STORY-011, STORY-012

---

### STORY-014 — 主入口 Runner

**状态：** `[ ]`

**As a** developer triggering the automation,
**I want** a single entry point script that I can run with `pnpm start`,
**So that** I don't need to understand the internals—just run one command and the whole thing fires.

**Acceptance Criteria:**
- [ ] `src/runner.ts` 是整个程序的入口
- [ ] 启动时打印运行模式（DRY-RUN 还是真实模式）、当前时间、配置摘要（不打印密码）
- [ ] 从 `config.ts` 读取配置，构建 `TaskConfig` 对象
- [ ] 调用 `runReviewAndReply(config)` 并等待结果
- [ ] 完成后打印汇总：处理了几条报告、是否有错误、截图目录路径
- [ ] 未捕获的异常（process-level）有全局 handler，打印 `logger.error` 后以非零退出码退出
- [ ] `DRY_RUN=true` 时，运行前在控制台打印醒目的警告横幅（让操作者清楚知道是安全模式）

**Depends on:** STORY-013

---

### STORY-015 — Dry-Run 端到端验证

**状态：** `[ ]`

> ⚠️ **这个 Story 由人类完成，不是 Agent 任务。**
>
> 这是 Phase 1 的第一个里程碑：在 Dry-Run 模式下完整跑通全流程。

**As a** developer who has built all Phase 1 components,
**I want** to run the complete script in Dry-Run mode and verify every step executes correctly,
**So that** I can confidently move to real mode knowing the logic is sound.

**Acceptance Criteria:**
- [ ] `DRY_RUN=true pnpm start` 完整运行，无 crash，无未处理异常
- [ ] 日志中每个关键步骤都有记录，顺序与 STORY-013 定义的步骤一致
- [ ] `[DRY-RUN]` 标记的条目清楚显示"跳过了什么操作"
- [ ] `screenshots/` 目录下有每个步骤对应的截图文件，按时间戳排序
- [ ] 每张截图打开后，画面内容与步骤描述一致（人工目视检查）
- [ ] 日志中无真实收件人出现（验证沙箱保护生效）
- [ ] 运行结束时，控制台打印汇总，处理报告数量正确

**Depends on:** STORY-014

---

### STORY-016 — 真实模式首次发送验证

**状态：** `[ ]`

> ⚠️ **这个 Story 由人类完成，不是 Agent 任务。**
>
> 这是 Phase 1 的最终里程碑，也是进入 Phase 2 的门票。

**As a** developer who has validated the Dry-Run flow,
**I want** to run the script in real mode with human confirmation gates active,
**So that** I can verify the system can successfully send one real email to the test inbox with full audit trail.

**Acceptance Criteria:**
- [ ] `DRY_RUN=false pnpm start` 运行时，所有 `confirmAction` 关卡正常工作（输入 `yes` 才继续）
- [ ] 测试收件人邮箱（`TEST_EMAIL_RECIPIENT`）成功收到至少一封测试邮件
- [ ] 邮件内容与报告数据匹配（非乱码、非模板占位符）
- [ ] 第三方系统中对应患者的回复字段已被正确填写，带有 `[TEST]` 标记
- [ ] `screenshots/` 目录有完整的截图存档，包括邮件发送成功截图
- [ ] 日志文件完整记录了本次运行的全部操作
- [ ] `.env` 未被提交到 Git（`git status` 验证）

**Depends on:** STORY-015

---

## Phase 1 Story 执行顺序

```
STORY-001 (脚手架)
    ↓
STORY-002 (配置加载)
    ↓
STORY-003 (日志工具)
    ├──→ STORY-004 (Dry-Run 机制)
    └──→ STORY-005 (截图工具)
         ↓
STORY-006 (类型定义)
    ↓
STORY-007 (浏览器初始化)
    ├──→ STORY-008 (POM: 登录页)
    ├──→ STORY-009 (POM: 报告列表页)
    ├──→ STORY-010 (POM: 报告详情页)
    └──→ STORY-011 (POM: 邮件撰写页)
         ↓
    STORY-012 ⚠️ [人类操作: Codegen 录制]
         ↓
    STORY-013 (主工作流编排)
         ↓
    STORY-014 (主入口 Runner)
         ↓
    STORY-015 ⚠️ [人类操作: Dry-Run 验证]
         ↓
    STORY-016 ⚠️ [人类操作: 真实模式验证]
         ↓
    ✅ Phase 1 完成，进入 Phase 2
```

---

## Phase 2 Stories — 待规划

> Phase 2 的 Story 拆分将在 Phase 1 全部完成（STORY-016 通过）后进行。
>
> 已知的 Phase 2 Epic 列表（Epic 级别，尚未拆分为 Story）：
>
> - **EPIC-P2-001** — Monorepo 结构搭建（pnpm workspace）
> - **EPIC-P2-002** — Docker Compose 本地环境（PostgreSQL + Redis + Browserless）
> - **EPIC-P2-003** — Prisma Schema 与数据库迁移
> - **EPIC-P2-004** — BullMQ Worker（Phase 1 Workflow 封装为 Job Handler）
> - **EPIC-P2-005** — Fastify API（任务创建、查询、医生管理）
> - **EPIC-P2-006** — JWT 认证 + 多租户隔离
> - **EPIC-P2-007** — Bull Board 任务监控 UI 接入
> - **EPIC-P2-008** — infra 抽象层（SecretsProvider + StorageProvider）
> - **EPIC-P2-009** — Next.js Dashboard（任务触发、状态监控、审计日志）
> - **EPIC-P2-010** — 云端部署（AWS 或 Azure，待定）
> - **EPIC-P2-011** — 监控与告警配置

---

## 📊 Phase 1 快速状态总览

> 每次开始新的 Agent 会话前，先看这张表，确认当前状态。
> 更新规则：Story 状态变更时，同步更新下方表格 + Story 正文中的状态标记。

| Story | 标题 | 执行者 | 状态 | 备注 |
|---|---|---|---|---|
| STORY-001 | 项目脚手架与基础配置 | Agent | `[ ] 待开始` | — |
| STORY-002 | 环境变量加载与校验 | Agent | `[ ] 待开始` | 依赖 001 |
| STORY-003 | 统一日志工具 | Agent | `[ ] 待开始` | 依赖 002 |
| STORY-004 | Dry-Run 安全机制 | Agent | `[ ] 待开始` | 依赖 003 |
| STORY-005 | 截图工具模块 | Agent | `[ ] 待开始` | 依赖 003 |
| STORY-006 | 共享类型定义 | Agent | `[ ] 待开始` | 依赖 002 |
| STORY-007 | Playwright 浏览器初始化 | Agent | `[ ] 待开始` | 依赖 006 |
| STORY-008 | POM: 第三方系统登录页 | Agent | `[ ] 待开始` | 依赖 007，选择器待录制后补全 |
| STORY-009 | POM: 患者报告列表页 | Agent | `[ ] 待开始` | 依赖 007，选择器待录制后补全 |
| STORY-010 | POM: 患者报告详情页 | Agent | `[ ] 待开始` | 依赖 007，选择器待录制后补全 |
| STORY-011 | POM: Web 邮件撰写页 | Agent | `[ ] 待开始` | 依赖 004+007，选择器待录制后补全 |
| STORY-012 | ⚠️ Codegen 录制会话 | **人类** | `[ ] 待开始` | 需亲自操作，依赖 008~011 骨架完成 |
| STORY-013 | Feature 1 主工作流编排 | Agent | `[ ] 待开始` | 依赖 012 完成（真实选择器到位后） |
| STORY-014 | 主入口 Runner | Agent | `[ ] 待开始` | 依赖 013 |
| STORY-015 | ⚠️ Dry-Run 端到端验证 | **人类** | `[ ] 待开始` | 需亲自操作并人工目视核查截图 |
| STORY-016 | ⚠️ 真实模式首次发送验证 | **人类** | `[ ] 待开始` | Phase 1 最终里程碑 |

**进度：** 0 / 16 完成 &nbsp;|&nbsp; 🤖 Agent 任务：13 个 &nbsp;|&nbsp; 👤 人类任务：3 个

---

*最后更新：2026-04-15*
*文档维护：Top Agent（架构决策 & Story 设计）*
*执行：Implementation Agent（Story 级别逐一完成）*
