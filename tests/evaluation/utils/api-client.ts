export interface ApiChatResponse {
  statusCode: number;
  tokens: string[];
  fullContent: string;
  sources: Array<{ id: number; title: string; url: string }>;
  timings?: {
    totalMs: number;
    timeToFirstEventMs: number | null;
    timeToFirstTokenMs: number | null;
    memoryMs: number;
    searchMs: number;
  };
  conversationId?: string;
  error?: string;
  status: 'complete' | 'interrupted' | 'error';
}

export class EvaluationApiClient {
  constructor(private baseUrl: string) {}

  async sendChat(params: {
    ownerId: string;
    message: string;
    conversationId?: string;
    timezone?: string;
    signal?: AbortSignal;
  }): Promise<ApiChatResponse> {
    const url = `${this.baseUrl}/api/chat`;
    const tokens: string[] = [];
    let fullContent = '';
    let sources: Array<{ id: number; title: string; url: string }> = [];
    let timings: ApiChatResponse['timings'] = undefined;
    let conversationId = params.conversationId;
    let finalStatus: ApiChatResponse['status'] = 'complete';
    let errorMessage: string | undefined = undefined;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-owner-id': params.ownerId,
      },
      body: JSON.stringify({
        message: params.message,
        conversationId: params.conversationId,
        timezone: params.timezone || 'UTC',
      }),
      signal: params.signal,
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as { message?: string };
      return {
        statusCode: res.status,
        tokens: [],
        fullContent: '',
        sources: [],
        status: 'error',
        error: errJson.message || `HTTP ${res.status}`,
      };
    }

    const text = await res.text();
    const blocks = text.split('\n\n').filter((b) => b.trim().length > 0);

    for (const block of blocks) {
      const lines = block.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event: '));
      const dataLine = lines.find((l) => l.startsWith('data: '));

      if (eventLine && dataLine) {
        const eventType = eventLine.replace('event: ', '').trim();
        const data = JSON.parse(dataLine.replace('data: ', '').trim());

        if (eventType === 'token') {
          tokens.push(data.content);
          fullContent += data.content;
        } else if (eventType === 'sources') {
          sources = data.sources || [];
        } else if (eventType === 'complete') {
          fullContent = data.content || fullContent;
          sources = data.sources || sources;
          timings = data.timings;
          conversationId = data.conversationId || conversationId;
          finalStatus = data.status || 'complete';
        } else if (eventType === 'error') {
          finalStatus = 'error';
          errorMessage = data.error;
        }
      }
    }

    return {
      statusCode: res.status,
      tokens,
      fullContent,
      sources,
      timings,
      conversationId,
      status: finalStatus,
      error: errorMessage,
    };
  }

  async listConversations(ownerId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/conversations`, {
      headers: { 'x-owner-id': ownerId },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { conversations: any[] };
    return data.conversations || [];
  }

  async getMessages(conversationId: string, ownerId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/messages`, {
      headers: { 'x-owner-id': ownerId },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { messages: any[] };
    return data.messages || [];
  }
}

