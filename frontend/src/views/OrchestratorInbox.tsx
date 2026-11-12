import React, { useState } from 'react';
import { useChaseStore } from '../store/useChaseStore';

export const OrchestratorInbox: React.FC = () => {
  const {
    summary,
    filterTab,
    setFilterTab,
    selectCase,
    startLangGraphWorkflow,
    searchQuery,
    setSearchQuery,
  } = useChaseStore();

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [agingFilter, setAgingFilter] = useState<string>('all');

  const allCases = summary?.cases ?? [];

  // Filter cases based on search and filters
  const filteredCases = allCases.filter((c) => {
    if (stageFilter !== 'all') {
      if (stageFilter === 'missing_docs' && c.status !== 'Missing_Docs') return false;
      if (stageFilter === 'draft_ready' && c.status !== 'Draft_Ready') return false;
      if (stageFilter === 'completed' && c.status !== 'Completed') return false;
    }
    if (agingFilter !== 'all') {
      if (agingFilter === 'gt21' && c.days_open <= 21) return false;
      if (agingFilter === '14-21' && (c.days_open < 14 || c.days_open > 21)) return false;
      if (agingFilter === 'lt7' && c.days_open >= 7) return false;
    }
    return true;
  });

  const totalCases = summary?.total_active_cases ?? allCases.length;
  const overdueCount = summary?.sla_breached_count ?? allCases.filter((c) => c.sla_breached).length;
  const dueTodayCount = summary?.pending_rm_action_count ?? 3;
  const avgDaysInChase = summary?.avg_chase_latency_days ?? 17.4;
  const unreviewedDrafts = summary?.pending_rm_action_count ?? 3;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredCases.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleRow = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBatchChase = () => {
    const targetCaseId = selectedIds[0] ?? allCases.find((c) => c.sla_breached)?.id ?? allCases[0]?.id;
    if (targetCaseId) {
      startLangGraphWorkflow(targetCaseId, { navigateToDrafting: true });
    }
  };

  const handleExportCSV = () => {
    const headers = ['Case ID', 'Client Name', 'LEI', 'Entity Type', 'Jurisdiction', 'Assigned RM', 'Days Open', 'Status', 'SLA Breached'];
    const rows = filteredCases.map((c) => [
      c.case_code,
      `"${c.client_name}"`,
      c.lei,
      `"${c.entity_type}"`,
      `"${c.jurisdiction}"`,
      `"${c.assigned_rm}"`,
      c.days_open,
      c.status,
      c.sla_breached ? 'YES' : 'NO',
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `northgate_chase_queue_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col w-full">
      {/* Operational Context Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md mb-space-lg">
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs">
            <span className="font-data-mono-sm text-data-mono-sm uppercase text-on-surface-variant tracking-wider">
              Desk: Institutional Corporate Onboarding
            </span>
            <span className="inline-block w-1 h-1 rounded-full bg-outline-variant" />
            <span className="font-data-mono-sm text-data-mono-sm text-on-secondary-container">
              Cycle Window: Q1 2026 Audit Run
            </span>
          </div>
          <div className="flex items-baseline gap-space-sm mt-space-2xs">
            <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
              Active KYC Chase Workbench
            </h2>
            <span className="font-label-sm text-label-sm uppercase bg-surface-container text-on-surface px-space-xs py-space-2xs rounded">
              Live Telemetry
            </span>
          </div>
        </div>

        {/* Quick Ops Actions */}
        <div className="flex items-center gap-space-xs self-start lg:self-auto flex-wrap">
          <button
            type="button"
            className="px-space-md py-space-xs rounded bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-space-xs transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">tune</span>
            Density: Dense (40px)
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-space-md py-space-xs rounded bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-space-xs transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">history</span>
            Audit Log
          </button>
          <button
            type="button"
            onClick={handleBatchChase}
            className="px-space-md py-space-xs rounded bg-primary-container text-white hover:bg-primary font-label-md text-label-md flex items-center gap-space-xs shadow-sm transition-colors cursor-pointer font-semibold"
          >
            <span className="material-symbols-outlined text-[16px]">outgoing_mail</span>
            Run Autonomous Chase
          </button>
        </div>
      </div>

      {/* Operational Summary Metric Strip (5 cards) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-space-md mb-space-lg">
        {/* Card 1: Active Cases */}
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-border-hairline">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              Active Cases in Chase
            </span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
              sync_saved_locally
            </span>
          </div>
          <div className="my-space-xs flex items-baseline gap-space-xs">
            <span className="font-headline-lg text-headline-lg font-bold text-on-surface">
              {totalCases}
            </span>
            <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
              entities
            </span>
          </div>
          <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
            <span>400 new corporate / mo</span>
            <span className="font-data-mono-sm text-data-mono-sm text-on-secondary-container">
              98.2% S&P rated
            </span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-[3px] bg-secondary-container" />
        </div>

        {/* Card 2: Overdue Cases */}
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-border-hairline">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase text-error font-semibold">
              Cases Overdue for Chase
            </span>
            <span className="material-symbols-outlined text-[18px] text-error">error</span>
          </div>
          <div className="my-space-xs flex items-baseline gap-space-xs">
            <span className="font-headline-lg text-headline-lg font-bold text-error">
              {overdueCount}
            </span>
            <span className="font-label-sm text-label-sm font-semibold text-error bg-error-container/50 px-space-xs py-space-2xs rounded">
              +4 vs yesterday
            </span>
          </div>
          <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
            <span>SLA breach risk: High</span>
            <span className="font-data-mono-sm text-data-mono-sm text-error">
              {Math.round((overdueCount / (totalCases || 1)) * 100)}% portfolio
            </span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-[3px] bg-error" />
        </div>

        {/* Card 3: Due Today */}
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-border-hairline">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase text-on-surface">
              Cases Due Today
            </span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
              schedule
            </span>
          </div>
          <div className="my-space-xs flex items-baseline gap-space-xs">
            <span className="font-headline-lg text-headline-lg font-bold text-on-surface">
              {dueTodayCount}
            </span>
            <span className="font-data-mono-sm text-data-mono-sm text-on-secondary-container">
              reminders slated
            </span>
          </div>
          <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
            <span>Batch runs: 14:00 GMT</span>
            <span className="font-label-sm text-label-sm text-on-secondary-container bg-secondary-fixed/50 px-space-xs py-space-2xs rounded">
              Ready
            </span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-[3px] bg-outline-variant" />
        </div>

        {/* Card 4: Median Days in Chase */}
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-border-hairline">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              Median Days in Chase
            </span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
              timelapse
            </span>
          </div>
          <div className="my-space-xs flex items-baseline gap-space-xs">
            <span className="font-headline-lg text-headline-lg font-bold text-on-surface">
              {avgDaysInChase}
            </span>
            <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
              Days
            </span>
            <span className="font-data-mono-sm text-data-mono-sm text-error ml-space-2xs">
              (+3.4d vs KPI)
            </span>
          </div>
          <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
            <span>Target: 14.0d</span>
            <div className="w-16 h-2 bg-surface-container-high rounded overflow-hidden">
              <div className="h-full bg-error" style={{ width: '80%' }} />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-[3px] bg-outline-variant" />
        </div>

        {/* Card 5: Unreviewed Draft Reminders */}
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-border-hairline">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              Unreviewed Draft Reminders
            </span>
            <span className="material-symbols-outlined text-[18px] text-on-tertiary-container">
              rate_review
            </span>
          </div>
          <div className="my-space-xs flex items-baseline gap-space-xs">
            <span className="font-headline-lg text-headline-lg font-bold text-on-surface">
              {unreviewedDrafts}
            </span>
            <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
              drafts pending
            </span>
          </div>
          <div className="flex items-center justify-between font-body-sm text-body-sm">
            <span className="text-on-surface-variant">Requires RM Sign-off</span>
            <span className="font-label-sm text-label-sm text-on-tertiary-container bg-surface-container px-space-xs py-space-2xs rounded">
              High Priority
            </span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-[3px] bg-on-tertiary-container" />
        </div>
      </section>

      {/* Filter & Action Command Strip */}
      <section className="bg-surface-container-lowest rounded shadow-sm p-space-md mb-space-md flex flex-col gap-space-md border border-border-hairline">
        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex flex-wrap items-center bg-surface-container-low p-space-2xs rounded gap-space-2xs">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-space-md py-space-xs rounded font-label-md text-label-md flex items-center gap-space-xs cursor-pointer transition-colors ${
                filterTab === 'all'
                  ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <span>All Open Cases</span>
              <span className="font-data-mono-sm text-data-mono-sm bg-surface-container px-space-xs rounded">
                {totalCases}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('breached')}
              className={`px-space-md py-space-xs rounded font-label-md text-label-md flex items-center gap-space-xs cursor-pointer transition-colors ${
                filterTab === 'breached'
                  ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <span>Overdue Items</span>
              <span className="font-data-mono-sm text-data-mono-sm bg-error-container text-on-error-container px-space-xs rounded font-bold">
                {overdueCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('draft_ready')}
              className={`px-space-md py-space-xs rounded font-label-md text-label-md flex items-center gap-space-xs cursor-pointer transition-colors ${
                filterTab === 'draft_ready'
                  ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <span>Due Today / Ready</span>
              <span className="font-data-mono-sm text-data-mono-sm bg-secondary-container text-on-secondary-container px-space-xs rounded">
                {dueTodayCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('completed')}
              className={`px-space-md py-space-xs rounded font-label-md text-label-md flex items-center gap-space-xs cursor-pointer transition-colors ${
                filterTab === 'completed'
                  ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <span>Completed Files</span>
              <span className="font-data-mono-sm text-data-mono-sm bg-surface-container px-space-xs rounded">
                {summary?.completed_count ?? 12}
              </span>
            </button>
          </div>

          {/* Action Buttons Right */}
          <div className="flex items-center gap-space-xs">
            <button
              type="button"
              onClick={handleBatchChase}
              disabled={selectedIds.length === 0}
              className={`px-space-md py-space-xs rounded font-label-md text-label-md flex items-center gap-space-xs transition-all ${
                selectedIds.length > 0
                  ? 'bg-primary-container text-white cursor-pointer shadow-sm'
                  : 'bg-surface-container text-outline cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">forward_to_inbox</span>
              <span>Batch Chase Action</span>
              {selectedIds.length > 0 && (
                <span className="font-data-mono-sm text-data-mono-sm bg-white text-primary-container px-space-xs rounded font-bold">
                  {selectedIds.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-space-md py-space-xs rounded bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-space-xs transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">download</span>
              Export CSV
            </button>
          </div>
        </div>

        {/* Dropdowns + Filter Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm pt-space-xs">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <span className="material-symbols-outlined absolute left-space-sm top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by client name, NG case ID, or LEI..."
              className="w-full bg-surface-container-low text-on-surface font-body-sm text-body-sm pl-space-2xl pr-space-md py-space-xs rounded focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-on-surface-variant border border-outline-variant/30"
            />
          </div>

          {/* Stage Dropdown */}
          <div className="md:col-span-3">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="w-full bg-surface-container-low text-on-surface font-body-sm text-body-sm px-space-sm py-space-xs rounded focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer border border-outline-variant/30"
            >
              <option value="all">Stage: All Stages</option>
              <option value="missing_docs">Chasing Missing Docs</option>
              <option value="draft_ready">Draft Ready for Sign-Off</option>
              <option value="completed">Completed Files</option>
            </select>
          </div>

          {/* Aging Bucket Dropdown */}
          <div className="md:col-span-3">
            <select
              value={agingFilter}
              onChange={(e) => setAgingFilter(e.target.value)}
              className="w-full bg-surface-container-low text-on-surface font-body-sm text-body-sm px-space-sm py-space-xs rounded focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer border border-outline-variant/30"
            >
              <option value="all">Aging: All Aging Buckets</option>
              <option value="gt21">&gt; 21 Days (Critical SLA)</option>
              <option value="14-21">14 - 21 Days (Overdue)</option>
              <option value="lt7">&lt; 7 Days (Fresh)</option>
            </select>
          </div>

          {/* Reset Filters */}
          <div className="md:col-span-1 flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                setStageFilter('all');
                setAgingFilter('all');
                setSearchQuery('');
              }}
              className="w-full h-full bg-surface-container-low hover:bg-surface-container-high rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors py-space-xs cursor-pointer border border-outline-variant/30"
              title="Reset Filters"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
            </button>
          </div>
        </div>
      </section>

      {/* Primary Tabular High-Density Workbench */}
      <div className="w-full bg-surface-container-lowest rounded shadow-sm overflow-hidden mb-space-md border border-border-hairline">
        <div className="overflow-x-auto max-h-[640px] relative">
          <table className="w-full text-left border-collapse min-w-[1300px]">
            {/* Sticky Header */}
            <thead className="sticky top-0 z-20 bg-surface-container text-on-surface font-label-sm text-label-sm uppercase tracking-wider select-none shadow-[0_1px_0_rgba(0,0,0,0.08)] border-b-2 border-border-structural">
              <tr className="h-10">
                <th className="w-10 px-space-sm text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredCases.length > 0 && selectedIds.length === filteredCases.length
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-3.5 h-3.5 rounded bg-surface-container-lowest text-primary focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="px-space-md min-w-[240px]">Client Name & Entity Type</th>
                <th className="px-space-sm min-w-[130px]">Case ID</th>
                <th className="px-space-sm min-w-[130px]">Assigned RM</th>
                <th className="px-space-sm min-w-[90px] text-center">Days Open</th>
                <th className="px-space-md min-w-[210px]">Current Stage</th>
                <th className="px-space-sm min-w-[110px] text-center">Missing Docs</th>
                <th className="px-space-sm min-w-[140px]">Oldest Item Age</th>
                <th className="px-space-sm min-w-[140px]">Next Follow-Up</th>
                <th className="px-space-sm min-w-[130px]">Status</th>
                <th className="px-space-md min-w-[180px] text-right pr-space-md">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-hairline text-body-sm font-body-sm">
              {filteredCases.map((c, idx) => {
                const isSelected = selectedIds.includes(c.id);
                const isOverdue = c.sla_breached;
                const rowBg = isOverdue
                  ? 'bg-error-container/15 hover:bg-error-container/25'
                  : idx % 2 === 0
                  ? 'bg-surface-container-lowest hover:bg-surface-container-low'
                  : 'bg-surface-container-low/40 hover:bg-surface-container-low';

                return (
                  <tr
                    key={c.id}
                    onClick={() => void selectCase(c.id, 'case-detail')}
                    className={`${rowBg} transition-colors group cursor-pointer relative`}
                  >
                    {/* Checkbox Column */}
                    <td
                      className="px-space-sm text-center relative"
                      onClick={(e) => handleToggleRow(c.id, e)}
                    >
                      {isOverdue && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-error" />
                      )}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-3.5 h-3.5 rounded bg-surface-container-lowest text-primary focus:ring-0 cursor-pointer"
                      />
                    </td>

                    {/* Client Name & Entity Type */}
                    <td className="px-space-md py-space-sm">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-space-xs">
                          <span className="font-label-md text-label-md font-bold text-on-surface group-hover:text-primary tracking-tight truncate">
                            {c.client_name}
                          </span>
                          {isOverdue && (
                            <span className="font-data-mono-sm text-data-mono-sm text-error bg-surface-container-lowest px-space-xs py-space-2xs rounded font-bold border border-error/30">
                              CRITICAL
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
                          <span className="truncate">{c.entity_type} ({c.jurisdiction})</span>
                          <span className="text-outline-variant">•</span>
                          <span className="font-data-mono-sm text-data-mono-sm">LEI: {c.lei}</span>
                        </div>
                      </div>
                    </td>

                    {/* Case ID */}
                    <td className="px-space-sm py-space-sm">
                      <span className="font-data-mono-md text-data-mono-md font-semibold text-on-surface">
                        {c.case_code}
                      </span>
                    </td>

                    {/* Assigned RM */}
                    <td className="px-space-sm py-space-sm">
                      <div className="flex items-center gap-space-xs">
                        <div className="w-5 h-5 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-data-mono-sm text-[10px] font-semibold">
                          {c.assigned_rm
                            .split(' ')
                            .map((p) => p[0])
                            .join('')}
                        </div>
                        <span className="font-body-sm text-body-sm text-on-surface truncate">
                          {c.assigned_rm}
                        </span>
                      </div>
                    </td>

                    {/* Days Open */}
                    <td className="px-space-sm py-space-sm text-center">
                      <span
                        className={`font-data-mono-sm text-data-mono-sm font-semibold ${
                          c.days_open > 20 ? 'text-error' : 'text-on-surface'
                        }`}
                      >
                        {c.days_open}d
                      </span>
                    </td>

                    {/* Current Stage */}
                    <td className="px-space-md py-space-sm">
                      <span className="font-body-sm text-body-sm text-on-surface">
                        {c.status === 'Missing_Docs'
                          ? 'Stage 2: Document Chasing'
                          : c.status === 'Draft_Ready'
                          ? 'Stage 3: RM Draft Review'
                          : 'Stage 6: Final Verification'}
                      </span>
                    </td>

                    {/* Missing Docs */}
                    <td className="px-space-sm py-space-sm text-center">
                      <span
                        className={`font-data-mono-sm text-data-mono-sm px-space-xs py-space-2xs rounded font-bold ${
                          c.missing_count > 0
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        {c.missing_count} Items
                      </span>
                    </td>

                    {/* Oldest Item Age */}
                    <td className="px-space-sm py-space-sm">
                      <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                        +{c.days_since_contact} Days ago
                      </span>
                    </td>

                    {/* Next Follow-Up */}
                    <td className="px-space-sm py-space-sm">
                      <span className="font-body-sm text-body-sm text-on-surface truncate block">
                        {c.target_deadline_label}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="px-space-sm py-space-sm">
                      {isOverdue ? (
                        <span className="inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold text-error bg-error-container/40 px-space-xs py-space-2xs rounded border border-error/20">
                          <span className="material-symbols-outlined text-[13px]">warning</span>
                          Overdue ({c.sla_delay_days}d)
                        </span>
                      ) : c.status === 'Draft_Ready' ? (
                        <span className="inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold text-on-tertiary-container bg-surface-container px-space-xs py-space-2xs rounded">
                          <span className="material-symbols-outlined text-[13px]">rate_review</span>
                          Draft Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold text-status-success bg-surface-container-low px-space-xs py-space-2xs rounded">
                          <span className="material-symbols-outlined text-[13px]">check_circle</span>
                          Compliant
                        </span>
                      )}
                    </td>

                    {/* Quick Actions */}
                    <td className="px-space-md py-space-sm text-right pr-space-md">
                      <div className="flex items-center justify-end gap-space-xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void selectCase(c.id, 'reminder-composer');
                          }}
                          className="px-space-sm py-space-2xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm transition-colors cursor-pointer"
                          title="Review Draft"
                        >
                          Review
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startLangGraphWorkflow(c.id, { navigateToDrafting: true });
                          }}
                          className="px-space-sm py-space-2xs rounded bg-primary-container text-white hover:bg-primary font-label-sm text-label-sm transition-colors cursor-pointer font-semibold shadow-xs"
                          title="Launch AI Chase Agent"
                        >
                          Chase
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
