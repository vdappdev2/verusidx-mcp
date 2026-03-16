import { z } from 'zod';
import { spawn } from 'node:child_process';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  rpcCall,
  RegistryReader,
  auditLog,
  isReadOnly,
  assertWriteEnabled,
  VerusError,
  getRegistryPath,
  parseConfFile,
  getChainConfPath,
  type RpcCredentials,
} from '@verusidx/shared';
import { discoverChains, findVerusdBinary, pingChain } from './discovery.js';

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function fail(category: string, message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: category, message }, null, 2) }],
    isError: true as const,
  };
}

function handleError(err: unknown) {
  if (err instanceof VerusError) {
    return fail(err.category, err.message);
  }
  return fail('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function relativeTime(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const SERVER_NAME = 'verusidx-chain-mcp';

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  // ------ Read-only tools (always registered) ------

  server.tool(
    'getinfo',
    'Get blockchain and node information for a running chain. Returns version, block height, connections, difficulty, sync status, and fee configuration. Use this to check whether a daemon is running and synced before performing operations on that chain.',
    { chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")') },
    async ({ chain }) => {
      try {
        const result = await rpcCall(chain, 'getinfo', []);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'getwalletinfo',
    'Get wallet state for a running chain. Returns balances (confirmed, unconfirmed, immature, staking-eligible), reserve currency balances, transaction count, and key pool status. Use this for a quick overview of wallet health and native + reserve currency holdings. Note: reserve_balance is an object keyed by currency name, showing all non-native currencies held in the wallet.',
    { chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")') },
    async ({ chain }) => {
      try {
        const result = await rpcCall(chain, 'getwalletinfo', []);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'help',
    'Get daemon documentation for any RPC command. With no command argument, returns a list of all available RPCs grouped by category. With a command name, returns detailed usage including parameters, types, and examples. Use this when an agent needs to understand an RPC that isn\'t exposed as an MCP tool, or to check exact parameter formats before constructing a complex call.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      command: z.string().optional().describe('RPC command name to get help for (e.g., "sendcurrency", "getidentity"). Omit to list all commands.'),
    },
    async ({ chain, command }) => {
      try {
        const params = command ? [command] : [];
        const result = await rpcCall(chain, 'help', params);
        // help returns a plain string from the daemon
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'getblockcount',
    'Get the current block count (height of the longest chain). Returns a single number — the most lightweight way to check the current block height. Use this for polling block progress, such as waiting for a name commitment to confirm before calling registeridentity.',
    { chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")') },
    async ({ chain }) => {
      try {
        const result = await rpcCall(chain, 'getblockcount', []);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'getcurrency',
    'Get the full definition and current state of a currency. Returns the currency\'s configuration (reserves, weights, fees, preallocations, eras) and its latest on-chain state (supply, reserve balances, conversion prices). Use this to check if a currency exists, understand its structure (simple token vs. fractional basket), read current reserve ratios and conversion prices before performing conversions, or look up registration fees before registering identities or defining currencies on a specific chain. Fee interpretation: idregistrationfees is the fee amount. For basket currencies, if idimportfees is a satoshi-scale value it encodes which reserve currency the fee is denominated in: 0.00000000 = first reserve (index 0), 0.00000001 = second reserve (index 1), etc. Default idimportfees (e.g., 0.02) means the fee is in the basket currency itself, but defaults may differ per chain.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      currencyname: z.string().describe('Currency name (e.g., "bitcoins", "NATI🦉") or i-address. Also accepts "hex:<currencyidhex>" format.'),
    },
    async ({ chain, currencyname }) => {
      try {
        const result = await rpcCall(chain, 'getcurrency', [currencyname]);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'status',
    'Check registry freshness and daemon reachability. Use this to verify chain health before starting a workflow, or to debug why calls to other MCPs are failing. Without a chain parameter, returns an overview of all registered chains. With a chain parameter, returns detailed status for that specific chain.',
    {
      chain: z.string().optional().describe('Specific chain to check. Omit for an overview of all registered chains.'),
    },
    async ({ chain }) => {
      try {
        const reader = new RegistryReader();
        const registry = reader.read();

        if (!registry) {
          return fail('CONNECTION_FAILED', 'No chain registry found. Run refresh_chains to discover chains.');
        }

        const discoveredAt = registry.discoveredAt;
        const registryAge = relativeTime(discoveredAt);

        if (chain) {
          // Single chain status
          const entry = registry.chains[chain];
          if (!entry) {
            return fail('CONNECTION_FAILED', `Chain "${chain}" not found in registry. Run refresh_chains to update.`);
          }

          const creds = reader.resolveCredentials(entry);
          if (!creds) {
            return ok({
              chain,
              reachable: false,
              error: 'Cannot resolve credentials',
              registry_age: registryAge,
              registry_discovered_at: discoveredAt,
            });
          }

          const pingResult = await pingChain(creds);
          if (pingResult.running) {
            const info = pingResult.getinfo;
            return ok({
              chain,
              reachable: true,
              blocks: info.blocks,
              connections: info.connections,
              synced: typeof info.longestchain === 'number' && info.blocks === info.longestchain,
              version: info.version,
              testnet: info.testnet,
              registry_age: registryAge,
              registry_discovered_at: discoveredAt,
            });
          }

          return ok({
            chain,
            reachable: false,
            error: pingResult.error,
            registry_age: registryAge,
            registry_discovered_at: discoveredAt,
          });
        }

        // All chains overview
        const chainsStatus: Record<string, unknown> = {};

        const chainNames = Object.keys(registry.chains);
        const pingPromises = chainNames.map(async (name) => {
          const entry = registry.chains[name];
          const creds = reader.resolveCredentials(entry);
          if (!creds) {
            chainsStatus[name] = { reachable: false, error: 'Cannot resolve credentials' };
            return;
          }

          const pingResult = await pingChain(creds);
          if (pingResult.running) {
            const info = pingResult.getinfo;
            chainsStatus[name] = {
              reachable: true,
              blocks: info.blocks,
              connections: info.connections,
              synced: typeof info.longestchain === 'number' && info.blocks === info.longestchain,
            };
          } else {
            chainsStatus[name] = {
              reachable: false,
              error: pingResult.error,
            };
          }
        });

        await Promise.allSettled(pingPromises);

        return ok({
          registry_age: registryAge,
          registry_discovered_at: discoveredAt,
          chains: chainsStatus,
        });
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'refresh_chains',
    'Re-run chain discovery and rewrite the chain registry file. Call this after starting a new daemon, stopping a daemon, or when the registry appears stale. Discovery scans OS-appropriate data directories for .conf files, parses them, and calls getinfo on each discovered chain to confirm it\'s running. PBaaS chains with hex-encoded folder names are resolved to friendly names via the VRSC daemon. The updated registry is written atomically. Available in read-only mode.',
    {},
    async () => {
      try {
        const result = await discoverChains();

        const chainsSummary: Record<string, { host: string; port: number; running: boolean }> = {};
        let runningCount = 0;

        for (const [name, entry] of Object.entries(result.registry.chains)) {
          const reachable = result.reachability[name];
          const running = reachable?.running ?? false;
          if (running) runningCount++;

          chainsSummary[name] = {
            host: entry.host,
            port: entry.port,
            running,
          };
        }

        const discovered = Object.keys(chainsSummary).length;

        auditLog({
          server: SERVER_NAME,
          tool: 'refresh_chains',
          chain: '*',
          params: {},
          result: { discovered, running: runningCount },
          success: true,
        });

        return ok({
          discovered,
          chains: chainsSummary,
          registry_path: getRegistryPath(),
          message: `Registry updated. ${runningCount} of ${discovered} discovered chains are running.`,
        });
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ------ Write tools (registered only when not read-only) ------

  if (!isReadOnly()) {
    server.tool(
      'stop',
      'Stop a running daemon. This shuts down the daemon process for the specified chain entirely — ALL connected clients, MCP servers, CLI users, and applications connected to this daemon will lose connectivity. This is not a per-session disconnect; it terminates the daemon. After stopping, the chain will no longer be reachable. Consider calling refresh_chains after stopping so other MCPs see the updated state.',
      {
        chain: z.string().describe('Chain whose daemon to stop (e.g., "VRSC", "vrsctest")'),
        reason: z.string().optional().describe('Reason for stopping. Not sent to the daemon — recorded only in the local audit log for accountability.'),
      },
      async ({ chain, reason }) => {
        try {
          assertWriteEnabled();
          const result = await rpcCall(chain, 'stop', []);

          auditLog({
            server: SERVER_NAME,
            tool: 'stop',
            chain,
            params: { reason },
            result,
            success: true,
          });

          return ok(result);
        } catch (err) {
          return handleError(err);
        }
      },
    );

    server.tool(
      'verusd',
      'Start a Verus daemon instance. This is a system command that spawns a new process — it is NOT an RPC call to an existing daemon. The daemon runs independently of this MCP server (detached process). After starting, the tool waits briefly and verifies the daemon launched successfully via getinfo. Call refresh_chains after a successful start so other MCPs can discover the new daemon.',
      {
        chain: z.string().optional().describe('Chain to start. Omit for VRSC mainnet. For other chains, provide the chain name (e.g., "vrsctest"). Maps to the -chain= flag.'),
        bootstrap: z.boolean().optional().describe('Start with -bootstrap flag for faster initial sync. Only useful on first start or after a long time offline. Default: false.'),
        extra_args: z.array(z.string()).optional().describe('Additional command-line arguments passed to verusd (e.g., ["-reindex"]).'),
      },
      async ({ chain, bootstrap, extra_args }) => {
        try {
          assertWriteEnabled();

          const binaryPath = findVerusdBinary();
          if (!binaryPath) {
            return fail('RPC_ERROR', 'verusd binary not found — set VERUSIDX_BIN_PATH or add verusd to your PATH');
          }

          const effectiveChain = chain || 'VRSC';

          // Check if daemon is already running
          const confPath = getChainConfPath(effectiveChain);
          const conf = parseConfFile(confPath);
          if (conf?.rpcuser && conf?.rpcpassword && conf?.rpcport) {
            const port = parseInt(conf.rpcport, 10);
            if (!isNaN(port)) {
              const creds: RpcCredentials = {
                host: conf.rpchost || '127.0.0.1',
                port,
                user: conf.rpcuser,
                password: conf.rpcpassword,
              };
              const alreadyRunning = await pingChain(creds);
              if (alreadyRunning.running) {
                return fail('RPC_ERROR', `Daemon for ${effectiveChain} appears to already be running (getinfo responded on port ${port})`);
              }
            }
          }

          // Build args
          const args: string[] = ['-daemon'];
          if (chain) {
            args.push(`-chain=${chain}`);
          }
          if (bootstrap) {
            args.push('-bootstrap');
          }
          if (extra_args) {
            args.push(...extra_args);
          }

          // Spawn detached
          const child = spawn(binaryPath, args, {
            detached: true,
            stdio: 'ignore',
          });
          const pid = child.pid;
          child.unref();

          // Wait for daemon to start
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Verify it started — re-read conf in case it was just created
          let started = false;
          const freshConf = parseConfFile(confPath);
          if (freshConf?.rpcuser && freshConf?.rpcpassword && freshConf?.rpcport) {
            const port = parseInt(freshConf.rpcport, 10);
            if (!isNaN(port)) {
              const creds: RpcCredentials = {
                host: freshConf.rpchost || '127.0.0.1',
                port,
                user: freshConf.rpcuser,
                password: freshConf.rpcpassword,
              };
              const verifyResult = await pingChain(creds);
              started = verifyResult.running;
            }
          }

          const resultData = started
            ? { started: true, chain: effectiveChain, pid, message: 'Daemon started. Run refresh_chains to update the chain registry.' }
            : { started: false, chain: effectiveChain, pid, message: 'Daemon process spawned but getinfo did not respond yet. It may still be starting — try status in a few seconds.' };

          auditLog({
            server: SERVER_NAME,
            tool: 'verusd',
            chain: effectiveChain,
            params: { chain, bootstrap, extra_args },
            result: resultData,
            success: started,
          });

          return ok(resultData);
        } catch (err) {
          return handleError(err);
        }
      },
    );

    server.tool(
      'sendrawtransaction',
      'Broadcast a signed raw transaction to the network. Takes a hex-encoded signed transaction and submits it to the local node, which relays it to the network. Returns the transaction hash (txid) on success. This is the companion to definecurrency — definecurrency returns a signed hex that must be broadcast here. Also used for any pre-signed transaction hex.',
      {
        chain: z.string().describe('Chain to broadcast on (e.g., "VRSC", "vrsctest")'),
        hexstring: z.string().describe('The hex-encoded signed raw transaction'),
        allowhighfees: z.boolean().optional().describe('Allow transactions with unusually high fees. Default: false.'),
      },
      async ({ chain, hexstring, allowhighfees }) => {
        try {
          assertWriteEnabled();

          const params: unknown[] = [hexstring];
          if (allowhighfees !== undefined) params.push(allowhighfees);

          const result = await rpcCall(chain, 'sendrawtransaction', params);

          auditLog({
            server: SERVER_NAME,
            tool: 'sendrawtransaction',
            chain,
            params: { hexstring: hexstring.slice(0, 20) + '...', allowhighfees },
            result,
            success: true,
          });

          return ok(result);
        } catch (err) {
          return handleError(err);
        }
      },
    );

    server.tool(
      'signrawtransaction',
      'Sign inputs of a raw transaction. Takes a hex-encoded transaction and signs it with keys available in the wallet (or with explicitly provided private keys). Returns the signed hex and whether all inputs are fully signed. Use this for multisig workflows where multiple parties need to sign. For definecurrency in the normal single-signer case, the hex is returned already signed — signrawtransaction is not needed.',
      {
        chain: z.string().describe('Chain to sign for (e.g., "VRSC", "vrsctest")'),
        hexstring: z.string().describe('The hex-encoded raw transaction to sign'),
        prevtxs: z.array(z.object({
          txid: z.string(),
          vout: z.number(),
          scriptPubKey: z.string(),
          redeemScript: z.string().optional(),
          amount: z.number(),
        })).optional().describe('Array of previous dependent transaction outputs not yet in the blockchain.'),
        privatekeys: z.array(z.string()).optional().describe('Array of base58-encoded private keys to use for signing. If provided, only these keys are used.'),
        sighashtype: z.string().optional().describe('Signature hash type. Default: "ALL". Options: "ALL", "NONE", "SINGLE", "ALL|ANYONECANPAY", "NONE|ANYONECANPAY", "SINGLE|ANYONECANPAY".'),
      },
      async ({ chain, hexstring, prevtxs, privatekeys, sighashtype }) => {
        try {
          assertWriteEnabled();

          // Build positional params — daemon expects: hexstring [prevtxs] [privatekeys] [sighashtype]
          const params: unknown[] = [hexstring];
          if (prevtxs !== undefined || privatekeys !== undefined || sighashtype !== undefined) {
            params.push(prevtxs ?? null);
          }
          if (privatekeys !== undefined || sighashtype !== undefined) {
            params.push(privatekeys ?? null);
          }
          if (sighashtype !== undefined) {
            params.push(sighashtype);
          }

          const result = await rpcCall(chain, 'signrawtransaction', params);

          auditLog({
            server: SERVER_NAME,
            tool: 'signrawtransaction',
            chain,
            params: { hexstring: hexstring.slice(0, 20) + '...', prevtxs: !!prevtxs, privatekeys: !!privatekeys, sighashtype },
            result,
            success: true,
          });

          return ok(result);
        } catch (err) {
          return handleError(err);
        }
      },
    );
  }
}
