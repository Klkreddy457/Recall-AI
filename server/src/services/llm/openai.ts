import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import type {
  LLMClient,
  ChatMessage,
  ToolDefinition,
  LLMStreamChunk,
} from './types.js';

export interface OpenAIOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export class OpenAILLMClient implements LLMClient {
  private client: OpenAI;
  private model: string;

  constructor(opts: OpenAIOptions) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    });
    this.model = opts.model || 'gpt-4o-mini';
  }

  async *streamChat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const formattedMessages: ChatCompletionMessageParam[] = messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.tool_call_id || '',
        };
      }
      if (m.role === 'assistant') {
        return {
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.tool_calls?.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        };
      }
      if (m.role === 'system') {
        return {
          role: 'system',
          content: m.content,
        };
      }
      return {
        role: 'user',
        content: m.content,
      };
    });

    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: formattedMessages,
        tools: tools as unknown as ChatCompletionTool[],
        stream: true,
      },
      { signal }
    );

    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new Error('LLM stream aborted by client');
      }

      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta.content) {
        yield { token: delta.content };
      }

      if (delta.tool_calls && delta.tool_calls.length > 0) {
        const tc = delta.tool_calls[0]!;
        yield {
          toolCallDelta: {
            id: tc.id,
            name: tc.function?.name,
            argumentsDelta: tc.function?.arguments,
          },
        };
      }

      if (choice.finish_reason) {
        yield { finishReason: choice.finish_reason };
      }
    }
  }
}

/**
 * In-memory Fake LLM Client for testing without network or paid API keys.
 * Supports programmable scripted turns (tokens and/or tool calls).
 */
export interface FakeTurnResponse {
  toolCall?: { id: string; name: string; arguments: string };
  tokens?: string[];
  error?: Error;
}

export class FakeLLMClient implements LLMClient {
  public recordedMessages: ChatMessage[][] = [];
  public scriptedTurns: FakeTurnResponse[] = [];
  private turnIndex = 0;

  constructor(scriptedTurns: FakeTurnResponse[] = []) {
    this.scriptedTurns = scriptedTurns;
  }

  setScript(turns: FakeTurnResponse[]) {
    this.scriptedTurns = turns;
    this.turnIndex = 0;
  }

  async *streamChat(
    messages: ChatMessage[],
    _tools?: ToolDefinition[],
    signal?: AbortSignal
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    if (signal?.aborted) {
      throw new Error('LLM stream aborted by client');
    }

    this.recordedMessages.push([...messages]);

    const turn = this.scriptedTurns[this.turnIndex];
    this.turnIndex++;

    if (!turn) {
      yield { token: 'Default fake response.' };
      yield { finishReason: 'stop' };
      return;
    }

    if (turn.error) {
      throw turn.error;
    }

    if (turn.toolCall) {
      yield {
        toolCallDelta: {
          id: turn.toolCall.id,
          name: turn.toolCall.name,
          argumentsDelta: turn.toolCall.arguments,
        },
      };
      yield { finishReason: 'tool_calls' };
      return;
    }

    if (turn.tokens) {
      for (const tok of turn.tokens) {
        if (signal?.aborted) {
          throw new Error('LLM stream aborted by client');
        }
        yield { token: tok };
      }
      yield { finishReason: 'stop' };
    }
  }
}

