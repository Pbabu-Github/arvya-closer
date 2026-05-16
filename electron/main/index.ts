import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';

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

  ipcMain.handle('pmf:gbrain:query', async (_, _question: string) => {
    // TODO(Naveen — lane/brain): wire to gbrain MCP via OAuth client_credentials
    return { ok: false, error: 'pmf:gbrain:query not yet implemented' };
  });

  ipcMain.handle('pmf:gbrain:search', async (_, _q: string) => {
    // TODO(Naveen — lane/brain)
    return { ok: false, error: 'pmf:gbrain:search not yet implemented' };
  });

  ipcMain.handle('pmf:gbrain:put-page', async (_, _slug: string, _content: string) => {
    // TODO(Naveen — lane/brain)
    return { ok: false, error: 'pmf:gbrain:put-page not yet implemented' };
  });

  ipcMain.handle('pmf:hog:enrich', async (_, _linkedinUrl: string) => {
    // TODO(Naveen — lane/api)
    return { ok: false, error: 'pmf:hog:enrich not yet implemented' };
  });

  ipcMain.handle('pmf:groq:transcribe', async (_, _audioBytes: Uint8Array) => {
    // TODO(Naveen — lane/api)
    return { ok: false, error: 'pmf:groq:transcribe not yet implemented' };
  });

  ipcMain.handle('pmf:anthropic:chat', async (_, _system: string, _user: string) => {
    // TODO(Naveen — lane/api)
    return { ok: false, error: 'pmf:anthropic:chat not yet implemented' };
  });

  ipcMain.handle('pmf:autopsy:load-cached', () => {
    // TODO(Prashanth — lane/dash): pre-cache demo autopsy result and load here
    return { ok: false, error: 'pmf:autopsy:load-cached not yet implemented' };
  });

  ipcMain.handle('pmf:coach:next-card', async (_, _context: unknown) => {
    // TODO(Naveen — lane/api): hybrid rules + Anthropic tool-call
    return { ok: false, error: 'pmf:coach:next-card not yet implemented' };
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

  ipcMain.handle('pmf:brain:stats', async () => {
    // TODO(Naveen — lane/brain): call gbrain MCP get_brain_identity and return
    // { pages, chunks, last_sync, entities }
    return { ok: false, error: 'pmf:brain:stats not yet implemented' };
  });

  createDashboardWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createDashboardWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
