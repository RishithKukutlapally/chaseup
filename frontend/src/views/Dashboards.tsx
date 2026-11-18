import React, { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import { WidgetCard } from '../components/Widgets';
import { Button, Chip, ErrorBanner, Loading } from '../components/ui';
import { clockTime } from '../lib/format';
import { can } from '../lib/routing';
import type { ChainVerification, InsightsOverview, Me, VerticalDashboard } from '../types';

const REFRESH_MS = 15000;

function usePolling<T>(fetcher: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const load = useCallback(() => {
    fetcher()
      .then((d) => {
        setData(d);
        setError(null);
        setAt(new Date());
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    setData(null);
    load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);
  return { data, error, at };
}

const LiveBadge: React.FC<{ at: Date | null }> = ({ at }) => (
  <span className="live" data-testid="live-indicator">
    Live · updated {at ? clockTime(at) : '—'}
  </span>
);

const Overview: React.FC<{ data: InsightsOverview; at: Date | null }> = ({ data, at }) => {
  const { baseline, target, now } = data.outcome;
  const rawUnit = data.outcome.unit ?? 'd';
  const unit = rawUnit.startsWith(' ') ? rawUnit : ` ${rawUnit}`;
  const scaleMax = Math.max(baseline, target, now) * 1.05 || 1;
  const pos = (x: number) => `${(x / scaleMax) * 100}%`;
  return (
    <div className="dpage" data-testid="dash-overview">
      <div className="row">
        <span className="small dim">Dashboards / Overview</span>
        <span className="spacer" />
        <LiveBadge at={at} />
      </div>
      <section className="card intro">
        <div className="txt">
          <span className="cap" style={{ color: 'var(--hub)' }}>
            What this dashboard shows
          </span>
          <h1>One agent, seven views, one number</h1>
          <p>
            This dashboard tracks the Northgate document-chase agent during its pilot. The agent finds every missing document on a
            corporate onboarding file, drafts one complete reminder, and holds it until the named Relationship Manager approves and
            sends it.
          </p>
          <p>Seven functions have a stake in the pilot and each needs different evidence. Each has its own view here, built around the one question it brings to the weekly review.</p>
        </div>
        <ul className="how-list">
          <li>
            <span className="ic">1</span>
            <div>
              <b>Start with the shared outcome</b>
              <span>{data.outcome.label ?? 'Every view rolls up to the days it takes to chase a file to complete.'}</span>
            </div>
          </li>
          <li>
            <span className="ic">2</span>
            <div>
              <b>Open the view for your function</b>
              <span>Each opens with its question, four headline numbers, then the detail behind them.</span>
            </div>
          </li>
          <li>
            <span className="ic">3</span>
            <div>
              <b>Read the status chips</b>
              <span>
                <Chip tone="good">Green</Chip> on track, <Chip tone="warn">amber</Chip> watch, <Chip tone="bad">red</Chip> act this week.
              </span>
            </div>
          </li>
        </ul>
      </section>
      <section className="card north" aria-label="Shared outcome">
        <div className="ring">
          <b>
            {baseline} → {target}
          </b>
          <span>Chase days</span>
        </div>
        <div className="track-wrap">
          <div className="cap">Shared outcome · median days from document requested to received</div>
          <div className="track">
            <span className="fill" style={{ left: pos(Math.min(now, baseline)), right: `${100 - parseFloat(pos(Math.max(now, baseline)))}%` }} />
            <span className="mark" style={{ left: pos(target) }} title="Target" />
          </div>
          <div className="ticks">
            <span className="l0" style={{ left: 0 }}>
              0{unit}
            </span>
            <span style={{ left: pos(now) }}>
              <b>
                {now}
                {unit}
              </b>
              now
            </span>
            <span style={{ left: pos(target) }}>
              <b>
                {target}
                {unit}
              </b>
              target
            </span>
            <span className="l1" style={{ left: pos(baseline) }}>
              <b>
                {baseline}
                {unit}
              </b>
              before
            </span>
          </div>
          {data.outcome.note && <p className="note">{data.outcome.note}</p>}
        </div>
      </section>
      <div className="cap">The seven dashboards</div>
      <div className="vcards" data-testid="vertical-cards">
        {data.verticals.map((v) => (
          <a
            key={v.id}
            className={`card vcard ${v.allowed ? '' : 'locked'}`}
            href={v.allowed ? `#dash-${v.id}` : undefined}
            style={{ ['--c' as string]: v.color } as React.CSSProperties}
            data-testid={`vcard-${v.id}`}
            aria-disabled={!v.allowed}
          >
            <div className="vh">
              <b>{v.name}</b>
              <small>{v.lead}</small>
            </div>
            <p>{v.question}</p>
            {v.headline && (
              <div className="hk">
                <div>
                  <span>{v.headline.label}</span>
                  <br />
                  <b>{v.headline.value}</b>
                </div>
                {v.headline.status && <Chip tone={v.headline.status}>{v.headline.statusText ?? v.headline.status}</Chip>}
              </div>
            )}
            <span className="open">{v.allowed ? 'Open dashboard →' : 'No access'}</span>
          </a>
        ))}
      </div>
    </div>
  );
};

const Vertical: React.FC<{ me: Me; data: VerticalDashboard; at: Date | null; showOverviewLink: boolean }> = ({ me, data, at, showOverviewLink }) => {
  const [chain, setChain] = useState<ChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const style = { ['--c' as string]: data.color } as React.CSSProperties;
  return (
    <div className="dpage" style={style} data-testid={`dash-${data.id}`}>
      <div className="row">
        <span className="small dim">
          {showOverviewLink ? (
            <a className="back" href="#dashboards">
              Overview
            </a>
          ) : (
            'Dashboards'
          )}{' '}
          / {data.name}
        </span>
        <span className="spacer" />
        <LiveBadge at={at} />
      </div>
      <div className="dhead">
        <div className="stack" style={{ gap: 6 }}>
          <span className="lead">{data.lead}</span>
          <h1>{data.name}</h1>
          <p className="q">{data.question}</p>
        </div>
        <div className="card proves">
          <span className="cap">What this view proves</span>
          {data.proves}
        </div>
      </div>
      <div className="kpis">
        {data.kpis.map((k) => (
          <div className="card kpi" key={k.label} data-testid="kpi">
            <div className="top">
              <span className="l">{k.label}</span>
              {k.status && <Chip tone={k.status}>{k.statusText ?? k.status}</Chip>}
            </div>
            <span className="v">{k.value}</span>
            {k.sub && <span className="s">{k.sub}</span>}
          </div>
        ))}
      </div>
      {data.id === 'security' && can(me, 'audit:verify') && (
        <div className="card proves" data-testid="verify-panel">
          <div className="row">
            <div className="stack" style={{ gap: 2 }}>
              <b>Audit trail integrity</b>
              <span className="small muted">Recalculates the fingerprint of every logged action to prove nothing was edited or deleted.</span>
            </div>
            <span className="spacer" />
            <Button
              variant="primary"
              disabled={verifying}
              testId="verify-chain"
              onClick={async () => {
                setVerifying(true);
                setErr(null);
                try {
                  setChain(await api.verifyChain());
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setVerifying(false);
                }
              }}
            >
              {verifying ? 'Checking…' : 'Verify audit chain'}
            </Button>
          </div>
          <ErrorBanner message={err} />
          {chain && (
            <div className={`banner ${chain.valid ? 'good' : 'bad'}`} data-testid="verify-result">
              <b>{chain.valid ? `Chain intact · ${chain.events_checked} events verified` : `Chain broken at event ${chain.broken_at_id}`}</b>
              {chain.head_hash && <span className="mono small">Latest fingerprint {chain.head_hash.slice(0, 16)}…</span>}
            </div>
          )}
        </div>
      )}
      <div className="wgrid">
        {data.widgets.map((w, i) => (
          <WidgetCard key={`${w.title}-${i}`} w={w} color={data.color} />
        ))}
      </div>
    </div>
  );
};

export const Dashboards: React.FC<{ me: Me; verticalId: string | null }> = ({ me, verticalId }) => {
  const overview = usePolling(() => api.insights(), 'overview');
  const allowedIds = (overview.data?.verticals ?? []).filter((v) => v.allowed).map((v) => v.id);
  const multi = allowedIds.length > 1;

  return (
    <div className="page">
      <div className="dash-shell">
        <nav className="rail" aria-label="Dashboards">
          {multi && (
            <>
              <span className="cap">Start here</span>
              <a href="#dashboards" className={verticalId === null ? 'on' : ''} data-testid="rail-overview">
                <i className="ov" aria-hidden="true" />
                <span>
                  <b>Overview</b>
                  <small>What this dashboard shows</small>
                </span>
              </a>
            </>
          )}
          <span className="cap">Seven views</span>
          {(overview.data?.verticals ?? []).map((v) => (
            <a
              key={v.id}
              href={v.allowed ? `#dash-${v.id}` : undefined}
              className={`${verticalId === v.id ? 'on' : ''} ${v.allowed ? '' : 'locked'}`}
              style={{ ['--c' as string]: v.color } as React.CSSProperties}
              data-testid={`rail-${v.id}`}
            >
              <i aria-hidden="true" />
              <span>
                <b>{v.name}</b>
                <small>{v.allowed ? v.lead : 'No access'}</small>
              </span>
            </a>
          ))}
        </nav>
        {verticalId ? (
          <VerticalLoader key={verticalId} me={me} id={verticalId} multi={multi} />
        ) : overview.error ? (
          <ErrorBanner message={overview.error} />
        ) : overview.data ? (
          <Overview data={overview.data} at={overview.at} />
        ) : (
          <Loading />
        )}
      </div>
    </div>
  );
};

const VerticalLoader: React.FC<{ me: Me; id: string; multi: boolean }> = ({ me, id, multi }) => {
  const { data, error, at } = usePolling(() => api.insight(id), id);
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Loading />;
  return <Vertical me={me} data={data} at={at} showOverviewLink={multi} />;
};

