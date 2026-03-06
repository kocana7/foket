const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

// Admin middleware: inject admin user, no i18n
router.use((req, res, next) => {
  res.locals.admin = req.session.admin || null;
  res.locals.adminPage = true;
  next();
});

// LOGIN
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin Login', layout: false });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [[user]] = await db.query(
      "SELECT * FROM users WHERE email = ? AND role IN ('admin','superadmin') AND is_active = 1",
      [email]
    );
    if (!user) {
      req.flash('error_msg', 'Invalid credentials');
      return res.redirect('/admin/login');
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      req.flash('error_msg', 'Invalid credentials');
      return res.redirect('/admin/login');
    }
    req.session.admin = { id: user.id, email: user.email, username: user.username, role: user.role };
    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Login error');
    res.redirect('/admin/login');
  }
});

router.get('/logout', (req, res) => {
  req.session.admin = null;
  res.redirect('/admin/login');
});

// All routes below require admin auth
router.use(requireAdmin);

// DASHBOARD
router.get('/', async (req, res) => {
  try {
    const [[{ totalUsers }]] = await db.query('SELECT COUNT(*) as totalUsers FROM users WHERE role = "user"');
    const [[{ totalSignals }]] = await db.query('SELECT COUNT(*) as totalSignals FROM signals');
    const [[{ activeSignals }]] = await db.query('SELECT COUNT(*) as activeSignals FROM signals WHERE status = "active"');
    const [[{ totalNews }]] = await db.query('SELECT COUNT(*) as totalNews FROM news');
    const [[{ unreadMessages }]] = await db.query('SELECT COUNT(*) as unreadMessages FROM contact_messages WHERE is_read = 0');
    const [recentSignals] = await db.query('SELECT * FROM signals ORDER BY created_at DESC LIMIT 5');
    const [recentUsers] = await db.query('SELECT id, email, username, plan_id, created_at FROM users WHERE role = "user" ORDER BY created_at DESC LIMIT 5');

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: { totalUsers, totalSignals, activeSignals, totalNews, unreadMessages },
      recentSignals,
      recentUsers
    });
  } catch (err) {
    console.error(err);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: { totalUsers: 0, totalSignals: 0, activeSignals: 0, totalNews: 0, unreadMessages: 0 },
      recentSignals: [],
      recentUsers: []
    });
  }
});

// SIGNALS MANAGEMENT
router.get('/signals', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM signals');
    const [signals] = await db.query('SELECT * FROM signals ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    res.render('admin/signals', {
      title: 'Manage Signals',
      signals,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.render('admin/signals', { title: 'Manage Signals', signals: [], total: 0, page: 1, pages: 1 });
  }
});

router.get('/signals/new', (req, res) => {
  res.render('admin/signal-form', { title: 'New Signal', signal: null, action: '/admin/signals' });
});

router.post('/signals', async (req, res) => {
  try {
    const {
      coin, pair, signal_type, entry_price, take_profit_1, take_profit_2, take_profit_3,
      stop_loss, risk_percentage, risk_reward_ratio, leverage, exchange, tier, analysis
    } = req.body;
    await db.query(
      `INSERT INTO signals (coin, pair, signal_type, entry_price, take_profit_1, take_profit_2, take_profit_3,
       stop_loss, risk_percentage, risk_reward_ratio, leverage, exchange, tier, analysis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [coin.toUpperCase(), pair.toUpperCase(), signal_type, entry_price, take_profit_1, take_profit_2 || null,
       take_profit_3 || null, stop_loss, risk_percentage, risk_reward_ratio || null, leverage || null,
       exchange, tier, analysis]
    );
    req.flash('success_msg', 'Signal created successfully');
    res.redirect('/admin/signals');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error creating signal');
    res.redirect('/admin/signals/new');
  }
});

router.get('/signals/:id/edit', async (req, res) => {
  try {
    const [[signal]] = await db.query('SELECT * FROM signals WHERE id = ?', [req.params.id]);
    if (!signal) return res.redirect('/admin/signals');
    res.render('admin/signal-form', { title: 'Edit Signal', signal, action: `/admin/signals/${req.params.id}` });
  } catch (err) {
    res.redirect('/admin/signals');
  }
});

router.post('/signals/:id', async (req, res) => {
  try {
    const {
      coin, pair, signal_type, entry_price, take_profit_1, take_profit_2, take_profit_3,
      stop_loss, risk_percentage, risk_reward_ratio, leverage, exchange, tier, status, result,
      profit_loss_percent, analysis
    } = req.body;
    const closedAt = (status === 'closed' || status === 'cancelled') ? new Date() : null;
    await db.query(
      `UPDATE signals SET coin=?, pair=?, signal_type=?, entry_price=?, take_profit_1=?, take_profit_2=?,
       take_profit_3=?, stop_loss=?, risk_percentage=?, risk_reward_ratio=?, leverage=?, exchange=?,
       tier=?, status=?, result=?, profit_loss_percent=?, analysis=?, closed_at=? WHERE id=?`,
      [coin.toUpperCase(), pair.toUpperCase(), signal_type, entry_price, take_profit_1, take_profit_2 || null,
       take_profit_3 || null, stop_loss, risk_percentage, risk_reward_ratio || null, leverage || null,
       exchange, tier, status, result, profit_loss_percent || null, analysis, closedAt, req.params.id]
    );
    req.flash('success_msg', 'Signal updated successfully');
    res.redirect('/admin/signals');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating signal');
    res.redirect(`/admin/signals/${req.params.id}/edit`);
  }
});

router.post('/signals/:id/delete', async (req, res) => {
  await db.query('DELETE FROM signals WHERE id = ?', [req.params.id]);
  req.flash('success_msg', 'Signal deleted');
  res.redirect('/admin/signals');
});

// NEWS MANAGEMENT
router.get('/news', async (req, res) => {
  try {
    const [articles] = await db.query(
      'SELECT n.*, u.username as author_name FROM news n LEFT JOIN users u ON n.author_id = u.id ORDER BY n.created_at DESC LIMIT 50'
    );
    res.render('admin/news', { title: 'Manage News', articles });
  } catch (err) {
    console.error(err);
    res.render('admin/news', { title: 'Manage News', articles: [] });
  }
});

router.get('/news/new', (req, res) => {
  res.render('admin/news-form', { title: 'New Article', article: null, action: '/admin/news' });
});

router.post('/news', async (req, res) => {
  try {
    const { title, slug, content, excerpt, category, language, is_featured, is_published } = req.body;
    const publishedAt = is_published === '1' ? new Date() : null;
    await db.query(
      `INSERT INTO news (title, slug, content, excerpt, category, language, is_featured, is_published, published_at, author_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, slug, content, excerpt, category, language, is_featured || 0, is_published || 0, publishedAt, req.session.admin.id]
    );
    req.flash('success_msg', 'Article created');
    res.redirect('/admin/news');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error creating article');
    res.redirect('/admin/news/new');
  }
});

router.get('/news/:id/edit', async (req, res) => {
  try {
    const [[article]] = await db.query('SELECT * FROM news WHERE id = ?', [req.params.id]);
    if (!article) return res.redirect('/admin/news');
    res.render('admin/news-form', { title: 'Edit Article', article, action: `/admin/news/${req.params.id}` });
  } catch (err) {
    res.redirect('/admin/news');
  }
});

router.post('/news/:id', async (req, res) => {
  try {
    const { title, slug, content, excerpt, category, language, is_featured, is_published } = req.body;
    const publishedAt = is_published === '1' ? new Date() : null;
    await db.query(
      `UPDATE news SET title=?, slug=?, content=?, excerpt=?, category=?, language=?, is_featured=?, is_published=?, published_at=? WHERE id=?`,
      [title, slug, content, excerpt, category, language, is_featured || 0, is_published || 0, publishedAt, req.params.id]
    );
    req.flash('success_msg', 'Article updated');
    res.redirect('/admin/news');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating article');
    res.redirect(`/admin/news/${req.params.id}/edit`);
  }
});

router.post('/news/:id/delete', async (req, res) => {
  await db.query('DELETE FROM news WHERE id = ?', [req.params.id]);
  req.flash('success_msg', 'Article deleted');
  res.redirect('/admin/news');
});

// USERS MANAGEMENT
router.get('/users', async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT u.*, p.name as plan_name FROM users u LEFT JOIN plans p ON u.plan_id = p.id ORDER BY u.created_at DESC LIMIT 50'
    );
    res.render('admin/users', { title: 'Manage Users', users });
  } catch (err) {
    console.error(err);
    res.render('admin/users', { title: 'Manage Users', users: [] });
  }
});

router.post('/users/:id/toggle', async (req, res) => {
  try {
    await db.query('UPDATE users SET is_active = 1 - is_active WHERE id = ?', [req.params.id]);
    req.flash('success_msg', 'User status updated');
  } catch (err) {
    req.flash('error_msg', 'Error updating user');
  }
  res.redirect('/admin/users');
});

// PLANS MANAGEMENT
router.get('/plans', async (req, res) => {
  try {
    const [plans] = await db.query('SELECT * FROM plans ORDER BY sort_order ASC');
    res.render('admin/plans', { title: 'Manage Plans', plans });
  } catch (err) {
    res.render('admin/plans', { title: 'Manage Plans', plans: [] });
  }
});

router.get('/plans/new', (req, res) => {
  res.render('admin/plan-form', { title: 'New Plan', plan: null, action: '/admin/plans' });
});

router.post('/plans', async (req, res) => {
  try {
    const { name, slug, duration_days, price, currency, signals_per_day_min, signals_per_day_max, is_popular, features } = req.body;
    const featuresArr = features ? features.split('\n').map(f => f.trim()).filter(Boolean) : [];
    await db.query(
      `INSERT INTO plans (name, slug, duration_days, price, currency, signals_per_day_min, signals_per_day_max, is_popular, features)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, slug, duration_days, price, currency || 'USD', signals_per_day_min, signals_per_day_max, is_popular || 0, JSON.stringify(featuresArr)]
    );
    req.flash('success_msg', 'Plan created');
    res.redirect('/admin/plans');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error creating plan');
    res.redirect('/admin/plans/new');
  }
});

router.get('/plans/:id/edit', async (req, res) => {
  try {
    const [[plan]] = await db.query('SELECT * FROM plans WHERE id = ?', [req.params.id]);
    if (!plan) return res.redirect('/admin/plans');
    res.render('admin/plan-form', { title: 'Edit Plan', plan, action: `/admin/plans/${req.params.id}` });
  } catch (err) {
    res.redirect('/admin/plans');
  }
});

router.post('/plans/:id', async (req, res) => {
  try {
    const { name, slug, duration_days, price, currency, signals_per_day_min, signals_per_day_max, is_popular, is_active, features } = req.body;
    const featuresArr = features ? features.split('\n').map(f => f.trim()).filter(Boolean) : [];
    await db.query(
      `UPDATE plans SET name=?, slug=?, duration_days=?, price=?, currency=?, signals_per_day_min=?,
       signals_per_day_max=?, is_popular=?, is_active=?, features=? WHERE id=?`,
      [name, slug, duration_days, price, currency, signals_per_day_min, signals_per_day_max,
       is_popular || 0, is_active || 1, JSON.stringify(featuresArr), req.params.id]
    );
    req.flash('success_msg', 'Plan updated');
    res.redirect('/admin/plans');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating plan');
    res.redirect(`/admin/plans/${req.params.id}/edit`);
  }
});

// MESSAGES
router.get('/messages', async (req, res) => {
  try {
    const [messages] = await db.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 50');
    await db.query('UPDATE contact_messages SET is_read = 1');
    res.render('admin/messages', { title: 'Contact Messages', messages });
  } catch (err) {
    res.render('admin/messages', { title: 'Contact Messages', messages: [] });
  }
});

router.post('/messages/:id/delete', async (req, res) => {
  await db.query('DELETE FROM contact_messages WHERE id = ?', [req.params.id]);
  req.flash('success_msg', 'Message deleted');
  res.redirect('/admin/messages');
});

// SETTINGS
router.get('/settings', async (req, res) => {
  try {
    const [settings] = await db.query('SELECT * FROM settings ORDER BY setting_group, setting_key');
    const grouped = {};
    settings.forEach(s => {
      if (!grouped[s.setting_group]) grouped[s.setting_group] = [];
      grouped[s.setting_group].push(s);
    });
    res.render('admin/settings', { title: 'Site Settings', settings, grouped });
  } catch (err) {
    res.render('admin/settings', { title: 'Site Settings', settings: [], grouped: {} });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await db.query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [value, key]);
    }
    req.flash('success_msg', 'Settings saved');
    res.redirect('/admin/settings');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error saving settings');
    res.redirect('/admin/settings');
  }
});

// TESTIMONIALS
router.get('/testimonials', async (req, res) => {
  try {
    const [testimonials] = await db.query('SELECT * FROM testimonials ORDER BY sort_order ASC');
    res.render('admin/testimonials', { title: 'Testimonials', testimonials });
  } catch (err) {
    res.render('admin/testimonials', { title: 'Testimonials', testimonials: [] });
  }
});

router.post('/testimonials', async (req, res) => {
  try {
    const { name, country, text, rating, plan_name } = req.body;
    await db.query(
      'INSERT INTO testimonials (name, country, text, rating, plan_name) VALUES (?, ?, ?, ?, ?)',
      [name, country, text, rating, plan_name]
    );
    req.flash('success_msg', 'Testimonial added');
    res.redirect('/admin/testimonials');
  } catch (err) {
    req.flash('error_msg', 'Error adding testimonial');
    res.redirect('/admin/testimonials');
  }
});

router.post('/testimonials/:id/delete', async (req, res) => {
  await db.query('DELETE FROM testimonials WHERE id = ?', [req.params.id]);
  req.flash('success_msg', 'Testimonial deleted');
  res.redirect('/admin/testimonials');
});

// STATS
router.post('/stats', async (req, res) => {
  try {
    const { total_members, success_rate, signals_delivered, years_active } = req.body;
    const updates = { total_members, success_rate, signals_delivered, years_active };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        await db.query('INSERT INTO stats (stat_key, stat_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE stat_value = ?', [key, value, value]);
      }
    }
    req.flash('success_msg', 'Stats updated');
    res.redirect('/admin/settings');
  } catch (err) {
    req.flash('error_msg', 'Error updating stats');
    res.redirect('/admin/settings');
  }
});

module.exports = router;
