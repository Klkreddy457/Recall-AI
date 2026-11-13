import { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Trash2,
  Sun,
  Moon,
  Clock,
  X,
} from 'lucide-react';
import type { Conversation } from '../types/index.js';

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onSearchChange: (search: string) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  isOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onSearchChange,
  theme,
  onToggleTheme,
  isOpen,
  onCloseMobile,
}: SidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = (val: string) => {
    setSearchTerm(val);
    onSearchChange(val);
  };

  // Group conversations by date (Today, Yesterday, Previous 7 Days, Older)
  const groupedConversations = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const groups: { [key: string]: Conversation[] } = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      Older: [],
    };

    for (const conv of conversations) {
      const convDate = new Date(conv.updated_at);
      if (convDate >= today) {
        groups['Today']!.push(conv);
      } else if (convDate >= yesterday) {
        groups['Yesterday']!.push(conv);
      } else if (convDate >= lastWeek) {
        groups['Previous 7 Days']!.push(conv);
      } else {
        groups['Older']!.push(conv);
      }
    }

    return groups;
  }, [conversations]);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden transition-opacity"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 flex flex-col justify-between border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-md transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header & New Chat button */}
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm tracking-wide shadow-sm shadow-blue-500/20">
                  R
                </div>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  Recall AI
                </span>
              </div>
              <button
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 md:hidden"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => {
                onNewChat();
                onCloseMobile();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-zinc-100 dark:text-zinc-900 font-medium text-sm transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>New Chat</span>
            </button>

            {/* Backend-powered Search */}
            <div className="relative mt-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
              <input
                type="text"
                placeholder="Search history..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Conversations History List */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
            {conversations.length === 0 ? (
              <div className="text-center py-8 text-zinc-400 dark:text-zinc-500 text-xs">
                <Clock className="w-6 h-6 mx-auto mb-2 opacity-40" />
                No conversations yet
              </div>
            ) : (
              Object.entries(groupedConversations).map(([groupTitle, convList]) => {
                if (convList.length === 0) return null;

                return (
                  <div key={groupTitle} className="space-y-1">
                    <h3 className="px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {groupTitle}
                    </h3>
                    <div className="space-y-0.5">
                      {convList.map((conv) => {
                        const isActive = conv.id === activeConversationId;
                        return (
                          <div
                            key={conv.id}
                            className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 font-medium'
                                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                            }`}
                            onClick={() => {
                              onSelectConversation(conv.id);
                              onCloseMobile();
                            }}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-zinc-400 dark:text-zinc-500" />
                              <span className="truncate">
                                {conv.title || 'New Conversation'}
                              </span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteConversation(conv.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-opacity"
                              title="Delete conversation"
                              aria-label="Delete conversation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer: Theme Toggle & Info */}
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <button
              onClick={onToggleTheme}
              className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-zinc-700" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
            <span className="text-[10px] text-zinc-400">Recall AI v1.0</span>
          </div>
        </div>
      </aside>
    </>
  );
}

