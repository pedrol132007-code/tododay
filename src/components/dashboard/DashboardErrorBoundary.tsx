import { Component, type ReactNode } from "react";
import { EmptyState } from "../ui/EmptyState";
import { IconColumns } from "../ui/icons";

/**
 * Segura falhas ao abrir o Dashboard (tipicamente o arquivo do código, carregado sob demanda,
 * que sumiu depois de um deploy) para não derrubar o app inteiro. Recarregar busca a versão nova.
 */
export class DashboardErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-1 items-start justify-center p-6">
        <EmptyState
          icon={<IconColumns size={22} />}
          title="Não foi possível abrir o Dashboard."
          description="Pode ser uma versão nova do app publicada agora há pouco. Recarregue a página para tentar de novo."
          action={
            <button type="button" onClick={() => location.reload()} className="btn-primary px-4 py-2">
              Recarregar
            </button>
          }
        />
      </div>
    );
  }
}
