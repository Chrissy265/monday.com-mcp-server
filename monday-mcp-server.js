#!/usr/bin/env node
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors';

const MONDAY_API_KEY = process.env.striling_monday_api;

const server = new Server(
  {
    name: 'monday_query',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'monday_query',
        description: 'Query Monday.com boards, tasks, and users using GraphQL',
        inputSchema: {
          type: 'object',
          properties: {
            graphqlQuery: {
              type: 'string',
              description: 'Complete GraphQL query to execute',
            },
          },
          required: ['graphqlQuery'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'monday_query') {
    const { graphqlQuery } = request.params.arguments;

    try {
      const response = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Authorization': MONDAY_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: graphqlQuery }),
      });

      const data = await response.json();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Express app
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Monday.com MCP Server' });
});

// SSE endpoint
app.get('/sse', async (req, res) => {
  console.log('SSE connection received from:', req.headers['user-agent']);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const transport = new SSEServerTransport('/message', res);
  await server.connect(transport);

  console.log('MCP server connected via SSE');
});

// Message endpoint
app.post('/message', async (req, res) => {
  console.log('Message received:', req.body);
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Monday.com MCP server running on port ${PORT}`);
  console.log(`SSE endpoint: http://0.0.0.0:${PORT}/sse`);
});
