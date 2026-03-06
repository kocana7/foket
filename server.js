require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

const db = require('./config/database');
const mainRouter = require('./routes/main');
const adminRouter = require('./routes/admin');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
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

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// 루트(/) 요청 시 public/index.html 제공 (MySQL 없이 메인 페이지 표시, 404 방지)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'foketcrypto-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(flash());

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global middleware: language detection
app.use((req, res, next) => {
  const supportedLangs = ['ko', 'en', 'de', 'ja', 'zh', 'fr', 'es'];

  // Priority: query param > cookie > browser accept-language > default (ko)
  let lang = req.query.lang || req.cookies.lang;

  if (!lang || !supportedLangs.includes(lang)) {
    const acceptLang = req.headers['accept-language'] || '';
    const browserLang = acceptLang.split(',')[0].split('-')[0].toLowerCase();
    lang = supportedLangs.includes(browserLang) ? browserLang : 'ko';
  }

  if (req.query.lang && supportedLangs.includes(req.query.lang)) {
    res.cookie('lang', req.query.lang, { maxAge: 365 * 24 * 60 * 60 * 1000 });
    lang = req.query.lang;
  }

  req.lang = lang;
  res.locals.lang = lang;
  res.locals.supportedLangs = supportedLangs;

  // Load translations
  try {
    res.locals.t = require(`./locales/${lang}.json`);
  } catch (e) {
    res.locals.t = require('./locales/ko.json');
  }

  next();
});

// Flash messages global
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.use('/', mainRouter);
app.use('/admin', adminRouter);
app.use('/api', apiRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Page Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('500', { title: '500 - Server Error', error: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n  CryptoSignals server running on http://localhost:${PORT}`);
  console.log(`  Admin panel: http://localhost:${PORT}/admin`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
