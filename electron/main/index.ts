import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { gbrainClient } from '../../src/lib/gbrain-client';
import { chat as anthropicChat } from '../../src/lib/anthropic';
import { nextCard, type CoachContext } from '../../src/lib/coach-engine';
import { enrich as hogEnrich, deepResearch as hogDeepResearch } from '../../src/lib/hog';
import { listProspects } from '../../src/lib/prospects';
import { enrichAutopsy } from '../../src/lib/autopsy-enrich';

// Dev-mode diagnostics: remote-debugging port so we can connect via CDP
if (is.dev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

let dashboardWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

function attachRendererDiagnostics(win: BrowserWindow, name: string) {
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const levelName = ['LOG', 'WARN', 'ERROR', 'DEBUG'][level] || `L${level}`;
    console.log(`[${name} ${levelName}] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[${name} LOAD FAIL] ${code} ${desc} url=${url}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[${name} CRASH] ${JSON.stringify(details)}`);
  });
  win.webContents.on('preload-error', (_e, preloadPath, err) => {
    console.error(`[${name} PRELOAD ERROR] ${preloadPath} ${err.stack ?? err.message}`);
  });
}

function createDashboardWindow() {
  dashboardWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Arvya Closer',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  dashboardWindow.on('ready-to-show', () => {
    dashboardWindow?.show();
    dashboardWindow?.focus();
    if (is.dev) {
      dashboardWindow?.webContents.openDevTools({ mode: 'right' });
    }
  });
  dashboardWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  attachRendererDiagnostics(dashboardWindow, 'dashboard');

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    dashboardWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/dashboard.html`);
  } else {
    dashboardWindow.loadFile(join(__dirname, '../renderer/dashboard.html'));
  }

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show();
    overlayWindow.focus();
    return;
  }

  const primary = screen.getPrimaryDisplay();
  const width = 440;
  const height = 320;

  overlayWindow = new BrowserWindow({
    width,
    height,
    x: primary.workArea.x + primary.workArea.width - width - 24,
    y: primary.workArea.y + 80,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    movable: true,
    focusable: true,
    title: 'Arvya Closer Overlay',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ============================================================
  // CRITICAL: screen-share exemption (macOS only — Sonoma 14.x+).
  // Sets NSWindowSharingNone on the underlying NSWindow so Zoom /
  // Meet / QuickTime / OBS / macOS-native screenshot render this
  // window as a blank rectangle in their captures. Test this AT
  // HOUR 0:15 with a 30-second screen recording — if it fails on
  // the demo Mac, the "invisible-to-prospect" beat is dead.
  // ============================================================
  overlayWindow.setContentProtection(true);

  // Always-on-top above floating apps too
  overlayWindow.setAlwaysOnTop(true, 'floating', 1);

  // Visible across virtual desktops (so it stays put during Zoom fullscreen)
  if (process.platform === 'darwin') {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  overlayWindow.on('ready-to-show', () => overlayWindow?.show());

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    overlayWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`);
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'));
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.arvya.closer');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // ------------------------------------------------------------
  // IPC handlers — minimum viable stubs. Naveen fills these in
  // with real gbrain / Hog / Groq / Anthropic calls.
  // See src/lib/* and HACKATHON.md for the integration plan.
  // ------------------------------------------------------------
  ipcMain.handle('pmf:open-overlay', () => {
    createOverlayWindow();
    return { ok: true };
  });

  ipcMain.handle('pmf:hide-overlay', () => {
    overlayWindow?.hide();
    return { ok: true };
  });

  ipcMain.handle('pmf:overlay:toggle-click-through', (_, ignore: boolean) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
    return { ok: true, ignore };
  });

  ipcMain.handle('pmf:gbrain:query', async (_, question: string) => {
    try {
      return { ok: true, result: await gbrainClient.query(question) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('pmf:gbrain:search', async (_, q: string) => {
    try {
      return { ok: true, result: await gbrainClient.search(q) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('pmf:gbrain:put-page', async (_, slug: string, content: string) => {
    try {
      return { ok: true, result: await gbrainClient.putPage(slug, content) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('pmf:hog:enrich', async (_, linkedinUrl: string) => {
    try {
      return { ok: true, result: await hogEnrich(linkedinUrl) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(
    'pmf:hog:deep-research',
    async (_, args: { prompt: string; schema: object; urls?: string[] }) => {
      try {
        const result = await hogDeepResearch(args);
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(
    'pmf:groq:transcribe',
    async (_, audioBytes: Uint8Array, mimeType?: string) => {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) return { ok: false, error: 'GROQ_API_KEY missing from env' };
      try {
        // Don't lie about the format — Whisper decodes based on the filename
        // extension + content-type. The renderer records webm/opus by default.
        const mime = (typeof mimeType === 'string' && mimeType) || 'audio/webm';
        const ext = mime.includes('mp4')
          ? 'mp4'
          : mime.includes('ogg')
            ? 'ogg'
            : mime.includes('wav')
              ? 'wav'
              : mime.includes('mpeg') || mime.includes('mp3')
                ? 'mp3'
                : 'webm';

        const form = new FormData();
        const copy = new Uint8Array(audioBytes.byteLength);
        copy.set(audioBytes);
        const blob = new Blob([copy.buffer as ArrayBuffer], { type: mime });
        form.append('file', blob, `audio.${ext}`);
        form.append('model', 'whisper-large-v3');
        form.append('response_format', 'text');
        // Bias Whisper away from common silence-hallucinations
        form.append('language', 'en');
        form.append('temperature', '0');
        form.append(
          'prompt',
          'A sales discovery call. Casual business conversation. If silent, return empty string.',
        );

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
        });

        const text = await response.text();
        if (!response.ok) {
          return { ok: false, error: `groq ${response.status}: ${text.slice(0, 200)}` };
        }
        return { ok: true, text };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle('pmf:anthropic:chat', async (_, system: string, user: string) => {
    try {
      const text = await anthropicChat({ system, user });
      return { ok: true, text };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('pmf:autopsy:load-cached', () => {
    const path = join(process.cwd(), 'data', 'demo-autopsy-result.json');
    if (!existsSync(path)) {
      return {
        ok: false,
        error: 'run scripts/precache-demo-autopsy.ts first',
      };
    }
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      const enriched = enrichAutopsy(data);
      return { ok: true, ...enriched };
    } catch (error) {
      return {
        ok: false,
        error: `failed to read autopsy cache: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  ipcMain.handle('pmf:coach:next-card', async (_, context: unknown) => {
    try {
      const ctx: CoachContext = {
        lastTurns: Array.isArray((context as CoachContext | undefined)?.lastTurns)
          ? ((context as CoachContext).lastTurns.filter((t) => typeof t === 'string') as string[])
          : [],
        callStage:
          typeof (context as CoachContext | undefined)?.callStage === 'string'
            ? (context as CoachContext).callStage
            : undefined,
      };
      const card = await nextCard(ctx);
      return { ok: true, card };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ------------------------------------------------------------
  // Brain seed — spawns scripts/seed-brain.ts via Bun.
  // Streams progress events to the dashboard via webContents.send.
  // ------------------------------------------------------------
  ipcMain.handle('pmf:brain:seed', async (_, extraPaths: string[]) => {
    // TODO(Naveen — lane/brain): spawn `bun run scripts/seed-brain.ts` with
    // ...extraPaths.map(p => ['--add', p]).flat(), parse stdout for progress,
    // forward to dashboardWindow.webContents.send('pmf:brain:seed:progress', ...).
    // For now this is a stub so the UI button compiles.
    return { ok: false, error: 'pmf:brain:seed not yet implemented (see scripts/seed-brain.ts)' };
  });

  ipcMain.handle('pmf:prospects:list', () => {
    try {
      return { ok: true, prospects: listProspects() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('pmf:brain:stats', async () => {
    try {
      const stats = await gbrainClient.getBrainIdentity();
      return { ok: true, ...stats };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  createDashboardWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createDashboardWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
