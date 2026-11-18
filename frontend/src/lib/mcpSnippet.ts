/** Claude Desktop / Claude Code config for the ChaseUp streamable-HTTP MCP endpoint. */
export function claudeDesktopConfig(token: string, url: string): string {
  return JSON.stringify(
    { mcpServers: { chaseup: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2
  );
}

/** Same server over stdio (runs the Python module directly). */
export function claudeStdioConfig(token: string, backendDir = '<path-to-repo>/backend'): string {
  return JSON.stringify(
    {
      mcpServers: {
        chaseup: {
          command: 'uv',
          args: ['run', '--directory', backendDir, 'python', '-m', 'app.mcp_server'],
          env: { CHASEZERO_MCP_TOKEN: token },
        },
      },
    },
    null,
    2
  );
}
