import React, { useEffect, useState } from 'react';

import { apiClient } from '../api/client';
import type { AccessMatrix, McpTokenCreated, McpTokenRow } from '../types/chasezero';
import { formatDateTime } from '../utils/format';
import { claudeDesktopConfig, claudeStdioConfig, DEFAULT_MCP_URL } from '../utils/mcpSnippet';
import { Badge, Button, inputClass, Modal, Table, Td } from './ui';

export const AccessDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [matrix, setMatrix] = useState<AccessMatrix | null>(null);
  const [tokens, setTokens] = useState<McpTokenRow[]>([]);
  const [created, setCreated] = useState<McpTokenCreated | null>(null);
  const [name, setName] = useState('Claude Desktop');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadTokens = () => apiClient.listMcpTokens().then(setTokens).catch((e: Error) => setErr(e.message));

  useEffect(() => {
    apiClient.accessMatrix().then(setMatrix).catch((e: Error) => setErr(e.message));
    void loadTokens();
  }, []);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied('copy failed — select the text manually');
    }
  };

  const mcpUrl = `${window.location.origin.replace('5173', '8000')}/mcp`;
  const roles = matrix ? Object.keys(matrix.roles) : [];
  const myRole = matrix?.you.role;

  return (
    <Modal title="Your access" onClose={onClose} wide testId="access-dialog">
      {err && <p className="text-error font-body-sm text-body-sm">{err}</p>}
      {matrix && (
        <>
          <p className="font-body-md text-body-md text-on-surface">
            Signed in as <strong>{matrix.you.display_name}</strong> ({matrix.you.role_label}). The same permission matrix is
            enforced by the server on every API call and every MCP tool call. Your column is highlighted.
          </p>
          <div className="rounded border border-border-hairline p-space-md bg-surface-container-low">
            <h3 className="font-label-sm text-label-sm uppercase text-on-surface-variant mb-space-xs">Red lines (server-enforced)</h3>
            <ul className="list-disc pl-space-xl font-body-sm text-body-sm text-on-surface">
              {matrix.red_lines.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <Table head={['Permission', ...roles.map((r) => matrix.roles[r])]} testId="access-matrix">
            {Object.entries(matrix.permissions).map(([perm, grants]) => (
              <tr key={perm}>
                <Td mono>{perm}</Td>
                {roles.map((r) => (
                  <Td key={r} className={r === myRole ? 'bg-secondary-container/60 font-semibold' : ''}>
                    {grants[r] ? (grants[r] === 'own' ? 'own cases' : '✓ all') : <span className="text-outline">—</span>}
                  </Td>
                ))}
              </tr>
            ))}
          </Table>
          <div>
            <h3 className="font-headline-sm text-headline-sm mb-space-xs">Field-level rights on agent configuration</h3>
            <Table head={['Field', 'Who may change it']}>
              {Object.entries(matrix.agent_field_rights).map(([f, rs]) => (
                <tr key={f}>
                  <Td mono>{f}</Td>
                  <Td>
                    {rs.map((r) => (
                      <span key={r} className="mr-space-xs">
                        <Badge tone={r === myRole ? 'accent' : 'neutral'}>{matrix.roles[r] ?? r}</Badge>
                      </span>
                    ))}
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        </>
      )}

      <div className="border-t border-border-hairline pt-space-md flex flex-col gap-space-sm" data-testid="mcp-tokens">
        <h3 className="font-headline-sm text-headline-sm">MCP tokens</h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          An MCP client (Claude Desktop, Claude Code, MCP Inspector) using your token runs with <strong>your role</strong>.
          Tools available: {matrix?.mcp_tools.join(', ')}. No tool can approve or send. Tokens are stored only as SHA-256
          hashes.
        </p>
        <div className="flex gap-space-sm items-center">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} aria-label="Token name" />
          <Button
            variant="primary"
            testId="create-mcp-token"
            onClick={async () => {
              try {
                setCreated(await apiClient.createMcpToken(name || 'MCP client'));
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
          <div className="rounded border border-status-warning/50 bg-[#fef3c7] p-space-md flex flex-col gap-space-sm">
            <strong className="font-body-sm text-body-sm">Copy this token now — it will not be shown again.</strong>
            <code data-testid="mcp-token-value" className="font-data-mono-sm text-data-mono-sm break-all bg-surface-container-lowest p-space-xs rounded">
              {created.token}
            </code>
            <div className="flex gap-space-sm flex-wrap">
              <Button onClick={() => void copy('token', created.token)}>Copy token</Button>
              <Button onClick={() => void copy('Claude Desktop config', claudeDesktopConfig(created.token, mcpUrl))}>
                Copy Claude Desktop config (HTTP)
              </Button>
              <Button onClick={() => void copy('stdio config', claudeStdioConfig(created.token))}>Copy stdio config</Button>
              {copied && <span className="font-body-sm text-body-sm self-center">Copied: {copied}</span>}
            </div>
            <pre className="font-data-mono-sm text-data-mono-sm bg-surface-container-lowest p-space-sm rounded overflow-x-auto">
              {claudeDesktopConfig(created.token, mcpUrl || DEFAULT_MCP_URL)}
            </pre>
          </div>
        )}
        <Table head={['Name', 'Prefix', 'Created', 'Last used', 'Status', '']}>
          {tokens.map((t) => (
            <tr key={t.id}>
              <Td>{t.name}</Td>
              <Td mono>{t.prefix}…</Td>
              <Td>{formatDateTime(t.created_at)}</Td>
              <Td>{formatDateTime(t.last_used_at)}</Td>
              <Td>{t.revoked ? <Badge tone="fail">revoked</Badge> : <Badge tone="ok">active</Badge>}</Td>
              <Td>
                {!t.revoked && (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await apiClient.revokeMcpToken(t.id);
                      void loadTokens();
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </div>
    </Modal>
  );
};
