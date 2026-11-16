import React, { useState } from 'react';

import { useChaseStore } from '../store/useChaseStore';
import { Button, Field, inputClass } from '../components/ui';

export const LoginView: React.FC = () => {
  const login = useChaseStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim().toLowerCase(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-space-xl">
      <form
        onSubmit={submit}
        data-testid="login-form"
        className="w-full max-w-sm bg-surface-container-lowest rounded border border-border-hairline shadow-sm p-space-xl flex flex-col gap-space-md"
      >
        <div className="flex items-center gap-space-md">
          <div className="w-10 h-10 rounded bg-primary-container text-white flex items-center justify-center font-data-mono-md text-data-mono-md font-bold">
            NC
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md text-on-surface">Northgate ChaseUp</h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Personal sign-in · synthetic demo data</p>
          </div>
        </div>
        <Field label="Username" hint="Your first name in lower case, e.g. sarah">
          <input
            data-testid="login-username"
            className={inputClass}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </Field>
        <Field label="Password">
          <input
            data-testid="login-password"
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {error && (
          <p role="alert" data-testid="login-error" className="font-body-sm text-body-sm text-error">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy} testId="login-submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Repeated failed attempts lock the account for a few minutes. Your role decides which screens you see.
        </p>
      </form>
    </div>
  );
};
