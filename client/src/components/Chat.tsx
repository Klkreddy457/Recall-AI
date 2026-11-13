import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import {
  Send,
  Square,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Menu,
  Bot,
  User,
  Globe,
  Clock,
} from 'lucide-react';
import type { Message } from '../types/index.js';
import { CitationCard } from './CitationCard.js';

interface ChatProps {
  messages: Message[];
  isStreaming: boolean;
  statusMessage: string | null;
  error: string | null;
  onClearError: () => void;
  onSendMessage: (query: string) => void;
  onStopStreaming: () => void;
  onOpenMobileMenu: () => void;
}

const SUGGESTED_PROMPTS = [
  'What did we discuss yesterday?',
  'What are the latest updates on quantum computing?',
  'Compare PostgreSQL FTS with vector databases',
  'What was the first topic we discussed?',
];

function formatLocalTimestamp(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function Chat({
  messages,
  isStreaming,
  statusMessage,
  error,
  onClearError,
  onSendMessage,
  onStopStreaming,
  onOpenMobileMenu,
}: ChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, statusMessage]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSendMessage(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const handleRetry = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      onClearError();
      onSendMessage(lastUserMsg.content);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-900 transition-colors overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobileMenu}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
              Recall AI
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-900/40">
              Hybrid Memory + Search
            </span>
          </div>
        </div>
      </header>

      {/* Messages Scroll View */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
        {messages.length === 0 ? (
          /* Welcome Screen */
          <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center px-4 py-12">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-500/25 mb-4">
              R
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
              Welcome to Recall AI
            </h2>
            <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mb-8 max-w-md leading-relaxed">
              Answers fast, verifies facts with live web search citations, and remembers what you asked and when.
            </p>

            {/* 4 Suggested Prompts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 w-full">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => onSendMessage(prompt)}
                  className="flex items-start gap-2.5 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-blue-500/40 transition-all text-left group"
                >
                  <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium leading-snug">
                    {prompt}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages List */
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 md:gap-4 ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%]`}>
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-blue-600 text-white rounded-tr-sm shadow-sm'
                          : 'bg-zinc-100 dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-100 rounded-tl-sm border border-zinc-200/50 dark:border-zinc-700/50'
                      }`}
                    >
                      {msg.content || (isStreaming && !isUser ? (
                        <span className="inline-flex items-center gap-1.5 text-zinc-400 italic">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
                          Thinking...
                        </span>
                      ) : null)}

                      {/* Interrupted Status Badge */}
                      {msg.status === 'interrupted' && (
                        <div className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Square className="w-3 h-3" />
                          <span>Generation stopped</span>
                        </div>
                      )}
                    </div>

                    {/* Sources Cards Horizontal Scroll */}
                    {msg.sources_json && msg.sources_json.length > 0 && (
                      <div className="mt-3 w-full">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
                          <Globe className="w-3.5 h-3.5 text-blue-500" />
                          <span>Verified Sources ({msg.sources_json.length})</span>
                        </div>
                        <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
                          {msg.sources_json.map((source) => (
                            <CitationCard key={source.id} source={source} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 px-1 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatLocalTimestamp(msg.created_at)}
                    </span>
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live Search Status Event */}
            {statusMessage && (
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/40 dark:border-blue-900/40 rounded-xl px-3 py-2 w-fit animate-pulse">
                <Globe className="w-3.5 h-3.5 animate-spin" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Error Notification Bar */}
            {error && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span>{error}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-1 font-medium hover:underline text-red-700 dark:text-red-300"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </button>
                  <button
                    onClick={onClearError}
                    className="p-1 hover:text-red-900 dark:hover:text-red-100"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Bottom Input Area */}
      <footer className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm flex-shrink-0">
        <div className="max-w-3xl mx-auto relative">
          <div className="flex items-end gap-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all shadow-sm">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything or recall past discussions (Shift+Enter for newline)..."
              className="flex-1 bg-transparent border-0 resize-none px-2 py-1 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none max-h-44"
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={onStopStreaming}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-xs transition-colors shadow-sm flex-shrink-0"
                title="Stop generation"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:hover:bg-blue-600 text-white transition-all shadow-sm flex-shrink-0"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

