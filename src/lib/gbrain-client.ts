import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

type JsonRpcResponse<T = unknown> = {
  jsonrpc?: string;
  id?: string | number;
  result?: T;
  error?: { code?: number; message?: string; data?: unknown };
};

type GBrainConfig = {
  httpUrl: string;
  clientId: string;
  clientSecret: string;
};

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

export type GBrainIdentity = {
  pages?: number;
  chunks?: number;
  last_sync?: string;
  entities?: number;
  raw: unknown;
};

export type GBrainSearchChunk = {
  slug?: string;
  page_id?: number;
  title?: string;
  type?: string;
  chunk_text?: string;
  chunk_source?: string;
  chunk_id?: number;
  chunk_index?: number;
  score?: number;
  stale?: boolean;
  source_id?: string;
};

let tokenCache: TokenCache | null = null;

function loadDotEnv() {
  const candidates = [join(process.cwd(), '.env'), join(process.cwd(), '..', '.env')];

  for (const path of candidates) {
    if (!existsSync(path)) continue;

    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (process.env[key]) continue;

      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function getConfig(): GBrainConfig {
  loadDotEnv();

  const httpUrl = process.env.GBRAIN_HTTP_URL?.replace(/\/+$/, '');
  const clientId = process.env.GBRAIN_CLIENT_ID;
  const clientSecret = process.env.GBRAIN_CLIENT_SECRET;

  const missing = [
    !httpUrl && 'GBRAIN_HTTP_URL',
    !clientId && 'GBRAIN_CLIENT_ID',
    !clientSecret && 'GBRAIN_CLIENT_SECRET',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing gbrain env vars: ${missing.join(', ')}`);
  }

  return {
    httpUrl: httpUrl as string,
    clientId: clientId as string,
    clientSecret: clientSecret as string,
  };
}

async function parseJsonResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  let json: unknown;

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned non-JSON (${response.status}): ${text.slice(0, 240)}`);
  }

  if (!response.ok) {
    const message =
      typeof json === 'object' && json && 'error' in json
        ? JSON.stringify((json as { error: unknown }).error)
        : text.slice(0, 240);
    throw new Error(`${label} failed (${response.status}): ${message}`);
  }

  return json as T;
}

async function mintToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now) {
    return tokenCache.accessToken;
  }

  const config = getConfig();
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(`${config.httpUrl}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await parseJsonResponse<{ access_token?: string; expires_in?: number }>(
    response,
    'gbrain token',
  );

  if (!json.access_token) {
    throw new Error('gbrain token response did not include access_token');
  }

  const serverTtlMs = typeof json.expires_in === 'number' ? json.expires_in * 1000 : 60 * 60 * 1000;
  tokenCache = {
    accessToken: json.access_token,
    expiresAtMs: now + Math.min(serverTtlMs, 50 * 60 * 1000),
  };

  return tokenCache.accessToken;
}

async function mcpCall<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const config = getConfig();
  const token = await mintToken();
  const response = await fetch(`${config.httpUrl}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `arvya-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });

  const json = await parseMcpResponse<JsonRpcResponse<T>>(response, `gbrain MCP ${name}`);
  if (json.error) {
    throw new Error(`gbrain MCP ${name} failed: ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  return json.result as T;
}

async function parseMcpResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${text.slice(0, 240)}`);
  }

  const trimmed = text.trim();
  if (!trimmed) return {} as T;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as T;
  }

  // SSE stream: take the last `data: <json>` line.
  let payload: string | null = null;
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith('data:')) payload = line.slice(5).trim();
  }
  if (!payload) {
    throw new Error(`${label} returned no data frame: ${trimmed.slice(0, 240)}`);
  }
  return JSON.parse(payload) as T;
}

type McpToolCallResult = {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

function extractStructured<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'structuredContent' in result) {
    return (result as { structuredContent: T }).structuredContent;
  }
  const content = (result as McpToolCallResult)?.content;
  const first = content?.[0]?.text;
  if (typeof first === 'string') {
    try {
      return JSON.parse(first) as T;
    } catch {
      return first as unknown as T;
    }
  }
  return result as T;
}

function normalizeIdentity(raw: unknown): GBrainIdentity {
  const source = extractStructured<unknown>(raw);
  const record = typeof source === 'object' && source ? (source as Record<string, unknown>) : {};
  return {
    pages: numberFrom(record.pages ?? record.page_count ?? record.pageCount),
    chunks: numberFrom(record.chunks ?? record.chunk_count ?? record.chunkCount),
    last_sync: stringFrom(
      record.last_sync ?? record.lastSync ?? record.last_synced_at ?? record.last_sync_iso,
    ),
    entities: numberFrom(record.entities ?? record.entity_count ?? record.entityCount),
    raw,
  };
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export const gbrainClient = {
  async query(q: string, limit?: number): Promise<unknown> {
    const args: Record<string, unknown> = { query: q };
    if (typeof limit === 'number') args.limit = limit;
    return extractStructured(await mcpCall('query', args));
  },
  async search(q: string, limit?: number): Promise<GBrainSearchChunk[]> {
    const args: Record<string, unknown> = { query: q };
    if (typeof limit === 'number') args.limit = limit;
    const raw = await mcpCall('search', args);
    const parsed = extractStructured<unknown>(raw);
    return Array.isArray(parsed) ? (parsed as GBrainSearchChunk[]) : [];
  },
  putPage: (slug: string, content: string) => mcpCall('put_page', { slug, content }),
  async getBrainIdentity() {
    return normalizeIdentity(await mcpCall('get_brain_identity'));
  },
};

export default gbrainClient;
