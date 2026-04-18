import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { config } from '../config';
import { logger } from '../logger';

export interface SupervisedConfirmationStep {
  description: string;
  screenshotBase64: string;
  targetRect?: { x: number; y: number; width: number; height: number };
  windowLabel?: string;
}

let registeredInstance: SupervisedUI | null = null;

export function registerSupervisedUi(ui: SupervisedUI | null): void {
  registeredInstance = ui;
}

export function getRegisteredSupervisedUi(): SupervisedUI | null {
  return registeredInstance;
}

const PANEL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ClinicHub — Supervised confirmation</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 16px; background: #111; color: #eee; }
    h1 { font-size: 1.1rem; margin: 0 0 12px; }
    #windowLabel { color: #9cf; margin-bottom: 8px; font-size: 0.9rem; display: none; }
    #description { margin: 12px 0; line-height: 1.4; }
    #shotWrap { position: relative; display: inline-block; max-width: 100%; vertical-align: top; background: #222; }
    #shot { display: block; max-width: 100%; height: auto; }
    #highlight { position: absolute; border: 3px solid #f33; box-sizing: border-box; pointer-events: none; display: none; }
    #actions { margin-top: 16px; display: flex; gap: 12px; flex-wrap: wrap; }
    button { padding: 10px 18px; font-size: 1rem; cursor: pointer; border-radius: 6px; border: none; }
    #confirmBtn { background: #2a7; color: #fff; }
    #skipBtn { background: #555; color: #fff; }
    #waiting { color: #888; font-style: italic; }
  </style>
</head>
<body>
  <h1>ClinicHub supervised step</h1>
  <div id="windowLabel"></div>
  <p id="description"><span id="waiting">Waiting for the next automation step…</span></p>
  <div id="shotWrap">
    <img id="shot" alt="Page screenshot" />
    <div id="highlight"></div>
  </div>
  <div id="actions" style="display:none">
    <button type="button" id="confirmBtn">Confirm</button>
    <button type="button" id="skipBtn">Skip</button>
  </div>
  <script>
    (function () {
      var shot = document.getElementById('shot');
      var highlight = document.getElementById('highlight');
      var desc = document.getElementById('description');
      var waiting = document.getElementById('waiting');
      var actions = document.getElementById('actions');
      var windowLabelEl = document.getElementById('windowLabel');
      var confirmBtn = document.getElementById('confirmBtn');
      var skipBtn = document.getElementById('skipBtn');

      function layoutHighlight() {
        if (!highlight || highlight.style.display === 'none' || !shot || !shot.naturalWidth) return;
        var rect = shot._targetRect;
        if (!rect) return;
        var scale = shot.clientWidth / shot.naturalWidth;
        highlight.style.left = (rect.x * scale) + 'px';
        highlight.style.top = (rect.y * scale) + 'px';
        highlight.style.width = (rect.width * scale) + 'px';
        highlight.style.height = (rect.height * scale) + 'px';
      }

      if (shot) {
        shot.addEventListener('load', layoutHighlight);
        globalThis.addEventListener('resize', layoutHighlight);
      }

      function applyStep(step) {
        if (!step) {
          if (waiting) waiting.style.display = '';
          if (actions) actions.style.display = 'none';
          if (shot) { shot.removeAttribute('src'); shot._targetRect = null; }
          if (highlight) highlight.style.display = 'none';
          if (windowLabelEl) { windowLabelEl.style.display = 'none'; windowLabelEl.textContent = ''; }
          desc.innerHTML = '';
          desc.appendChild(waiting);
          return;
        }
        if (waiting) waiting.style.display = 'none';
        if (actions) actions.style.display = 'flex';
        desc.textContent = step.description || '';
        if (windowLabelEl) {
          if (step.windowLabel) {
            windowLabelEl.textContent = 'Window: ' + step.windowLabel;
            windowLabelEl.style.display = 'block';
          } else {
            windowLabelEl.style.display = 'none';
            windowLabelEl.textContent = '';
          }
        }
        if (shot) {
          shot._targetRect = step.targetRect || null;
          shot.src = 'data:image/png;base64,' + (step.screenshotBase64 || '');
        }
        if (highlight && step.targetRect) {
          highlight.style.display = 'block';
          layoutHighlight();
        } else if (highlight) {
          highlight.style.display = 'none';
        }
      }

      function poll() {
        fetch('/api/current')
          .then(function (r) { return r.json(); })
          .then(function (data) { applyStep(data.step); })
          .catch(function () {});
      }

      function postDecision(choice) {
        fetch('/api/decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ choice: choice })
        }).catch(function () {});
      }

      if (confirmBtn) confirmBtn.addEventListener('click', function () { postDecision('confirm'); });
      if (skipBtn) skipBtn.addEventListener('click', function () { postDecision('skip'); });
      setInterval(poll, 400);
      poll();
    })();
  </script>
</body>
</html>`;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw.trim() === '') {
          resolve({});
          return;
        }
        const parsed: unknown = JSON.parse(raw);
        resolve(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export class SupervisedUI {
  private server: Server | null = null;
  private pendingStep: SupervisedConfirmationStep | null = null;
  private pendingResolver: ((value: 'confirm' | 'skip') => void) | null = null;

  async start(): Promise<void> {
    if (!config.supervisedMode) {
      return;
    }
    if (this.server?.listening) {
      return;
    }

    const srv = createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    srv.on('error', (err: Error) => {
      logger.error({ err }, 'Supervised UI server error');
    });

    try {
      await new Promise<void>((resolve, reject) => {
        srv.once('error', reject);
        srv.listen(config.supervisedUiPort, '127.0.0.1', () => {
          srv.removeListener('error', reject);
          resolve();
        });
      });
    } catch (err) {
      await new Promise<void>((resolve) => {
        srv.close(() => {
          resolve();
        });
      });
      throw err;
    }

    this.server = srv;
    logger.info(
      `Supervised UI listening on http://127.0.0.1:${config.supervisedUiPort} — open this URL to confirm each step`,
    );
  }

  async stop(): Promise<void> {
    if (this.pendingResolver) {
      this.pendingResolver('skip');
      this.pendingResolver = null;
    }
    this.pendingStep = null;

    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.server!.close(() => {
        resolve();
      });
    });
    this.server = null;
    logger.info('Supervised UI server stopped');
  }

  async requestConfirmation(step: SupervisedConfirmationStep): Promise<'confirm' | 'skip'> {
    if (!config.supervisedMode) {
      return 'confirm';
    }

    if (!this.server?.listening) {
      throw new Error('SupervisedUI.start() must be called before requestConfirmation when SUPERVISED_MODE is true');
    }

    if (this.pendingResolver) {
      throw new Error('SupervisedUI.requestConfirmation called while another confirmation is still pending');
    }

    this.pendingStep = { ...step };

    return await new Promise<'confirm' | 'skip'>((resolve) => {
      this.pendingResolver = resolve;
    });
  }

  private resolvePending(outcome: 'confirm' | 'skip'): void {
    this.pendingStep = null;
    const resolver = this.pendingResolver;
    this.pendingResolver = null;
    if (resolver) {
      resolver(outcome);
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    try {
      if (method === 'GET' && (url === '/' || url.startsWith('/?'))) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(PANEL_HTML);
        return;
      }

      if (method === 'GET' && url === '/api/current') {
        sendJson(res, 200, { step: this.pendingStep });
        return;
      }

      if (method === 'POST' && url === '/api/decision') {
        const body = await readJsonBody(req);
        const choice = body.choice;
        if (choice !== 'confirm' && choice !== 'skip') {
          sendJson(res, 400, { error: 'Invalid choice' });
          return;
        }
        if (!this.pendingResolver) {
          sendJson(res, 409, { error: 'No pending confirmation' });
          return;
        }
        this.resolvePending(choice);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === 'GET' && url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      res.writeHead(404);
      res.end();
    } catch (err) {
      logger.warn({ err }, 'Supervised UI HTTP handler error');
      sendJson(res, 500, { error: 'Internal error' });
    }
  }
}
