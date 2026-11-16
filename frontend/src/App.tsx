import { useEffect } from 'react';

import { Layout } from './components/Layout';
import { Empty } from './components/ui';
import { useChaseStore } from './store/useChaseStore';
import type { ViewId } from './types/chasezero';
import { canView, resolveLanding } from './utils/access';
import { AgentWorkbench } from './views/AgentWorkbench';
import { AiCostView } from './views/AiCostView';
import { AnalystHandoffView } from './views/AnalystHandoffView';
import { AuditLogView } from './views/AuditLogView';
import { CaseTracker } from './views/CaseTracker';
import { DraftingAgentView } from './views/DraftingAgentView';
import { ExecutiveDashboard } from './views/ExecutiveDashboard';
import { LoginView } from './views/LoginView';
import { MeasureView } from './views/MeasureView';
import { OrchestratorInbox } from './views/OrchestratorInbox';
import { TraceView } from './views/TraceView';

const VIEWS: Record<ViewId, () => JSX.Element> = {
  'chase-queue': () => <OrchestratorInbox />,
  'case-detail': () => <CaseTracker />,
  'reminder-composer': () => <DraftingAgentView />,
  'analyst-handoff': () => <AnalystHandoffView />,
  'stage-analytics': () => <ExecutiveDashboard />,
  measure: () => <MeasureView />,
  'ai-cost': () => <AiCostView />,
  'agent-workbench': () => <AgentWorkbench />,
  'audit-log': () => <AuditLogView />,
  traces: () => <TraceView />,
};

export function App() {
  const { me, authChecked, boot, activeView, error, setError, notice, setNotice } = useChaseStore();

  useEffect(() => {
    void boot();
  }, [boot]);

  if (!authChecked) return <Empty>Loading…</Empty>;
  if (!me) return <LoginView />;

  const view: ViewId = canView(me, activeView) ? activeView : (resolveLanding(me) ?? 'chase-queue');
  const render = canView(me, view) ? VIEWS[view] : () => <Empty>Your role has no screens assigned.</Empty>;

  return (
    <Layout>
      {error && (
        <div
          role="alert"
          data-testid="error-banner"
          className="mb-space-md p-space-md rounded bg-error-container/50 border border-error/30 text-on-error-container font-body-sm text-body-sm flex justify-between gap-space-md"
        >
          <span>{error}</span>
          <button type="button" className="cursor-pointer" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
      {notice && (
        <div className="mb-space-md p-space-md rounded bg-secondary-container border border-border-hairline font-body-sm text-body-sm flex justify-between gap-space-md">
          <span>{notice}</span>
          <button type="button" className="cursor-pointer" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}
      {render()}
    </Layout>
  );
}

export default App;
