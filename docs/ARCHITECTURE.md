# ClinicHub — 架构决策文档（ADR）

> 本文档记录所有重大技术决策及其背后的原因。未来 Agent 修改架构前，必须先理解这里记录的决策背景，避免走回头路。

---

## 1. 整体架构模式：三层插件化

```
┌─────────────────────────────────────────────────────────┐
│                    模块层 (Feature Modules)               │
│   Feature 1: 报告查看 + 邮件发送                          │
│   Feature 2: 预约管理（未来）                              │
│   Feature N: ...（未来持续扩展）                           │
├─────────────────────────────────────────────────────────┤
│                  自动化引擎层 (Automation Engine)          │
│   Playwright 浏览器控制器                                  │
│   Page Object Registry（页面对象注册表）                   │
│   Action Pipeline + 自动重试机制                          │
├─────────────────────────────────────────────────────────┤
│                   核心框架层 (Core Framework)              │
│   凭据管理（加密存储）  配置中心  任务调度/队列  审计日志    │
└─────────────────────────────────────────────────────────┘
```

**决策原因：**
- 每个诊所功能是一个独立插件（Feature Module），注册进模块层即可，不影响其他功能。
- 自动化引擎层只负责"怎么操作浏览器"，不关心业务逻辑。
- 核心框架层只写一次，所有功能共用。
- 新增功能无需改动底层，只新增模块。

---

## 2. 技术栈选型

### 2.1 主语言：TypeScript (Node.js)

**决策：全栈使用 TypeScript**

| 备选方案 | 排除原因 |
|---|---|
| Python | Playwright 虽然支持 Python，但 JS/TS 是 Playwright 原生语言，工具链（codegen、trace viewer）最完整 |
| Java | 启动复杂（Maven/Gradle/JVM 调优），与 Playwright 集成需要额外适配，适合将来对接 HL7/FHIR 等医疗企业系统时引入，现阶段过重 |
| JavaScript（无类型） | 放弃类型安全，大型项目维护成本高 |

**TypeScript 优势：**
- Playwright 原生 TS，codegen 直接生成 TS 代码
- 前后端共享类型定义（患者数据结构、任务状态等）
- 静态类型在多人协作时防止低级错误

### 2.2 前端：Next.js (React + TypeScript)

**定位：** 仅用于 UI Dashboard（任务触发、状态监控、日志查看、医生账号管理）。

**重要：Next.js API Routes 不用于核心业务逻辑**，原因如下：
- Next.js API Routes 是 Serverless 模式，适合短请求，不适合 Playwright 自动化任务（可能运行 2-5 分钟）
- 长连接、后台 Worker 进程不适合在 Next.js 中运行

### 2.3 后端 API：Fastify (Node.js + TypeScript)

**独立服务，不依赖 Next.js。**

选 Fastify 而非 Express 的原因：
- 性能更好（基准测试约 2-3x Express）
- 内置 TypeScript 支持和 JSON Schema 验证
- 插件化架构，与项目整体设计理念一致

### 2.4 自动化引擎：Playwright

**核心组件，不可替代。**

**优势：**
- 原生 TypeScript 支持
- `playwright codegen`：让非技术人员手动操作一遍，自动生成自动化代码
- 内置截图、视频录制、网络请求拦截（HAR 录制/回放）
- `BrowserContext` 天然支持多用户隔离（不同 cookie/session）
- 比 Selenium 稳定，比 Puppeteer 功能更完整

**云端部署注意：**
- Playwright 容器镜像约 1.5GB（含 Chromium）
- 每个 BrowserContext 运行时内存约 300-500MB
- 推荐使用 `browserless` 将浏览器实例独立部署，Worker 服务通过 WebSocket 连接，解耦计算资源

### 2.5 任务队列：BullMQ + Redis

**决策：不使用 Kafka / RabbitMQ**

| 方案 | 排除原因 |
|---|---|
| Kafka | 设计用于每秒百万级消息的分布式流处理，诊所场景每天任务量百级，大炮打蚊子；运维复杂（Zookeeper/KRaft、集群） |
| RabbitMQ | 功能过剩，额外引入 AMQP 协议学习成本 |
| BullMQ | 完美匹配：Node.js 原生，Redis 支持，内置 cron 调度、重试、并发控制、Web UI（Bull Board） |

**BullMQ 核心用途：**
- 每个医生有独立的任务队列（队列名前缀 `doctor:{id}:`）
- 任务失败自动重试（可配置次数和间隔）
- 限速：防止短时间大量操作触发第三方系统的反爬机制
- Bull Board：一行代码接入任务监控 Web UI

### 2.6 数据库：PostgreSQL

**用途：** 任务记录、审计日志、医生账号配置、操作历史。

**多租户设计：** 所有表必须包含 `doctor_id` 字段，作为数据分区键，确保医生间数据严格隔离。

### 2.7 密钥管理

| 环境 | 方案 |
|---|---|
| Phase 1 本地开发 | `.env` 文件（加入 `.gitignore`，绝不提交代码库） |
| Phase 2 云端生产 | AWS Secrets Manager 或 Azure Key Vault（通过抽象接口层访问，代码不直接调用云 SDK） |

**原则：代码库中零明文密码，无例外。**

---

## 3. 多租户架构（医生隔离）

**背景：** 同一诊所有 2-3 名医生，每人有自己的第三方系统账号，必须严格隔离。

**隔离方案：逻辑隔离（Phase 2），演进到物理隔离（SaaS 扩大后）**

### Phase 2 逻辑隔离设计

```
医生A 的请求 → API 鉴权（JWT，含 doctor_id）
             → BullMQ 队列：doctor:A:tasks
             → Worker A → BrowserContext A（独立 Cookie/Session）
             → PostgreSQL：所有查询带 WHERE doctor_id = 'A'
             → 截图存储：screenshots/doctor-A/...
```

**Playwright BrowserContext 隔离：**
```typescript
// 每个医生创建独立的 BrowserContext，完全不共享 Cookie 和 Session
const contextA = await browser.newContext(); // 医生A
const contextB = await browser.newContext(); // 医生B
// contextA 和 contextB 之间完全隔离，如同两个独立的浏览器
```

### 未来物理隔离路径（真正 SaaS 扩大时）

```
现在：1台服务器，多个 BrowserContext 并行
未来：Docker 容器 → 每个医生独立容器实例
迁移成本：改配置文件，不改业务代码
```

---

## 4. 云部署架构

**云厂商：AWS 或 Azure（待定），代码层保持云厂商无关。**

### 4.1 完整云架构图

```
                    ┌──── Internet ────┐
                    │  医生 A / B / C  │
                    │   浏览器访问 Dashboard │
                    └────────┬─────────┘
                             │ HTTPS
                    ┌────────▼─────────┐
                    │   Next.js 前端   │  ← CDN 静态托管
                    │   (Dashboard UI) │    (CloudFront / Azure CDN)
                    └────────┬─────────┘
                             │ REST API
                    ┌────────▼─────────┐
                    │  Fastify API     │  ← 容器，横向扩展
                    │  (鉴权、任务创建) │    (ECS Fargate / ACA)
                    └────────┬─────────┘
                             │ 入队
                    ┌────────▼─────────┐
                    │  Redis (BullMQ)  │  ← 托管服务
                    │  任务队列 + 缓存  │    (ElastiCache / Azure Cache)
                    └────────┬─────────┘
                             │ 出队（每医生独立队列）
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───┐  ┌───────▼────┐  ┌─────▼──────┐
     │  Worker A  │  │  Worker B  │  │  Worker C  │
     │ (医生A专属) │  │ (医生B专属) │  │ (医生C专属) │
     └────────┬───┘  └───────┬────┘  └─────┬──────┘
              └──────────────┼──────────────┘
                             │ WebSocket
                    ┌────────▼─────────┐
                    │   Browserless    │  ← 浏览器池（独立容器）
                    │   (Chromium 实例) │    Worker 不自带浏览器
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │                             │
     ┌────────▼─────────┐       ┌───────────▼──────┐
     │   PostgreSQL     │       │   对象存储         │
     │  任务记录/审计日志│       │  截图/录像文件     │
     │  (RDS / Azure DB)│       │  (S3 / Blob)      │
     └──────────────────┘       └──────────────────┘
```

### 4.2 云厂商无关接口层

```typescript
// 所有云服务通过接口访问，不直接调用 AWS SDK / Azure SDK
interface SecretsProvider {
  getSecret(key: string): Promise<string>;
}

interface StorageProvider {
  upload(path: string, buffer: Buffer): Promise<string>;
  getUrl(path: string): Promise<string>;
}

// 开发环境实现（本地文件）
class LocalSecretsProvider implements SecretsProvider { ... }
// 生产环境实现（注入具体云 SDK）
class AwsSecretsProvider implements SecretsProvider { ... }
class AzureSecretsProvider implements SecretsProvider { ... }
```

### 4.3 部署演进路径

```
阶段 1（Phase 1 - 现在）：
  本地运行，.env 文件，Docker Compose（可选）

阶段 2（Phase 2 初期）：
  Docker Compose 推上云，直接跑在一台 VM 上

阶段 3（Phase 2 生产）：
  Kubernetes / 容器服务，托管 Redis + PostgreSQL，CDN 分发

阶段 4（SaaS 扩大）：
  每医生/每诊所独立容器实例，自动扩缩容
```

---

## 5. 安全设计

### 5.1 测试安全机制（极其重要）

由于目前只有第三方系统的 **prod 环境测试账号**，测试即在生产环境中进行，必须有以下多层保护：

| 机制 | 实现方式 | 保护目标 |
|---|---|---|
| **Dry-Run 模式** | `DRY_RUN=true` 环境变量，所有写操作变为日志打印 | 防止误提交、误发送 |
| **截图留证** | 每个关键步骤前后截图，失败时录制完整视频 | 问题溯源、行为审计 |
| **Human-in-the-loop** | 不可逆操作（提交/发送）前控制台输出摘要，等待 `yes` 确认 | 最后一道人工防线 |
| **收件人沙箱** | 测试模式强制将邮件收件人替换为测试邮箱 | 防止邮件误发真实患者 |
| **账号隔离** | 测试账号凭据单独存储，Profile 切换机制 | 防止混用正式账号 |
| **数据标记** | 测试操作在备注字段写入 `[TEST-{timestamp}]` | 便于事后识别和清理 |
| **步进模式** | `STEP_MODE=true`，每步暂停打印元素选择器 | 开发调试新页面逻辑 |
| **限速** | BullMQ limiter：每分钟最多 N 个任务 | 防止触发第三方反爬封号 |

### 5.2 凭据安全

- **Phase 1：** `.env` 文件本地存储，`.gitignore` 严格排除，绝不提交 Git
- **Phase 2：** AWS Secrets Manager / Azure Key Vault，通过接口层访问
- **代码审查原则：** PR 中出现任何硬编码字符串疑似密码，立即拒绝合并

---

## 6. Feature 1 详细执行流程

```
触发器（手动 or 定时任务）
  ↓
加载医生凭据（从 Secrets Provider）
  ↓
Playwright 启动 BrowserContext（该医生专属）
  ↓
登录第三方系统（截图记录登录状态）
  ↓
导航到患者报告列表页（截图）
  ↓
循环处理每个患者报告：
  ├── 打开报告页（截图）
  ├── 提取报告数据（结构化解析）
  ├── 填写回复内容（Dry-Run：仅打印，不填写）
  ├── 点击保存（Human-in-loop 确认 → Dry-Run：跳过）
  └── 截图记录操作结果
  ↓
数据校验（校验失败 → 中止流程，报警，不继续）
  ↓
组装邮件内容（提取数据 → 模板填充）
  ↓
打开 Web 邮件平台（新 Tab 或新 Context）
  ↓
填写收件人、主题、正文（Dry-Run：仅打印）
  ↓
Human-in-loop 确认发送
  ↓
点击发送（截图确认）
  ↓
写入审计日志（doctor_id、患者ID、操作时间、截图路径、结果）
  ↓
关闭 BrowserContext
```

---

## 7. Page Object Model（POM）规范

所有 Playwright 页面操作必须封装为 Page Object，禁止在业务逻辑中直接写选择器。

```
src/
  automation/
    pages/
      ThirdPartyLoginPage.ts      ← 第三方系统登录页
      PatientReportListPage.ts    ← 患者报告列表页
      PatientReportDetailPage.ts  ← 报告详情页
      WebMailComposePage.ts       ← Web 邮件撰写页
    workflows/
      ReviewAndReplyWorkflow.ts   ← Feature 1 完整流程编排
```

**原因：** 第三方网站 UI 经常变动，POM 集中管理选择器，变动时只改一处，不改业务逻辑。

---

## 8. 语言规范（Language Convention）

**决策：代码库与 UI 全部使用英文，零例外。**

| 范围 | 规范 | 示例 |
|---|---|---|
| 变量名 / 函数名 / 类名 | 英文 | `patientReport`，`runReviewAndReply` |
| 代码注释 | 英文 | `// Retry up to 3 times on failure` |
| 日志消息（`logger.*`） | 英文 | `logger.info('Login successful')` |
| 错误消息（`throw new Error`） | 英文 | `throw new Error('Report list container not found')` |
| UI 文字（按钮、标签、提示） | 英文 | `"Trigger Task"`，`"Dry-Run Mode"` |
| 环境变量 key | 英文大写 + 下划线 | `DRY_RUN`，`TEST_EMAIL_RECIPIENT` |
| 文件名 / 目录名 | 英文驼峰或短横线 | `PatientReportListPage.ts`，`dry-run.ts` |
| Git commit message | 英文 | `feat: add screenshot utility module` |

**禁止：**
- 代码文件中出现任何中文字符（包括注释、字符串、日志）
- UI 组件中出现中文文案

**文档例外：**
- `docs/` 目录下的 Markdown 文档（架构文档、Story 文档）可使用中文，因为这些是给项目维护者阅读的规划文档，不是代码交付物。

---

*最后更新：2026-04-15*
*记录人：架构设计对话（ClinicHub 初始架构讨论）*
