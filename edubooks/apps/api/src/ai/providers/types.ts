/** Provider abstraction: the rest of the app never knows which model or vendor is behind it. */
export interface GenerateRequest {
  system: string;
  user: string;
  maxTokens: number;
  /** Ask for a single JSON object as the answer. */
  json: boolean;
}
export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  /** The model declined for safety reasons. */
  refused?: boolean;
}
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** True when this provider calls a real language model (false for the offline drafter). */
  readonly live: boolean;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  /** Optional: vector embeddings for semantic search. */
  embed?(texts: string[]): Promise<number[][]>;
  health(): Promise<{ ok: boolean; detail: string }>;
}
export class AiUnavailableError extends Error {}
