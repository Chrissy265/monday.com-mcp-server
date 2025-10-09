import express from 'express';
import cors from 'cors';

const MONDAY_API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU2MzExNTU4NiwiYWFpIjoxMSwidWlkIjo3OTc1NjYzNiwiaWFkIjoiMjAyNS0wOS0xN1QxMDoyMTowMC4wNzNaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQzMzYwNTUsInJnbiI6ImFwc2UyIn0.HUC69FAKdCCyxnqLIzFDbmpOAjN5l1okwM6jaEE-Eo8';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'monday-api-proxy' });
});

// Simple query endpoint for AI Agent to use
app.post('/query', async (req, res) => {
  console.log('📨 Query received:', req.body);
  
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'query parameter required' });
  }

  try {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': MONDAY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    
    console.log('✅ Monday.com responded');
    res.json(data);
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Monday API Proxy running on port ${PORT}`);
}); 