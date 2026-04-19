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

const INJECT_SOURCE = [
  '(function(){',
  "if (window.__chSelectorCaptureInstalled) return;",
  'window.__chSelectorCaptureInstalled = true;',
  'var HIGHLIGHT = "2px solid #0066ff";',
  'function cssEscape(s){',
  "if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);",
  "return String(s).replace(/[^a-zA-Z0-9_-]/g,function(c){return '\\\\'+c;});",
  '}',
  'function buildSelector(el){',
  'if(!el||el.nodeType!==1)return "";',
  'var tag=el.tagName.toLowerCase();',
  'if(el.id&&/^[a-zA-Z][\\w-]*$/.test(el.id))return "#"+cssEscape(el.id);',
  'var attrs=el.attributes;',
  'for(var i=0;i<attrs.length;i++){',
  'var a=attrs[i];',
  "if(a.name.indexOf('data-')===0&&a.value){",
  'return tag+"["+a.name+\'="\'+a.value.replace(/\\\\/g,"\\\\\\\\").replace(/"/g,\'\\\\"\')+\'"]\';',
  '}',
  '}',
  "var al=el.getAttribute('aria-label');",
  'if(al){',
  'return tag+\'[aria-label="\'+al.replace(/\\\\/g,"\\\\\\\\").replace(/"/g,\'\\\\"\')+\'"]\';',
  '}',
  "var role=el.getAttribute('role');",
  'if(role){',
  "var al2=el.getAttribute('aria-label');",
  'if(al2){',
  'return tag+\'[role="\'+role.replace(/"/g,\'\\\\"\')+\'"][aria-label="\'+al2.replace(/\\\\/g,"\\\\\\\\").replace(/"/g,\'\\\\"\')+\'"]\';',
  '}',
  'return tag+\'[role="\'+role.replace(/"/g,\'\\\\"\')+\'"]\';',
  '}',
  'var pathParts=[];',
  'var cur=el;',
  'var depth=0;',
  'while(cur&&cur.nodeType===1&&depth<12){',
  'var t=cur.tagName.toLowerCase();',
  'if(cur.id){pathParts.unshift("#"+cssEscape(cur.id));break;}',
  'var par=cur.parentElement;',
  'if(!par){pathParts.unshift(t);break;}',
  'var sameTag=[].slice.call(par.children).filter(function(n){return n.tagName===cur.tagName;});',
  'if(sameTag.length>1){',
  'var idx=sameTag.indexOf(cur)+1;',
  't+=":nth-of-type("+idx+")";',
  '}',
  'pathParts.unshift(t);',
  'cur=par;',
  'depth++;',
  '}',
  'return pathParts.join(" > ");',
  '}',
  'var hoverEl=null;',
  'function outline(el){',
  'if(hoverEl){hoverEl.style.outline="";}',
  'hoverEl=el;',
  'if(el){el.style.outline=HIGHLIGHT;}',
  '}',
  'document.addEventListener("mousemove",function(e){outline(e.target);},true);',
  'document.addEventListener("click",function(e){',
  'e.preventDefault();',
  'e.stopPropagation();',
  'e.stopImmediatePropagation();',
  'var el=e.target;',
  'if(!el||el.nodeType!==1)return;',
  'var sel=buildSelector(el);',
  'var txt=(el.innerText||el.textContent||"").trim().replace(/\\s+/g," ").slice(0,50);',
  'var tag=el.tagName.toLowerCase();',
  'if(typeof window.__chSelectorCapturePush==="function"){',
  'window.__chSelectorCapturePush({selector:sel,visibleText:txt,tagName:tag});',
  '}',
  'return false;',
  '},true);',
  '})();',
].join('');

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

function appendRowToSelectorsFile(row: TableRow): void {
  const target = path.resolve(process.cwd(), SELECTORS_RELATIVE);
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

function ensureSessionFile(): void {
  const sessionPath = path.resolve(process.cwd(), config.sessionStatePath);
  if (!fs.existsSync(sessionPath)) {
    output.write(
      `Session state file not found at:\n  ${sessionPath}\n` +
        'Save a session first (e.g. login flow + saveSession, or STORY-012 Session 0), then retry.\n',
    );
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  ensureSessionFile();
  if (process.exitCode === 1) {
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

  await context.addInitScript({ content: INJECT_SOURCE });

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
      'Commands: window <label> | name <step> | type read|click|fill | note <text> | ok | skip | done | quit\n',
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
        appendRowToSelectorsFile(row);
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
        const label = line.slice('window '.length).trim();
        if (label === '') {
          output.write('Usage: window <label>\n');
          continue;
        }
        const existing = pagesByLabel.get(label);
        if (existing) {
          currentLabel = label;
          await existing.bringToFront();
          output.write(`Switched to window "${label}".\n`);
          continue;
        }
        const newPage = await context.newPage();
        pagesByLabel.set(label, newPage);
        currentLabel = label;
        await newPage.bringToFront();
        output.write(`Opened new page labeled "${label}".\n`);
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
      output.write('Unknown command. Try: window, name, type, note, ok, skip, done, quit\n');
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
