require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./src/routes/v1/auth.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// API Routes
app.use('/api/v1/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (req, res) => {
  res.json({
    service: 'Medical OCR SaaS Platform',
    version: '5.0.0',
    status: 'running',
    mode: 'demo',
    endpoints: {
      v1: '/api/v1',
      health: '/health',
      portal: '/portal',
    },
  });
});

// Serve frontend
const frontendDist = path.join(__dirname, 'frontend', 'dist');
app.use('/portal', express.static(frontendDist));
app.get('/portal*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// 404
app.use((req, res) => {
  res.status(404).json({ status: 'error', error: { message: 'Not found' } });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📱 Portal: http://localhost:${PORT}/portal`);
  console.log(`🔐 Demo Mode: true`);
  console.log(`\n👤 Demo Credentials:`);
  console.log(`   Admin: admin@demo.com / Admin123!`);
  console.log(`   Operator: operator@demo.com / Operator123!`);
  console.log(`   Viewer: viewer@demo.com / Viewer123!`);
});
