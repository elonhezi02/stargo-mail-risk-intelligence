import { z } from 'zod';
import { ModelError } from '../errors.js';

export interface ModelRequest {
  system: string;
  input: unknown;
  schema: Record<string, unknown>;
  repair?: string;
  previous?: string;
}
export interface ModelClient {
  model: string;
  generate(request: ModelRequest): Promise<string>;
  health(): Promise<{ available: boolean; message: string }>;
}
export class OllamaClient implements ModelClient {
  constructor(
    public model: string,
    private baseUrl: string,
    private timeoutMs = 60000,
  ) {}
  async health() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) return { available: false, message: 'Ollama is not responding normally.' };
      const data = (await response.json()) as { models?: { name: string }[] };
      const available =
        data.models?.some((m) => m.name === this.model || m.name === `${this.model}:latest`) ??
        false;
      return {
        available,
        message: available ? 'Local model ready' : `Model missing. Run: ollama pull ${this.model}`,
      };
    } catch {
      return { available: false, message: 'Ollama is offline. Start it with: ollama serve' };
    }
  }
  async generate(request: ModelRequest): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: this.model,
          stream: false,
          think: false,
          keep_alive: '10m',
          format: request.schema,
          options: { temperature: 0, num_ctx: 16384, num_predict: 3500 },
          messages: [
            {
              role: 'system',
              content: `${request.system}\n\nReturn JSON matching this schema (including the descriptions):\n${JSON.stringify(request.schema)}`,
            },
            { role: 'user', content: JSON.stringify({ data: request.input }) },
            ...(request.repair
              ? [
                  { role: 'assistant', content: request.previous ?? '{}' },
                  {
                    role: 'user',
                    content: `Your previous response failed validation. Return a complete corrected JSON response. Validation errors: ${request.repair}`,
                  },
                ]
              : []),
          ],
        }),
      });
    } catch (error) {
      const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      throw new ModelError(
        timeout ? 'MODEL_TIMEOUT' : 'MODEL_UNAVAILABLE',
        timeout
          ? 'The local model timed out. Try again, or increase LLM_TIMEOUT_MS for slower hardware.'
          : 'Cannot connect to Ollama. Start the local model server and retry.',
        true,
      );
    }
    if (!response.ok) {
      if (response.status === 404)
        throw new ModelError(
          'MODEL_MISSING',
          `Model "${this.model}" is not installed. Run: ollama pull ${this.model}`,
        );
      throw new ModelError(
        'MODEL_HTTP_ERROR',
        `The model server returned HTTP ${response.status}.`,
        response.status === 429 || response.status >= 500,
      );
    }
    let data: { message?: { content?: string }; done_reason?: string };
    try {
      data = await response.json();
    } catch {
      throw new ModelError('INVALID_RESPONSE', 'The model server returned an unreadable response.');
    }
    if (typeof data.message?.content !== 'string')
      throw new ModelError('INVALID_RESPONSE', 'The model server did not return message content.');
    return data.message.content;
  }
}

export async function callStructured<T>(
  client: ModelClient,
  system: string,
  input: unknown,
  schema: z.ZodType<T>,
  validate: (value: T) => void,
  wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): Promise<T> {
  let repair: string | undefined;
  let previous: string | undefined;
  for (let generation = 0; generation < 2; generation++) {
    let raw = '';
    for (let attempt = 0; ; attempt++) {
      try {
        raw = await client.generate({
          system,
          input,
          schema: z.toJSONSchema(schema) as Record<string, unknown>,
          repair,
          previous,
        });
        break;
      } catch (error) {
        if (!(error instanceof ModelError) || !error.retryable || attempt >= 2) throw error;
        await wait(1000 * 2 ** attempt);
      }
    }
    try {
      const value = schema.parse(JSON.parse(raw));
      validate(value);
      return value;
    } catch (error) {
      previous = raw;
      repair = error instanceof Error ? error.message.slice(0, 1800) : 'Invalid JSON';
    }
  }
  throw new ModelError(
    'INVALID_OUTPUT',
    'The model returned invalid or unsupported data after one repair attempt. You can retry this stage.',
  );
}
