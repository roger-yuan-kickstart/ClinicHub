/**
 * Interactive selector capture CLI (STORY-012a).
 * Hover highlights the element under the pointer; click captures a candidate CSS selector.
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output, stderr as stderrStream } from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'playwright';
import { createBrowserContext, closeBrowser } from '../automation/browser';
import { config } from '../config';
import { logger } from '../logger';

type ActionType = 'read' | 'click' | 'fill';

interface CapturePayload {
  selector: string;
  visibleText: string;
  tagName: string;
}

interface TableRow {
  stepName: string;
  windowLabel: string;
  actionType: ActionType;
  selector: string;
  note: string;
}

const SELECTORS_RELATIVE = path.join('recordings', 'SELECTORS.md');

function loadInjectSource(): string {
  const injectPath = path.join(__dirname, 'selectorCapture.inject.js');
  return fs.readFileSync(injectPath, 'utf8');
}

function notifyCapture(payload: CapturePayload, windowLabel: string): void {
  const text =
    `\n[capture] window=${windowLabel}\n` +
    `  selector: ${payload.selector}\n` +
    `  tag: ${payload.tagName}\n` +
    `  text: ${payload.visibleText}\n` +
    '  Confirm with ok, or skip to discard.\n';
  stderrStream.write(text);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function appendRowToSelectorsFile(row: TableRow): boolean {
  const target = path.resolve(process.cwd(), SELECTORS_RELATIVE);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const header =
      '# Selector capture\n\n' +
      '| stepName | windowLabel | actionType | selector | note |\n' +
      '| --- | --- | --- | --- | --- |\n';
    if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
      fs.writeFileSync(target, header, 'utf8');
    }
    const line =
      `| ${escapeCell(row.stepName)} | ${escapeCell(row.windowLabel)} | ${escapeCell(row.actionType)} | ${escapeCell(row.selector)} | ${escapeCell(row.note)} |\n`;
    fs.appendFileSync(target, line, 'utf8');
    logger.info({ path: target, stepName: row.stepName }, 'Appended selector row to SELECTORS.md');
    return true;
  } catch (err: unknown) {
    logger.error(err, 'Failed to write SELECTORS.md');
    output.write(
      'Could not write to ./recordings/SELECTORS.md (permissions, disk full, or another I/O error). ' +
        'Your capture is still pending; fix the issue and run ok again.\n',
    );
    return false;
  }
}

function printSegmentSummary(rows: TableRow[]): void {
  if (rows.length === 0) {
    output.write('Segment summary: (no entries confirmed yet)\n');
    return;
  }
  output.write(`Segment summary (${rows.length} entries):\n`);
  for (const r of rows) {
    output.write(`  - ${r.stepName} [${r.windowLabel}] ${r.actionType}: ${r.selector}\n`);
  }
}

/**
 * @returns true if the session file exists; otherwise prints instructions and returns false.
 */
function loadSessionStateOrExplain(): boolean {
  const sessionPath = path.resolve(process.cwd(), config.sessionStatePath);
  if (!fs.existsSync(sessionPath)) {
    output.write(
      `Session state file not found at:\n  ${sessionPath}\n` +
        'Save a session first (e.g. login flow + saveSession, or STORY-012 Session 0), then retry.\n',
    );
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  if (!loadSessionStateOrExplain()) {
    process.exitCode = 1;
    return;
  }

  const session = await createBrowserContext(config);
  const { browser, context, page: initialPage } = session;

  const pagesByLabel = new Map<string, Page>();
  let currentLabel = 'main';
  let popupCounter = 0;

  pagesByLabel.set('main', initialPage);

  const state = {
    pending: null as CapturePayload | null,
  };
  let draftStepName = 'unnamed-step';
  let draftAction: ActionType = 'click';
  let draftNote = '';
  const segmentRows: TableRow[] = [];

  await context.addInitScript({ content: loadInjectSource() });

  await context.exposeFunction('__chSelectorCapturePush', (payload: CapturePayload) => {
    state.pending = payload;
    notifyCapture(payload, currentLabel);
  });

  context.on('page', (newPage) => {
    popupCounter += 1;
    const label = `popup-${popupCounter}`;
    pagesByLabel.set(label, newPage);
    stderrStream.write(
      `\n[new window] Registered as "${label}". Switch with: window ${label}\n`,
    );
    void newPage.waitForLoadState('domcontentloaded').catch(() => undefined);
  });

  const rl = createInterface({ input, output, terminal: true });

  output.write(
    'Selector capture ready.\n' +
      'Commands: window <label> | window new <label> | name <step> | type read|click|fill | ' +
      'note <text> | ok | skip | done | quit\n',
  );

  try {
    // REPL loop: exit via `break` on quit.
    // eslint-disable-next-line no-constant-condition -- intentional infinite readline loop
    while (true) {
      const line = (await rl.question('selector-capture> ')).trim();
      if (line === '') {
        continue;
      }
      const lower = line.toLowerCase();
      if (lower === 'quit' || lower === 'exit') {
        break;
      }
      if (lower === 'done') {
        printSegmentSummary(segmentRows);
        segmentRows.length = 0;
        continue;
      }
      if (lower === 'ok') {
        const captured = state.pending;
        if (!captured) {
          output.write('Nothing to confirm. Click an element first.\n');
          continue;
        }
        const row: TableRow = {
          stepName: draftStepName,
          windowLabel: currentLabel,
          actionType: draftAction,
          selector: captured.selector,
          note: draftNote,
        };
        if (!appendRowToSelectorsFile(row)) {
          continue;
        }
        segmentRows.push(row);
        state.pending = null;
        draftNote = '';
        output.write('Written to ./recordings/SELECTORS.md\n');
        continue;
      }
      if (lower === 'skip') {
        state.pending = null;
        output.write('Capture discarded.\n');
        continue;
      }
      if (lower.startsWith('window ')) {
        const rest = line.slice('window '.length).trim();
        if (rest === '') {
          output.write('Usage: window <label>  (switch)  |  window new <label>  (open blank page)\n');
          continue;
        }
        if (rest.toLowerCase().startsWith('new ')) {
          const newLabel = rest.slice(4).trim();
          if (newLabel === '') {
            output.write('Usage: window new <label>\n');
            continue;
          }
          if (pagesByLabel.has(newLabel)) {
            output.write(
              `Label "${newLabel}" is already in use. Use: window ${newLabel} to switch to that page.\n`,
            );
            continue;
          }
          const newPage = await context.newPage();
          pagesByLabel.set(newLabel, newPage);
          currentLabel = newLabel;
          await newPage.bringToFront();
          output.write(`Opened new page labeled "${newLabel}".\n`);
          continue;
        }
        const label = rest;
        const existing = pagesByLabel.get(label);
        if (existing) {
          currentLabel = label;
          await existing.bringToFront();
          output.write(`Switched to window "${label}".\n`);
          continue;
        }
        const known = [...pagesByLabel.keys()].sort().join(', ');
        output.write(
          `Unknown window label "${label}". Known labels: ${known || '(none)'}\n` +
            'To open a blank page with a new label, use: window new <label>\n',
        );
        continue;
      }
      if (lower.startsWith('name ')) {
        draftStepName = line.slice('name '.length).trim() || 'unnamed-step';
        output.write(`Next ok will use step name: ${draftStepName}\n`);
        continue;
      }
      if (lower.startsWith('type ')) {
        const t = line.slice('type '.length).trim().toLowerCase();
        if (t === 'read' || t === 'click' || t === 'fill') {
          draftAction = t;
          output.write(`Next ok will use action type: ${draftAction}\n`);
        } else {
          output.write('type must be read, click, or fill.\n');
        }
        continue;
      }
      if (lower.startsWith('note ')) {
        draftNote = line.slice('note '.length).trim();
        output.write(`Note set for next ok: ${draftNote}\n`);
        continue;
      }
      output.write(
        'Unknown command. Try: window, window new, name, type, note, ok, skip, done, quit\n',
      );
    }
  } finally {
    rl.close();
    await closeBrowser({ browser, context });
  }
}

main().catch((err: unknown) => {
  logger.error(err, 'selector-capture failed');
  process.exitCode = 1;
});
