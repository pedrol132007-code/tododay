import { Suspense, lazy, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useBoards } from "./hooks/useBoards";
import { useMyTeams } from "./hooks/useTeams";
import { useRealtimeSync } from "./hooks/useRealtimeSync";
import { ArchiveView } from "./components/archive/ArchiveView";
import { BoardSwitcher } from "./components/board/BoardSwitcher";
import { BoardView } from "./components/board/BoardView";
import { CommandPalette } from "./components/search/CommandPalette";
import { NoTeamScreen } from "./components/team/NoTeamScreen";
import { TeamSwitcher } from "./components/team/TeamSwitcher";
import { TeamView } from "./components/team/TeamView";
import { MyTasksView } from "./components/my-tasks/MyTasksView";
import { WelcomeDialog, markWelcomed, shouldWelcome } from "./components/ui/WelcomeDialog";
import { useProfile } from "./hooks/useAuth";
import { InviteScreen } from "./components/team/InviteScreen";
import { AppMenu, type AppView } from "./components/ui/AppMenu";
import { BrandMark } from "./components/ui/BrandMark";
import { ViewTabs } from "./components/ui/ViewTabs";
import { SettingsView } from "./components/settings/SettingsView";
import { clearPendingInvite, getPendingInvite } from "./lib/pendingInvite";
import { CurrentTeamContext } from "./hooks/useCurrentTeam";
import { dropBoardLinkOrigin, leaveBoardLink, openBoardLink } from "./hooks/useBoardFilters";
import type { DashboardData, MyTeam, SearchResult } from "./types";
import { IconColumns } from "./components/ui/icons";
import { EmptyState } from "./components/ui/EmptyState";
import { DashboardErrorBoundary } from "./components/dashboard/DashboardErrorBoundary";
import { isProduction } from "./db/supabase";

// Carregado só ao abrir o Dashboard: os gráficos não pesam para quem usa só o board.
const DashboardView = lazy(() => import("./components/dashboard/DashboardView").then((m) => ({ default: m.DashboardView })));
// A demonstração também: o gerador e o board fictício só descem quando alguém pede.
const DemoBoardView = lazy(() => import("./components/board/DemoBoardView").then((m) => ({ default: m.DemoBoardView })));

const ACTIVE_TEAM_KEY = "tododay.activeTeamId";

function readStoredTeamId(): number | null {
  try {
    const value = localStorage.getItem(ACTIVE_TEAM_KEY);
    return value ? Number(value) : null;
  } catch {
    return null;
  }
}

function storeTeamId(teamId: number) {
  try {
    localStorage.setItem(ACTIVE_TEAM_KEY, String(teamId));
  } catch {
    // Só uma conveniência: sem storage, o app abre na primeira equipe.
  }
}

export default function App({ userId }: { userId: string }) {
  const { data: teams, isError, refetch } = useMyTeams(userId);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(readStoredTeamId);
  const [inviteToken, setInviteToken] = useState(getPendingInvite);

  function selectTeam(teamId: number) {
    setSelectedTeamId(teamId);
    storeTeamId(teamId);
  }

  if (inviteToken) {
    return (
      <InviteScreen
        token={inviteToken}
        onDone={(teamId) => {
          clearPendingInvite();
          setInviteToken(null);
          if (teamId !== null) selectTeam(teamId);
        }}
      />
    );
  }
  if (isError) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bg-base text-text-muted">
        Não foi possível carregar suas equipes.
        <button type="button" onClick={() => refetch()} className="text-primary hover:underline">
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!teams) {
    return <div className="h-screen w-screen bg-bg-base" />;
  }
  if (teams.length === 0) {
    return <NoTeamScreen userId={userId} onCreated={selectTeam} />;
  }

  const activeTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0];
  // key: trocar de equipe zera board ativo, arquivo e navegação pendente da busca.
  return <TeamWorkspace key={activeTeam.id} userId={userId} teams={teams} team={activeTeam} onSelectTeam={selectTeam} />;
}

interface TeamWorkspaceProps {
  userId: string;
  teams: MyTeam[];
  team: MyTeam;
  onSelectTeam: (teamId: number) => void;
}

function TeamWorkspace({ userId, teams, team, onSelectTeam }: TeamWorkspaceProps) {
  const { data: boards } = useBoards(team.id);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [view, setView] = useState<AppView>("board");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { data: profile } = useProfile(userId);
  const [welcome, setWelcome] = useState(shouldWelcome);
  const [pendingCardId, setPendingCardId] = useState<number | null>(null);
  const [pendingListId, setPendingListId] = useState<number | null>(null);
  // Demonstração em memória: enquanto existe, o Board e o Dashboard mostram as mesmas tarefas fictícias.
  // Só em desenvolvimento: em produção não há como gerá-la.
  const [demo, setDemo] = useState<DashboardData | null>(null);
  const newDemo = isProduction
    ? undefined
    : () => import("./lib/demoData").then((m) => setDemo(m.generateDemo(Math.floor(Math.random() * 2 ** 31))));

  // Sem board escolhido, ou o escolhido foi excluído (aqui ou por outra pessoa): abre o primeiro.
  useEffect(() => {
    if (boards && !boards.some((board) => board.id === activeBoardId)) {
      setActiveBoardId(boards[0]?.id ?? null);
    }
  }, [boards, activeBoardId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleNavigate(result: SearchResult) {
    setActiveBoardId(result.board_id);
    setDemo(null);
    setView("board");
    setPendingCardId(result.type === "card" ? result.id : null);
    setPendingListId(result.type === "list" ? result.id : null);
    setPaletteOpen(false);
  }

  // A manual board switch means any search-navigation target still pending is stale — if the
  // target board's lists hadn't finished loading yet, BoardView never got the chance to consume
  // it, and without this it would sit in state and could fire a highlight later, on whatever
  // future board happens to contain a list with that same id.
  // Escolher um board no topo sai do Dashboard, da Equipe e das Configurações; nos Arquivados fica,
  // mostrando os do board escolhido. Também sai da demonstração: o board escolhido é real.
  function handleSelectBoard(id: number) {
    setActiveBoardId(id);
    setDemo(null);
    setView((v) => (v === "archive" ? v : "board"));
    setPendingCardId(null);
    setPendingListId(null);
  }

  // Trocar de aba à mão: o "Voltar ao dashboard" de um link anterior deixa de valer.
  function navigate(next: AppView) {
    dropBoardLinkOrigin();
    setView(next);
  }

  function closeWelcome(next?: AppView) {
    markWelcomed();
    setWelcome(false);
    if (next) navigate(next);
  }

  const activeBoard = boards?.find((board) => board.id === activeBoardId);
  useRealtimeSync(team.id, activeBoard?.id ?? null);

  return (
    <CurrentTeamContext.Provider value={{ teamId: team.id, canEdit: team.role !== "viewer", isAdmin: team.role === "admin" }}>
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <div className="h-1 shrink-0 bg-brand-gradient" />
      <div className="flex items-center justify-between border-b border-border bg-bg-surface">
        <div className="ml-4">
          <BrandMark />
        </div>
        <TeamSwitcher userId={userId} teams={teams} activeTeamId={team.id} onSelect={onSelectTeam} />
        <div className="h-5 w-px shrink-0 bg-border" />
        <BoardSwitcher teamId={team.id} activeBoardId={activeBoardId} onSelect={handleSelectBoard} onOpenArchive={() => setView("archive")} />
        <ViewTabs view={view} onNavigate={navigate} />
        <AppMenu userId={userId} view={view} onNavigate={navigate} />
      </div>
      {view === "dashboard" ? (
        <DashboardErrorBoundary>
          <Suspense fallback={null}>
            <DashboardView
              teamName={team.name}
              data={demo}
              onGenerate={newDemo}
              onExit={() => setDemo(null)}
              onOpenBoard={(link) => {
                openBoardLink(link);
                setView("board");
              }}
            />
          </Suspense>
        </DashboardErrorBoundary>
      ) : view === "my-tasks" ? (
        <MyTasksView
          teamId={team.id}
          userId={userId}
          onBack={() => setView("board")}
          onOpenCard={(task) => handleNavigate({ type: "card", id: task.id, title: task.title, board_id: task.board_id, board_name: task.board.name })}
        />
      ) : view === "settings" ? (
        <SettingsView userId={userId} onBack={() => setView("board")} />
      ) : view === "team" ? (
        <TeamView userId={userId} team={team} onBack={() => setView("board")} />
      ) : demo && newDemo && view === "board" ? (
        <Suspense fallback={null}>
          <DemoBoardView
            data={demo}
            onRegenerate={newDemo}
            onExit={() => setDemo(null)}
            onBackToDashboard={() => {
              leaveBoardLink();
              setView("dashboard");
            }}
          />
        </Suspense>
      ) : activeBoard ? (
        view === "archive" ? (
          <ArchiveView boardId={activeBoard.id} boardName={activeBoard.name} onBack={() => setView("board")} />
        ) : (
          <BoardView
            boardId={activeBoard.id}
            boardName={activeBoard.name}
            initialSelectedCardId={pendingCardId}
            onInitialCardHandled={() => setPendingCardId(null)}
            initialHighlightListId={pendingListId}
            onInitialListHandled={() => setPendingListId(null)}
          />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<IconColumns size={22} />}
            title="Nenhum board ainda"
            description="Crie o primeiro board em “Novo board”, no topo da tela."
          />
        </div>
      )}
      {welcome && profile && (
        <WelcomeDialog
          name={profile.display_name}
          isAdmin={team.role === "admin"}
          onClose={() => closeWelcome()}
          onOpenMyTasks={() => closeWelcome("my-tasks")}
        />
      )}
      <AnimatePresence>
        {paletteOpen && <CommandPalette teamId={team.id} onNavigate={handleNavigate} onClose={() => setPaletteOpen(false)} />}
      </AnimatePresence>
    </div>
    </CurrentTeamContext.Provider>
  );
}
