import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { Chat } from './components/Chat.js';
import {
  fetchConversations,
  fetchMessages,
  deleteConversation,
} from './api/client.js';
import { useChatStream } from './hooks/useChatStream.js';
import type { Conversation, Message } from './types/index.js';

const ACTIVE_CONV_KEY = 'recall_active_conversation_id';
const THEME_KEY = 'recall_theme';

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
    const initialTheme = savedTheme || 'dark';
    setTheme(initialTheme);
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Load conversations list
  const loadConversations = useCallback(async (searchQuery?: string) => {
    try {
      const list = await fetchConversations(searchQuery);
      setConversations(list);
      return list;
    } catch (err) {
      console.error('Error loading conversations:', err);
      return [];
    }
  }, []);

  // Initialize on mount: load conversations & restore active conversation if saved
  useEffect(() => {
    loadConversations().then((list) => {
      const savedConvId = localStorage.getItem(ACTIVE_CONV_KEY);
      if (savedConvId && list.some((c) => c.id === savedConvId)) {
        setActiveConversationId(savedConvId);
        fetchMessages(savedConvId).then(setMessages).catch(console.error);
      }
    });
  }, [loadConversations]);

  // Handle selecting conversation from sidebar
  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);
    localStorage.setItem(ACTIVE_CONV_KEY, id);
    try {
      const msgs = await fetchMessages(id);
      setMessages(msgs);
    } catch (err) {
      console.error('Failed to load conversation messages:', err);
    }
  };

  // Handle New Chat
  const handleNewChat = () => {
    setActiveConversationId(null);
    localStorage.removeItem(ACTIVE_CONV_KEY);
    setMessages([]);
  };

  // Handle Deleting Conversation
  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Setup Chat Streaming Hook
  const {
    isStreaming,
    statusMessage,
    error,
    clearError,
    sendQuery,
    stopStreaming,
  } = useChatStream({
    onConversationUpdated: () => {
      loadConversations().then((updatedList) => {
        // If we didn't have an active conversation, pick the latest one
        if (!activeConversationId && updatedList.length > 0) {
          const newest = updatedList[0];
          if (newest) {
            setActiveConversationId(newest.id);
            localStorage.setItem(ACTIVE_CONV_KEY, newest.id);
          }
        }
      });
    },
  });

  const handleSendMessage = (query: string) => {
    sendQuery(
      query,
      activeConversationId || undefined,
      setMessages,
      (newId: string) => {
        setActiveConversationId(newId);
        localStorage.setItem(ACTIVE_CONV_KEY, newId);
      }
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onSearchChange={(search) => loadConversations(search)}
        theme={theme}
        onToggleTheme={toggleTheme}
        isOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Chat
          messages={messages}
          isStreaming={isStreaming}
          statusMessage={statusMessage}
          error={error}
          onClearError={clearError}
          onSendMessage={handleSendMessage}
          onStopStreaming={stopStreaming}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />
      </main>
    </div>
  );
}
