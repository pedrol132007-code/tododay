# Configurações — design

Data: 2026-09-23 · Branch: `feature/equipe-e-status` (mesma da aba Equipe)

## Objetivo

Uma aba **Configurações**, aberta por uma engrenagem no canto superior direito, com:

1. **Tema:** Claro / Escuro / Automático (segue o modo do Windows).
2. **Cor de destaque:** roxo (padrão), azul, verde, rosa, laranja.
3. **Densidade dos cards:** Normal / Compacto.
4. **Dados:** caminho da pasta de dados, "Fazer backup…" (escolher onde salvar),
   "Abrir pasta dos dados".
5. **Sobre:** versão do app.

Toda mudança aplica na hora; não há botão salvar.

## Fora de escopo

Restaurar backup, exportar CSV/JSON, atalhos configuráveis, idioma, fonte,
temas além de claro/escuro, cores de membro/etiqueta dependentes do tema.

## Persistência

`localStorage["tododay.settings"]` = JSON `{ theme, accent, compact }`.

- Não usa SQLite: o tema precisa estar aplicado antes da primeira pintura (SQLite é
  assíncrono → a janela piscaria no tema errado), e são preferências da instalação,
  não dados do usuário — por isso também não entram no backup.
- Tipos em `src/types/index.ts`:
  `ThemePreference = "light" | "dark" | "system"`,
  `AccentColor = "purple" | "blue" | "green" | "pink" | "orange"`,
  `Settings = { theme: ThemePreference; accent: AccentColor; compact: boolean }`.
- `src/lib/settings.ts` (puro, testado): `DEFAULT_SETTINGS` (`dark`, `purple`,
  `false` — o visual atual), `parseSettings(raw: string | null): Settings` — JSON
  inválido, campos ausentes ou valores fora do domínio caem campo a campo no padrão;
  `resolveTheme(pref, systemPrefersDark): "light" | "dark"`.
- Leitura/escrita do storage em `src/lib/settingsStorage.ts` (`loadSettings`,
  `saveSettings`), com `try/catch` — storage indisponível = padrões, sem quebrar.

## Tema e cores

- `tailwind.config.ts`: cada cor vira `var(--token)`:
  `bg-base`, `bg-surface`, `bg-elevated`, `text-primary`, `text-muted`, `border`,
  `accent`, `on-accent`, `accent-pink`, `accent-yellow`, `overlay`.
  Nenhum uso atual aplica opacidade (`/50`) sobre esses tokens, então `var()` puro basta.
- `accent-purple` é renomeado para `accent` em todo `src/` (troca mecânica).
  Textos sobre o destaque que hoje usam `text-bg-base` passam a `text-on-accent`.
- `bg-black/50` dos overlays (`CardDetailPanel`, `CommandPalette`) vira `bg-overlay`.
- `src/index.css` define as variáveis:
  - `:root, [data-theme="dark"]` — valores atuais (ex.: `--bg-base: #16121f`).
  - `[data-theme="light"]` — paleta clara (fundo `#f7f5fb`, superfície `#ffffff`,
    elevado `#efebf7`, texto `#1f1a2e`, muted `#6b6283`, borda `#ddd6ea`).
  - `[data-accent="<cor>"]` combinado com o tema: `--accent` e `--on-accent` por tema
    (tom mais claro no escuro, mais saturado/escuro no claro, `--on-accent` escolhido
    para contraste).
  - Cores de status como variáveis por tema: `--status-planned`,
    `--status-in-progress`, `--status-done`. `STATUS_COLORS` em `src/lib/status.ts`
    passa a guardar `var(--status-...)`.
- `index.html`: remove `class="dark"` fixo do `<html>`.
- `main.tsx`: antes do `render`, `loadSettings()` e aplica `data-theme`
  (resolvido) e `data-accent` no `document.documentElement`.

### Contexto React

`src/components/settings/SettingsProvider.tsx`: `SettingsProvider` + `useSettings()`
→ `{ settings, resolvedTheme, update(patch) }`. `update` salva no storage e reaplica
os atributos no `<html>`. Com `theme: "system"`, escuta
`matchMedia("(prefers-color-scheme: dark)")` e troca ao vivo.

## Compacto

`useSettings().settings.compact`:

- `Card`: `px-2 py-1 text-sm` em vez de `px-3 py-2`; linha de selos colada ao título.
- `List`: `gap-1.5` entre cards e `p-3` em vez de `p-4`.
- `StatusBadge`: só a bolinha, com `title` = rótulo do status.

## Backup e pasta de dados

- Novos plugins: `tauri-plugin-dialog` (Rust + `@tauri-apps/plugin-dialog`) e
  `tauri-plugin-opener` (Rust + `@tauri-apps/plugin-opener`), registrados em
  `main.rs`; permissões em `capabilities/default.json`: `dialog:allow-save`,
  `opener:allow-reveal-item-in-dir` e `opener:allow-open-path` restrito ao
  diretório de dados do app (`$APPDATA/**`).
- `src/db/backup.ts`: `backupDatabase(destPath)` → `VACUUM INTO $1`. Gera cópia
  consistente com o app aberto (WAL incluso). SQL fica em `src/db/`.
- `SettingsView`: "Fazer backup…" abre `save()` com nome sugerido
  `tododay-backup-AAAA-MM-DD-HHMM.db` e filtro `.db`; sucesso → "Backup salvo em
  <caminho>"; cancelado → nada; erro → mensagem. Se o destino já existir,
  o SQLite recusa (`output file already exists`) e a mensagem é
  "Esse arquivo já existe — escolha outro nome." (não se cria comando para apagar
  arquivos só para isso).
- Caminho da pasta: `appDataDir()` de `@tauri-apps/api/path`, mostrado em texto
  selecionável. "Abrir pasta dos dados" → `openPath(appDataDir)`.
- O arquivo copiado é o banco em uso (`kanban-dev.db` em dev, `kanban.db` em release).

## Tela

- `App.tsx`: `view` ganha `"settings"`. Engrenagem (SVG inline,
  `aria-label="Configurações"`) no canto superior direito, depois de "Arquivados";
  alterna settings ↔ board e fica destacada quando ativa. "Arquivados" some na aba
  Configurações (como na Equipe). Busca e troca de board voltam ao board.
- `src/components/settings/SettingsView.tsx`: "← Voltar" + "Configurações", seções
  **Aparência** (tema segmentado com "(agora: claro/escuro)" em Automático; 5
  bolinhas de destaque com anel na escolhida; densidade segmentada + prévia de um
  card de exemplo), **Dados** e **Sobre** ("Tododay v<versão>" via `getVersion()`,
  "Seus dados ficam só neste computador.").

## Erros

Storage indisponível → padrões. Falha de backup/abrir pasta → mensagem inline na
seção Dados; o app continua.

## Testes

- Unitários: `parseSettings` (null, JSON inválido, campos faltando, valores
  inválidos, válido), `resolveTheme` (3 × 2 combinações), nome sugerido do backup
  (`backupFileName(date)`, zero-padding).
- Manual em `tauri dev`: alternar os 3 temas e as 5 cores em todas as telas (board,
  detalhe, busca, arquivados, equipe, configurações) conferindo contraste; mudar o
  modo do Windows com Automático; compacto no board; reabrir o app e ver a
  preferência mantida sem piscar; backup para um arquivo novo e abrir no SQLite;
  backup sobre arquivo existente mostra a mensagem; abrir pasta dos dados.
