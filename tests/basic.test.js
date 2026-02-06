const request = require('supertest');
const app = require('../src/app');

describe('Medical OCR SaaS Platform - Basic Tests', () => {

  describe('GET /', () => {
    it('should return service information', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body.service).toBe('Medical OCR SaaS Platform');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.body).toHaveProperty('status');
    });
  });

  describe('GET /api/v1/version', () => {
    it('should return v1 version information', async () => {
      const response = await request(app).get('/api/v1/version');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('apiVersion', 'v1');
      expect(response.body).toHaveProperty('service', 'Medical OCR SaaS Platform');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return error without credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('status', 'error');
    });
  });

  describe('Protected routes', () => {
    it('should return 401 for unauthenticated access to tenants', async () => {
      const response = await request(app).get('/api/v1/tenants');
      expect(response.status).toBe(401);
    });

    it('should return 401 for unauthenticated access to users', async () => {
      const response = await request(app).get('/api/v1/users');
      expect(response.status).toBe(401);
    });

    it('should return 401 for unauthenticated access to api-keys', async () => {
      const response = await request(app).get('/api/v1/api-keys');
      expect(response.status).toBe(401);
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
