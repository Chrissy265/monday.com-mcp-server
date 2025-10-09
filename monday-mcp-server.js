#!/usr/bin/env node
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express from 'express';
import cors from 'cors';

const MONDAY_API_KEY = process.env.striling_monday_api;

// Create Express app for HTTP interface
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Simple health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Monday.com MCP Server',
    endpoints: {
      health: '/',
      sse: '/sse',
      query: '/query'
    }
  });
});

// Direct query endpoint (bypass MCP for testing)
app.post('/query', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': MONDAY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SSE endpoint for MCP
app.get('/sse', (req, res) => {
  console.log('SSE connection requested');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial connection message
  res.write('data: {"type":"connection","status":"connected"}\n\n');

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    console.log('SSE connection closed');
  });
});

// Handle MCP messages
app.post('/message', async (req, res) => {
  console.log('MCP message received:', JSON.stringify(req.body, null, 2));

  const { method, params } = req.body;

  try {
    if (method === 'tools/list') {
      return res.json({
        tools: [
          {
            name: 'monday_query',
            description: 'Query Monday.com boards and tasks using GraphQL',
            inputSchema: {
              type: 'object',
              properties: {
                graphqlQuery: {
                  type: 'string',
                  description: 'GraphQL query to execute',
                },
              },
              required: ['graphqlQuery'],
            },
          },
        ],
      });
    }

    if (method === 'tools/call' && params?.name === 'monday_query') {
      const { graphqlQuery } = params.arguments;

      const response = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Authorization': MONDAY_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: graphqlQuery }),
      });

      const data = await response.json();

      return res.json({
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      });
    }

    res.json({ error: 'Unknown method' });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      isError: true
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================`);
  console.log(`Monday.com MCP Server RUNNING`);
  console.log(`Port: ${PORT}`);
  console.log(`SSE Endpoint: /sse`);
  console.log(`=================================`);
});
