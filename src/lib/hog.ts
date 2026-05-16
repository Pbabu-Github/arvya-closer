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

/**
 * Poll a HOG operation until it succeeds, fails, or times out.
 * Tolerates 429 (rate limit) by backing off — does NOT treat 429 as failure.
 * Returns the final operation payload.
 */
async function pollOperation(
  url: string,
  headers: Record<string, string>,
  label: string,
): Promise<{ status: string; result?: unknown; raw: unknown }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let interval = POLL_INTERVAL_MS;
  // Wait a bit before the first poll — operations need time to even register.
  await sleep(3000);

  while (Date.now() < deadline) {
    let response: Response;
    try {
      response = await fetch(url, { headers });
    } catch (e) {
      // Network blip — back off and retry
      console.warn(`[hog] ${label} network error, backing off:`, e);
      await sleep(interval);
      interval = Math.min(interval * 1.5, 20_000);
      continue;
    }

    // 429: back off harder, keep polling — don't fail
    if (response.status === 429) {
      interval = Math.min(interval * 1.6, 20_000);
      await sleep(interval);
      continue;
    }

    // Other HTTP errors: still try to read the body for status info
    const text = await response.text();
    if (!response.ok) {
      // Some HOG errors are transient; back off but don't fail unless near deadline
      console.warn(`[hog] ${label} HTTP ${response.status}: ${text.slice(0, 160)}`);
      await sleep(interval);
      interval = Math.min(interval * 1.3, 15_000);
      continue;
    }

    let poll: { status?: string; result?: unknown };
    try {
      poll = JSON.parse(text);
    } catch {
      await sleep(interval);
      continue;
    }

    const status = (poll.status ?? '').toLowerCase();
    if (
      status === 'completed' ||
      status === 'success' ||
      status === 'succeeded' ||
      status === 'done'
    ) {
      return { status: poll.status ?? 'succeeded', result: poll.result, raw: poll };
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`${label} failed: ${JSON.stringify(poll).slice(0, 200)}`);
    }

    // still in-progress — back to normal cadence
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`${label} timed out after ${POLL_TIMEOUT_MS}ms`);
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

  const final = await pollOperation(
    `${BASE_URL}/enrichments/${id}`,
    headers,
    `hog enrichment ${id}`,
  );
  return { id, status: final.status, result: final.result, raw: final.raw };
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

  const final = await pollOperation(
    `${BASE_URL}/operations/${id}`,
    headers,
    `hog deep-research ${id}`,
  );
  return { id, status: final.status, result: final.result, raw: final.raw };
}
