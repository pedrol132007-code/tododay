# Fase 3 — Drag and Drop — Design

> Complementa `docs/superpowers/specs/2026-09-17-kanban-desktop-design.md` (identidade visual, schema, algoritmo de posições fracionárias já especificado ali). Este documento cobre só as decisões específicas da Fase 3.

## Escopo

- Reordenar cards dentro da mesma lista, arrastando.
- Mover cards entre listas, arrastando (muda `list_id`) — não existia na Fase 2.
- Reordenar colunas (listas) arrastando.
- Os botões de seta (↑/↓ nos cards, ←/→ nas colunas) da Fase 2 são **removidos** — o drag-and-drop os substitui. Acessibilidade via teclado é recuperada pelo `KeyboardSensor` do dnd-kit (ver "Interação"), não por manter os botões.

## Biblioteca

`@dnd-kit/core` + `@dnd-kit/sortable`. Escolhida por:
- Suporte nativo a múltiplos containers (o próprio exemplo oficial é um kanban), necessário pro requisito de mover cards entre listas.
- Mantida ativamente — diferente de `react-beautiful-dnd` (arquivada pela Atlassian, bugs conhecidos com React 18 Strict Mode).
- Sensor de teclado embutido, cobrindo a acessibilidade perdida com a remoção das setas.
- Alternativa descartada: HTML5 Drag and Drop nativo (zero dependência, mas exige implementar manualmente placeholder visual, drop entre containers e não tem suporte a teclado — mais código próprio sem ganho real aqui). `framer-motion`'s `Reorder` (já é dependência) foi descartado por não suportar arrastar entre containers diferentes.

## Camada de dados

**`src/lib/position.ts`** (novo, função pura, sem SQL):
- `positionBetween(prev: number | null, next: number | null): number` — média dos vizinhos; `prev + 1` se não há próximo; `next - 1` se não há anterior; `1` se a lista está vazia.
- `needsRebalance(prev: number, next: number): boolean` — verdadeiro se `next - prev` for menor que um limiar pequeno (`1e-7`), sinalizando que floats sucessivos colapsariam.
- `rebalance<T>(items: T[]): T[]` — recebe itens já ordenados por posição e devolve a mesma lista com `position` renumerada `1, 2, 3, ...`.

**`src/db/lists.ts`**: remove `moveList(id, direction)` (swap com vizinho). Adiciona `updateListPosition(id: number, position: number): Promise<void>` — um `UPDATE list SET position = $1 WHERE id = $2`.

**`src/db/cards.ts`**: remove `moveCard(id, direction)`. Adiciona:
- `updateCardPosition(id: number, position: number): Promise<void>` — reordena dentro da mesma lista.
- `moveCardToList(id: number, listId: number, position: number): Promise<void>` — muda `list_id` e `position` juntos, para mover entre listas.

A camada `db/*.ts` continua sem lógica — quem decide o valor de `position` (chamando `positionBetween`/`rebalance`) é o código de UI que já tem as listas/cards carregados via `useLists`/`useCards`.

## Arquitetura de drag-and-drop

- Um único `DndContext` envolve `BoardView`, com `PointerSensor` (`activationConstraint: { distance: 8 }` para não disparar em cliques simples) e `KeyboardSensor`.
- Duas camadas de `SortableContext`: uma horizontal para o conjunto de listas (reordenar colunas), e uma vertical dentro de cada `List` para seus cards. Cada `List` é também um container "droppable" — inclusive quando vazia, para aceitar o primeiro card arrastado para ela.
- **Estado espelho local em `BoardView`**: uma cópia local (useState) das listas+cards, sincronizada a partir das queries via `useEffect`. Durante o arraste (`onDragOver`), só esse estado local muda, dando feedback visual imediato de um card "pulando" para outra lista, sem esperar round-trip do SQLite. Nenhuma mutação roda ainda nesse momento.
- No soltar (`onDragEnd`): calcula a posição final com `positionBetween` usando os vizinhos do container de destino (excluindo o item arrastado) e chama `updateCardPosition` (mesma lista) ou `moveCardToList` (lista diferente) — ou `updateListPosition` para colunas. Invalida as query keys envolvidas (`["cards", listId]` da origem e do destino se forem diferentes; `["lists", boardId]` para colunas).
- `DragOverlay` do dnd-kit renderiza uma cópia flutuando do item seguindo o cursor; o slot original fica com destaque sutil (placeholder). O fade/slide do `framer-motion` continua só para entrada de itens novos (criação), não para o movimento do drag em si.

## Interação

- Handle de arraste dedicado: ícone `⠿` à esquerda do título em `Card` e no cabeçalho de `List`, separado do texto editável (`InlineEditableText`, duplo-clique) e do botão `×` — evita disputa de gesto entre arrastar, editar e excluir/arquivar.
- Teclado: focar o handle e usar as setas move o item (comportamento padrão do `KeyboardSensor`); Espaço/Enter pega e solta.

## Erros e rebalanceamento

- Se uma mutação de posição falhar, invalidamos as queries envolvidas para forçar um refetch — o estado espelho local se realinha com a verdade do banco automaticamente, sem lógica de rollback manual.
- Quando `needsRebalance` acusa gap pequeno demais entre os vizinhos calculados, primeiro persistimos as posições renumeradas de todos os irmãos daquele container (uma sequência de `UPDATE`s, sem transação SQL explícita — single-user, escritas rápidas), depois persistimos a posição final já calculada sobre os números limpos.

## Testes

- `src/lib/position.ts` ganha testes unitários com **Vitest** (nova dependência de dev, escopo restrito a este módulo puro): casos de meio de lista, pontas (sem anterior/sem próximo), lista vazia, e o gatilho de `needsRebalance`/`rebalance`.
- O resto (integração com dnd-kit, SQLite real) continua verificação manual, como nas Fases 1 e 2 — checklist no plano de implementação.
