require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

const db = require('./config/database');
const apiRouter = require('./routes/api');

// IP blocking middleware
async function ipBlockMiddleware(req, res, next) {
  if (req.path.startsWith('/api/admin') || req.path.startsWith('/admin')) return next();
  try {
    const ip = req.ip || '';
    if (!ip) return next();
    const [rows] = await db.query('SELECT 1 FROM blocked_ips WHERE ip = ? LIMIT 1', [ip]);
    if (rows.length) return res.status(403).send('Access denied.');
    next();
  } catch (e) { next(); }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Nginx reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.sheetjs.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      connectSrc: ["'self'", "https://api.binance.com", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  }
}));

app.use(cors());
app.use(morgan('dev'));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session (API 인증용)
app.use(session({
  secret: process.env.SESSION_SECRET || 'foketcrypto-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// IP blocking
app.use(ipBlockMiddleware);

// API routes
app.use('/api', apiRouter);

// Admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Static files (index.html, login.html, signup.html 등)
app.use(express.static(path.join(__dirname, 'public')));

// Start server
app.listen(PORT, () => {
  console.log(`\n  Server running on http://localhost:${PORT}`);
  console.log(`  Admin panel: http://localhost:${PORT}/admin`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
