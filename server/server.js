/*require('dotenv').config();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
const path = require('path');
const express = require('express');
const http = require('http');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const menuRoutes = require('./routes/menuRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentInfoRoutes = require('./routes/paymentInfoRoutes');
const supportRoutes = require('./routes/supportRoutes');
const contactInfoRoutes = require('./routes/contactInfoRoutes');
const supplierRoutes = require('./routes/supplierRoutes');

const app = express();
const server = http.createServer(app);

connectDB();
initSocket(server, process.env.CLIENT_URL);

// --- Custom CORS & Preflight Middleware for Vercel Serverless ---
app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:7700',
    'https://rossy-webapp.netlify.app',
    process.env.CLIENT_URL ? process.env.CLIENT_URL.replace(/\/$/, '') : null
  ].filter(Boolean);

  const origin = req.headers.origin;

  if (origin && (allowedOrigins.includes(origin) || origin.endsWith('.netlify.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization, Accept');

  // Intercept and resolve preflight OPTIONS requests immediately
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

app.use(express.json());
app.use(cookieParser());

// ---- API routes (all under /api/...) ----
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment-info', paymentInfoRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/contact-info', contactInfoRoutes);
app.use('/api/supplier', supplierRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ---- Static File Serving ----
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use('/supplier', express.static(path.join(__dirname, '..', 'supplier')));

app.use('/api', notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;*/






require('dotenv').config();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
const path = require('path');
const express = require('express');
const http = require('http');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const menuRoutes = require('./routes/menuRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentInfoRoutes = require('./routes/paymentInfoRoutes');
const supportRoutes = require('./routes/supportRoutes');
const contactInfoRoutes = require('./routes/contactInfoRoutes');
const supplierRoutes = require('./routes/supplierRoutes');

const app = express();
const server = http.createServer(app);

connectDB();
initSocket(server, process.env.CLIENT_URL);

// --- Custom CORS & Preflight Middleware for Vercel Serverless ---
app.use((req, res, next) => {
  /*
  // ORIGINAL RESTRICTIVE CORS CHECKS COMMENTED OUT
  const allowedOrigins = [
    'http://localhost:7700',
    'https://rossy-webapp.netlify.app',
    process.env.CLIENT_URL ? process.env.CLIENT_URL.replace(/\/$/, '') : null
  ].filter(Boolean);

  const origin = req.headers.origin;

  if (origin && (allowedOrigins.includes(origin) || origin.endsWith('.netlify.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  */

  // Allow all origins unconditionally
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization, Accept');

  // Intercept and resolve preflight OPTIONS requests immediately
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

app.use(express.json());
app.use(cookieParser());

// ---- API routes (all under /api/...) ----
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment-info', paymentInfoRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/contact-info', contactInfoRoutes);
app.use('/api/supplier', supplierRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ---- Static File Serving ----
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use('/supplier', express.static(path.join(__dirname, '..', 'supplier')));

app.use('/api', notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
