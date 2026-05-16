import { contextBridge, ipcRenderer } from 'electron';

const api = {
  openOverlay: () => ipcRenderer.invoke('pmf:open-overlay'),
  hideOverlay: () => ipcRenderer.invoke('pmf:hide-overlay'),
  overlayToggleClickThrough: (ignore: boolean) =>
    ipcRenderer.invoke('pmf:overlay:toggle-click-through', ignore),
  gbrain: {
    query: (q: string) => ipcRenderer.invoke('pmf:gbrain:query', q),
    search: (q: string) => ipcRenderer.invoke('pmf:gbrain:search', q),
    putPage: (slug: string, content: string) =>
      ipcRenderer.invoke('pmf:gbrain:put-page', slug, content),
  },
  hog: {
    enrich: (linkedinUrl: string) => ipcRenderer.invoke('pmf:hog:enrich', linkedinUrl),
  },
  groq: {
    transcribe: (audioBytes: Uint8Array) =>
      ipcRenderer.invoke('pmf:groq:transcribe', audioBytes),
  },
  anthropic: {
    chat: (system: string, user: string) =>
      ipcRenderer.invoke('pmf:anthropic:chat', system, user),
  },
  autopsy: {
    loadCached: () => ipcRenderer.invoke('pmf:autopsy:load-cached'),
  },
  coach: {
    nextCard: (context: unknown) => ipcRenderer.invoke('pmf:coach:next-card', context),
  },
  brain: {
    seed: (extraPaths?: string[]) => ipcRenderer.invoke('pmf:brain:seed', extraPaths ?? []),
    stats: () => ipcRenderer.invoke('pmf:brain:stats'),
    onProgress: (cb: (event: { file: string; current: number; total: number; kind: string }) => void) => {
      const listener = (_: unknown, payload: { file: string; current: number; total: number; kind: string }) =>
        cb(payload);
      ipcRenderer.on('pmf:brain:seed:progress', listener);
      return () => ipcRenderer.removeListener('pmf:brain:seed:progress', listener);
    },
  },
};

contextBridge.exposeInMainWorld('pmf', api);

export type PMFApi = typeof api;
