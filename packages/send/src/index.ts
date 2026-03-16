#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ensureSpendingLimitsFile } from '@verusidx/shared';
import { registerTools } from './tools.js';

// Create default spending-limits.json if it doesn't exist yet
ensureSpendingLimitsFile();

const server = new McpServer({
  name: 'verusidx-send-mcp',
  version: '0.1.2',
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});
