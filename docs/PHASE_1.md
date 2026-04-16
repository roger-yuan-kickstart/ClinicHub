# Phase 1 — MVP：打通核心自动化链路

> **目标：** 用最少的基础设施，让一名医生能完整执行"登录第三方系统 → 查看患者报告 → 填写回复 → 发送邮件"这条链路，并且有足够的安全保护机制防止误操作。
>
> **不做什么：** 不做多租户、不做任务队列、不做前端 UI、不做云部署。这些全部留给 Phase 2。
>
> **Phase 1 完成标准：** 脚本在 Dry-Run 模式下完整走通全流程，人工审核日志无误后，切换真实模式成功发出一封邮件，全程有截图存档。

---

## 1. Phase 1 技术栈（极简）

```
语言：       TypeScript (Node.js 18+)
自动化：     Playwright
配置：       dotenv (.env 文件)
日志：       console + 本地文件（pino，轻量）
截图存储：   本地文件夹 ./screenshots/
包管理：     pnpm（推荐）或 npm
```

**没有：** Redis、PostgreSQL、BullMQ、Fastify、Next.js、Docker

Phase 2 会把这些全部加回来，但 Phase 1 的代码会直接复用进 Phase 2，不浪费。

---

## 2. 项目目录结构

```
ClinicHub/
├── package.json
├── tsconfig.json
├── .env                          ← 本地凭据（绝不提交 Git）
├── .env.example                  ← 凭据模板（提交 Git，无真实值）
├── .gitignore
├── screenshots/                  ← 运行时自动创建，存截图
├── logs/                         ← 运行时自动创建，存日志
│
└── src/
    ├── config.ts                 ← 读取并校验环境变量
    ├── logger.ts                 ← 统一日志工具
    ├── runner.ts                 ← 入口：启动自动化任务
    │
    ├── automation/
    │   ├── browser.ts            ← Playwright 浏览器初始化
    │   ├── dryRun.ts             ← Dry-Run 中间件（核心安全机制）
    │   ├── screenshot.ts         ← 截图工具（带时间戳文件名）
    │   │
    │   ├── pages/                ← Page Object Model
    │   │   ├── ThirdPartyLoginPage.ts
    │   │   ├── PatientReportListPage.ts
    │   │   ├── PatientReportDetailPage.ts
    │   │   └── WebMailComposePage.ts
    │   │
    │   └── workflows/
    │       └── ReviewAndReplyWorkflow.ts   ← Feature 1 完整流程
    │
    └── types/
        └── index.ts              ← 共享类型定义（PatientReport、TaskConfig 等）
```

---

## 3. 环境变量配置（.env）

```bash
# .env.example（这个文件提交 Git，.env 不提交）

# 运行模式
DRY_RUN=true          # true=只打日志不执行写操作 | false=真实执行
STEP_MODE=false        # true=每步暂停等待确认 | false=自动执行

# 第三方系统凭据（测试账号）
THIRD_PARTY_URL=https://xxxxx.com
THIRD_PARTY_USERNAME=your_test_username
THIRD_PARTY_PASSWORD=your_test_password

# Web 邮件平台凭据
WEBMAIL_URL=https://xxxxx.com
WEBMAIL_USERNAME=your_email@xxx.com
WEBMAIL_PASSWORD=your_email_password

# 测试模式：发送邮件的收件人强制替换为此地址（防止误发真实患者）
TEST_EMAIL_RECIPIENT=test@yourdomain.com

# 截图和日志输出路径
SCREENSHOT_DIR=./screenshots
LOG_DIR=./logs

# Playwright 配置
BROWSER_HEADLESS=false   # false=显示浏览器窗口（调试用）| true=无头模式
SLOW_MO_MS=500           # 操作间隔毫秒数，模拟人工操作节奏，防封号
```

---

## 4. Dry-Run 机制（核心安全设计）

Dry-Run 是 Phase 1 最重要的安全机制。所有"写"操作（填写表单、点击保存、发送邮件）都必须通过 `dryRun.ts` 执行。

```typescript
// src/automation/dryRun.ts

const isDryRun = process.env.DRY_RUN === 'true';

export async function safeClick(
  page: Page,
  selector: string,
  description: string
): Promise<void> {
  if (isDryRun) {
    logger.info(`[DRY-RUN] Skip click: ${description} (selector: ${selector})`);
    return;
  }
  logger.info(`Clicking: ${description}`);
  await page.click(selector);
}

export async function safeFill(
  page: Page,
  selector: string,
  value: string,
  description: string
): Promise<void> {
  if (isDryRun) {
    logger.info(`[DRY-RUN] Skip fill: ${description} = "${value}"`);
    return;
  }
  logger.info(`Filling field: ${description}`);
  await page.fill(selector, value);
}

export async function confirmAction(description: string): Promise<boolean> {
  // Requires human confirmation before irreversible actions in real mode
  if (isDryRun) return false;
  
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  return new Promise((resolve) => {
    rl.question(`\n[Confirm action] ${description}\nType "yes" to continue, anything else to skip: `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}
```

---

## 5. Feature 1 执行流程（代码级别）

```typescript
// src/automation/workflows/ReviewAndReplyWorkflow.ts

export async function runReviewAndReply(config: TaskConfig): Promise<TaskResult> {
  const browser = await chromium.launch({ headless: config.headless, slowMo: config.slowMo });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Step 1: Login to third-party system
    const loginPage = new ThirdPartyLoginPage(page);
    await loginPage.navigate();
    await screenshot(page, '01-before-login');
    await loginPage.login(config.thirdPartyUsername, config.thirdPartyPassword);
    await screenshot(page, '02-after-login');
    logger.info('Login successful');

    // Step 2: Fetch patient report list
    const listPage = new PatientReportListPage(page);
    await listPage.navigate();
    await screenshot(page, '03-report-list');
    const reports = await listPage.getReportList();
    logger.info(`Found ${reports.length} patient report(s)`);

    // Step 3: Process each report
    for (const report of reports) {
      logger.info(`Processing report for patient: ${report.patientId}`);
      
      const detailPage = new PatientReportDetailPage(page);
      await detailPage.open(report.id);
      await screenshot(page, `04-report-${report.patientId}`);

      const reportData = await detailPage.extractData();
      
      // Fill reply (dry-run: log only, no actual write)
      await safeFill(page, detailPage.replySelector, reportData.replyContent, 'Fill doctor reply');
      await screenshot(page, `05-reply-filled-${report.patientId}`);

      // Save (requires human confirmation)
      const confirmed = await confirmAction(`Save reply for patient ${report.patientId}`);
      if (confirmed) {
        await safeClick(page, detailPage.saveButtonSelector, 'Click save');
        await screenshot(page, `06-saved-${report.patientId}`);
      }

      // Step 4: Send notification email
      await sendEmailForReport(context, reportData, config);
    }

    return { success: true, processedCount: reports.length };
    
  } catch (error) {
    await screenshot(page, 'ERROR-screenshot');
    logger.error('Workflow execution failed', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}
```

---

## 6. 如何录制第三方网站操作（Playwright Codegen）

**这是 Phase 1 开发的第一步。**

```bash
# 安装依赖
pnpm add -D playwright @playwright/test
pnpm exec playwright install chromium

# 启动录制（替换为真实 URL）
pnpm exec playwright codegen \
  --save-har=./recordings/session.har \
  https://第三方系统URL
```

浏览器弹出后：
1. 正常手动操作完整流程（登录 → 查看报告 → 填写回复 → 跳转邮件平台 → 发送）
2. 右侧代码窗口实时生成 TypeScript 代码
3. 操作完成后复制生成的代码，交给 Agent 进行封装和完善

**注意事项：**
- 录制时使用测试账号，全程打开 `SLOW_MO_MS=500` 放慢节奏
- 不要在录制过程中输入真实患者数据
- 录制完成后立即关闭浏览器窗口

---

## 7. Phase 1 完成标准 Checklist

在进入 Phase 2 之前，以下所有条件必须满足：

- [ ] `DRY_RUN=true` 时，脚本完整跑通全流程，日志清晰显示每一步操作
- [ ] 每个关键步骤都有截图留存，可通过截图验证行为正确性
- [ ] 所有截图按时间戳命名，存入 `./screenshots/` 目录
- [ ] `DRY_RUN=false` 时，Human-in-the-loop 确认关卡正常工作（输入 yes 才继续）
- [ ] 测试模式下，邮件收件人已强制替换为 `TEST_EMAIL_RECIPIENT`
- [ ] 成功发送至少一封测试邮件，收件人为测试邮箱
- [ ] 所有第三方系统操作的数据都带有 `[TEST]` 标记
- [ ] `.env` 已加入 `.gitignore`，未提交任何明文密码
- [ ] 页面选择器已全部封装进 Page Object，业务代码中无裸选择器字符串

---

## 8. Phase 1 → Phase 2 过渡说明

Phase 1 的代码会**直接迁移**进 Phase 2，不需要重写：

| Phase 1 代码 | Phase 2 去向 |
|---|---|
| `src/automation/pages/*` | 直接复用，Page Object 不变 |
| `src/automation/workflows/*` | 封装成 BullMQ Job Handler |
| `src/automation/dryRun.ts` | 直接复用 |
| `src/config.ts` | 扩展，加入多租户配置 |
| `.env` 单个医生凭据 | 迁移到 Secrets Manager，按 `doctor_id` 分区 |

---

*Phase 1 状态：待开发*
*最后更新：2026-04-15*
