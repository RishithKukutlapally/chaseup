import React, { useState } from 'react';

import { api } from '../api';
import { Button } from '../components/ui';
import type { Me } from '../types';

export const Login: React.FC<{ onSignedIn: (me: Me) => void }> = ({ onSignedIn }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.login(username.trim().toLowerCase(), password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit} data-testid="login-form">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            NC
          </div>
          <b>Northgate ChaseUp</b>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h1>Sign in</h1>
          <p className="muted">Collect missing KYC documents in one email, sent only by you.</p>
        </div>
        <div className="field">
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            className="input"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            data-testid="login-username"
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="login-password"
          />
        </div>
        {error && (
          <div className="banner bad" role="alert" data-testid="login-error">
            {error}
          </div>
        )}
        <Button type="submit" variant="primary" size="big" disabled={busy || !username || !password} testId="login-submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="hint">Your username is your first name. Demo uses synthetic data only.</p>
      </form>
    </div>
  );
};
