/** Shapes shared by the renderer and the main-process provider client. */

export interface ProviderToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ProviderToolResult {
  id: string;
  name: string;
  output: string;
  isError: boolean;
}

/** A provider-neutral conversation turn. `tool` turns carry the results of the previous assistant turn's calls. */
export interface ProviderMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ProviderToolCall[];
  toolResults?: ProviderToolResult[];
}

export interface ProviderToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ProviderStreamRequest {
  requestId: string;
  providerId: string;
  messages: ProviderMessage[];
  system?: string;
  model?: string;
  tools?: ProviderToolDef[];
}

export interface ProviderResult {
  content: string;
  toolCalls: ProviderToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
}
