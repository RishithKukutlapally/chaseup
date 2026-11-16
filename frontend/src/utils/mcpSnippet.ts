export const DEFAULT_MCP_URL = 'http://127.0.0.1:8000/mcp';

/** Claude Desktop / Claude Code config for the ChaseUp streamable-HTTP MCP endpoint. */
export function claudeDesktopConfig(token: string, url: string = DEFAULT_MCP_URL): string {
  const cfg = {
    mcpServers: {
      chaseup: {
        type: 'http',
        url,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  };
  return JSON.stringify(cfg, null, 2);
}

/** Same server over stdio (runs the Python module directly). */
export function claudeStdioConfig(token: string, backendDir = '<path-to-repo>/backend'): string {
  const cfg = {
    mcpServers: {
      chaseup: {
        command: 'uv',
        args: ['run', '--directory', backendDir, 'python', '-m', 'app.mcp_server'],
        env: { CHASEZERO_MCP_TOKEN: token },
      },
    },
  };
  return JSON.stringify(cfg, null, 2);
}
