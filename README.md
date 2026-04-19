# ClinicHub — 诊所自动化全家桶

> **写给未来 Agent 的说明：** 本文档记录了项目的完整背景、架构决策和实施计划。在开始任何开发工作之前，请先完整阅读本文件和 `docs/` 目录下的所有文档。

---

## 项目背景

**问题：** 诊所日常运营中存在大量重复性的人工操作，耗时、易出错、占用医护人员宝贵精力。

**解决方案：** ClinicHub 是一个面向诊所的自动化"全家桶"软件，通过浏览器自动化技术，将医生在第三方医疗系统上的重复性操作自动化，甚至完全消除人工干预。

**定位：** 类 SaaS 产品，每个医生拥有独立的自动化实例，互相隔离。未来部署在云端（AWS 或 Azure，待定）。

---

## 第一个功能（Feature 1）概述

**场景：**

- 医生登录第三方医疗管理系统
- 查看分配给自己的患者报告
- 在系统中填写回复内容并保存
- 将相关信息提取出来，通过 Web 邮件平台发送给对应患者

**自动化目标：** 以上所有步骤由软件自动完成，医生只需触发任务。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技术选型决策、架构原则、各组件说明 |
| [docs/PHASE_1.md](docs/PHASE_1.md) | Phase 1 MVP 详细实施计划（当前阶段） |
| [docs/PHASE_2.md](docs/PHASE_2.md) | Phase 2 完整生产架构详细设计 |

---

## 当前状态

- [x] 架构设计完成
- [x] Phase 1 / Phase 2 计划制定完成
- [ ] Phase 1 开发中（核心链路打通）
- [ ] Phase 2 工程化实施

---

## 核心原则（所有 Agent 必读）

1. **安全第一：** 任何会对第三方系统产生写操作的步骤，必须经过 Dry-Run 验证和人工确认关卡。
2. **医生数据严格隔离：** 不同医生的凭据、任务、日志绝不混用，`doctor_id` 是所有数据的分区键。
3. **代码云厂商无关：** 不直接调用 AWS SDK 或 Azure SDK，通过抽象接口层访问云服务，便于切换云厂商。
4. **分阶段演进：** Phase 1 只跑通链路，Phase 2 才做工程化，不提前过度设计。
5. **明文密码零容忍：** 凭据必须加密存储，代码库中不出现任何账号密码。

---

## 开发与运行（Phase 1）

### 依赖安装

本项目使用 **pnpm** 作为包管理器（版本见 `package.json` 的 `packageManager` 字段）。

```bash
pnpm install
```

若本机未安装 pnpm，可使用 Corepack（Node 18+）：

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

### 常用命令

```bash
pnpm typecheck   # TypeScript compile check
pnpm lint        # ESLint (zero warnings)
pnpm setup-session  # Visible browser: manual login; optional MANUAL_LOGIN_TIMEOUT_MS in .env (0 = no limit)
pnpm start       # Run entrypoint once (ts-node)
pnpm dev         # Run with reload (ts-node-dev)
```

### Dry-Run 与真实模式

环境变量模板见根目录 `.env.example`。复制为本地 `.env` 并至少配置 `THIRD_PARTY_URL`（**不要提交 `.env`**）。账号密码不写入配置文件；首次请运行 `pnpm setup-session` 在浏览器中手动登录并保存 Session（`SESSION_STATE_PATH`，默认 `./recordings/auth.json`）。

- **Dry-Run（推荐默认）：** 在 `.env` 中设置 `DRY_RUN=true`。写入类操作应由 `src/automation/dryRun.ts`（Story 004）拦截为仅日志；在 Story 004 落地前，仍请保持 `DRY_RUN=true` 作为安全默认。
- **真实模式：** 设置 `DRY_RUN=false` 并确认你已理解所有写操作风险；建议同时按需开启 `STEP_MODE=true` 以便逐步确认。

入口脚本为 `src/runner.ts`。配置加载与校验将在 Story 002（`src/config.ts`）完成后成为启动路径的一部分。

### 目录结构（Phase 1）

```
ClinicHub/
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── .env                 # local only (gitignored)
├── .env.example
├── src/
│   └── runner.ts        # entry point
├── docs/                # architecture and stories
├── featurebench/        # local verification notes per story
├── screenshots/         # created at runtime (gitignored)
└── logs/                # created at runtime (gitignored)
```

更完整的 `src/` 布局见 [docs/PHASE_1.md](docs/PHASE_1.md)。
