import { useState } from "react";
import { useCreateList, useLists } from "../../hooks/useLists";
import { List } from "./List";

interface BoardViewProps {
  boardId: number;
  boardName: string;
}

export function BoardView({ boardId, boardName }: BoardViewProps) {
  const { data: lists, isLoading, error } = useLists(boardId);
  const createList = useCreateList(boardId);
  const [newListName, setNewListName] = useState("");

  function handleAddList() {
    const name = newListName.trim();
    if (!name) return;
    createList.mutate(name);
    setNewListName("");
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        Carregando...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-accent-pink">
        Erro ao carregar colunas: {(error as Error).message}
      </div>
    );
  }

  const listData = lists ?? [];

  return (
    <div className="flex h-full flex-col p-6">
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">{boardName}</h1>
      <div className="flex flex-1 items-start gap-4 overflow-x-auto">
        {listData.length === 0 ? (
          <div className="rounded-2xl border border-border bg-bg-surface p-6 text-text-muted">
            Nenhuma lista ainda.
          </div>
        ) : (
          listData.map((list, index) => (
            <List
              key={list.id}
              list={list}
              boardId={boardId}
              isFirst={index === 0}
              isLast={index === listData.length - 1}
            />
          ))
        )}
        <div className="flex w-72 shrink-0 flex-col gap-2 rounded-2xl border border-dashed border-border p-4">
          <input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddList()}
            placeholder="Nova coluna..."
            className="rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-accent-purple"
          />
          <button
            type="button"
            onClick={handleAddList}
            className="rounded-lg bg-accent-purple px-3 py-1 text-sm font-medium text-bg-base hover:opacity-90"
          >
            + Adicionar coluna
          </button>
        </div>
      </div>
    </div>
  );
}
