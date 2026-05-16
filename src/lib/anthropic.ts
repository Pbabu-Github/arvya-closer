import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing from env');
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export async function chat(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  const resp = await client().messages.create({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 512,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });

  const text = resp.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
  return text;
}

export async function structuredCall<T>(opts: {
  system: string;
  user: string;
  toolName: string;
  schema: object;
  maxTokens?: number;
  model?: string;
}): Promise<T> {
  const resp = await client().messages.create({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 512,
    system: opts.system,
    tools: [
      {
        name: opts.toolName,
        description: `Return a structured payload via ${opts.toolName}.`,
        input_schema: opts.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: opts.toolName },
    messages: [{ role: 'user', content: opts.user }],
  });

  for (const block of resp.content) {
    if (block.type === 'tool_use' && block.name === opts.toolName) {
      return block.input as T;
    }
  }

  throw new Error(`structuredCall(${opts.toolName}): model did not invoke the tool`);
}
