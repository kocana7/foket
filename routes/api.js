const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ----- MySQL AppStorage API (관리자·메인 페이지용) -----

// GET /api/storage/:key
router.get('/storage/:key', async (req, res) => {
  try {
    const key = req.params.key.replace(/[^a-z0-9_-]/gi, '') || 'markets';
    const [rows] = await db.query('SELECT value FROM app_storage WHERE `key` = ? LIMIT 1', [key]);
    const value = rows.length ? rows[0].value : null;
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
    await db.query(
      'INSERT INTO app_storage (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()',
      [key, value]
    );
    res.json({ success: true, saved: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/public/markets  (메인 페이지용)
router.get('/public/markets', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT value FROM app_storage WHERE `key` = ? LIMIT 1', ['markets_published']);
    let raw = rows.length ? rows[0].value : null;
    if (!raw) {
      const [rows2] = await db.query('SELECT value FROM app_storage WHERE `key` = ? LIMIT 1', ['markets']);
      raw = rows2.length ? rows2[0].value : null;
    }
    if (raw == null) return res.json({ success: true, data: null });
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/public/settings  (메인 페이지용 설정)
router.get('/public/settings', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT value FROM app_storage WHERE `key` = ? LIMIT 1', ['settings']);
    if (!rows.length) return res.json({ success: true, data: {} });
    const data = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----- 기존 MySQL 기반 API -----
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

router.get('/prices', async (req, res) => {
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

// ----- Telegram Bot API -----

async function getTelegramToken() {
  let token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    const [rows] = await db.query('SELECT value FROM app_storage WHERE `key` = ? LIMIT 1', ['telegram_bot_token']);
    token = rows.length ? rows[0].value : '';
  }
  return token;
}

// GET /api/telegram/status
router.get('/telegram/status', async (req, res) => {
  try {
    const token = await getTelegramToken();
    if (!token) return res.json({ configured: false });
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const j = await r.json();
    if (j.ok) res.json({ configured: true, bot_name: j.result.username });
    else res.json({ configured: false, error: j.description });
  } catch (e) {
    res.json({ configured: false, error: e.message });
  }
});

// POST /api/telegram/send  body: { groups: [...], message: string }
router.post('/telegram/send', express.json(), async (req, res) => {
  try {
    const token = await getTelegramToken();
    if (!token) return res.status(400).json({ success: false, error: '봇 토큰이 설정되지 않았습니다. 관리자 패널에서 봇 토큰을 입력해주세요.' });

    const { groups, message } = req.body;
    if (!Array.isArray(groups) || !groups.length) return res.status(400).json({ success: false, error: 'groups required' });
    if (!message || !message.trim()) return res.status(400).json({ success: false, error: 'message required' });
    if (message.length > 4096) return res.status(400).json({ success: false, error: '메시지가 너무 깁니다 (최대 4096자)' });

    const results = [];
    for (const chatId of groups) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
        });
        const j = await r.json();
        results.push({ group: chatId, ok: j.ok, error: j.description });
      } catch (e) {
        results.push({ group: chatId, ok: false, error: e.message });
      }
    }
    const sent = results.filter(r => r.ok).length;
    res.json({ success: true, sent, total: results.length, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
