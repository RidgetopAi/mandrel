#!/usr/bin/env npx tsx

/**
 * Test script to verify logging format fix
 */

import express from 'express';
import { requestLoggingMiddleware } from './aidis-command/backend/src/middleware/requestLogger';
import { correlationIdMiddleware } from './aidis-command/backend/src/middleware/correlationId';

const app = express();

// Add middleware
app.use(correlationIdMiddleware);
app.use(requestLoggingMiddleware);

// Test route
app.get('/test', (req, res) => {
  res.json({ message: 'Test successful' });
});

// Start server for a quick test
const server = app.listen(3001, () => {
  console.log('Test server running on port 3001');
  
  // Make a test request after a short delay
  setTimeout(async () => {
    try {
      const response = await fetch('http://localhost:3001/test');
      const data = await response.json();
      console.log('Test request completed:', data);
      
      setTimeout(() => {
        server.close();
        console.log('Test server stopped');
        process.exit(0);
      }, 500);
    } catch (error) {
      console.error('Test failed:', error);
      server.close();
      process.exit(1);
    }
  }, 100);
});
