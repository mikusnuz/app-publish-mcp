#!/usr/bin/env node
/**
 * CLI entry point.
 *   app-publish-mcp              → starts MCP server (stdio)
 *   app-publish-mcp auth google  → interactive OAuth flow
 */

const args = process.argv.slice(2);

if (args[0] === 'auth') {
  import('./auth.js');
} else {
  import('./index.js');
}
