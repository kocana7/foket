const express = require('express');
const router = express.Router();
const db = require('../config/database');
const storage = require('../config/database-mssql');

// ----- MSSQL AppStorage API (관리자·메인 페이지용) -----
// GET /api/storage/:key
router.get('/storage/:key', async (req, res) => {
  try {
    const key = req.params.key.replace(/[^a-z0-9_-]/gi, '') || 'markets';
    const value = await storage.queryStorage(key);
    if (value === null && !(await storage.getPool())) {
      return res.status(503).json({ success: false, error: 'MSSQL not configured', value: null });
    }
    res.json({ success: true, value });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/storage  body: { key, value }
router.post('/storage', express.json(), async (req, res) => {
  try {
    const key = (req.body && req.body.key) ? String(req.body.key).replace(/[^a-z0-9_-]/gi, '') : null;
    if (!key) return res.status(400).json({ success: false, error: 'key required' });
    const value = req.body.value != null ? (typeof req.body.value === 'string' ? req.body.value : JSON.stringify(req.body.value)) : '';
    const ok = await storage.saveStorage(key, value);
    if (!ok && !(await storage.getPool())) {
      return res.status(503).json({ success: false, error: 'MSSQL not configured' });
    }
    res.json({ success: true, saved: ok });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/public/markets  (메인 페이지용: markets_published 또는 markets)
router.get('/public/markets', async (req, res) => {
  try {
    let raw = await storage.queryStorage('markets_published');
    if (raw == null) raw = await storage.queryStorage('markets');
    if (raw == null) {
      return res.json({ success: true, data: null });
    }
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/public/settings  (메인 페이지용 설정)
router.get('/public/settings', async (req, res) => {
  try {
    const raw = await storage.queryStorage('settings');
    if (raw == null) return res.json({ success: true, data: {} });
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----- 기존 MySQL 기반 API (DB 없으면 에러 가능) -----
router.get('/signals', async (req, res) => {
  try {
    const tier = req.query.tier || 'free';
    const [signals] = await db.query(
      'SELECT coin, pair, signal_type, entry_price, take_profit_1, stop_loss, risk_percentage, risk_reward_ratio, status, result, created_at FROM signals WHERE tier = ? ORDER BY created_at DESC LIMIT 10',
      [tier]
    );
    res.json({ success: true, data: signals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get stats (public)
router.get('/stats', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT stat_key, stat_value FROM stats');
    const stats = {};
    rows.forEach(r => { stats[r.stat_key] = r.stat_value; });
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get crypto prices (live ticker - placeholder)
router.get('/prices', async (req, res) => {
  // In production, connect to a crypto exchange API
  const mockPrices = [
    { coin: 'BTC', price: 65432.10, change24h: 2.34 },
    { coin: 'ETH', price: 3241.50, change24h: 1.87 },
    { coin: 'BNB', price: 385.20, change24h: -0.54 },
    { coin: 'ADA', price: 0.4521, change24h: 3.12 },
    { coin: 'DOT', price: 8.32, change24h: 1.45 },
    { coin: 'LINK', price: 14.87, change24h: 2.91 },
    { coin: 'XRP', price: 0.6234, change24h: -1.23 },
    { coin: 'LTC', price: 82.41, change24h: 0.87 }
  ];
  res.json({ success: true, data: mockPrices });
});

module.exports = router;
