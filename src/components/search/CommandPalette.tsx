import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSearch } from "../../hooks/useSearch";
import type { SearchResult } from "../../types";

interface CommandPaletteProps {
  onNavigate: (result: SearchResult) => void;
  onClose: () => void;
}

export function CommandPalette({ onNavigate, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const { data: results } = useSearch(query);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-32">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15 }}
        className="relative flex w-full max-w-lg flex-col gap-2 rounded-2xl border border-border bg-bg-surface p-4"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results && results.length > 0) {
              onNavigate(results[0]);
            }
          }}
          placeholder="Buscar cards e colunas em todos os boards..."
          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-text-primary outline-none focus:border-accent-purple"
        />
        {results && results.length > 0 && (
          <div className="flex flex-col gap-1">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => onNavigate(result)}
                className="flex flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-bg-elevated"
              >
                <span className="text-text-primary">{result.title}</span>
                <span className="text-xs text-text-muted">
                  {result.type === "card" ? "Card" : "Coluna"} · {result.board_name}
                </span>
              </button>
            ))}
          </div>
        )}
        {query.trim() && results && results.length === 0 && (
          <div className="px-3 py-2 text-sm text-text-muted">Nenhum resultado encontrado.</div>
        )}
      </motion.div>
    </div>
  );
}
