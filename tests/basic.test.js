const request = require('supertest');
const app = require('../src/app');

describe('Medical OCR Service - Basic Tests', () => {
  
  describe('GET /', () => {
    it('should return service information', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body.service).toBe('Medical OCR Microservice');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('dependencies');
    });
  });

  describe('GET /health/metrics', () => {
    it('should return metrics', async () => {
      const response = await request(app).get('/health/metrics');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('metrics');
      expect(response.body.metrics).toHaveProperty('requests');
      expect(response.body.metrics).toHaveProperty('tokens');
    });
  });

  describe('GET /api/version', () => {
    it('should return version information', async () => {
      const response = await request(app).get('/api/version');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('model');
      expect(response.body.model).toBe('gpt-4o');
    });
  });

  describe('POST /api/visar', () => {
    it('should return error when no file is provided', async () => {
      const response = await request(app)
        .post('/api/visar')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body.error).toHaveProperty('code', 'NO_FILE');
    });
  });

  describe('GET /nonexistent', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/nonexistent');
      
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });
  });
});
