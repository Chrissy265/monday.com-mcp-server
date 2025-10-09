import express from 'express';
import cors from 'cors';

const MONDAY_API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU2MzExNTU4NiwiYWFpIjoxMSwidWlkIjo3OTc1NjYzNiwiaWFkIjoiMjAyNS0wOS0xN1QxMDoyMTowMC4wNzNaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQzMzYwNTUsInJnbiI6ImFwc2UyIn0.HUC69FAKdCCyxnqLIzFDbmpOAjN5l1okwM6jaEE-Eo8';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Store active SSE connections
const connections = new Map();

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    protocol: 'MCP',
    version: '2024-11-05',
    capabilities: {
      tools: {}
    }
  });
});

// SSE endpoint - proper MCP protocol
app.get('/sse', (req, res) => {
  console.log('📡 New SSE connection established');

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });

  const connectionId = Date.now().toString();
  connections.set(connectionId, res);

  // Send endpoint message (MCP protocol requirement)
  const endpointMessage = {
    jsonrpc: '2.0',
    method: 'endpoint',
    params: {
      endpoint: '/message'
    }
  };
  res.write(`data: ${JSON.stringify(endpointMessage)}\n\n`);

  // Keep-alive ping
  const keepAlive = setInterval(() => {
    res.write(':ping\n\n');
  }, 15000);

  // Cleanup on disconnect
  req.on('close', () => {
    console.log('🔌 SSE connection closed');
    clearInterval(keepAlive);
    connections.delete(connectionId);
  });
});

// Message endpoint - handles MCP JSON-RPC messages
app.post('/message', async (req, res) => {
  const message = req.body;
  console.log('📨 Received message:', JSON.stringify(message, null, 2));

  try {
    // Handle JSON-RPC 2.0 messages
    if (!message.jsonrpc || message.jsonrpc !== '2.0') {
      return res.json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request'
        },
        id: message.id || null
      });
    }

    const { method, params, id } = message;

    // Handle initialize
    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: {
            name: 'monday-mcp-server',
            version: '1.0.0'
          }
        },
        id
      });
    }

    // Handle initialized notification
    if (method === 'notifications/initialized') {
      console.log('✅ Client initialized');
      return res.json({
        jsonrpc: '2.0',
        result: {},
        id
      });
    }

    // Handle tools/list
    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        result: {
          tools: [
            {
              name: 'monday_query',
              description: 'Query Monday.com boards and tasks using GraphQL. Use this to find task owners, check statuses, and get board information.',
              inputSchema: {
                type: 'object',
                properties: {
                  graphqlQuery: {
                    type: 'string',
                    description: 'Complete GraphQL query to execute against Monday.com API'
                  }
                },
                required: ['graphqlQuery']
              }
            }
          ]
        },
        id
      });
    }

    // Handle tools/call
    if (method === 'tools/call') {
      const { name, arguments: args } = params;

      if (name === 'monday_query') {
        const { graphqlQuery } = args;

        console.log('🚀 Executing Monday.com query:', graphqlQuery);

        try {
          const response = await fetch('https://api.monday.com/v2', {
            method: 'POST',
            headers: {
              'Authorization': MONDAY_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: graphqlQuery })
          });

          const data = await response.json();

          console.log('✅ Monday.com response received');

          return res.json({
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(data, null, 2)
                }
              ]
            },
            id
          });
        } catch (error) {
          console.error('❌ Monday.com API error:', error);
          
          return res.json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: `Monday.com API error: ${error.message}`
            },
            id
          });
        }
      }

      // Unknown tool
      return res.json({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: `Unknown tool: ${name}`
        },
        id
      });
    }

    // Handle ping
    if (method === 'ping') {
      return res.json({
        jsonrpc: '2.0',
        result: {},
        id
      });
    }

    // Method not found
    return res.json({
      jsonrpc: '2.0',
      error: {
        code: -32601,
        message: `Method not found: ${method}`
      },
      id
    });

  } catch (error) {
    console.error('❌ Error handling message:', error);
    
    return res.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: `Internal error: ${error.message}`
      },
      id: message.id || null
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════');
  console.log('🚀 Monday.com MCP Server READY');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔗 SSE Endpoint: /sse`);
  console.log(`💬 Message Endpoint: /message`);
  console.log(`🏥 Health Check: /`);
  console.log('═══════════════════════════════════════');
});