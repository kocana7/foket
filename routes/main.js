const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Homepage
router.get('/', async (req, res) => {
  try {
    const [signals] = await db.query(
      'SELECT * FROM signals WHERE tier = "free" AND status != "cancelled" ORDER BY created_at DESC LIMIT 6'
    );
    const [vipSignals] = await db.query(
      'SELECT * FROM signals ORDER BY created_at DESC LIMIT 4'
    );
    const [plans] = await db.query(
      'SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order ASC'
    );
    const [testimonials] = await db.query(
      'SELECT * FROM testimonials WHERE is_active = 1 ORDER BY sort_order ASC LIMIT 6'
    );
    const [statsRows] = await db.query('SELECT stat_key, stat_value FROM stats');
    const stats = {};
    statsRows.forEach(s => { stats[s.stat_key] = s.stat_value; });

    const [news] = await db.query(
      'SELECT id, title, slug, excerpt, category, featured_image, published_at FROM news WHERE is_published = 1 ORDER BY published_at DESC LIMIT 3'
    );

    const [settings] = await db.query('SELECT setting_key, setting_value FROM settings');
    const siteSettings = {};
    settings.forEach(s => { siteSettings[s.setting_key] = s.setting_value; });

    res.render('index', {
      title: req.t ? req.t.site_title : 'CryptoSignals',
      signals,
      vipSignals,
      plans,
      testimonials,
      stats,
      news,
      siteSettings,
      currentPage: 'home'
    });
  } catch (err) {
    console.error(err);
    res.render('index', {
      title: 'CryptoSignals',
      signals: [],
      vipSignals: [],
      plans: [],
      testimonials: [],
      stats: { total_members: '50,000+', success_rate: '82', signals_delivered: '15,000+', years_active: '10' },
      news: [],
      siteSettings: {},
      currentPage: 'home'
    });
  }
});

// Pricing page
router.get('/pricing', async (req, res) => {
  try {
    const [plans] = await db.query(
      'SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order ASC'
    );
    res.render('pricing', {
      title: 'Pricing Plans',
      plans,
      currentPage: 'pricing'
    });
  } catch (err) {
    console.error(err);
    res.render('pricing', { title: 'Pricing Plans', plans: [], currentPage: 'pricing' });
  }
});

// Crypto signals page
router.get('/crypto-signals', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const offset = (page - 1) * limit;
    const coin = req.query.coin || '';
    const status = req.query.status || '';

    let where = 'WHERE 1=1';
    const params = [];
    if (coin) { where += ' AND coin = ?'; params.push(coin.toUpperCase()); }
    if (status) { where += ' AND status = ?'; params.push(status); }

    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM signals ${where}`, params);
    const [signals] = await db.query(
      `SELECT * FROM signals ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.render('signals', {
      title: 'Crypto Signals',
      signals,
      total,
      page,
      pages: Math.ceil(total / limit),
      coin,
      status,
      currentPage: 'signals'
    });
  } catch (err) {
    console.error(err);
    res.render('signals', { title: 'Crypto Signals', signals: [], total: 0, page: 1, pages: 1, coin: '', status: '', currentPage: 'signals' });
  }
});

// News listing
router.get('/news', async (req, res) => {
  try {
    const [articles] = await db.query(
      'SELECT id, title, slug, excerpt, category, featured_image, published_at FROM news WHERE is_published = 1 ORDER BY published_at DESC LIMIT 12'
    );
    res.render('news', { title: 'Crypto News', articles, currentPage: 'news' });
  } catch (err) {
    console.error(err);
    res.render('news', { title: 'Crypto News', articles: [], currentPage: 'news' });
  }
});

// Single news article
router.get('/news/:slug', async (req, res) => {
  try {
    const [[article]] = await db.query(
      'SELECT * FROM news WHERE slug = ? AND is_published = 1', [req.params.slug]
    );
    if (!article) return res.redirect('/news');

    await db.query('UPDATE news SET views = views + 1 WHERE id = ?', [article.id]);

    const [related] = await db.query(
      'SELECT id, title, slug, excerpt, featured_image, published_at FROM news WHERE is_published = 1 AND id != ? AND category = ? LIMIT 3',
      [article.id, article.category]
    );

    res.render('news-single', { title: article.title, article, related, currentPage: 'news' });
  } catch (err) {
    console.error(err);
    res.redirect('/news');
  }
});

// Contact page
router.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact Us', currentPage: 'contact' });
});

router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    await db.query(
      'INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
      [name, email, subject, message]
    );
    req.flash('success_msg', 'Your message has been sent!');
    res.redirect('/contact');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error sending message. Please try again.');
    res.redirect('/contact');
  }
});

module.exports = router;
