import { ExternalLink, Calendar } from 'lucide-react';
import type { SourceCard } from '../types/index.js';

interface CitationCardProps {
  source: SourceCard;
}

export function CitationCard({ source }: CitationCardProps) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 hover:border-blue-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-all text-xs w-64 flex-shrink-0 shadow-sm"
    >
      <div>
        <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1.5 font-medium">
          <span className="flex items-center gap-1.5 truncate">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
              {source.id}
            </span>
            <span className="truncate">{source.domain}</span>
          </span>
          <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 flex-shrink-0" />
        </div>
        <h4 className="font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2 mb-1.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {source.title}
        </h4>
        <p className="text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
          {source.snippet}
        </p>
      </div>

      {source.date && (
        <div className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
          <Calendar className="w-3 h-3" />
          <span>{source.date}</span>
        </div>
      )}
    </a>
  );
}

