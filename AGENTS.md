# ClinicHub — Agent Navigation Index

> **Read this first.** This is the table of contents for all agents working in this repository.
> It is intentionally short (~100 lines). Follow the pointers to deeper sources of truth.

---

## What is this project?

ClinicHub is a clinic workflow automation tool that helps doctors automatically:
1. Log in to a third-party medical management system
2. Review patient reports and fill in replies
3. Send notification emails via a web mail platform

**Current phase: Phase 1 — MVP**
One doctor, one machine, TypeScript + Playwright, no infrastructure.

---

## Document Map

| Document | Purpose | When to read |
|---|---|---|
| `AGENTS.md` (this file) | Navigation index | Always, first |
| `docs/ARCHITECTURE.md` | Tech stack decisions, layer design, security model | Before making any structural decisions |
| `docs/PHASE_1.md` | Phase 1 directory layout, env vars, code-level flow | Before writing any Phase 1 code |
| `docs/STORIES.md` | Story backlog, AC, dependency graph, status table | Before starting any story |
| `docs/AGENT_PROMPT_TEMPLATE.md` | How to dispatch sub-agents (Top Agent use only) | When dispatching an implementation agent |

---

## Hard Constraints (enforced by tooling, not just docs)

These are machine-enforced via ESLint (`pnpm lint`). Violations will fail CI.

| Rule | Enforcement | Why |
|---|---|---|
| No `console.log` | `eslint: no-console` | All logging must go through `src/logger.ts` |
| No direct `process.env` | `eslint: no-restricted-syntax` | All env vars must come from `src/config.ts` |
| No `any` type | `eslint: @typescript-eslint/no-explicit-any` | TypeScript strict mode isn't enough alone |
| No Chinese in code files | `eslint: no-restricted-syntax` | All `.ts` code must be English-only |
| No bare selectors in business logic | Code review / architecture | All selectors live in Page Object classes |
| No write ops outside `safeClick`/`safeFill` | Code review / architecture | Every write must be Dry-Run-aware |

---

## Verification Commands

Every story delivery must pass both:

```bash
pnpm typecheck   # TypeScript compile check (zero errors)
pnpm lint        # ESLint check (zero warnings)
```

---

## Phase 1 Tech Stack

```
Language:    TypeScript (Node.js 18+)
Automation:  Playwright
Config:      dotenv (via src/config.ts)
Logging:     pino (via src/logger.ts)
Screenshots: local ./screenshots/
Package mgr: pnpm
```

**Banned in Phase 1:** Redis, PostgreSQL, BullMQ, Fastify, Next.js, Docker.

---

## Directory Layout (Phase 1)

```
ClinicHub/
├── AGENTS.md                         ← you are here
├── .eslintrc.json                    ← machine-enforced constraints
├── tsconfig.json
├── package.json
├── .env                              ← never commit (gitignored)
├── .env.example                      ← template, committed
├── src/
│   ├── config.ts                     ← ONLY place to read process.env
│   ├── logger.ts                     ← ONLY place to call console
│   ├── runner.ts                     ← entry point
│   ├── types/index.ts                ← shared TypeScript types
│   └── automation/
│       ├── browser.ts
│       ├── dryRun.ts                 ← safeClick / safeFill / confirmAction
│       ├── screenshot.ts
│       ├── pages/                    ← Page Object Model (selectors live here)
│       └── workflows/
└── docs/
    ├── ARCHITECTURE.md
    ├── PHASE_1.md
    ├── PHASE_2.md
    └── STORIES.md
```

---

## Agent Role Boundaries

| Agent type | Responsibilities | NOT allowed to |
|---|---|---|
| Top Agent | Story sequencing, architecture decisions, prompt assembly | Write application code directly |
| Implementation Agent | Implement one story at a time, follow AC exactly | Make architecture decisions, modify completed stories |

If an implementation agent encounters an architectural ambiguity, it must **stop and log the issue** rather than self-resolve it.

---

*Last updated: 2026-04-15*
*Maintained by: Top Agent*
