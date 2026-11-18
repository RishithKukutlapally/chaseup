import React, { useCallback, useEffect, useState } from 'react';

import { api, setUnauthorizedHandler } from './api';
import { AccessDialog } from './components/AccessDialog';
import { Loading } from './components/ui';
import { activeNav, allowed, casesHash, landingHash, navItems, parseHash, type Route } from './lib/routing';
import type { Health, Me } from './types';
import { AgentSettings } from './views/AgentSettings';
import { CasePage } from './views/CasePage';
import { Dashboards } from './views/Dashboards';
import { Login } from './views/Login';
import { MyCases } from './views/MyCases';
import { Queue } from './views/Queue';

function useHash(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

const TopBar: React.FC<{ me: Me; health: Health | null; route: Route | null; onAccess: () => void; onLogout: () => void }> = ({
  me,
  health,
  route,
  onAccess,
  onLogout,
}) => {
  const active = activeNav(route);
  return (
    <header className="topbar">
      <div className="in">
        <a className="brand" href={landingHash(me)} style={{ color: 'inherit', textDecoration: 'none' }}>
          <div className="logo" aria-hidden="true">
            NC
          </div>
          <b>Northgate ChaseUp</b>
        </a>
        <nav className="topnav" aria-label="Main">
          {navItems(me).map((n) => (
            <a key={n.hash} href={n.hash} className={active === n.hash ? 'on' : ''} data-testid={n.testId} aria-current={active === n.hash ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="who">
          {health && (
            <span
              className={`ai-badge ${health.llm_mode}`}
              title={`Main model ${health.llm_model}, backup ${health.fallback_model}`}
              data-testid="llm-mode"
            >
              {health.llm_mode === 'live' ? 'AI live' : 'AI simulated'}
            </span>
          )}
          <div className="name">
            <b data-testid="header-user">{me.display_name}</b>
            <span data-testid="header-role">{me.role_label}</span>
          </div>
          <button type="button" className="tbtn" onClick={onAccess} data-testid="open-access">
            Your access
          </button>
          <button type="button" className="tbtn" onClick={onLogout} data-testid="logout">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
};

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [health, setHealth] = useState<Health | null>(null);
  const [showAccess, setShowAccess] = useState(false);
  const hash = useHash();

  useEffect(() => {
    setUnauthorizedHandler(() => setMe(null));
    api
      .me()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setBooting(false));
    api.health().then(setHealth).catch(() => undefined);
    return () => setUnauthorizedHandler(null);
  }, []);

  const route = parseHash(hash);

  // Send people to their own landing page, and away from pages they cannot use.
  useEffect(() => {
    if (!me) return;
    if (!route || !allowed(me, route)) {
      const target = landingHash(me);
      if (location.hash !== target) location.replace(target);
    }
  }, [me, route]);

  const signedIn = useCallback((m: Me) => {
    setMe(m);
    location.hash = landingHash(m);
  }, []);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setMe(null);
      history.replaceState(null, '', location.pathname);
    }
  };

  if (booting) return <Loading label="Starting…" />;
  if (!me) return <Login onSignedIn={signedIn} />;

  let page: React.ReactNode = <Loading />;
  if (route && allowed(me, route)) {
    switch (route.view) {
      case 'my-cases':
        page = <MyCases me={me} />;
        break;
      case 'queue':
        page = <Queue />;
        break;
      case 'case':
        page = <CasePage key={route.id} me={me} id={route.id} autoPrepare={Boolean(route.prepare)} backHash={casesHash(me) ?? '#dashboards'} />;
        break;
      case 'agent-settings':
        page = <AgentSettings />;
        break;
      case 'dashboards':
        page = <Dashboards me={me} verticalId={null} />;
        break;
      case 'dash':
        page = <Dashboards me={me} verticalId={route.id} />;
        break;
    }
  }

  return (
    <>
      <TopBar me={me} health={health} route={route} onAccess={() => setShowAccess(true)} onLogout={() => void logout()} />
      <main>{page}</main>
      {showAccess && <AccessDialog onClose={() => setShowAccess(false)} />}
    </>
  );
}
