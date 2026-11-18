import React, { useEffect, useState } from 'react';

import { api } from '../api';
import { formatDateTime } from '../lib/format';
import { claudeDesktopConfig, claudeStdioConfig } from '../lib/mcpSnippet';
import type { AccessMatrix, McpTokenCreated, McpTokenRow } from '../types';
import { Button, Chip, ErrorBanner } from './ui';

export const AccessDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [matrix, setMatrix] = useState<AccessMatrix | null>(null);
  const [tokens, setTokens] = useState<McpTokenRow[]>([]);
  const [created, setCreated] = useState<McpTokenCreated | null>(null);
  const [name, setName] = useState('Claude Desktop');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadTokens = () => api.listTokens().then(setTokens).catch((e: Error) => setErr(e.message));
  useEffect(() => {
    api.accessMatrix().then(setMatrix).catch((e: Error) => setErr(e.message));
    void loadTokens();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${label} copied`);
    } catch {
      setCopied('Copy failed — select the text and copy it by hand');
    }
  };

  const mcpUrl = `${window.location.origin.replace(':5173', ':8000')}/mcp`;
  const roles = matrix ? Object.keys(matrix.roles) : [];
  const me = matrix?.you.role;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label="Your access" data-testid="access-dialog">
        <div className="ch">
          <h2>Your access</h2>
          <Button variant="ghost" onClick={onClose} testId="close-access">
            Close
          </Button>
        </div>
        <div className="cb" style={{ gap: 18 }}>
          <ErrorBanner message={err} />
          {matrix && (
            <>
              <p className="muted">
                Signed in as <b>{matrix.you.display_name}</b> ({matrix.you.role_label}). The server checks this table on every
                request, including every MCP tool call. Your column is highlighted.
              </p>
              <div className="banner info">
                <b>Rules the system never breaks</b>
                <ul>
                  {matrix.red_lines.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <div className="card">
                <div className="tbl">
                  <table className="matrix" data-testid="access-matrix">
                    <thead>
                      <tr>
                        <th>Permission</th>
                        {roles.map((r) => (
                          <th key={r} className={r === me ? 'me' : ''}>
                            {matrix.roles[r]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(matrix.permissions).map(([perm, grants]) => (
                        <tr key={perm}>
                          <td className="mono small">{perm}</td>
                          {roles.map((r) => (
                            <td key={r} className={r === me ? 'me' : ''}>
                              {grants[r] ? (grants[r] === 'own' ? 'Own cases' : '✓') : <span className="dim">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div className="stack" data-testid="mcp-tokens">
            <h3>MCP tokens</h3>
            <p className="small muted">
              Connect an AI assistant (Claude Desktop, Claude Code, MCP Inspector). It runs with <b>your</b> permissions. Tools:{' '}
              {matrix?.mcp_tools.join(', ')}. No tool can approve or send. Tokens are stored only as a hash.
            </p>
            <div className="row">
              <input className="input" style={{ maxWidth: 260 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Token name" />
              <Button
                variant="primary"
                testId="create-mcp-token"
                onClick={async () => {
                  try {
                    setCreated(await api.createToken(name || 'MCP client'));
                    setCopied(null);
                    void loadTokens();
                  } catch (e) {
                    setErr((e as Error).message);
                  }
                }}
              >
                Create token
              </Button>
            </div>
            {created && (
              <div className="banner warn stack">
                <b>Copy this token now. It will not be shown again.</b>
                <div className="token" data-testid="mcp-token-value">
                  {created.token}
                </div>
                <div className="row">
                  <Button size="sm" onClick={() => void copy('Token', created.token)}>
                    Copy token
                  </Button>
                  <Button size="sm" onClick={() => void copy('Claude Desktop config', claudeDesktopConfig(created.token, mcpUrl))}>
                    Copy Claude Desktop config
                  </Button>
                  <Button size="sm" onClick={() => void copy('Local (stdio) config', claudeStdioConfig(created.token))}>
                    Copy local config
                  </Button>
                  {copied && <span className="small">{copied}</span>}
                </div>
                <pre className="cfg">{claudeDesktopConfig(created.token, mcpUrl)}</pre>
              </div>
            )}
            {tokens.length > 0 && (
              <div className="card">
                <div className="tbl">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Starts with</th>
                        <th>Created</th>
                        <th>Last used</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {tokens.map((t) => (
                        <tr key={t.id}>
                          <td>{t.name}</td>
                          <td className="mono small">{t.prefix}…</td>
                          <td>{formatDateTime(t.created_at)}</td>
                          <td>{formatDateTime(t.last_used_at)}</td>
                          <td>{t.revoked ? <Chip tone="bad">Revoked</Chip> : <Chip tone="good">Active</Chip>}</td>
                          <td>
                            {!t.revoked && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  await api.revokeToken(t.id);
                                  void loadTokens();
                                }}
                              >
                                Revoke
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
