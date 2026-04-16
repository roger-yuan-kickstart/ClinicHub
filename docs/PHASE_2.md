# Phase 2 — 完整生产架构

> **前提条件：** Phase 1 链路已完整打通，Feature 1 在测试账号上稳定运行，人工审核通过。
>
> **目标：** 将 Phase 1 的单脚本升级为完整的生产级 SaaS 系统，支持多医生、云部署、任务调度、监控告警、前端 Dashboard。
>
> **写给 Agent 的说明：** Phase 2 是对 Phase 1 代码的工程化封装，不是重写。所有 Phase 1 的 Page Object 和 Workflow 代码直接复用，只是加了更多的基础设施层。

---

## 1. Phase 2 完整技术栈

| 层次 | 技术 | 版本要求 | 说明 |
|---|---|---|---|
| 前端 | Next.js + React + TypeScript | Next.js 14+ | 仅 UI，不跑自动化 |
| 后端 API | Fastify + TypeScript | Fastify 4+ | 独立服务，长连接友好 |
| 自动化引擎 | Playwright + TypeScript | 最新稳定版 | Phase 1 代码直接复用 |
| 任务队列 | BullMQ | 5+ | Redis 为后端 |
| 队列存储 | Redis | 7+ | 托管服务 |
| 数据库 | PostgreSQL | 15+ | 托管服务 |
| ORM | Prisma | 5+ | 类型安全，Schema 迁移 |
| 浏览器托管 | Browserless | latest | 浏览器实例独立部署 |
| 任务监控 UI | Bull Board | 最新 | 接入 Fastify，一行代码 |
| 容器化 | Docker + Docker Compose | — | 开发和部署统一 |
| 编排（生产） | Kubernetes / ECS Fargate | — | 按需扩缩容 |
| 密钥管理 | AWS Secrets Manager 或 Azure Key Vault | — | 通过抽象接口层访问 |
| 对象存储 | AWS S3 或 Azure Blob Storage | — | 截图、录像文件 |
| CDN | CloudFront 或 Azure CDN | — | 前端静态资源 |
| 认证 | JWT + Refresh Token | — | 医生登录 Dashboard |

---

## 2. 完整系统架构图

```
                         ┌─────────────────────────────┐
                         │         Internet             │
                         │    医生 A  /  医生 B  /  医生 C   │
                         │      浏览器访问 Dashboard    │
                         └──────────────┬──────────────┘
                                        │ HTTPS
                         ┌──────────────▼──────────────┐
                         │       Next.js 前端           │
                         │       (Dashboard UI)         │  ← CDN 静态托管
                         │  任务触发 / 状态监控 / 审计   │    CloudFront / Azure CDN
                         └──────────────┬──────────────┘
                                        │ REST API / JWT 认证
                         ┌──────────────▼──────────────┐
                         │       Fastify API            │
                         │  任务创建 / 医生管理 / 鉴权  │  ← 容器，横向扩展
                         │       Bull Board UI          │    ECS Fargate / ACA
                         └──────────────┬──────────────┘
                                        │ 入队 (BullMQ)
                         ┌──────────────▼──────────────┐
                         │    Redis (BullMQ 队列)       │  ← 托管服务
                         │   key: doctor:{id}:tasks:*   │    ElastiCache / Azure Cache
                         └──────────────┬──────────────┘
                                        │ 出队（每医生独立队列）
               ┌────────────────────────┼────────────────────────┐
               │                        │                        │
    ┌──────────▼──────────┐  ┌──────────▼──────────┐  ┌─────────▼───────────┐
    │      Worker A       │  │      Worker B       │  │      Worker C       │
    │    (医生A 专属)      │  │    (医生B 专属)      │  │    (医生C 专属)      │
    │  concurrency: 1     │  │  concurrency: 1     │  │  concurrency: 1     │
    │  limiter: 2/min     │  │  limiter: 2/min     │  │  limiter: 2/min     │
    └──────────┬──────────┘  └──────────┬──────────┘  └─────────┬───────────┘
               └────────────────────────┼────────────────────────┘
                                        │ WebSocket (CDP)
                         ┌──────────────▼──────────────┐
                         │         Browserless          │
                         │       (Chromium 浏览器池)     │  ← 独立容器，统一管理
                         │   BrowserContext A (医生A)   │    Worker 不自带浏览器
                         │   BrowserContext B (医生B)   │    各 Context 独立隔离
                         │   BrowserContext C (医生C)   │
                         └──────────────┬──────────────┘
                                        │
                                        │ 操作第三方系统 + Web 邮件平台
                         ┌──────────────▼──────────────┐
                         │      第三方医疗管理系统       │
                         │   (登录 / 查看报告 / 保存)   │  ← 外部系统，只读写自己账号
                         │      Web 邮件平台            │
                         └─────────────────────────────┘

                         持久化层（所有服务共用）

               ┌──────────────────┐        ┌──────────────────────┐
               │    PostgreSQL    │        │    对象存储            │
               │  任务记录        │        │  截图 / 录像文件       │
               │  审计日志        │        │  路径: {doctorId}/    │
               │  医生配置        │        │        {taskId}/      │
               │  所有表含        │        │        {step}.png     │
               │  doctor_id 字段  │        │  S3 / Azure Blob      │
               │  (RDS / Azure DB)│        └──────────────────────┘
               └──────────────────┘

                         密钥管理（所有服务通过接口层访问）

                         ┌──────────────────────────────┐
                         │  AWS Secrets Manager         │
                         │  或 Azure Key Vault          │  ← 医生第三方账号密码
                         │  接口层：SecretsProvider     │    JWT 签名密钥
                         │  代码不直接调用云 SDK         │    数据库连接串
                         └──────────────────────────────┘
```

### 架构关键设计说明

| 设计点 | 原因 |
|---|---|
| Worker 每医生独立，`concurrency: 1` | 同一医生账号同时只跑一个任务，防止第三方系统 session 冲突 |
| `limiter: 2/min` 限速 | 模拟人工操作节奏，防止触发第三方网站反爬机制封号 |
| Browserless 独立部署 | Worker 进程和浏览器进程解耦，各自独立扩容；浏览器崩溃不影响 Worker |
| BrowserContext 隔离 | 每个医生的 Cookie/Session 完全独立，不可能串号 |
| `SecretsProvider` 接口层 | 代码不依赖具体云厂商 SDK，切换 AWS↔Azure 只改配置 |
| PostgreSQL `doctor_id` 全表覆盖 | 数据行级隔离，API 层强制注入过滤条件，防止越权查询 |

---

## 3. 完整项目目录结构

```
ClinicHub/
├── docker-compose.yml              ← 本地开发一键启动所有服务
├── docker-compose.prod.yml         ← 生产环境 compose（参考用）
├── .env.example                    ← 环境变量模板（提交 Git）
├── .gitignore
│
├── packages/                       ← Monorepo（pnpm workspace）
│   │
│   ├── shared/                     ← 跨服务共享代码
│   │   ├── package.json
│   │   └── src/
│   │       ├── types/              ← 共享类型定义（Doctor、Task、PatientReport 等）
│   │       ├── constants/          ← 共享常量
│   │       └── utils/              ← 共享工具函数
│   │
│   ├── automation/                 ← 自动化引擎（Phase 1 代码迁移至此）
│   │   ├── package.json
│   │   └── src/
│   │       ├── browser.ts          ← Playwright 浏览器 / Browserless 连接
│   │       ├── dryRun.ts           ← Dry-Run 中间件（Phase 1 直接复用）
│   │       ├── screenshot.ts       ← 截图工具（升级：支持 S3/Blob 上传）
│   │       ├── pages/              ← Page Object（Phase 1 直接复用）
│   │       │   ├── ThirdPartyLoginPage.ts
│   │       │   ├── PatientReportListPage.ts
│   │       │   ├── PatientReportDetailPage.ts
│   │       │   └── WebMailComposePage.ts
│   │       └── workflows/          ← 工作流（Phase 1 直接复用）
│   │           └── ReviewAndReplyWorkflow.ts
│   │
│   ├── worker/                     ← BullMQ Worker 进程
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts            ← Worker 入口，注册队列处理器
│   │       ├── queues/
│   │       │   └── taskQueue.ts    ← BullMQ Queue / Worker 定义
│   │       └── handlers/
│   │           └── reviewAndReplyHandler.ts  ← 调用 automation 包的 Workflow
│   │
│   ├── api/                        ← Fastify API 服务
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts            ← Fastify 服务入口
│   │       ├── plugins/
│   │       │   ├── auth.ts         ← JWT 认证插件
│   │       │   ├── bullBoard.ts    ← Bull Board 监控 UI
│   │       │   └── cors.ts
│   │       └── routes/
│   │           ├── doctors.ts      ← 医生账号管理 API
│   │           ├── tasks.ts        ← 任务创建、查询 API
│   │           └── audit.ts        ← 审计日志查询 API
│   │
│   ├── frontend/                   ← Next.js Dashboard
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── app/
│   │       │   ├── dashboard/      ← 任务状态总览
│   │       │   ├── tasks/          ← 创建 / 查看任务
│   │       │   ├── audit/          ← 审计日志查看
│   │       │   └── settings/       ← 医生凭据配置
│   │       └── components/
│   │
│   └── infra/                      ← 基础设施抽象层
│       ├── package.json
│       └── src/
│           ├── secrets/
│           │   ├── SecretsProvider.ts        ← 接口定义
│           │   ├── LocalSecretsProvider.ts   ← 本地 .env 实现
│           │   ├── AwsSecretsProvider.ts     ← AWS Secrets Manager 实现
│           │   └── AzureSecretsProvider.ts   ← Azure Key Vault 实现
│           └── storage/
│               ├── StorageProvider.ts        ← 接口定义
│               ├── LocalStorageProvider.ts   ← 本地文件系统实现
│               ├── S3StorageProvider.ts      ← AWS S3 实现
│               └── AzureBlobProvider.ts      ← Azure Blob 实现
│
├── prisma/
│   ├── schema.prisma               ← 数据库 Schema
│   └── migrations/                 ← 数据库迁移文件
│
└── docs/                           ← 本文档所在目录
```

---

## 3. 数据库 Schema（Prisma）

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 医生账号（系统用户，非患者）
model Doctor {
  id          String   @id @default(cuid())
  email       String   @unique
  name        String
  passwordHash String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  credentials DoctorCredential[]
  tasks       Task[]
  auditLogs   AuditLog[]
}

// 医生在第三方系统的凭据（加密存储，不存明文）
model DoctorCredential {
  id             String   @id @default(cuid())
  doctorId       String
  systemName     String   // 例："third-party-ehr"、"webmail"
  usernameEncrypted String
  passwordRef    String   // Secrets Manager 的 key，不存密码本身
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  doctor         Doctor   @relation(fields: [doctorId], references: [id])
  
  @@unique([doctorId, systemName])
  @@index([doctorId])
}

// 自动化任务
model Task {
  id          String     @id @default(cuid())
  doctorId    String
  type        String     // 例："review-and-reply"
  status      TaskStatus @default(PENDING)
  config      Json       // 任务参数（患者列表等）
  result      Json?      // 执行结果
  isDryRun    Boolean    @default(true)
  bullJobId   String?    // BullMQ Job ID，用于追踪
  createdAt   DateTime   @default(now())
  startedAt   DateTime?
  completedAt DateTime?
  
  doctor      Doctor     @relation(fields: [doctorId], references: [id])
  auditLogs   AuditLog[]
  
  @@index([doctorId])
  @@index([status])
}

enum TaskStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

// 审计日志（每一步操作都记录）
model AuditLog {
  id           String   @id @default(cuid())
  doctorId     String
  taskId       String?
  action       String   // 例："login"、"open-report"、"send-email"
  description  String
  screenshotUrl String? // 截图在 S3/Blob 的 URL
  metadata     Json?    // 额外数据（患者ID、页面URL等）
  isDryRun     Boolean
  createdAt    DateTime @default(now())
  
  doctor       Doctor   @relation(fields: [doctorId], references: [id])
  task         Task?    @relation(fields: [taskId], references: [id])
  
  @@index([doctorId])
  @@index([taskId])
  @@index([createdAt])
}
```

---

## 4. BullMQ 队列设计

```typescript
// packages/worker/src/queues/taskQueue.ts

import { Queue, Worker, QueueScheduler } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL!);

// 每个医生有独立的队列（key 前缀隔离）
export function getDoctorQueue(doctorId: string) {
  return new Queue(`doctor:${doctorId}:tasks`, {
    connection,
    defaultJobOptions: {
      attempts: 3,                    // 失败最多重试 3 次
      backoff: { type: 'exponential', delay: 5000 }, // 指数退避重试
      removeOnComplete: false,        // 保留完成记录（审计用）
      removeOnFail: false,            // 保留失败记录
    },
  });
}

// 全局 Worker（监听所有医生的队列）
export function createWorker(doctorId: string) {
  return new Worker(
    `doctor:${doctorId}:tasks`,
    async (job) => {
      const handler = getHandler(job.data.type);
      return handler.execute(job.data, job);
    },
    {
      connection,
      concurrency: 1,          // 每个医生同时只跑 1 个任务（避免账号冲突）
      limiter: {
        max: 2,                // 每分钟最多 2 个任务（防封号）
        duration: 60_000,
      },
    }
  );
}
```

---

## 5. Docker Compose（本地开发）

```yaml
# docker-compose.yml

version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: clinichub
      POSTGRES_USER: clinichub
      POSTGRES_PASSWORD: localdev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  browserless:
    image: browserless/chrome:latest
    environment:
      MAX_CONCURRENT_SESSIONS: 5
      CONNECTION_TIMEOUT: 300000    # 5 分钟，足够长的自动化任务
      ENABLE_DEBUGGER: "true"
    ports:
      - "3000:3000"                 # WebSocket 端口，Worker 连接此处

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://clinichub:localdev@postgres:5432/clinichub
      REDIS_URL: redis://redis:6379
      JWT_SECRET: local-dev-secret-change-in-prod
      NODE_ENV: development
    ports:
      - "4000:4000"
    depends_on:
      - postgres
      - redis
    volumes:
      - ./packages:/app/packages    # 热重载
      - ./prisma:/app/prisma

  worker:
    build:
      context: .
      dockerfile: packages/worker/Dockerfile
    environment:
      DATABASE_URL: postgresql://clinichub:localdev@postgres:5432/clinichub
      REDIS_URL: redis://redis:6379
      BROWSERLESS_URL: ws://browserless:3000
      DRY_RUN: "true"               # 本地开发默认 Dry-Run
      NODE_ENV: development
    depends_on:
      - postgres
      - redis
      - browserless
    volumes:
      - ./packages:/app/packages
      - ./screenshots:/app/screenshots

  frontend:
    build:
      context: .
      dockerfile: packages/frontend/Dockerfile
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:4000
      NODE_ENV: development
    ports:
      - "3001:3001"
    depends_on:
      - api

volumes:
  postgres_data:
  redis_data:
```

---

## 6. 多租户隔离实现要点

### 6.1 API 层隔离（JWT 中间件）

```typescript
// 每个 API 请求必须携带有效 JWT，JWT payload 中包含 doctorId
// 所有数据库查询自动注入 doctorId 过滤条件

fastify.addHook('onRequest', async (request, reply) => {
  const { doctorId } = verifyJWT(request.headers.authorization);
  request.doctorId = doctorId; // 注入到请求上下文
});

// 路由层：doctorId 自动从请求上下文读取，不信任客户端传入的 doctorId
app.get('/tasks', async (request) => {
  return prisma.task.findMany({
    where: { doctorId: request.doctorId }, // 强制过滤
  });
});
```

### 6.2 浏览器层隔离（BrowserContext）

```typescript
// packages/automation/src/browser.ts

export async function createDoctorContext(doctorId: string): Promise<BrowserContext> {
  // 连接 Browserless（生产）或本地 Playwright（开发）
  const browser = process.env.BROWSERLESS_URL
    ? await chromium.connectOverCDP(process.env.BROWSERLESS_URL)
    : await chromium.launch({ headless: process.env.BROWSER_HEADLESS === 'true' });

  // 每个医生独立的 BrowserContext = 独立 Cookie、Session、本地存储
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 ...',  // 模拟真实浏览器
    viewport: { width: 1280, height: 720 },
  });

  return context;
  // 注意：browser 实例由 Browserless 管理，不在这里关闭
}
```

### 6.3 存储层隔离

```
截图路径规范：screenshots/{doctorId}/{taskId}/{step}-{timestamp}.png
日志分区：  audit_logs WHERE doctor_id = ?（PostgreSQL 行级隔离）
Redis Key： doctor:{doctorId}:tasks:*（命名空间隔离）
```

---

## 7. 云部署步骤（AWS 示例，Azure 同理）

### 7.1 基础设施准备

```bash
# 1. 创建托管 PostgreSQL
aws rds create-db-instance \
  --db-instance-identifier clinichub-prod \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username clinichub \
  --master-user-password <从 Secrets Manager 读取> \
  --allocated-storage 20

# 2. 创建托管 Redis
aws elasticache create-replication-group \
  --replication-group-id clinichub-redis \
  --cache-node-type cache.t3.micro \
  --engine redis

# 3. 创建 S3 存储桶（截图）
aws s3 mb s3://clinichub-screenshots-prod

# 4. 创建 Secrets（医生凭据等）
aws secretsmanager create-secret \
  --name clinichub/prod/doctor-credentials \
  --secret-string '{"doctorId":"xxx","username":"yyy","password":"zzz"}'
```

### 7.2 容器部署（ECS Fargate）

```
每个服务独立 Task Definition：
- clinichub-api       ← API 服务，最小 0.25 vCPU / 512MB RAM
- clinichub-worker    ← Worker 服务，0.5 vCPU / 1GB RAM（Playwright 需要内存）
- clinichub-browserless ← 浏览器池，1 vCPU / 2GB RAM

自动扩缩容规则：
- worker：根据 Redis 队列长度扩容（队列积压 > 10 → 新增 Worker 实例）
- api：根据 CPU 使用率扩容（CPU > 70% → 新增实例）
```

### 7.3 前端部署

```
Next.js → 构建静态文件 → 上传 S3 → CloudFront 分发
域名：clinichub.yourdomain.com → CloudFront → S3
API：api.clinichub.yourdomain.com → ALB → ECS Fargate (api 服务)
```

---

## 8. 监控与告警

| 监控项 | 工具 | 告警条件 |
|---|---|---|
| 任务失败 | Bull Board + 自定义告警 | 任何任务失败超过 3 次 |
| Worker 崩溃 | CloudWatch / Azure Monitor | Worker 进程退出 |
| 第三方网站登录失败 | 审计日志 + 告警 | 连续 3 次登录失败（可能封号） |
| 队列积压 | BullMQ metrics | 队列积压超过 50 条 |
| 邮件发送失败 | 审计日志 + 告警 | 任何邮件发送失败 |
| 截图上传失败 | 应用日志 | 截图无法保存（存储问题） |

---

## 9. Phase 2 开发顺序

Phase 2 按以下顺序实施，每步完成后验证再进入下一步：

```
Step 1: 搭建 Monorepo 结构（pnpm workspace）
         ↓
Step 2: 迁移 Phase 1 代码到 packages/automation/
         ↓
Step 3: 搭建 Docker Compose（postgres + redis + browserless）
         ↓
Step 4: 实现 Prisma Schema + 数据库迁移
         ↓
Step 5: 实现 BullMQ Worker（调用 automation 包）
         ↓
Step 6: 实现 Fastify API（任务创建、状态查询、医生管理）
         ↓
Step 7: 接入 Bull Board（任务监控 UI）
         ↓
Step 8: 实现 JWT 认证 + 多租户隔离
         ↓
Step 9: 实现 infra 层（Secrets Provider + Storage Provider）
         ↓
Step 10: 搭建 Next.js Dashboard 基础页面
          ↓
Step 11: 云环境部署（选定 AWS 或 Azure 后）
          ↓
Step 12: 监控告警配置
```

---

## 10. Phase 2 完成标准

- [ ] `docker-compose up` 一键启动所有本地服务
- [ ] 医生可以通过 Dashboard 登录，看到自己的任务列表
- [ ] 医生在 Dashboard 触发任务后，Worker 自动执行
- [ ] 两个医生同时触发任务，各自独立运行，互不干扰
- [ ] 任务失败后自动重试，重试 3 次后触发告警
- [ ] 所有截图自动上传 S3/Blob，审计日志写入 PostgreSQL
- [ ] Bull Board 可以看到所有队列和任务状态
- [ ] 医生 A 无法查看医生 B 的任务和日志（隔离验证）
- [ ] 云端部署成功，可通过域名访问 Dashboard
- [ ] 扩展一个新的 Feature Module，不需要改动 automation 引擎和框架层代码

---

*Phase 2 状态：待开发（Phase 1 完成后启动）*
*最后更新：2026-04-15*
