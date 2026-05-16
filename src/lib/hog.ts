export type HogEnrichment = {
  id: string;
  status: string;
  result?: unknown;
  raw: unknown;
};

export type HogDeepResearch = {
  id: string;
  status: string;
  result?: unknown;
  raw: unknown;
};

const BASE_URL = 'https://developer.thehog.ai/api';
const POLL_INTERVAL_MS = 5000; // 5s — avoid HOG's 429 rate limit on polling
const POLL_TIMEOUT_MS = 120_000; // 2 min for slow deep-research operations

function authHeaders(): Record<string, string> {
  const accessKey = process.env.HOG_ACCESS_KEY;
  const secretKey = process.env.HOG_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error('HOG_ACCESS_KEY / HOG_SECRET_KEY missing from env');
  }
  return {
    'X-Access-Key': accessKey,
    'X-Secret-Key': secretKey,
  };
}

async function asJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enrich(linkedinUrl: string): Promise<HogEnrichment> {
  const headers = authHeaders();

  const createResponse = await fetch(`${BASE_URL}/enrichments`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      identifier: { linkedin_url: linkedinUrl },
      fields: [
        'contact.email',
        'contact.phone',
        'contact.title',
        'contact.company',
        'contact.name',
        'contact.full_name',
      ],
    }),
  });

  const created = await asJson<{ id?: string; enrichment_id?: string; operation_id?: string }>(
    createResponse,
    'hog enrichment create',
  );
  const id = created.id ?? created.enrichment_id ?? created.operation_id;
  if (!id) throw new Error('hog enrichment response missing id');

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const pollResponse = await fetch(`${BASE_URL}/enrichments/${id}`, { headers });
    const poll = await asJson<{ status?: string; result?: unknown }>(
      pollResponse,
      'hog enrichment poll',
    );
    const status = (poll.status ?? '').toLowerCase();
    if (status === 'completed' || status === 'success' || status === 'succeeded' || status === 'done') {
      return { id, status: poll.status ?? 'completed', result: poll.result, raw: poll };
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`hog enrichment ${id} failed: ${JSON.stringify(poll).slice(0, 200)}`);
    }
  }

  throw new Error(`hog enrichment ${id} timed out after ${POLL_TIMEOUT_MS}ms`);
}

/**
 * Run a HOG /deep-research operation: prompt + JSON schema + optional source URLs.
 * Returns the structured result. Polls /operations/:id until status is done.
 *
 * Example use: find PE/IB conferences in NY this quarter that target M&A advisors.
 */
export async function deepResearch(args: {
  prompt: string;
  schema: object;
  urls?: string[];
}): Promise<HogDeepResearch> {
  const headers = authHeaders();

  const createResponse = await fetch(`${BASE_URL}/deep-research`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: args.prompt,
      schema: args.schema,
      urls: args.urls ?? [],
    }),
  });

  const created = await asJson<{ id?: string; operation_id?: string }>(
    createResponse,
    'hog deep-research create',
  );
  const id = created.id ?? created.operation_id;
  if (!id) throw new Error('hog deep-research response missing id');

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const pollResponse = await fetch(`${BASE_URL}/operations/${id}`, { headers });
    const poll = await asJson<{ status?: string; result?: unknown }>(
      pollResponse,
      'hog deep-research poll',
    );
    const status = (poll.status ?? '').toLowerCase();
    if (status === 'completed' || status === 'success' || status === 'succeeded' || status === 'done') {
      return { id, status: poll.status ?? 'completed', result: poll.result, raw: poll };
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`hog deep-research ${id} failed: ${JSON.stringify(poll).slice(0, 200)}`);
    }
  }

  throw new Error(`hog deep-research ${id} timed out after ${POLL_TIMEOUT_MS}ms`);
}
