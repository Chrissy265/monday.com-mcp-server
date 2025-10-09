import express from 'express';
import cors from 'cors';

const MONDAY_API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU2MzExNTU4NiwiYWFpIjoxMSwidWlkIjo3OTc1NjYzNiwiaWFkIjoiMjAyNS0wOS0xN1QxMDoyMTowMC4wNzNaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQzMzYwNTUsInJnbiI6ImFwc2UyIn0.HUC69FAKdCCyxnqLIzFDbmpOAjN5l1okwM6jaEE-Eo8';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Helper: Generate GraphQL query based on natural language
function generateQuery(userQuestion) {
  const q = userQuestion.toLowerCase();
  
  // Get current week date range
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  
  const startDate = startOfWeek.toISOString().split('T')[0];
  const endDate = endOfWeek.toISOString().split('T')[0];
  
  // Due this week query
  if (q.includes('due') && (q.includes('week') || q.includes('this week'))) {
    return `
      query {
        boards(limit: 50) {
          id
          name
          items_page(limit: 500) {
            items {
              id
              name
              column_values {
                id
                title
                text
                type
                ... on DateValue {
                  date
                }
                ... on PeopleValue {
                  persons_and_teams {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;
  }
  
  // Owner/assigned queries
  if (q.includes('owner') || q.includes('assigned') || q.includes('who owns')) {
    // Extract task name if mentioned
    const taskMatch = q.match(/(?:of|the|for)\s+([^?]+?)(?:\s+task|\s+meeting|$)/i);
    const taskName = taskMatch ? taskMatch[1].trim() : '';
    
    return `
      query {
        boards(limit: 50) {
          id
          name
          items_page(limit: 500) {
            items {
              id
              name
              column_values {
                id
                title
                text
                ... on PeopleValue {
                  persons_and_teams {
                    id
                    name
                    email
                  }
                }
              }
            }
          }
        }
      }
    `;
  }
  
  // Default: Get all tasks with basic info
  return `
    query {
      boards(limit: 50) {
        id
        name
        items_page(limit: 500) {
          items {
            id
            name
            column_values {
              id
              title
              text
              type
            }
          }
        }
      }
    }
  `;
}

// Helper: Filter and format results
function filterResults(data, userQuestion) {
  const q = userQuestion.toLowerCase();
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  
  let results = [];
  
  // Process all boards
  for (const board of data.boards || []) {
    const items = board.items_page?.items || [];
    
    for (const item of items) {
      // Extract date column
      const dateColumn = item.column_values.find(col => 
        col.type === 'date' || 
        col.title?.toLowerCase().includes('due') ||
        col.title?.toLowerCase().includes('date')
      );
      
      // Extract people column
      const peopleColumn = item.column_values.find(col => 
        col.persons_and_teams && col.persons_and_teams.length > 0
      );
      
      const taskData = {
        board: board.name,
        task: item.name,
        date: dateColumn?.date || dateColumn?.text,
        owner: peopleColumn?.persons_and_teams?.map(p => p.name).join(', ') || 'Unassigned'
      };
      
      // Filter for "due this week"
      if (q.includes('due') && q.includes('week')) {
        if (taskData.date) {
          const taskDate = new Date(taskData.date);
          if (taskDate >= startOfWeek && taskDate <= endOfWeek) {
            results.push(taskData);
          }
        }
      }
      // Filter for owner queries
      else if (q.includes('owner') || q.includes('who owns')) {
        // Check if task name matches
        const taskMatch = q.match(/(?:of|the|for)\s+([^?]+?)(?:\s+task|\s+meeting|$)/i);
        if (taskMatch) {
          const searchTerm = taskMatch[1].trim().toLowerCase();
          if (item.name.toLowerCase().includes(searchTerm)) {
            results.push(taskData);
          }
        } else {
          results.push(taskData);
        }
      }
      // Default: all tasks
      else {
        results.push(taskData);
      }
    }
  }
  
  return results;
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'monday-api-proxy' });
});

app.post('/query', async (req, res) => {
  console.log('📨 Query received:', req.body);
  
  const { query: userQuestion } = req.body;
  
  if (!userQuestion) {
    return res.status(400).json({ error: 'query parameter required' });
  }

  try {
    // Generate appropriate GraphQL query
    const graphqlQuery = generateQuery(userQuestion);
    console.log('🔧 Generated GraphQL:', graphqlQuery.substring(0, 200) + '...');
    
    // Query Monday.com
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': MONDAY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: graphqlQuery })
    });

    const data = await response.json();
    
    if (data.errors) {
      console.error('❌ Monday.com errors:', data.errors);
      return res.status(500).json({ error: 'Monday.com API error', details: data.errors });
    }
    
    // Filter and format results
    const filteredResults = filterResults(data.data, userQuestion);
    
    console.log(`✅ Returning ${filteredResults.length} tasks`);
    
    res.json({
      success: true,
      question: userQuestion,
      results: filteredResults,
      totalTasks: filteredResults.length
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Monday API Proxy running on port ${PORT}`);
});