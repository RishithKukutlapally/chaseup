import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { Chip, ErrorBanner, Loading } from '../components/ui';
import { daysLabel } from '../lib/format';
import type { KycCase } from '../types';

type Filter = 'all' | 'overdue' | 'ready';

export function queueChip(c: KycCase): { tone: 'good' | 'warn' | 'bad' | 'neutral'; text: string } {
  if (c.status === 'Completed') return { tone: 'good', text: 'Sent' };
  if (c.pending_draft_id) return { tone: 'warn', text: 'Reminder with RM' };
  if (c.sla_breached) return { tone: 'bad', text: 'Overdue' };
  return { tone: 'neutral', text: 'Waiting' };
}

export function filterCases(cases: KycCase[], filter: Filter, search: string): KycCase[] {
  const q = search.trim().toLowerCase();
  return cases
    .filter((c) => (filter === 'overdue' ? c.sla_breached : filter === 'ready' ? Boolean(c.pending_draft_id) : true))
    .filter((c) => !q || c.client_name.toLowerCase().includes(q) || c.case_code.toLowerCase().includes(q) || c.assigned_rm.toLowerCase().includes(q))
    .sort((a, b) => b.oldest_missing_days - a.oldest_missing_days);
}

export const Queue: React.FC = () => {
  const [cases, setCases] = useState<KycCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.cases().then((d) => setCases(d.cases)).catch((e: Error) => setError(e.message));
  }, []);

  const rows = useMemo(() => filterCases(cases ?? [], filter, search), [cases, filter, search]);
  const count = (f: Filter) => filterCases(cases ?? [], f, '').length;

  return (
    <div className="page">
      <div className="phead">
        <div className="t">
          <h1>Chase queue</h1>
          <p>Every open case, oldest waiting document first. Prepare reminders here; the named RM sends them.</p>
        </div>
      </div>
      <ErrorBanner message={error} />
      <div className="toolbar">
        {(
          [
            ['all', 'All'],
            ['overdue', 'Overdue'],
            ['ready', 'Reminder ready'],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button key={f} type="button" className={`filter ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)} data-testid={`filter-${f}`}>
            {label} · {count(f)}
          </button>
        ))}
        <span className="spacer" />
        <input className="input" placeholder="Search client, case or RM" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
      </div>
      {cases === null && !error ? (
        <Loading />
      ) : (
        <div className="card">
          <div className="tbl">
            <table data-testid="queue-table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Client</th>
                  <th>Named RM</th>
                  <th className="n">Missing</th>
                  <th className="n">Oldest wait</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const chip = queueChip(c);
                  return (
                    <tr key={c.id} className="click" onClick={() => (location.hash = `#case-${c.id}`)} data-testid={`queue-row-${c.id}`}>
                      <td className="mono small">{c.case_code}</td>
                      <td>
                        <b style={{ fontWeight: 600 }}>{c.client_name}</b>
                      </td>
                      <td>{c.assigned_rm}</td>
                      <td className="n">{c.missing_count}</td>
                      <td className="n">{c.missing_count ? daysLabel(c.oldest_missing_days) : '—'}</td>
                      <td>
                        <Chip tone={chip.tone}>{chip.text}</Chip>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="dim" style={{ textAlign: 'center', padding: 28 }}>
                      No cases match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
