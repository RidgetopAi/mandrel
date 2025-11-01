import request from 'supertest';
import express from 'express';
import healthRoutes from '../routes/health';

const app = express();
app.use('/', healthRoutes);

describe('Health Controller', () => {
  test('GET /api/health returns status 200', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);
    
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
  });
});
