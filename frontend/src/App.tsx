import { useEffect } from 'react';

import { Layout } from './components/Layout';
import { useChaseStore } from './store/useChaseStore';
import { AnalystHandoffView } from './views/AnalystHandoffView';
import { CaseTracker } from './views/CaseTracker';
import { CriticAgentView } from './views/CriticAgentView';
import { DraftingAgentView } from './views/DraftingAgentView';
import { ExecutiveDashboard } from './views/ExecutiveDashboard';
import { HitlReviewView } from './views/HitlReviewView';
import { OrchestratorInbox } from './views/OrchestratorInbox';

export function App() {
  const { activeView, fetchCases, fetchDashboardMetrics, fetchLlmStatus, error } = useChaseStore();

  useEffect(() => {
    void fetchCases();
    void fetchDashboardMetrics();
    void fetchLlmStatus();
  }, [fetchCases, fetchDashboardMetrics, fetchLlmStatus]);

  const renderView = () => {
    switch (activeView) {
      case 'chase-queue':
      case 'orchestrator-inbox':
        return <OrchestratorInbox />;
      case 'case-detail':
      case 'case-tracker':
        return <CaseTracker />;
      case 'reminder-composer':
      case 'ai-drafting-agent':
        return <DraftingAgentView />;
      case 'stage-analytics':
      case 'executive-success-dashboard':
        return <ExecutiveDashboard />;
      case 'analyst-handoff':
        return <AnalystHandoffView />;
      case 'critic-compliance-qa':
        return <CriticAgentView />;
      case 'human-in-the-loop-review':
        return <HitlReviewView />;
      default:
        return <OrchestratorInbox />;
    }
  };

  return (
    <Layout>
      {error && (
        <div className="mb-space-md p-space-md rounded bg-error-container/40 border border-error/30 text-error font-body-sm text-body-sm">
          Backend Telemetry Notice: {error}
        </div>
      )}
      {renderView()}
    </Layout>
  );
}

export default App;
