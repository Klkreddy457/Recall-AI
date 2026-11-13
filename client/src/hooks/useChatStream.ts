import { useState, useRef, useCallback } from 'react';
import { getOwnerId, getUserTimezone, API_BASE } from '../api/client.js';
import type { Message, SourceCard, SearchMetadata } from '../types/index.js';

export interface UseChatStreamProps {
  onConversationUpdated?: () => void;
}

export function useChatStream({ onConversationUpdated }: UseChatStreamProps = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      setStatusMessage(null);
    }
  }, []);

  const sendQuery = useCallback(
    async (
      query: string,
      conversationId: string | undefined,
      onUpdateMessage: (updater: (prev: Message[]) => Message[]) => void,
      onSetCurrentConversationId?: (id: string) => void
    ) => {
      setError(null);
      setStatusMessage(null);
      setIsStreaming(true);

      const ownerId = getOwnerId();
      const timezone = getUserTimezone();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      const userMsg: Message = {
        id: userMessageId,
        conversation_id: conversationId || '',
        role: 'user',
        content: query,
        status: 'complete',
        created_at: timestamp,
      };

      const initialAssistantMsg: Message = {
        id: assistantMessageId,
        conversation_id: conversationId || '',
        role: 'assistant',
        content: '',
        status: null,
        created_at: timestamp,
        sources_json: [],
      };

      // Add user message & empty assistant placeholder immediately
      onUpdateMessage((prev) => [...prev, userMsg, initialAssistantMsg]);

      try {
        const response = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-owner-id': ownerId,
          },
          body: JSON.stringify({
            conversationId,
            message: query,
            timezone,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || `Server responded with ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body stream is not available');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedContent = '';
        let receivedSources: SourceCard[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            const lines = trimmed.split('\n');
            const eventLine = lines.find((l) => l.startsWith('event: '));
            const dataLine = lines.find((l) => l.startsWith('data: '));

            if (!eventLine || !dataLine) continue;

            const eventType = eventLine.replace('event: ', '').trim();
            const data = JSON.parse(dataLine.replace('data: ', '').trim());

            if (eventType === 'status') {
              setStatusMessage(data.message);
            } else if (eventType === 'token') {
              setStatusMessage(null);
              accumulatedContent += data.content;
              onUpdateMessage((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: accumulatedContent }
                    : msg
                )
              );
            } else if (eventType === 'sources') {
              receivedSources = data.sources || [];
              onUpdateMessage((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, sources_json: receivedSources }
                    : msg
                )
              );
            } else if (eventType === 'complete') {
              setStatusMessage(null);
              const finalStatus = data.status || 'complete';
              const finalSources = data.sources || receivedSources;
              const timings = data.timings as SearchMetadata;

              if (data.conversationId && onSetCurrentConversationId) {
                onSetCurrentConversationId(data.conversationId);
              }

              onUpdateMessage((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        content: data.content || accumulatedContent,
                        status: finalStatus,
                        sources_json: finalSources,
                        search_metadata: timings,
                      }
                    : msg
                )
              );

              if (onConversationUpdated) {
                onConversationUpdated();
              }
            } else if (eventType === 'error') {
              setError(data.error || 'An error occurred during response generation');
              onUpdateMessage((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId ? { ...msg, status: 'error' } : msg
                )
              );
            }
          }
        }
      } catch (err: unknown) {
        const isAbort =
          (err as Error).name === 'AbortError' ||
          controller.signal.aborted ||
          (err as Error).message.includes('aborted');

        if (isAbort) {
          onUpdateMessage((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, status: 'interrupted' } : msg
            )
          );
        } else {
          setError((err as Error).message || 'Failed to communicate with chat service');
          onUpdateMessage((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, status: 'error' } : msg
            )
          );
        }
      } finally {
        setIsStreaming(false);
        setStatusMessage(null);
        abortControllerRef.current = null;
      }
    },
    [onConversationUpdated]
  );

  return {
    isStreaming,
    statusMessage,
    error,
    clearError: () => setError(null),
    sendQuery,
    stopStreaming,
  };
}
