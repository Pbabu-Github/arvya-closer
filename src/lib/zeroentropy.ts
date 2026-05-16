export type RerankHit = {
  index: number;
  score: number;
  document: string;
};

const ENDPOINT = 'https://api.zeroentropy.com/v1/models/rerank';
const MODEL = 'zerank-2';
const FALLBACK_SCORE = 0.5;

function fallback(documents: string[]): RerankHit[] {
  return documents.map((document, index) => ({
    index,
    score: FALLBACK_SCORE,
    document,
  }));
}

export async function rerank(
  query: string,
  documents: string[],
): Promise<RerankHit[]> {
  if (documents.length === 0) return [];

  const apiKey = process.env.ZEROENTROPY_API_KEY;
  if (!apiKey) {
    console.warn('[zeroentropy] ZEROENTROPY_API_KEY missing — returning fallback order');
    return fallback(documents);
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, query, documents }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[zeroentropy] HTTP ${response.status}: ${text.slice(0, 200)}`);
      return fallback(documents);
    }

    const json = (await response.json()) as {
      results?: Array<{ index: number; relevance_score: number }>;
    };

    if (!json.results || json.results.length === 0) return fallback(documents);

    return json.results
      .map((hit) => ({
        index: hit.index,
        score: hit.relevance_score,
        document: documents[hit.index] ?? '',
      }))
      .filter((hit) => hit.document !== '')
      .sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error('[zeroentropy] request failed:', error);
    return fallback(documents);
  }
}
