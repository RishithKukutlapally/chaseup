import React from 'react';

import { formatValue } from '../lib/format';
import { isNumericColumn, niceMax, parseCell, pct } from '../lib/widgets';
import type { Widget } from '../types';
import { Chip, StatusChip } from './ui';

function isEmpty(w: Widget): boolean {
  switch (w.type) {
    case 'bars':
    case 'pairs':
    case 'funnel':
    case 'table':
      return !w.rows || w.rows.length === 0;
    case 'cols':
      return !w.days || w.days.length === 0;
    case 'flow':
      return !w.steps || w.steps.length === 0;
    case 'list':
      return !w.items || w.items.length === 0;
  }
}

const Bars: React.FC<{ w: Extract<Widget, { type: 'bars' }> }> = ({ w }) => {
  const max = Math.max(...w.rows.map((r) => r[1]), 0);
  return (
    <div className="bars">
      {w.rows.map(([label, v]) => (
        <div className="bar" key={label}>
          <span className="lab">{label}</span>
          <span className="trk">
            <b style={{ width: `${pct(v, max)}%` }} />
          </span>
          <span className="num">{formatValue(v, w.unit, w.dec)}</span>
        </div>
      ))}
    </div>
  );
};

const Pairs: React.FC<{ w: Extract<Widget, { type: 'pairs' }> }> = ({ w }) => {
  const max = w.max || Math.max(...w.rows.flatMap((r) => [r[1], r[2]]), 0);
  const unit = w.unit ?? '';
  return (
    <>
      <div className="legend">
        <span>
          <i className="base" />
          {w.legend[0]}
        </span>
        <span>
          <i />
          {w.legend[1]}
        </span>
      </div>
      <div className="bars">
        {w.rows.map(([label, a, b]) => (
          <div className="bar pair" key={label}>
            <span className="lab">{label}</span>
            <span className="trk">
              <b style={{ width: `${pct(a, max)}%` }} />
              <b className="now" style={{ width: `${pct(b, max)}%` }} />
            </span>
            <span className="num">
              {a}
              {unit} → {b}
              {unit}
            </span>
          </div>
        ))}
      </div>
    </>
  );
};

const Cols: React.FC<{ w: Extract<Widget, { type: 'cols' }> }> = ({ w }) => {
  const totals = w.days.map((_, i) => (w.ok[i] ?? 0) + (w.fb[i] ?? 0) + (w.er[i] ?? 0));
  const top = niceMax(Math.max(...totals, 0));
  const h = (x: number) => `${pct(x, top)}%`;
  return (
    <>
      <div className="legend">
        <span>
          <i />
          Success
        </span>
        <span>
          <i style={{ background: 'var(--orange)' }} />
          Fallback
        </span>
        <span>
          <i style={{ background: 'var(--bad)' }} />
          Error
        </span>
      </div>
      <div className="colsw">
        <div className="yax" aria-hidden="true">
          <span>{top.toLocaleString('en-GB')}</span>
          <span>{(top / 2).toLocaleString('en-GB')}</span>
          <span>0</span>
        </div>
        <div className="cols">
          {w.days.map((d, i) => (
            <div className="col" key={`${d}-${i}`} title={`${d}: ${w.ok[i]} success, ${w.fb[i]} fallback, ${w.er[i]} error`}>
              <b className="er" style={{ height: h(w.er[i] ?? 0) }} />
              <b className="fb" style={{ height: h(w.fb[i] ?? 0) }} />
              <b className="ok" style={{ height: h(w.ok[i] ?? 0) }} />
            </div>
          ))}
        </div>
        <div className="xl">
          {w.days.map((d, i) => (
            <span key={`${d}-${i}`}>{d}</span>
          ))}
        </div>
      </div>
    </>
  );
};

const Funnel: React.FC<{ w: Extract<Widget, { type: 'funnel' }> }> = ({ w }) => {
  const max = w.rows[0]?.[1] || 1;
  return (
    <div className="funnel">
      {w.rows.map(([label, v]) => (
        <div className="fstep" key={label}>
          <div style={{ width: `${Math.max(pct(v, max), 1)}%` }}>{label}</div>
          <span>
            {v} · {Math.round(pct(v, max))}%
          </span>
        </div>
      ))}
    </div>
  );
};

const Flow: React.FC<{ w: Extract<Widget, { type: 'flow' }> }> = ({ w }) => (
  <div className="flow">
    {w.steps.map(([t, s, key], i) => (
      <React.Fragment key={t}>
        {i > 0 && (
          <span className="ar" aria-hidden="true">
            →
          </span>
        )}
        <div className={`fs ${key ? 'key' : ''}`}>
          <b>{t}</b>
          <span>{s}</span>
        </div>
      </React.Fragment>
    ))}
  </div>
);

const List: React.FC<{ w: Extract<Widget, { type: 'list' }> }> = ({ w }) => (
  <ul className="list">
    {w.items.map(([t, s, st], i) => (
      <li key={`${t}-${i}`}>
        <div>
          {t}
          <small>{s}</small>
        </div>
        <StatusChip spec={st} />
      </li>
    ))}
  </ul>
);

const TableW: React.FC<{ w: Extract<Widget, { type: 'table' }> }> = ({ w }) => (
  <div className="tbl">
    <table>
      <thead>
        <tr>
          {w.head.map((h, i) => (
            <th key={h} className={isNumericColumn(w.rows, i) ? 'n' : ''}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {w.rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((raw, ci) => {
              const c = parseCell(raw);
              if (c.kind === 'num') return <td key={ci} className="n">{c.text}</td>;
              if (c.kind === 'status') return <td key={ci}><Chip tone={c.status}>{c.text}</Chip></td>;
              if (c.kind === 'code') return <td key={ci} className="mono small">{c.text}</td>;
              return <td key={ci}>{c.text}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const WidgetCard: React.FC<{ w: Widget; color: string }> = ({ w, color }) => {
  const empty = isEmpty(w);
  const body = (() => {
    if (empty) return <p className="wempty">Nothing to show yet. This fills in as the pilot runs.</p>;
    switch (w.type) {
      case 'bars':
        return <Bars w={w} />;
      case 'pairs':
        return <Pairs w={w} />;
      case 'cols':
        return <Cols w={w} />;
      case 'funnel':
        return <Funnel w={w} />;
      case 'flow':
        return <Flow w={w} />;
      case 'list':
        return <List w={w} />;
      case 'table':
        return <TableW w={w} />;
    }
  })();
  return (
    <section
      className={`card w ${w.wide ? 'wide' : ''} ${w.source === 'planned' ? 'planned' : ''}`}
      style={{ ['--c' as string]: color } as React.CSSProperties}
      data-testid="widget"
    >
      <div className="ch">
        <h3>
          {w.title}
          {w.source === 'planned' && <span className="tag planned">Not connected yet</span>}
          {w.source === 'static' && <span className="tag">Reference</span>}
        </h3>
        {w.note && <span>{w.note}</span>}
      </div>
      <div className="cb">{body}</div>
    </section>
  );
};
