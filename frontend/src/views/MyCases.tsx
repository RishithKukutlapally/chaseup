import React, { useEffect, useState } from 'react';

import { api } from '../api';
import { Button, ErrorBanner, Loading } from '../components/ui';
import { daysLabel, firstName, formatDate } from '../lib/format';
import type { KycCase, Me } from '../types';

export function caseStatus(c: KycCase): { text: string; dot: '' | 'ready' | 'sent' } {
  if (c.pending_draft_id) return { text: 'Reminder ready for your review', dot: 'ready' };
  if (c.status === 'Completed') return { text: `Sent on ${formatDate(c.last_contact_date)}`, dot: 'sent' };
  return { text: 'Nothing sent yet', dot: '' };
}

export const MyCases: React.FC<{ me: Me }> = ({ me }) => {
  const [cases, setCases] = useState<KycCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .cases()
      .then((d) => setCases([...d.cases].sort((a, b) => b.oldest_missing_days - a.oldest_missing_days)))
      .catch((e: Error) => setError(e.message));
  }, []);

  const ready = cases?.filter((c) => c.pending_draft_id).length ?? 0;
  const open = cases?.filter((c) => c.missing_count > 0).length ?? 0;

  return (
    <div className="page">
      <div className="phead">
        <div className="t">
          <h1>Hi {firstName(me.display_name)}</h1>
          <p>
            {cases === null
              ? 'Loading your cases…'
              : ready > 0
                ? `${ready} reminder${ready === 1 ? ' is' : 's are'} ready for you to check and send. ${open} case${open === 1 ? '' : 's'} still waiting on documents.`
                : `${open} case${open === 1 ? '' : 's'} waiting on documents. Prepare a reminder and we list everything that's missing in one email.`}
          </p>
        </div>
      </div>
      <ErrorBanner message={error} />
      {cases === null && !error && <Loading />}
      {cases && cases.length === 0 && <div className="card empty">You have no cases right now.</div>}
      {cases && cases.length > 0 && (
        <div className="case-grid" data-testid="my-cases">
          {cases.map((c) => {
            const st = caseStatus(c);
            const missing = c.documents.filter((d) => d.status === 'Missing');
            return (
              <article className="card case-card" key={c.id} data-testid={`case-card-${c.id}`}>
                <div className="top">
                  <div>
                    <div className="client">{c.client_name}</div>
                    <div className="code">{c.case_code}</div>
                  </div>
                  {c.missing_count > 0 && (
                    <span className={`wait ${c.oldest_missing_days > 7 ? 'late' : ''}`}>Waiting {daysLabel(c.oldest_missing_days)}</span>
                  )}
                </div>
                {missing.length > 0 ? (
                  <ul aria-label="Missing documents">
                    {missing.slice(0, 3).map((d) => (
                      <li key={d.id}>{d.document_name}</li>
                    ))}
                    {missing.length > 3 && <li className="dim">and {missing.length - 3} more</li>}
                  </ul>
                ) : (
                  <p className="small muted">All documents received.</p>
                )}
                <div className="status">
                  <span className={`dot ${st.dot ? `is-${st.dot}` : ''}`} />
                  {st.text}
                </div>
                <div className="actions">
                  {c.pending_draft_id ? (
                    <Button variant="primary" onClick={() => (location.hash = `#case-${c.id}`)} testId={`review-${c.id}`}>
                      Review & send
                    </Button>
                  ) : c.can_create_draft && c.missing_count > 0 ? (
                    <Button variant="primary" onClick={() => (location.hash = `#case-${c.id}?prepare`)} testId={`prepare-${c.id}`}>
                      Prepare reminder
                    </Button>
                  ) : (
                    <Button onClick={() => (location.hash = `#case-${c.id}`)}>Open case</Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
