export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMStreamChunk {
  token?: string;
  toolCallDelta?: {
    id?: string;
    name?: string;
    argumentsDelta?: string;
  };
  finishReason?: string | null;
}

export interface LLMClient {
  streamChat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
  ): AsyncGenerator<LLMStreamChunk, void, unknown>;
}

export const WEB_SEARCH_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the live web for current events, breaking news, or real-time information. Use ONLY when required facts cannot be resolved from memory or general knowledge.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A focused, standalone web search query.',
        },
      },
      required: ['query'],
    },
  },
};

