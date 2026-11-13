#!/usr/bin/env node
// Minimal MCP stdio server used by ReverseMind's connection tests.
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });
const send = (payload) => process.stdout.write(JSON.stringify(payload) + '\n');

const tools = [
  {
    name: 'echo',
    description: 'Echo a message back. Useful for verifying MCP connectivity.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string', description: 'Text to echo' } },
      required: ['message'],
    },
  },
  {
    name: 'add',
    description: 'Add two numbers and return the sum.',
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    },
  },
  {
    name: 'reverse',
    description: 'Reverse a string.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
];

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'reversemind-test-mcp', version: '1.0.0' },
      },
    });
  } else if (msg.method === 'notifications/initialized') {
    // notification, no response
  } else if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools } });
  } else if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments || {};
    let text = '';
    if (name === 'echo') text = `echo: ${args.message ?? ''}`;
    else if (name === 'add') text = `sum: ${Number(args.a || 0) + Number(args.b || 0)}`;
    else if (name === 'reverse') text = String(args.text ?? '').split('').reverse().join('');
    else {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Unknown tool: ${name}` } });
      return;
    }
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: { content: [{ type: 'text', text }], isError: false },
    });
  } else if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } });
  }
});
