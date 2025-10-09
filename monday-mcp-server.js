import express from 'express';
import cors from 'cors';

const MONDAY_API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU2MzExNTU4NiwiYWFpIjoxMSwidWlkIjo3OTc1NjYzNiwiaWFkIjoiMjAyNS0wOS0xN1QxMDoyMTowMC4wNzNaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQzMzYwNTUsInJnbiI6ImFwc2UyIn0.HUC69FAKdCCyxnqLIzFDbmpOAjN5l1okwM6jaEE-Eo8';

const app = express();

// CRITICAL: Enhanced CORS for n8n
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT || 10000;

// OPTIONS handler for preflight
app.options('*', cors());

// Store active SSE connections
const connections = new Map();

// Enhanced logging
app.use((req, res, next) => {
  console.log(`🔵 ${req.method} ${req.path} from ${req.ip}`);
  console.log(`   Headers:`, Object.keys(req.headers).join(', '));
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    protocol: 'MCP',
    version: '2024-11-05',
    capabilities: {
      tools: {}
    },
    timestamp: new Date().toISOString()
  });
});

// SSE endpoint with detailed logging
app.get('/sse', (req, res) => {
  console.log('═══════════════════════════════════════');
  console.log('📡 SSE CONNECTION ATTEMPT');
  console.log('   Time:', new Date().toISOString());
  console.log('   IP:', req.ip);
  console.log('   User-Agent:', req.headers['user-agent']);
  console.log('   Origin:', req.headers.origin || 'none');
  console.log('═══════════════════════════════════════');

  // Set headers immediately
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.flushHeaders(); // Flush headers immediately

  const connectionId = Date.now().toString();
  connections.set(connectionId, res);

  console.log(`✅ SSE connection ${connectionId} established`);

  // Send endpoint message
  const endpointMessage = {
    jsonrpc: '2.0',
    method: 'endpoint',
    params: {
      endpoint: '/message'
    }
  };

  try {
    res.write(`data: ${JSON.stringify(endpointMessage)}\n\n`);
    console.log(`📤 Sent endpoint message to ${connectionId}`);
  } catch (error) {
    console.error(`❌ Error sending endpoint message:`, error);
  }

  // Keep-alive ping
  const keepAlive = setInterval(() => {
    try {
      res.write(':ping\n\n');
      console.log(`💓 Ping sent to ${connectionId}`);
    } catch (error) {
      console.error(`❌ Ping failed for ${connectionId}:`, error);
      clearInterval(keepAlive);
    }
  }, 15000);

  // Cleanup on disconnect
  req.on('close', () => {
    console.log(`🔌 SSE connection ${connectionId} closed`);
    clearInterval(keepAlive);
    connections.delete(connectionId);
  });

  req.on('error', (error) => {
    console.error(`❌ SSE connection ${connectionId} error:`, error);
    clearInterval(keepAlive);
    connections.delete(connectionId);
  });
});

// Message endpoint with detailed logging
app.post('/message', async (req, res) => {
  console.log('═══════════════════════════════════════');
  console.log('📨 MESSAGE RECEIVED');
  console.log('   Time:', new Date().toISOString());
  console.log('   Body:', JSON.stringify(req.body, null, 2));
  console.log('═══════════════════════════════════════');

  const message = req.body;

  try {
    if (!message.jsonrpc || message.jsonrpc !== '2.0') {
      console.log('❌ Invalid JSON-RPC format');
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
    console.log(`🎯 Method: ${method}`);

    // Handle initialize
    if (method === 'initialize') {
      console.log('🚀 Handling initialize');
      const response = {
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
      };
      console.log('📤 Sending initialize response');
      return res.json(response);
    }

    // Handle initialized notification
    if (method === 'notifications/initialized') {
      console.log('✅ Client initialized notification received');
      return res.json({
        jsonrpc: '2.0',
        result: {},
        id
      });
    }

    // Handle tools/list
    if (method === 'tools/list') {
      console.log('📋 Handling tools/list');
      const response = {
        jsonrpc: '2.0',
        result: {
          tools: [
            {
              name: 'monday_query',
              description: 'Query Monday.com boards and tasks using GraphQL',
              inputSchema: {
                type: 'object',
                properties: {
                  graphqlQuery: {
                    type: 'string',
                    description: 'Complete GraphQL query to execute'
                  }
                },
                required: ['graphqlQuery']
              }
            }
          ]
        },
        id
      };
      console.log('📤 Sending tools list');
      return res.json(response);
    }

    // Handle tools/call
    if (method === 'tools/call') {
      console.log('🔧 Handling tools/call');
      const { name, arguments: args } = params;
      console.log(`   Tool: ${name}`);
      console.log(`   Args:`, JSON.stringify(args, null, 2));

      if (name === 'monday_query') {
        const { graphqlQuery } = args;

        console.log('🚀 Executing Monday.com query...');

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
          console.log('   Status:', response.status);

          const result = {
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
          };

          console.log('📤 Sending Monday.com results');
          return res.json(result);
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

      console.log(`❌ Unknown tool: ${name}`);
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
      console.log('🏓 Handling ping');
      return res.json({
        jsonrpc: '2.0',
        result: {},
        id
      });
    }

    console.log(`❌ Method not found: ${method}`);
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
  console.log(`⏰ Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════');
});
