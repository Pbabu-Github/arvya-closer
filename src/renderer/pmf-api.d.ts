/**
 * Renderer-local type declaration for the `window.pmf` API exposed by the
 * Electron preload script via contextBridge. The actual implementation lives
 * at electron/preload/index.ts — DO NOT import from there in the renderer;
 * Vite refuses to serve files outside src/renderer/.
 *
 * Keep this file in sync with electron/preload/index.ts manually. If the
 * preload API surface changes, mirror it here.
 */

export {};

interface BrainStatsResponse {
  ok: boolean;
  pages?: number;
  chunks?: number;
  last_sync?: string;
  entities?: number;
  error?: string;
}

interface SeedResponse {
  ok: boolean;
  error?: string;
}

interface SeedProgress {
  file: string;
  current: number;
  total: number;
  kind: string;
}

interface PMFApi {
  openOverlay: () => Promise<{ ok: boolean }>;
  hideOverlay: () => Promise<{ ok: boolean }>;
  overlayToggleClickThrough: (ignore: boolean) => Promise<{ ok: boolean; ignore: boolean }>;

  gbrain: {
    query: (q: string) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    search: (q: string) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    putPage: (slug: string, content: string) => Promise<{ ok: boolean; error?: string }>;
  };

  hog: {
    enrich: (linkedinUrl: string) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    deepResearch: (args: { prompt: string; schema: object; urls?: string[] }) =>
      Promise<{ ok: boolean; result?: unknown; error?: string }>;
  };

  groq: {
    transcribe: (
      audioBytes: Uint8Array,
      mimeType?: string,
    ) => Promise<{ ok: boolean; text?: string; error?: string }>;
  };

  anthropic: {
    chat: (system: string, user: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  };

  autopsy: {
    loadCached: () => Promise<{ ok: boolean; result?: unknown; error?: string }>;
  };

  coach: {
    nextCard: (context: unknown) => Promise<{ ok: boolean; card?: unknown; error?: string }>;
  };

  brain: {
    seed: (extraPaths?: string[]) => Promise<SeedResponse>;
    stats: () => Promise<BrainStatsResponse>;
    onProgress: (cb: (event: SeedProgress) => void) => () => void;
  };
}

declare global {
  interface Window {
    pmf: PMFApi;
  }
}
