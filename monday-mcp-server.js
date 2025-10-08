#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';

const MONDAY_API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU2MzExNTU4NiwiYWFpIjoxMSwidWlkIjo3OTc1NjYzNiwiaWFkIjoiMjAyNS0wOS0xN1QxMDoyMTowMC4wNzNaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQzMzYwNTUsInJnbiI6ImFwc2UyIn0.HUC69FAKdCCyxnqLIzFDbmpOAjN5l1okwM6jaEE-Eo8';

const server = new Server(
  {
    name: 'monday-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_monday',
        description: 'Query Monday.com boards, tasks, and users using GraphQL. Use this to find task owners, check statuses, list boards, and get task details.',
        inputSchema: {
          type: 'object',
          properties: {
            graphqlQuery: {
              type: 'string',
              description: 'Complete GraphQL query to execute against Monday.com API',
            },
          },
          required: ['graphqlQuery'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'query_monday') {
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

      if (data.errors) {
        return {
          content: [
            {
              type: 'text',
              text: `GraphQL Error: ${JSON.stringify(data.errors, null, 2)}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data.data, null, 2),
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

// Create Express app for SSE
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get('/sse', async (req, res) => {
  console.log('SSE connection received');
  
  const transport = new SSEServerTransport('/message', res);
  await server.connect(transport);
  
  console.log('MCP server connected via SSE');
});

app.post('/message', async (req, res) => {
  // Handle MCP messages
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Monday.com MCP server running on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});