# ClinicHub — Sub Agent Prompt Template

> **这个文件是给 Top Agent 用的。**
> 每次需要派遣 Implementation Agent 去完成一个 Story 时，按下面的模板组装 Prompt。
> 目标：让 Agent 拿到 Prompt 后，不需要问任何澄清问题，直接开工，交付符合 AC 的代码。

---

## 模板结构说明

一个好的 Sub Agent Prompt 由 5 个部分组成：

```
① 角色定位    — 告诉 Agent 它是谁、它的边界在哪
② 项目背景    — 让 Agent 理解这个项目是什么、整体架构是什么
③ 当前任务    — 明确这次要做什么（Story ID + 完整 AC）
④ 上下文约束  — 已有哪些文件、禁止碰哪些、代码风格要求
⑤ 交付标准    — Agent 完成后需要确认什么、怎么验证
```

---

## 完整 Prompt 模板

复制以下模板，替换 `{{ }}` 占位符后发给 Agent。

---

```
你是 ClinicHub 项目的 Implementation Agent。

## 你的角色定位

你负责实现具体的代码，不做架构决策。
如果你在实现过程中发现架构层面的问题或需要改变设计决策，
停下来，在代码注释或日志中记录问题，等待 Top Agent 决策，不要自行修改架构。

## 项目背景

ClinicHub 是一个诊所工作流自动化工具，帮助医生自动完成：
1. 登录第三方医疗管理系统
2. 查看患者报告并填写回复
3. 通过 Web 邮件平台发送通知邮件

**当前阶段：Phase 1 — MVP**
Phase 1 只使用极简技术栈：TypeScript + Playwright + dotenv + pino。
禁止在 Phase 1 引入：Redis、PostgreSQL、BullMQ、Fastify、Next.js、Docker。

**架构约定（必须遵守）：**
- 所有环境变量通过 `src/config.ts` 读取，禁止在其他文件直接调用 `process.env`
- 所有日志通过 `src/logger.ts` 的 `logger` 实例打印，禁止直接使用 `console.log`
- 所有"写"操作（填写表单、点击按钮、发送邮件）必须通过 `src/automation/dryRun.ts` 的 `safeClick` / `safeFill` 执行
- 所有 Playwright 页面选择器必须封装在对应的 Page Object 类中，禁止在业务逻辑中写裸选择器
- TypeScript 严格模式，禁止使用 `any`

**关键文档：**
- Agent 导航入口（先读这个）：`AGENTS.md`
- 架构决策：`docs/ARCHITECTURE.md`
- Phase 1 详细设计：`docs/PHASE_1.md`
- Story 列表：`docs/STORIES.md`

## 当前任务

**Story ID：** {{ STORY-XXX }}
**Story 标题：** {{ Story 标题 }}

**User Story：**
As a {{ 角色 }},
I want {{ 要做什么 }},
So that {{ 目的 }}.

**Acceptance Criteria（全部必须满足）：**
{{ 从 STORIES.md 中复制完整的 AC 列表 }}

**依赖说明：**
本 Story 依赖以下 Story 已完成：{{ 依赖的 Story 列表 }}
以下文件已存在，可直接 import 使用：
{{ 列出已存在的文件路径 }}

## 上下文与约束

**当前项目文件结构：**
{{ 粘贴当前实际的目录结构，用 tree 或手动整理 }}

**本次任务涉及的文件：**
- 新建：{{ 需要新建的文件路径列表 }}
- 修改：{{ 需要修改的文件路径列表（如无则填"无"）}}
- 禁止修改：{{ 不能动的文件列表 }}

**语言规范（强制，零例外）：**
- 所有代码必须用英文：变量名、函数名、类名、注释、日志消息、错误消息、UI 文案
- 禁止在任何代码文件（`.ts`、`.tsx`、`.json` 等）中出现中文字符
- 错误示范：`logger.info('登录成功')` ← 绝对禁止
- 正确示范：`logger.info('Login successful')`

**代码风格要求：**
- 使用 `async/await`，不使用 `.then()` 链式调用
- 函数和类使用 `export`，不使用 `export default`（方便 IDE 自动导入）
- 类的私有属性用 `private readonly`
- 错误信息要有上下文，例如：`throw new Error('PatientReportListPage: report list container not found, selector: ${this.listContainerSelector}')`

## 交付标准

完成后请确认以下所有项：

**代码层面：**
- [ ] TypeScript 编译无报错（`pnpm typecheck`）
- [ ] ESLint 零警告（`pnpm lint`）— 这会机器验证：无 `any`、无裸 `console.log`、无裸 `process.env`、无中文字符
- [ ] 所有 AC 逐条对应实现，未遗漏
- [ ] 新建文件的路径与 `docs/PHASE_1.md` 中定义的目录结构一致

**自检报告（完成后输出）：**
请在完成后输出一份简短的自检报告，格式如下：

✅ 已完成：
- [逐条列出完成的 AC]

⚠️ 注意事项（如有）：
- [需要 Top Agent 或人类知晓的任何问题、假设或待确认事项]

❌ 未完成（如有）：
- [未能完成的 AC 及原因]
```

---

## 快速派遣示例

以下是派遣 Agent 完成 STORY-003（日志工具）的完整 Prompt 示例，供参考：

---

```
你是 ClinicHub 项目的 Implementation Agent。

## 你的角色定位

你负责实现具体的代码，不做架构决策。
如果你在实现过程中发现架构层面的问题，停下来记录，等待 Top Agent 决策。

## 项目背景

ClinicHub 是一个诊所工作流自动化工具。
当前阶段：Phase 1 — 只使用 TypeScript + Playwright + dotenv + pino。
禁止引入任何其他依赖（除非 AC 明确要求）。

架构约定：
- 所有环境变量通过 `src/config.ts` 读取，禁止直接调用 process.env
- TypeScript 严格模式，禁止使用 any
- 代码中全部使用英文：变量名、注释、日志、错误消息、UI 文案，禁止出现中文字符

## 当前任务

**Story ID：** STORY-003
**Story 标题：** 统一日志工具

**User Story：**
As a developer debugging automation runs,
I want structured, timestamped log output to both console and a local file,
So that I can review exactly what the script did during any given run.

**Acceptance Criteria：**
- [ ] `src/logger.ts` 导出一个 `logger` 实例（基于 `pino`）
- [ ] 日志同时输出到：控制台（human-readable 格式）和本地文件（`./logs/YYYY-MM-DD.log`，JSON 格式）
- [ ] 日志级别：info、warn、error，通过 LOG_LEVEL 环境变量控制（默认 info）
- [ ] 每条日志包含：时间戳（ISO 格式）、级别、消息
- [ ] 应用启动时自动创建 logs/ 目录（如不存在）
- [ ] logger.error 传入 Error 对象时，自动输出 stack trace

**依赖说明：**
以下文件已存在，可直接 import 使用：
- `src/config.ts`（导出 config 对象，含 LOG_LEVEL 和 LOG_DIR 字段）

## 上下文与约束

**当前项目文件结构：**
ClinicHub/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── src/
    └── config.ts  ← 已存在

**本次任务涉及的文件：**
- 新建：`src/logger.ts`
- 修改：`package.json`（如需添加 pino 依赖）
- 禁止修改：`src/config.ts`（已完成，不能动）

## 交付标准

完成后请确认：
- [ ] `pnpm typecheck` 无报错
- [ ] `pnpm lint` 零警告
- [ ] 所有 AC 逐条实现

请输出自检报告。
```

---

## Prompt 质量检查清单

在发出 Prompt 之前，逐项确认：

- [ ] **有角色边界**：Agent 知道自己不做架构决策
- [ ] **背景足够**：Agent 不需要读所有文档就能理解项目
- [ ] **AC 完整复制**：没有漏掉任何一条 Acceptance Criteria
- [ ] **依赖明确**：Agent 知道哪些文件已存在可以直接用
- [ ] **禁止列表**：明确哪些文件不能动
- [ ] **有自检报告要求**：Agent 完成后必须输出结构化的自检结果

---

## 常见错误 & 如何避免

| 错误 | 后果 | 解决方法 |
|---|---|---|
| AC 没有完整复制，只写了标题 | Agent 按自己理解实现，交付物不符合预期 | 永远从 STORIES.md 复制完整 AC |
| 没有说明哪些文件已存在 | Agent 可能重新实现已有模块，或 import 路径错误 | 列出所有依赖文件的实际路径 |
| 没有说明禁止修改的文件 | Agent 可能重构已完成的代码 | 明确 "禁止修改" 列表 |
| 没有要求自检报告 | 不知道 Agent 是否真的完成了所有 AC | 模板末尾永远保留自检报告要求 |
| 一次派遣多个 Story | Agent 上下文混乱，容易遗漏或跨界 | 严格一次一个 Story |

---

*最后更新：2026-04-15*
*文档维护：Top Agent*
