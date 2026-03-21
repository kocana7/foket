require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const mysql   = require('mysql2/promise');
const path    = require('path');
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.use(cors());
app.use(express.json());

// ── 요청 로거 ────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | auth:${req.headers['authorization'] ? 'yes' : 'no'}`);
  }
  next();
});

// ── 정적 파일 서빙 ────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'main.html')));

// ── 설정 ──────────────────────────────────────────────────
const JWT_SECRET       = process.env.JWT_SECRET       || 'foket-jwt-secret-change-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const PORT             = process.env.PORT              || 4000;
const BOT_EMAIL_CONST  = 'superfoket@foket.com'; // 수퍼포켓 봇 이메일 (잔액 차감 제외용)

// ── MySQL 연결 풀 ─────────────────────────────────────────
const pool = mysql.createPool({
  host:              process.env.DB_SERVER   || 'localhost',
  database:          process.env.DB_NAME     || 'FoketDB',
  user:              process.env.DB_USER     || 'foket_app',
  password:          process.env.DB_PASS     || 'Foket2026',
  waitForConnections: true,
  connectionLimit:   10,
  charset:           'utf8mb4'
});

async function getPool() {
  return pool;
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ── 헬퍼 ─────────────────────────────────────────────────
function makeToken(user) {
  return jwt.sign({ userId: String(user.user_id), email: user.email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket?.remoteAddress
      || req.ip
      || 'unknown';
}

// ── 차단 IP 관리 (메모리 캐시) ─────────────────────────────
let _blockedIps = new Set();
async function refreshBlockedIps() {
  try {
    const db = await getPool();
    const [rows] = await db.execute('SELECT ip FROM BlockedIPs');
    _blockedIps = new Set(rows.map(r => r.ip));
  } catch {}
}

function ipBlockMiddleware(req, res, next) {
  const ip = getClientIp(req);
  if (_blockedIps.has(ip)) {
    return res.status(403).json({ error: '접속이 차단된 IP입니다' });
  }
  next();
}
// 관리자 API를 제외한 모든 경로에 차단 미들웨어 적용
app.use((req, res, next) => {
  if (req.path.startsWith('/api/admin')) return next();
  return ipBlockMiddleware(req, res, next);
});

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: '인증 필요' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '토큰 만료 또는 유효하지 않음' });
  }
}

function adminMiddleware(req, res, next) {
  const header = req.headers['x-admin-key'];
  if (header === (process.env.ADMIN_KEY || 'foket-admin-2026')) return next();
  res.status(403).json({ error: '관리자 권한 없음' });
}

// ── 닉네임 중복 확인 ──────────────────────────────────────
app.get('/api/check-nickname', async (req, res) => {
  const { nickname } = req.query;
  if (!nickname || nickname.trim().length < 2)
    return res.json({ available: false, reason: '닉네임은 2자 이상이어야 합니다' });
  if (nickname.trim().length > 20)
    return res.json({ available: false, reason: '닉네임은 20자 이하여야 합니다' });
  try {
    const db = await getPool();
    const [rows] = await db.execute('SELECT user_id FROM Users WHERE nickname = ?', [nickname.trim()]);
    res.json({ available: rows.length === 0 });
  } catch (err) {
    res.status(500).json({ available: false, reason: '서버 오류' });
  }
});

// ── 닉네임 설정 ───────────────────────────────────────────
app.post('/api/set-nickname', authMiddleware, async (req, res) => {
  const { nickname } = req.body;
  if (!nickname || nickname.trim().length < 2)
    return res.status(400).json({ error: '닉네임은 2자 이상이어야 합니다' });
  if (nickname.trim().length > 20)
    return res.status(400).json({ error: '닉네임은 20자 이하여야 합니다' });
  try {
    const db = await getPool();
    const [dup] = await db.execute('SELECT user_id FROM Users WHERE nickname = ? AND user_id <> ?', [nickname.trim(), req.user.userId]);
    if (dup.length > 0)
      return res.status(409).json({ error: '이미 사용 중인 닉네임입니다' });
    await db.execute('UPDATE Users SET nickname = ?, updated_at = NOW() WHERE user_id = ?', [nickname.trim(), req.user.userId]);
    res.json({ ok: true, nickname: nickname.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 이메일 회원가입 ───────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { full_name, email, password, nickname } = req.body;
  if (!full_name || !email || !password)
    return res.status(400).json({ error: '이름, 이메일, 비밀번호를 입력하세요' });
  if (password.length < 8)
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다' });
  if (!nickname || nickname.trim().length < 2)
    return res.status(400).json({ error: '닉네임은 2자 이상이어야 합니다' });
  if (nickname.trim().length > 20)
    return res.status(400).json({ error: '닉네임은 20자 이하여야 합니다' });

  try {
    const db = await getPool();

    const [existing] = await db.execute('SELECT user_id FROM Users WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다' });

    const [nickDup] = await db.execute('SELECT user_id FROM Users WHERE nickname = ?', [nickname.trim()]);
    if (nickDup.length > 0)
      return res.status(409).json({ error: '이미 사용 중인 닉네임입니다' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      'INSERT INTO Users (email, password_hash, full_name, nickname, kyc_status, status) VALUES (?, ?, ?, ?, ?, ?)',
      [email, hash, full_name, nickname.trim(), 'PENDING', 'ACTIVE']
    );

    const user = { user_id: result.insertId, email, full_name, nickname: nickname.trim() };
    const token = makeToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 이메일 로그인 ─────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요' });

  try {
    const db = await getPool();
    const [rows] = await db.execute(
      'SELECT user_id, email, full_name, nickname, password_hash, status FROM Users WHERE email = ?',
      [email]
    );

    if (rows.length === 0)
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });

    const user = rows[0];
    if (user.status === 'SUSPENDED')
      return res.status(403).json({ error: '정지된 계정입니다. 고객센터에 문의하세요' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });

    const loginIp = getClientIp(req);
    await db.execute('UPDATE Users SET last_login_at = NOW(), last_login_ip = ? WHERE user_id = ?', [loginIp, user.user_id]);

    const token = makeToken(user);
    res.json({ token, user: { user_id: user.user_id, email: user.email, full_name: user.full_name, nickname: user.nickname } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── Google 로그인/회원가입 ────────────────────────────────
app.post('/api/google-auth', async (req, res) => {
  const { credential } = req.body;
  if (!credential)
    return res.status(400).json({ error: 'Google 토큰이 없습니다' });
  if (!GOOGLE_CLIENT_ID)
    return res.status(500).json({ error: 'Google Client ID가 설정되지 않았습니다' });

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { email, name, sub: googleSub } = payload;

    const db = await getPool();
    const [existing] = await db.execute(
      'SELECT user_id, email, full_name, nickname, status FROM Users WHERE email = ?', [email]
    );

    let user;
    if (existing.length > 0) {
      user = existing[0];
      if (user.status === 'SUSPENDED')
        return res.status(403).json({ error: '정지된 계정입니다' });
      const googleLoginIp = getClientIp(req);
      await db.execute('UPDATE Users SET last_login_at = NOW(), last_login_ip = ? WHERE user_id = ?', [googleLoginIp, user.user_id]);
    } else {
      const [result] = await db.execute(
        'INSERT INTO Users (email, password_hash, full_name, kyc_status, status) VALUES (?, ?, ?, ?, ?)',
        [email, googleSub, name || email.split('@')[0], 'PENDING', 'ACTIVE']
      );
      user = { user_id: result.insertId, email, full_name: name || email.split('@')[0], nickname: null };
    }

    const token = makeToken(user);
    res.json({ token, user: { user_id: user.user_id, email: user.email, full_name: user.full_name, nickname: user.nickname }, isNew: !existing.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Google 인증 실패' });
  }
});

// ── 내 정보 ───────────────────────────────────────────────
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const [rows] = await db.execute(
      'SELECT user_id, email, full_name, nickname, grade, balance, kyc_status, status, created_at FROM Users WHERE user_id = ?',
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: '회원 없음' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: 회원 목록 ─────────────────────────────────────
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
  const { q, status, grade, page = 1, limit = 50 } = req.query;
  try {
    const db = await getPool();
    let where = 'WHERE 1=1';
    const params = [];

    if (q) {
      where += ' AND (u.email LIKE ? OR u.full_name LIKE ? OR CAST(u.user_id AS CHAR) LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status && status !== 'all') { where += ' AND u.status = ?'; params.push(status); }
    if (grade  && grade  !== 'all') { where += ' AND u.grade = ?';  params.push(grade); }

    const lim = parseInt(limit) || 50;
    const offset = (parseInt(page) - 1) * lim;
    const [rows] = await db.execute(
      `SELECT u.user_id, u.email, u.full_name, u.nickname, u.grade, u.balance,
              u.kyc_status, u.status, u.created_at, u.last_seen_at, u.last_login_ip
       FROM Users u ${where}
       ORDER BY u.created_at DESC LIMIT ${lim} OFFSET ${offset}`,
      params
    );

    res.json({ users: rows, total: rows.length });
  } catch (err) {
    console.error('[admin/users]', err.code, err.message);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: 회원 정보 수정 ────────────────────────────────
app.patch('/api/admin/users/:id', adminMiddleware, async (req, res) => {
  const { full_name, email, nickname, grade, balance } = req.body;
  const fields = [];
  const params = [];

  if (full_name !== undefined) { fields.push('full_name = ?'); params.push(full_name); }
  if (email     !== undefined) { fields.push('email = ?');     params.push(email); }
  if (nickname  !== undefined) { fields.push('nickname = ?');  params.push(nickname); }
  if (grade     !== undefined) { fields.push('grade = ?');     params.push(grade); }
  if (balance   !== undefined) { fields.push('balance = ?');   params.push(balance); }

  if (!fields.length) return res.status(400).json({ error: '수정할 항목이 없습니다' });

  try {
    const db = await getPool();
    await db.execute(
      `UPDATE Users SET ${fields.join(', ')}, updated_at = NOW() WHERE user_id = ?`,
      [...params, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: 회원 상태 변경 ────────────────────────────────
app.patch('/api/admin/users/:id/status', adminMiddleware, async (req, res) => {
  const { status } = req.body;
  if (!['ACTIVE', 'SUSPENDED', 'FLAGGED'].includes(status))
    return res.status(400).json({ error: '유효하지 않은 상태값' });
  try {
    const db = await getPool();
    await db.execute('UPDATE Users SET status = ?, updated_at = NOW() WHERE user_id = ?', [status, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: 회원 강제탈퇴 ────────────────────────────────
app.delete('/api/admin/users/:id', adminMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await db.execute('DELETE FROM Questions WHERE user_id = ?', [req.params.id]);
    await db.execute('DELETE FROM Users WHERE user_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: IP 차단 ────────────────────────────────────────
app.post('/api/admin/users/:id/block-ip', adminMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const [users] = await db.execute('SELECT last_login_ip FROM Users WHERE user_id = ?', [req.params.id]);
    if (!users.length || !users[0].last_login_ip)
      return res.status(400).json({ error: '해당 회원의 접속 IP가 없습니다' });
    const ip = users[0].last_login_ip;
    await db.execute(
      'INSERT INTO BlockedIPs (ip, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)',
      [ip, req.params.id]
    );
    await refreshBlockedIps();
    res.json({ ok: true, ip });
  } catch (err) {
    console.error('[block-ip]', err.message);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: IP 차단 해제 ──────────────────────────────────
app.delete('/api/admin/blocked-ips/:ip', adminMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await db.execute('DELETE FROM BlockedIPs WHERE ip = ?', [req.params.ip]);
    await refreshBlockedIps();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: 차단된 IP 목록 ────────────────────────────────
app.get('/api/admin/blocked-ips', adminMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const [rows] = await db.execute('SELECT ip, user_id, blocked_at FROM BlockedIPs ORDER BY blocked_at DESC');
    res.json({ blocked_ips: rows });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── Heartbeat ─────────────────────────────────────────────
app.post('/api/heartbeat', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await db.execute('UPDATE Users SET last_seen_at = NOW() WHERE user_id = ?', [req.user.userId]);
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

// ── 공개 질문 목록 (승인된 질문만) ───────────────────────
app.get('/api/questions', async (req, res) => {
  const { category } = req.query;
  // 선택적 인증: 로그인 회원이면 자신의 질문에 is_mine 플래그 부여
  let currentUserId = null;
  try {
    const hdr = req.headers['authorization'];
    if (hdr) currentUserId = String(jwt.verify(hdr.replace('Bearer ', ''), JWT_SECRET).userId);
  } catch { /* 미로그인 또는 만료 토큰 → 무시 */ }

  try {
    const db = await getPool();
    let where = "WHERE q.status = 'APPROVED'";
    const params = [];
    if (category) { where += ' AND q.category = ?'; params.push(category); }
    const [rows] = await db.execute(
      `SELECT q.question_id, q.user_id, q.type, q.question, q.category,
              q.options, q.initial_prob, q.end_date, q.created_at,
              u.nickname,
              (SELECT COUNT(*) FROM Participations p WHERE p.question_id = q.question_id) AS participant_count
       FROM Questions q
       LEFT JOIN Users u ON q.user_id = u.user_id
       ${where}
       ORDER BY q.created_at DESC`,
      params
    );
    // 선택지별 참여 수 조회
    if (rows.length > 0) {
      const qIds = rows.map(r => r.question_id);
      const placeholders = qIds.map(() => '?').join(',');
      const [choices] = await db.execute(
        `SELECT question_id, choice, COUNT(*) AS cnt
         FROM Participations WHERE question_id IN (${placeholders})
         GROUP BY question_id, choice`,
        qIds
      );
      const choiceMap = {};
      choices.forEach(c => {
        if (!choiceMap[c.question_id]) choiceMap[c.question_id] = {};
        choiceMap[c.question_id][c.choice] = Number(c.cnt);
      });
      rows.forEach(r => {
        r.choices = choiceMap[r.question_id] || {};
        r.is_mine = currentUserId ? String(r.user_id) === currentUserId : false;
      });
    } else {
      rows.forEach(r => { r.choices = {}; r.is_mine = false; });
    }
    res.json({ questions: rows });
  } catch (err) {
    console.error('[questions GET]', err.message);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 질문 등록 ─────────────────────────────────────────────
app.post('/api/questions', authMiddleware, async (req, res) => {
  const { type, question, category, options, initial_prob, end_date } = req.body;
  if (!type || !question || !category || !end_date)
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요' });
  if (!['vote', 'bet'].includes(type))
    return res.status(400).json({ error: '질문 유형이 올바르지 않습니다' });
  if (question.trim().length < 5)
    return res.status(400).json({ error: '질문은 5자 이상 입력하세요' });
  if (type === 'vote' && (!options || options.length < 2))
    return res.status(400).json({ error: '투표 선택지를 2개 이상 입력하세요' });
  try {
    const db = await getPool();

    // 수퍼포켓 봇 제외 — 잔액 차감
    const [userRows] = await db.execute('SELECT email, balance FROM Users WHERE user_id = ?', [req.user.userId]);
    if (!userRows.length) return res.status(404).json({ error: '회원 정보를 찾을 수 없습니다' });
    const user = userRows[0];
    if (user.email !== BOT_EMAIL_CONST) {
      const cost = type === 'vote' ? 1 : 2;
      if ((user.balance || 0) < cost)
        return res.status(402).json({ error: `잔액이 부족합니다. ${type === 'vote' ? '투표' : '내기'} 질문 등록에는 ${cost}F가 필요합니다.` });
      await db.execute('UPDATE Users SET balance = balance - ? WHERE user_id = ?', [cost, req.user.userId]);
    }

    const optionsJson = options ? JSON.stringify(options) : null;
    const prob = (type === 'bet') ? (initial_prob || 50) : null;
    const [result] = await db.execute(
      'INSERT INTO Questions (user_id, type, question, category, options, initial_prob, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.userId, type, question.trim(), category, optionsJson, prob, new Date(end_date), 'PENDING']
    );
    res.json({ ok: true, question_id: result.insertId });
  } catch (err) {
    console.error('[questions POST]', err.message);
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
});

// ── 관리자: 질문 목록 ─────────────────────────────────────
app.get('/api/admin/questions', adminMiddleware, async (req, res) => {
  const { category, type, status } = req.query;
  try {
    const db = await getPool();
    let where = 'WHERE 1=1';
    const params = [];
    if (category) { where += ' AND q.category = ?'; params.push(category); }
    if (type)     { where += ' AND q.type = ?';     params.push(type); }
    if (status)   { where += ' AND q.status = ?';   params.push(status); }

    const [rows] = await db.execute(
      `SELECT q.question_id, q.user_id, q.type, q.question, q.category,
              q.options, q.initial_prob, q.end_date, q.status, q.created_at,
              u.email, u.nickname, u.full_name,
              (SELECT COUNT(*) FROM Participations p WHERE p.question_id = q.question_id) AS participant_count
       FROM Questions q
       LEFT JOIN Users u ON q.user_id = u.user_id
       ${where}
       ORDER BY q.created_at DESC`,
      params
    );

    // choices 집계 (question_id, choice, count)
    if (rows.length > 0) {
      const ids = rows.map(r => r.question_id);
      const placeholders = ids.map(() => '?').join(',');
      const [choiceRows] = await db.execute(
        `SELECT question_id, choice, COUNT(*) AS cnt FROM Participations WHERE question_id IN (${placeholders}) GROUP BY question_id, choice`,
        ids
      );
      const choiceMap = {};
      choiceRows.forEach(r => {
        if (!choiceMap[r.question_id]) choiceMap[r.question_id] = {};
        choiceMap[r.question_id][r.choice] = Number(r.cnt);
      });
      rows.forEach(r => { r.choices = choiceMap[r.question_id] || {}; });
    }

    res.json({ questions: rows });
  } catch (err) {
    console.error('[admin/questions GET]', err.message);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: 질문 상태 변경 ────────────────────────────────
app.patch('/api/admin/questions/:id/status', adminMiddleware, async (req, res) => {
  const { status } = req.body;
  if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status))
    return res.status(400).json({ error: '유효하지 않은 상태값' });
  try {
    const db = await getPool();
    await db.execute('UPDATE Questions SET status = ? WHERE question_id = ?', [status, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/questions PATCH]', err.message);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: 질문 삭제 ─────────────────────────────────────
app.delete('/api/admin/questions/:id', adminMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await db.execute('DELETE FROM Questions WHERE question_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/questions DELETE]', err.message);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 공개 설정 ─────────────────────────────────────────────
app.get('/api/public-config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID || '' });
});

// ── DB 초기화 (테이블 없으면 생성, 컬럼 누락 시 추가) ────
async function initDb() {
  try {
    const db = await getPool();

    await db.execute(`
      CREATE TABLE IF NOT EXISTS Users (
        user_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
        email         VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        full_name     VARCHAR(100),
        nickname      VARCHAR(50) UNIQUE,
        grade         VARCHAR(20)  DEFAULT 'BASIC',
        balance       DECIMAL(18,2) DEFAULT 0,
        kyc_status    VARCHAR(20)  DEFAULT 'PENDING',
        status        VARCHAR(20)  DEFAULT 'ACTIVE',
        last_login_at DATETIME,
        last_seen_at  DATETIME,
        created_at    DATETIME     DEFAULT NOW(),
        updated_at    DATETIME     DEFAULT NOW()
      ) CHARACTER SET utf8mb4
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS Questions (
        question_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id      BIGINT NOT NULL,
        type         VARCHAR(10)  NOT NULL,
        question     VARCHAR(500) NOT NULL,
        category     VARCHAR(50),
        options      LONGTEXT,
        initial_prob INT,
        end_date     DATETIME,
        status       VARCHAR(20)  DEFAULT 'PENDING',
        created_at   DATETIME     DEFAULT NOW()
      ) CHARACTER SET utf8mb4
    `);

    // 기존 테이블에 누락된 컬럼 추가 마이그레이션
    const [cols] = await db.execute(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'Users'`
    );
    const existing = new Set(cols.map(c => c.column_name || c.COLUMN_NAME));

    const migrations = [
      { name: 'grade',          sql: "ALTER TABLE Users ADD COLUMN grade VARCHAR(20) DEFAULT 'BASIC'" },
      { name: 'balance',        sql: 'ALTER TABLE Users ADD COLUMN balance DECIMAL(18,2) DEFAULT 0' },
      { name: 'kyc_status',     sql: "ALTER TABLE Users ADD COLUMN kyc_status VARCHAR(20) DEFAULT 'PENDING'" },
      { name: 'status',         sql: "ALTER TABLE Users ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE'" },
      { name: 'last_login_at',  sql: 'ALTER TABLE Users ADD COLUMN last_login_at DATETIME' },
      { name: 'last_seen_at',   sql: 'ALTER TABLE Users ADD COLUMN last_seen_at DATETIME' },
      { name: 'updated_at',     sql: 'ALTER TABLE Users ADD COLUMN updated_at DATETIME DEFAULT NOW()' },
      { name: 'last_login_ip',  sql: 'ALTER TABLE Users ADD COLUMN last_login_ip VARCHAR(45)' },
    ];

    for (const m of migrations) {
      if (!existing.has(m.name)) {
        await db.execute(m.sql);
        console.log(`컬럼 추가: Users.${m.name}`);
      }
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS Participations (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        question_id BIGINT NOT NULL,
        user_id     BIGINT NOT NULL,
        choice      VARCHAR(500),
        created_at  DATETIME DEFAULT NOW(),
        INDEX idx_user_question (user_id, question_id)
      ) CHARACTER SET utf8mb4
    `);

    // 기존 UNIQUE 제약 제거 (수퍼포켓 중복 참여 허용)
    const [pidx] = await db.execute(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Participations' AND INDEX_NAME = 'uq_user_question'`
    );
    if (pidx.length > 0) {
      await db.execute('ALTER TABLE Participations DROP INDEX uq_user_question');
      console.log('Participations UNIQUE 제약 제거 완료');
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS BlockedIPs (
        id         BIGINT AUTO_INCREMENT PRIMARY KEY,
        ip         VARCHAR(45) NOT NULL UNIQUE,
        user_id    BIGINT,
        blocked_at DATETIME DEFAULT NOW()
      ) CHARACTER SET utf8mb4
    `);

    console.log('DB 초기화 완료 (Users, Questions, Participations, BlockedIPs 테이블 확인)');
  } catch (err) {
    console.error('DB 초기화 실패:', err.message);
  }
}

// ── 수퍼포켓 봇 ───────────────────────────────────────────
const BOT_EMAIL = 'superfoket@foket.com';
const BOT_FULLNAME = 'SuperFoket'; // 수퍼포켓

// 언어별 닉네임 + 해당 언어로 작성된 질문 풀
const BOT_LANG_DATA = {

  ko: {
    nicknames: ['달빛나그네','새벽별','바람의노래','은하수여행자','자정의시인','봄날의기억'],
    questions: [
      { type:'bet',  category:'politics', question:'이재명 대통령 국정 지지율이 2분기에 50%를 돌파할까요?', initial_prob:52, days:30 },
      { type:'vote', category:'politics', question:'2026년 상반기 가장 중요한 정치 이슈는?', options:['경제 정책','외교 안보','복지 확대','교육 개혁','환경 정책'], days:20 },
      { type:'bet',  category:'politics', question:'6·25 기념일 전 남북 대화 채널이 재개될까요?', initial_prob:31, days:60 },
      { type:'bet',  category:'sports', question:'손흥민이 2025-26 시즌 EPL에서 15골 이상 넣을까요?', initial_prob:58, days:60 },
      { type:'vote', category:'sports', question:'2026 FIFA 월드컵 한국의 최종 성적은?', options:['16강','8강','4강','결승','우승'], days:90 },
      { type:'bet',  category:'culture', question:'BTS가 2026년 완전체 컴백 앨범을 발표할까요?', initial_prob:71, days:60 },
      { type:'vote', category:'culture', question:'2026년 최고의 K-팝 걸그룹은?', options:['블랙핑크','NewJeans','aespa','IVE','LE SSERAFIM'], days:30 },
      { type:'bet',  category:'trading', question:'코스피 지수가 올해 2,800선을 회복할까요?', initial_prob:48, days:90 },
      { type:'bet',  category:'trading', question:'삼성전자 주가가 연내 8만원을 돌파할까요?', initial_prob:41, days:120 },
      { type:'bet',  category:'economy', question:'한국은행이 올해 기준금리를 추가 인하할까요?', initial_prob:66, days:45 },
      { type:'vote', category:'economy', question:'2026년 서울 아파트 가격 전망은?', options:['10% 이상 상승','5~10% 상승','보합','5~10% 하락','10% 이상 하락'], days:30 },
      { type:'bet',  category:'weather', question:'서울 2026년 7월 최고기온이 38도를 넘을까요?', initial_prob:63, days:90 },
      { type:'bet',  category:'science', question:'삼성 갤럭시 S27이 온디바이스 AI로 주목받을까요?', initial_prob:68, days:60 },
      { type:'vote', category:'science', question:'AI가 가장 먼저 대체할 직종은?', options:['콜센터 상담원','번역가','회계사','의료 진단','콘텐츠 제작'], days:25 },
      { type:'vote', category:'neighbor', question:'우리 동네에 가장 필요한 편의시설은?', options:['카페·베이커리','공원·녹지','헬스장','도서관','어린이집'], days:14 },
      { type:'bet',  category:'etc', question:'2026년 한국 출산율이 소폭 반등(0.8 이상)할까요?', initial_prob:34, days:60 },
    ]
  },

  en: {
    nicknames: ['MidnightDrifter','StarChaser','DawnWhisper','NeonSage','CrimsonTide','LunarEcho','SilverLining','EmberGlow','VoidWalker','StormRider'],
    questions: [
      { type:'bet',  category:'politics', question:'Will Trump impose additional tariffs on EU goods before end of 2026?', initial_prob:61, days:45 },
      { type:'vote', category:'politics', question:'Who will be the biggest geopolitical story of 2026?', options:['US-China tensions','Russia-Ukraine','Middle East crisis','NATO expansion','AI governance'], days:30 },
      { type:'bet',  category:'sports', question:'Will the Golden State Warriors make the NBA playoffs in 2026?', initial_prob:44, days:60 },
      { type:'vote', category:'sports', question:'Who wins the 2026 FIFA World Cup?', options:['Brazil','France','England','Germany','Argentina'], days:90 },
      { type:'bet',  category:'culture', question:'Will a Marvel film top the global box office in 2026?', initial_prob:67, days:60 },
      { type:'vote', category:'culture', question:'Best streaming platform of 2026?', options:['Netflix','Disney+','Apple TV+','HBO Max','Amazon Prime'], days:20 },
      { type:'bet',  category:'trading', question:'Will Bitcoin exceed $120,000 by end of 2026?', initial_prob:53, days:90 },
      { type:'bet',  category:'trading', question:'Will the S&P 500 hit 6,000 points in 2026?', initial_prob:58, days:60 },
      { type:'bet',  category:'economy', question:'Will the US Fed cut interest rates twice in 2026?', initial_prob:62, days:45 },
      { type:'vote', category:'economy', question:'Biggest economic risk for the US in 2026?', options:['Inflation resurgence','Recession','Dollar weakening','Trade war','Tech bubble'], days:25 },
      { type:'bet',  category:'science', question:'Will GPT-5 be publicly released in the first half of 2026?', initial_prob:64, days:40 },
      { type:'vote', category:'science', question:'Which tech trend will dominate 2026?', options:['Generative AI','Quantum computing','Humanoid robots','Self-driving cars','Biotech'], days:20 },
      { type:'bet',  category:'statement', question:'Will Elon Musk sell X (Twitter) in 2026?', initial_prob:18, days:90 },
      { type:'vote', category:'statement', question:'Most controversial tech CEO statement of 2026?', options:['Elon Musk','Sam Altman','Jensen Huang','Mark Zuckerberg','Tim Cook'], days:15 },
      { type:'bet',  category:'weather', question:'Will a Category 5 hurricane hit the US mainland in 2026?', initial_prob:35, days:120 },
      { type:'vote', category:'etc', question:'Most used word of 2026?', options:['AI','Recession','Humanoid','Quantum','Autonomous'], days:30 },
    ]
  },

  ja: {
    nicknames: ['夜明けの星','風の詩人','銀河の旅人','月の影','静かな森','夢見る鯨'],
    questions: [
      { type:'bet',  category:'politics', question:'2026年の参議院選挙で自民党は過半数を維持できるでしょうか？', initial_prob:54, days:60 },
      { type:'vote', category:'politics', question:'2026年の日本の最重要政治課題は？', options:['経済再生','少子化対策','安全保障','デジタル化','環境政策'], days:20 },
      { type:'bet',  category:'sports', question:'大谷翔平が2026年のMLBシーズンで50本塁打以上を達成するでしょうか？', initial_prob:61, days:90 },
      { type:'vote', category:'sports', question:'2026年のWBCで最も優勝候補の国は？', options:['日本','アメリカ','ドミニカ共和国','プエルトリコ','韓国'], days:40 },
      { type:'bet',  category:'culture', question:'2026年に日本のアニメ映画が世界興行収入トップ10に入るでしょうか？', initial_prob:72, days:60 },
      { type:'vote', category:'culture', question:'2026年最も注目される日本のエンタメは？', options:['アニメ','J-POP','ゲーム','映画','マンガ'], days:25 },
      { type:'bet',  category:'economy', question:'日本銀行が2026年中に利上げを実施するでしょうか？', initial_prob:67, days:45 },
      { type:'vote', category:'economy', question:'2026年の日本経済の最大リスクは？', options:['円安加速','インフレ長期化','少子化による労働力不足','中国経済の減速','エネルギー価格上昇'], days:30 },
      { type:'bet',  category:'trading', question:'日経平均が2026年に45,000円を突破するでしょうか？', initial_prob:47, days:90 },
      { type:'bet',  category:'science', question:'ソニーが2026年にAIロボット製品を一般向けに発売するでしょうか？', initial_prob:38, days:60 },
      { type:'vote', category:'science', question:'2026年最もブレイクするテクノロジーは？', options:['生成AI','量子コンピュータ','自動運転','人型ロボット','宇宙旅行'], days:20 },
      { type:'bet',  category:'weather', question:'2026年の夏、東京で40度以上の気温が記録されるでしょうか？', initial_prob:55, days:90 },
      { type:'vote', category:'etc', question:'2026年最も流行る日本の食トレンドは？', options:['発酵食品','プラントベース','高級おにぎり','クラフトコーヒー','昆虫食'], days:20 },
    ]
  },

  zh: {
    nicknames: ['星光旅人','晨曦之影','云端漫步','月下独行','风中低语'],
    questions: [
      { type:'bet',  category:'politics', question:'中美关系在2026年下半年会出现重大缓和吗？', initial_prob:34, days:60 },
      { type:'vote', category:'politics', question:'2026年最影响中国外交格局的因素是？', options:['台湾问题','南海争端','中美贸易战','一带一路','俄乌局势'], days:30 },
      { type:'bet',  category:'trading', question:'上证指数2026年能否突破4000点？', initial_prob:42, days:90 },
      { type:'vote', category:'trading', question:'2026年中国最具投资价值的板块是？', options:['人工智能','新能源','半导体','消费品','生物医药'], days:25 },
      { type:'bet',  category:'economy', question:'中国2026年GDP增速能否达到5%以上？', initial_prob:56, days:60 },
      { type:'vote', category:'economy', question:'2026年中国经济的最大挑战是？', options:['房地产危机','通货紧缩','人口老龄化','科技封锁','内需不足'], days:20 },
      { type:'bet',  category:'science', question:'华为在2026年能否量产7nm以下芯片？', initial_prob:49, days:90 },
      { type:'vote', category:'science', question:'2026年中国最突破性的科技成就会是？', options:['量子计算','人工智能','航天探月','核聚变','新能源汽车'], days:30 },
      { type:'bet',  category:'sports', question:'中国男足能否在2026年世界杯小组赛出线？', initial_prob:28, days:80 },
      { type:'vote', category:'culture', question:'2026年最火的中国文化现象是？', options:['国潮时尚','古装剧','华语流行音乐','短视频文化','传统非遗'], days:20 },
      { type:'bet',  category:'weather', question:'2026年中国南方洪涝灾害损失会超过2024年吗？', initial_prob:44, days:120 },
      { type:'vote', category:'etc', question:'2026年中国最热门的年轻人生活方式是？', options:['城市露营','骑行健身','咖啡文化','宠物经济','慢生活'], days:25 },
    ]
  },

  es: {
    nicknames: ['LuzDelAlba','SombraLunar','VientoSur','EstrellaNoche','CieloProfundo'],
    questions: [
      { type:'bet',  category:'politics', question:'¿Ganará la izquierda las próximas elecciones en España en 2026?', initial_prob:46, days:60 },
      { type:'vote', category:'politics', question:'¿Cuál es el mayor desafío político de América Latina en 2026?', options:['Corrupción','Inflación','Crimen organizado','Migración','Desigualdad'], days:30 },
      { type:'bet',  category:'sports', question:'¿Ganará el Real Madrid la Champions League 2025-26?', initial_prob:33, days:60 },
      { type:'vote', category:'sports', question:'¿Quién será el mejor jugador de la Liga Española en 2026?', options:['Mbappé','Vinicius Jr','Yamal','Bellingham','Pedri'], days:45 },
      { type:'bet',  category:'culture', question:'¿Superará una serie en español a "La Casa de Papel" en Netflix en 2026?', initial_prob:41, days:60 },
      { type:'vote', category:'culture', question:'¿Cuál es el mayor aporte cultural de España al mundo en 2026?', options:['Cine','Gastronomía','Música flamenco','Moda','Literatura'], days:20 },
      { type:'bet',  category:'economy', question:'¿Bajará la inflación en España por debajo del 2% en 2026?', initial_prob:57, days:45 },
      { type:'vote', category:'economy', question:'¿Cuál es el mayor riesgo económico para América Latina en 2026?', options:['Deuda pública','Devaluación','Proteccionismo de EEUU','Sequía','Desempleo juvenil'], days:30 },
      { type:'bet',  category:'trading', question:'¿Superará el IBEX 35 los 13,000 puntos en 2026?', initial_prob:44, days:90 },
      { type:'bet',  category:'weather', question:'¿Será 2026 el verano más caluroso registrado en España?', initial_prob:62, days:90 },
      { type:'vote', category:'science', question:'¿Qué tecnología transformará más España en 2026?', options:['IA generativa','Vehículos eléctricos','Energía solar','Robots industriales','Biotecnología'], days:25 },
    ]
  },

  fr: {
    nicknames: ['LueurDuSoir','OmbreDouce','VentLibre','ÉtoileFilante','AubeNaissante'],
    questions: [
      { type:'bet',  category:'politics', question:'Macron terminera-t-il son mandat sans démission en 2026 ?', initial_prob:71, days:60 },
      { type:'vote', category:'politics', question:'Quel est le plus grand défi politique de la France en 2026 ?', options:['Immigration','Réforme des retraites','Sécurité','Écologie','Pouvoir d\'achat'], days:25 },
      { type:'bet',  category:'sports', question:'Le PSG remportera-t-il la Ligue des Champions 2025-26 ?', initial_prob:29, days:60 },
      { type:'vote', category:'sports', question:'Qui sera le meilleur joueur de Ligue 1 en 2026 ?', options:['Mbappé','Dembélé','Neymar Jr','Thuram','Zaire-Emery'], days:40 },
      { type:'bet',  category:'culture', question:'Un film français gagnera-t-il la Palme d\'Or à Cannes 2026 ?', initial_prob:38, days:50 },
      { type:'vote', category:'culture', question:'Quelle tendance culturelle dominera la France en 2026 ?', options:['Cinéma d\'auteur','Musique électronique','Mode durable','Littérature engagée','Gastronomie verte'], days:20 },
      { type:'bet',  category:'economy', question:'Le taux de chômage en France passera-t-il sous les 7% en 2026 ?', initial_prob:48, days:60 },
      { type:'vote', category:'economy', question:'Quel secteur sera le moteur de l\'économie française en 2026 ?', options:['Tourisme','Aéronautique','IA et tech','Luxe','Énergie renouvelable'], days:30 },
      { type:'bet',  category:'trading', question:'Le CAC 40 atteindra-t-il 9,000 points en 2026 ?', initial_prob:41, days:90 },
      { type:'bet',  category:'science', question:'La France lancera-t-elle son premier satellite quantique en 2026 ?', initial_prob:36, days:90 },
      { type:'vote', category:'weather', question:'Quelle catastrophe naturelle menace le plus la France en 2026 ?', options:['Sécheresse','Inondations','Canicule','Tempêtes','Incendies de forêt'], days:30 },
    ]
  },

  ar: {
    nicknames: ['نجمةالفجر','ظلالقمر','رياحالليل','ضوءالنجوم','سماءالفجر'],
    questions: [
      { type:'bet',  category:'politics', question:'هل ستشهد منطقة الشرق الأوسط اتفاقية سلام جديدة في 2026؟', initial_prob:27, days:60 },
      { type:'vote', category:'politics', question:'ما أكبر تحدٍّ سياسي يواجه العالم العربي في 2026؟', options:['الصراع في غزة','الأزمة اليمنية','الملف النووي الإيراني','الأزمة السودانية','التدخل الأجنبي'], days:30 },
      { type:'bet',  category:'sports', question:'هل ستتأهل المنتخبات العربية لدور الثمانية في كأس العالم 2026؟', initial_prob:38, days:90 },
      { type:'vote', category:'sports', question:'من سيكون أبرز لاعب عربي في 2026؟', options:['محمد صلاح','كريم بنزيمة','هاكيم زياش','رياض محرز','إبراهيم دياز'], days:40 },
      { type:'bet',  category:'economy', question:'هل ستتجاوز أسعار النفط 100 دولار للبرميل في 2026؟', initial_prob:44, days:60 },
      { type:'vote', category:'economy', question:'أي دولة خليجية ستحقق أعلى نمو اقتصادي في 2026؟', options:['المملكة العربية السعودية','الإمارات','قطر','الكويت','البحرين'], days:30 },
      { type:'bet',  category:'trading', question:'هل ستطلق المملكة العربية السعودية عملتها الرقمية بحلول 2026؟', initial_prob:33, days:90 },
      { type:'bet',  category:'science', question:'هل ستنجح مهمة الإمارات لاستكشاف حزام الكويكبات في 2026؟', initial_prob:61, days:90 },
      { type:'vote', category:'culture', question:'ما أبرز ظاهرة ثقافية عربية في 2026؟', options:['الدراما الخليجية','الموسيقى العربية الحديثة','السينما المصرية','الرياضة الإلكترونية','الفنون التشكيلية'], days:25 },
      { type:'bet',  category:'weather', question:'هل ستعاني منطقة الشرق الأوسط من موجات حر قياسية في صيف 2026؟', initial_prob:74, days:90 },
    ]
  },

  de: {
    nicknames: ['Nachtwandler','Silberlicht','Morgenröte','Sternenstaub','Windreiter'],
    questions: [
      { type:'bet',  category:'politics', question:'Wird die CDU die Bundestagswahl 2026 mit absoluter Mehrheit gewinnen?', initial_prob:23, days:60 },
      { type:'vote', category:'politics', question:'Was ist die größte politische Herausforderung Deutschlands 2026?', options:['Migration','Wirtschaftskrise','Energieversorgung','Sicherheitspolitik','Klimaschutz'], days:25 },
      { type:'bet',  category:'sports', question:'Wird Bayern München die Champions League 2025-26 gewinnen?', initial_prob:22, days:60 },
      { type:'vote', category:'sports', question:'Welcher Verein wird Deutscher Meister 2026?', options:['Bayern München','Borussia Dortmund','Bayer Leverkusen','RB Leipzig','Eintracht Frankfurt'], days:60 },
      { type:'bet',  category:'economy', question:'Wird Deutschland 2026 die Rezession überwinden und positives BIP-Wachstum erzielen?', initial_prob:54, days:60 },
      { type:'vote', category:'economy', question:'Was ist das größte Wirtschaftsrisiko für Deutschland in 2026?', options:['Energiepreise','Fachkräftemangel','Exportrückgang','Digitalisierungslücke','Staatsverschuldung'], days:30 },
      { type:'bet',  category:'trading', question:'Wird der DAX 2026 die 22.000-Punkte-Marke überschreiten?', initial_prob:46, days:90 },
      { type:'bet',  category:'science', question:'Wird ein deutsches Unternehmen 2026 einen kommerziellen Quantencomputer vorstellen?', initial_prob:31, days:90 },
      { type:'vote', category:'science', question:'Welche Technologie wird Deutschland 2026 am stärksten prägen?', options:['Künstliche Intelligenz','Elektromobilität','Wasserstoffenergie','Robotik','Biotechnologie'], days:20 },
      { type:'bet',  category:'weather', question:'Wird der Rhein 2026 erneut durch extreme Niedrigwasser Schifffahrtsprobleme verursachen?', initial_prob:48, days:90 },
      { type:'vote', category:'culture', question:'Was wird 2026 den deutschen Kulturdiskurs dominieren?', options:['KI in der Kunst','Nachhaltige Mode','Streaming-Serien','Gaming-Kultur','Traditionelles Handwerk'], days:25 },
    ]
  },
};

// ── 수퍼포켓 봇 닉네임 풀 (언어별 100 × 200 = 20,000 조합) ───────────
const BOT_NICK_PARTS = {
  ko: {
    a: ['달빛','새벽','바람','은하','자정','봄날','가을','겨울','여름','노을','구름','별빛','강물','이슬','파도','안개','눈꽃','서리','황혼','여명','폭풍','고요','봄비','설원','빙하','숲속','낙엽','천둥','번개','불꽃','얼음','모래','바위','폭포','호수','초원','사막','심연','절벽','봉우리','계곡','해안','동굴','화산','오로라','무지개','혜성','유성','금빛','은빛','청록','자줏빛','연보라','진홍','황금','백옥','영혼','꿈결','마음속','빛살','향기','숨결','전설','신화','그림자','기억','강변','밀림','청명','깊음','넓음','고요함','평온','잔잔','명랑','투명','순수','고귀','장엄','신비','찬란','황홀','영원','무한','창공','땅끝','물가','산정','별자리','달무리','해무리','빛무리','운무','함박눈','소나기','장맛비','해돋이','석양','새벽녘','황혼녘'],
    b: ['나그네','여행자','시인','탐험가','방랑자','사냥꾼','수호자','전사','영웅','기사','마법사','현인','예언자','사색가','구도자','개척자','몽상가','철학자','음유시인','지혜자','도사','무사','협객','검객','궁수','주술사','성자','은자','은둔자','달인','고수','명인','장인','봉황','용','학','기린','청룡','백호','독수리','매','올빼미','늑대','여우','곰','표범','치타','재규어','수호','지킴이','안내자','제왕','군주','왕자','공주','기수','선봉','척후','정찰자','파수꾼','경비','수비대','돌격대','비밀요원','스파이','잠입자','추격자','관찰자','분석가','전략가','전술가','지휘관','사령관','장군','제독','함장','선장','조종사','항법사','포수','저격수','명사수','사격수','공병','통신병','의무병','형사','탐정','조사관','판사','변호사','보안관','족장','부족장','영주','교주','선지자','사도','제자','수련생','견습생','연구원','학자','교수','박사','선생','멘토','코치','상담자','통역관','번역가','외교관','사절','전령','봉사자','글쓴이','노래꾼','춤꾼','연주자','화가','조각가','건축가','발명가','사상가','작가','평론가','기자','연출가','등반가','항해자','잠수사','우주인','비행사','해군','공군','육군','해병','특전사','정보요원','감찰관','감시자','순찰자','경계병','보초','방어자','공격수','선발대','전위대','선구자','혁명가','개혁가','해방자','구원자','선각자','창조자','파괴자','개척자','탐구자','수련자','행자','구도자','수행자','명상가','음악가','연기자','무용가','시조가','이야기꾼','전설자','영웅담','불사조','흑기사','백기사','홍기사','청기사','황기사','자기사','녹기사','은기사','금기사','다이아기사','루비기사','사파이어기사']
  },
  en: {
    a: ['Midnight','Silver','Golden','Shadow','Crimson','Ember','Neon','Void','Storm','Lunar','Solar','Stellar','Cosmic','Nebula','Aurora','Phantom','Mystic','Savage','Feral','Wild','Ancient','Silent','Burning','Frozen','Thunder','Blazing','Dark','Bright','Deep','Lost','Fallen','Rising','Broken','Swift','Bold','Fierce','Gentle','Quiet','Hidden','Forgotten','Sacred','Cursed','Eternal','Hollow','Iron','Steel','Crystal','Diamond','Jade','Obsidian','Amber','Ivory','Emerald','Ruby','Sapphire','Onyx','Copper','Bronze','Titan','Zenith','Apex','Primal','Raw','Pure','True','Ghost','Chaos','Fate','Doom','Glory','Honor','Rage','Calm','Rogue','Noble','Stray','Free','Dusk','Dawn','Twilight','Scarlet','Azure','Indigo','Violet','Magenta','Teal','Ochre','Ebony','Pearl','Coral','Turquoise','Lavender','Garnet','Vermilion','Ashen','Gloom','Blaze','Frost'],
    b: ['Drifter','Walker','Rider','Runner','Hunter','Seeker','Finder','Keeper','Watcher','Guardian','Warrior','Knight','Mage','Sage','Prophet','Rogue','Scout','Ranger','Sniper','Blade','Arrow','Lance','Shield','Sword','Axe','Hammer','Staff','Wand','Crown','Throne','Tower','Gate','Path','Mountain','Valley','River','Ocean','Forest','Desert','Fire','Ice','Lightning','Shadow','Light','Dream','Nightmare','Ghost','Spirit','Soul','Heart','Mind','Eye','Fist','Claw','Fang','Wing','Horn','Scale','Thorn','Root','Branch','Leaf','Tide','Wave','Wind','Breeze','Fog','Mist','Cloud','Star','Moon','Sun','Comet','Nova','Galaxy','Cosmos','Phantom','Specter','Wraith','Harbinger','Messenger','Herald','Sentinel','Vanguard','Champion','Conqueror','Destroyer','Creator','Builder','Breaker','Weaver','Singer','Speaker','Thinker','Dreamer','Wanderer','Pilgrim','Exile','Nomad','Vagrant','Traveler','Explorer','Voyager','Pioneer','Pathfinder','Trailblazer','Outsider','Observer','Analyst','Strategist','Commander','General','Admiral','Captain','Pilot','Navigator','Engineer','Alchemist','Wizard','Sorcerer','Warlock','Paladin','Cleric','Druid','Bard','Thief','Assassin','Spy','Agent','Detective','Enforcer','Judge','Warden','Marshal','Sheriff','Soldier','Marine','Medic','Courier','Diplomat','Ambassador','Oracle','Philosopher','Scholar','Professor','Doctor','Master','Mentor','Coach','Advisor','Painter','Sculptor','Architect','Inventor','Poet','Author','Reporter','Director','Sailor','Diver','Climber','Cyclist','Swimmer','Boxer','Archer','Marksman','Duelist','Gladiator','Centurion','Legionnaire','Cavalier','Lancer','Swordsman','Berserker','Barbarian','Chieftain','Warlord','Overlord','Monarch','Sovereign','Consul','Tribune','Prefect','Legate','Jester','Hermit','Shaman','Necromancer','Summoner','Inquisitor','Crusader','Templar','Skirmisher','Raider','Marauder','Survivalist','Witness','Chronicler','Historian','Geographer','Astronomer','Physicist','Chemist','Biologist','Surgeon','Pharmacist','Paramedic','Rescuer','Firefighter','Inspector','Commissioner']
  },
  ja: {
    a: ['夜明け','夕暮れ','星明り','月影','風花','霧雨','雪解け','若葉','紅葉','朝露','暁','黄昏','蛍','桜','梅','菊','藤','朝顔','向日葵','百合','薔薇','椿','松','竹','楓','銀杏','蓮','菖蒲','水仙','桔梗','彼岸花','朝霧','夕映え','残照','暮色','夜色','月色','雨色','雪色','花色','風色','山色','海色','空色','川色','森色','野原','草原','砂漠','渓谷','断崖','山岳','高原','湿原','湖','滝','川','海','波','嵐','雷','稲妻','吹雪','霜','氷','靄','霞','煙','炎','灰','土','岩','砂','水','火','風','光','闇','影','夢','心','魂','命','縁','業','絆','誓い','願い','怒り','悲しみ','喜び','希望','勇気','知恵','力','愛','真','善','美'],
    b: ['旅人','詩人','勇者','戦士','騎士','魔法使い','賢者','預言者','探索者','冒険者','狩人','守護者','英雄','達人','師匠','弟子','修行者','僧侶','陰陽師','忍者','侍','武士','剣士','弓使い','槍使い','拳士','錬金術師','精霊使い','竜騎士','魔剣士','聖剣士','暗黒騎士','レンジャー','アサシン','バード','ドルイド','シャーマン','ネクロマンサー','ウィザード','ソーサラー','ウォーロック','クレリック','モンク','バーバリアン','ローグ','スカウト','スナイパー','メディック','エンジニア','パイロット','コマンダー','ジェネラル','アドミラル','キャプテン','エージェント','スパイ','ディテクティブ','センチネル','ガーディアン','チャンピオン','コンカラー','デストロイヤー','クリエイター','ビルダー','ブレイカー','ウィーバー','ウォーカー','ライダー','ランナー','ドリフター','ワンダラー','ピルグリム','エクスプローラー','ボイジャー','パイオニア','アウトサイダー','オブザーバー','アナリスト','ストラテジスト','フィロソファー','スカラー','ドクター','マスター','メンター','オラクル','ハービンジャー','ヘラルド','剣客','侠客','刺客','密偵','諜報員','探偵','調査官','裁判官','守護神','番人','見張り','斥候','伝令','使者','外交官','大使','神官','司祭','導師','先達','先覚者','開拓者','革命家','改革者','創造者','破壊者','解放者','救済者','使徒','聖人','博士','学者','研究者','探求者','求道者','遍歴者','放浪者','漂泊者','流浪者','道化師','吟遊詩人','語り部','歌い手','踊り手','演者','奏者','画家','彫刻家','建築家','発明家','哲学者','作家','評論家','記者','映画監督','登山家','航海者','潜水士','宇宙飛行士','海軍','空軍','陸軍','海兵隊','特殊部隊','巡察者','歩哨','衛兵','防衛者','攻撃者','先遣隊','先駆者','救世主','創造主','破壊神','武神','戦神','守護神','風神','雷神','水神','火神','土神','光神','闇神','月神','星神','太陽神','海神','山神','森神','空神','川神','大地神','宇宙神']
  },
  zh: {
    a: ['星光','晨曦','云端','月下','风中','霜晨','雪夜','花影','竹影','松风','梅香','菊韵','兰芳','荷香','桃花','杏花','梨花','樱花','玫瑰','牡丹','芙蓉','芍药','紫藤','水仙','茉莉','丁香','桂花','海棠','山茶','玉兰','紫薇','金银花','向日葵','春风','夏雨','秋月','冬雪','朝霞','暮色','夕阳','星辰','银河','彗星','流星','极光','彩虹','闪电','雷鸣','狂风','暴雨','寒霜','白露','晨露','甘露','玄冰','寒冰','暖阳','烈日','明月','残月','新月','满月','月华','星华','日华','光华','荣华','繁华','清华','精华','灵气','仙气','瑞气','浩气','正气','锐气','锋芒','浮云','流云','乌云','白云','彩云','祥云','玉露','翠竹','红梅','白雪','青山','碧水','苍天','大地','寒江','暮江','春江','秋水','幽谷','深渊','峭壁','烽火','碧落'],
    b: ['旅人','诗人','勇者','战士','骑士','法师','智者','预言者','探索者','冒险者','猎人','守护者','英雄','高手','师傅','弟子','修行者','僧侣','道士','侠客','剑客','弓手','枪手','拳师','炼金术士','召唤师','龙骑士','魔剑士','圣剑士','暗黑骑士','游侠','刺客','吟游诗人','德鲁伊','萨满','亡灵法师','巫师','术士','魔导士','圣职者','武僧','斗士','野蛮人','盗贼','斥候','狙击手','医疗兵','工程师','飞行员','指挥官','将军','提督','舰长','船长','特工','间谍','侦探','哨兵','守卫','冠军','征服者','毁灭者','创造者','建设者','破坏者','编织者','行者','骑者','奔跑者','漂泊者','朝圣者','探险者','航行者','开拓者','先驱者','局外人','观察者','分析家','战略家','哲学家','学者','博士','导师','先知','使者','信使','前锋','先锋','卫兵','守夜人','见证者','守望者','执行者','裁判','保安','侦察兵','联络官','通信兵','外交官','大使','神官','司祭','先觉者','革命家','改革者','解放者','救世主','创造者','铸造者','雕刻者','建筑师','发明家','思想家','文学家','作家','画家','音乐家','舞者','演员','歌手','记者','导演','运动员','登山者','航海者','潜水员','宇航员','士兵','海军','空军','陆军','海军陆战队','特种兵','情报员','监察员','巡逻者','神秘客','旁观者','观测者','记录者','报告者','讲述者','评论员','研究员','实验者','指导者','引领者','领导者','主导者','策划者','协调者','统筹者','管理者','统治者','援助者','协助者','奠基者','风神','雷神','水神','火神','土神','光神','闇神','月神','星神','太阳神','海神','山神','武神','战神']
  },
  es: {
    a: ['Medianoche','Plateado','Dorado','Sombra','Carmesí','Brasa','Neón','Vacío','Tormenta','Lunar','Solar','Estelar','Cósmico','Nebulosa','Aurora','Fantasma','Místico','Salvaje','Antiguo','Silencioso','Ardiente','Helado','Trueno','Llameante','Oscuro','Brillante','Profundo','Alto','Perdido','Caído','Roto','Veloz','Audaz','Feroz','Gentil','Quieto','Oculto','Olvidado','Sagrado','Maldito','Eterno','Hueco','Hierro','Acero','Cristal','Diamante','Jade','Obsidiana','Ámbar','Marfil','Esmeralda','Rubí','Zafiro','Ónix','Mármol','Cobre','Bronce','Titán','Cénit','Puro','Verdadero','Fantasma','Caos','Destino','Gloria','Honor','Rabia','Noble','Errante','Libre','Crepúsculo','Amanecer','Escarlata','Azur','Índigo','Violeta','Turquesa','Ocre','Ébano','Perla','Coral','Lavanda','Carmín','Granate','Argento','Platino','Cobalto','Índigo','Borgoña','Azabache','Celeste','Zafiro','Magenta','Bermejo','Añil','Carmesí'],
    b: ['Errante','Caminante','Jinete','Corredor','Cazador','Buscador','Guardián','Guerrero','Caballero','Mago','Sabio','Profeta','Explorador','Viajero','Pionero','Vagabundo','Nómada','Centinela','Campeón','Conquistador','Destructor','Creador','Tejedor','Pensador','Soñador','Peregrino','Exilado','Observador','Analista','Estratega','Comandante','General','Almirante','Capitán','Piloto','Navegante','Ingeniero','Alquimista','Brujo','Druida','Bardo','Ladrón','Asesino','Espía','Agente','Detective','Juez','Guardabosques','Soldado','Marine','Médico','Diplomático','Filósofo','Erudito','Profesor','Doctor','Maestro','Mentor','Oráculo','Visionario','Heraldo','Mensajero','Vigía','Aventurero','Héroe','Paladín','Clérigo','Monje','Bárbaro','Pícaro','Francotirador','Espadachín','Arquero','Lancero','Berserker','Caudillo','Monarca','Soberano','Cónsul','Tribuno','Centurión','Legionario','Guerrillero','Combatiente','Luchador','Boxeador','Esgrimidor','Rastreador','Scout','Patrullero','Defensor','Atacante','Deportista','Atleta','Velocista','Saltador','Nadador','Ciclista','Escalador','Buceador','Astronauta','Aviador','Marinero','Sargento','Teniente','Coronel','Mariscal','Veterano','Mártir','Leyenda','Ícono','Símbolo','Embajador','Enviado','Emisario','Inventor','Poeta','Autor','Periodista','Director','Pintor','Escultor','Arquitecto','Músico','Cantante','Bailarín','Actor','Escritor','Crítico','Investigador','Descubridor','Fundador','Líder','Gobernador','Magistrado','Árbitro','Fiscal','Testigo','Cronista','Historiador','Geógrafo','Cartógrafo','Astrónomo','Físico','Químico','Biólogo','Cirujano','Farmacéutico','Paramédico','Rescatador','Bombero','Policía','Inspector','Comisario','Subcomisario','Guardabosques','Cazarrecompensas','Mercenario','Esbirro','Corsario','Bucanero','Filibustero','Corsario','Privateer','Explorador','Aventurero']
  },
  fr: {
    a: ['Minuit','Argenté','Doré','Ombre','Cramoisi','Braise','Néon','Vide','Tempête','Lunaire','Solaire','Stellaire','Cosmique','Nébuleuse','Aurore','Fantôme','Mystique','Sauvage','Féroce','Ancien','Silencieux','Ardent','Glacé','Tonnerre','Flamboyant','Sombre','Brillant','Profond','Élevé','Perdu','Déchu','Brisé','Vif','Audacieux','Doux','Calme','Caché','Oublié','Sacré','Maudit','Éternel','Creux','Fer','Acier','Cristal','Diamant','Jade','Obsidienne','Ambre','Ivoire','Émeraude','Rubis','Saphir','Onyx','Cuivre','Bronze','Titan','Zénith','Pur','Vrai','Spectre','Chaos','Destin','Gloire','Honneur','Rage','Noble','Errant','Libre','Crépuscule','Écarlate','Azur','Indigo','Violet','Magenta','Turquoise','Ocre','Sienne','Ébène','Perle','Corail','Lavande','Carmin','Grenat','Vermeil','Platine','Cobalt','Bordeaux','Nacre','Améthyste','Topaze','Céladon','Cerise','Saphir','Indigo'],
    b: ['Errant','Marcheur','Cavalier','Coureur','Chasseur','Chercheur','Gardien','Guerrier','Chevalier','Mage','Sage','Prophète','Explorateur','Voyageur','Pionnier','Vagabond','Nomade','Sentinelle','Champion','Conquérant','Destructeur','Créateur','Tisserand','Penseur','Rêveur','Pèlerin','Exilé','Observateur','Analyste','Stratège','Commandant','Général','Amiral','Capitaine','Pilote','Navigateur','Ingénieur','Alchimiste','Sorcier','Druide','Barde','Voleur','Assassin','Espion','Agent','Détective','Juge','Ranger','Soldat','Marine','Médecin','Diplomate','Philosophe','Érudit','Professeur','Docteur','Maître','Mentor','Oracle','Visionnaire','Héraut','Messager','Vigile','Aventurier','Héros','Paladin','Clerc','Moine','Barbare','Roublard','Tireur','Épéiste','Archer','Lancier','Berserk','Seigneur','Monarque','Souverain','Consul','Tribun','Centurion','Légionnaire','Guerillero','Combattant','Lutteur','Boxeur','Escrimeur','Scout','Patrouilleur','Défenseur','Attaquant','Sportif','Athlète','Sprinteur','Nageur','Cycliste','Grimpeur','Plongeur','Astronaute','Aviateur','Marin','Sergent','Lieutenant','Colonel','Maréchal','Vétéran','Martyr','Légende','Icône','Ambassadeur','Envoyé','Émissaire','Inventeur','Poète','Auteur','Journaliste','Réalisateur','Peintre','Sculpteur','Architecte','Musicien','Chanteur','Danseur','Acteur','Écrivain','Critique','Chercheur','Découvreur','Fondateur','Gouverneur','Magistrat','Arbitre','Procureur','Défenseur','Témoin','Chroniqueur','Historien','Géographe','Astronome','Physicien','Chimiste','Biologiste','Chirurgien','Pharmacien','Infirmier','Paramédic','Secouriste','Pompier','Policier','Inspecteur','Commissaire','Gendarme','Mercenaire','Corsaire','Flibustier','Boucanier']
  },
  ar: {
    a: ['نجمة','هلال','قمر','شمس','فجر','غروب','نهار','ليل','صباح','مساء','ضوء','ظلام','نور','نار','ماء','هواء','تراب','صخر','رمل','جبل','وادي','نهر','بحر','محيط','موج','ريح','عاصفة','رعد','برق','مطر','ثلج','جليد','صقيع','ضباب','غيم','سحاب','قوس','قزح','شفق','أفق','صحراء','واحة','غابة','سهل','هضبة','قمة','هاوية','كهف','بركان','شلال','بستان','روضة','زهرة','ورد','ياسمين','نرجس','لوتس','غصن','جذر','ورقة','بذرة','ثمرة','بلور','ألماس','ياقوت','زمرد','لازورد','عقيق','مرجان','لؤلؤ','ذهب','فضة','نحاس','حديد','فولاذ','بريق','لمعان','ضياء','بهاء','جلال','كمال','جمال','عظمة','هيبة','سطوة','قوة','شجاعة','حكمة','علم','معرفة','عقل','قلب','روح','نفس','وجدان','إرادة','عزم'],
    b: ['مسافر','شاعر','بطل','محارب','فارس','ساحر','حكيم','نبي','مستكشف','مغامر','صياد','حارس','قائد','أمير','ملك','سلطان','خليفة','وزير','قاضي','أمين','خبير','عارف','عالم','فيلسوف','متصوف','زاهد','ناسك','راهب','شيخ','مرشد','معلم','أستاذ','دكتور','مهندس','طبيب','محقق','جاسوس','عميل','مراقب','محلل','عسكري','ضابط','جندي','بحري','جوي','مشاة','قناص','طيار','قبطان','ربان','مقاتل','رامي','مدافع','مهاجم','لاعب','رياضي','عداء','سباح','راكب','متسلق','غواص','رائد','منقذ','طليعي','ديبلوماسي','سفير','قنصل','موفد','نبي','ولي','صديق','تلميذ','طالب','باحث','مؤلف','كاتب','رسام','موسيقي','مغني','راقص','ممثل','مخرج','مصور','صحفي','مراسل','منسق','مخطط','مدير','رئيس','مشرف','حكم','مقيّم','ناقد','ناصح','مستشار','مربي','مدرب','زعيم','مؤسس','مبتكر','مخترع','مكتشف','قدير','ماهر','حاذق','بارع','متميز','فريد','رفيع','جليل','عظيم','رائع','لامع','متألق','ساطع','مشرق','منير','بهي','نقي','طاهر','مقدس','روحاني','إلهي','رباني','نوراني','جبار','قادر','حاكم','شامل','واسع','عميق','دقيق','لطيف','رحيم','كريم','سخي','مخلص','أمين','وفي','صادق','عادل','حليم','صبور','شاكر','حامد','ذاكر','عابد','تائب','داعي','مبلغ','ناشر','باث','مرسل','موفد','مبعوث','مندوب','نائب','خادم','راعي','صانع','فاعل','مجاهد','فدائي','مقاوم','محرر','منقذ']
  },
  de: {
    a: ['Mitternacht','Silber','Gold','Schatten','Karmesin','Glut','Neon','Leere','Sturm','Mond','Sonne','Stern','Kosmos','Nebel','Aurora','Phantom','Mystik','Wildnis','Uralt','Stille','Feuer','Frost','Donner','Flamme','Dunkel','Licht','Tief','Hoch','Verloren','Gefallen','Schnell','Kühn','Wild','Sanft','Ruhig','Verborgen','Vergessen','Heilig','Verdammt','Ewig','Hohl','Eisen','Stahl','Kristall','Diamant','Jade','Obsidian','Bernstein','Elfenbein','Smaragd','Rubin','Saphir','Onyx','Marmor','Kupfer','Bronze','Titan','Zenit','Rein','Wahr','Geist','Chaos','Schicksal','Glorie','Ehre','Wut','Schurke','Edel','Freier','Dämmerung','Morgen','Zwielicht','Scharlach','Azur','Indigo','Violett','Magenta','Türkis','Ocker','Ebenholz','Perle','Koralle','Lavendel','Karmin','Granat','Zinnoberrot','Platin','Palladium','Chrom','Kobalt','Wolfram','Silicium','Radon','Neon','Xenon','Krypton'],
    b: ['Wanderer','Geher','Reiter','Läufer','Jäger','Sucher','Hüter','Wächter','Krieger','Ritter','Magier','Weiser','Prophet','Schurke','Scout','Ranger','Scharfschütze','Klinge','Pfeil','Lanze','Schild','Schwert','Axt','Hammer','Stab','Krone','Thron','Turm','Tor','Pfad','Berg','Tal','Fluss','Ozean','Wald','Wüste','Sturm','Feuer','Eis','Blitz','Schatten','Licht','Traum','Albtraum','Geist','Seele','Herz','Verstand','Auge','Faust','Klaue','Flügel','Horn','Schuppe','Dorn','Wurzel','Ast','Blatt','Flut','Welle','Wind','Nebel','Wolke','Stern','Mond','Sonne','Komet','Nova','Galaxis','Harbinger','Bote','Vortrupp','Champion','Eroberer','Zerstörer','Schöpfer','Erbauer','Brecher','Weber','Sänger','Sprecher','Denker','Träumer','Pilger','Verbannter','Nomade','Vagabund','Reisender','Forscher','Pionier','Wegbereiter','Außenseiter','Beobachter','Analyst','Stratege','Befehlshaber','General','Admiral','Kapitän','Pilot','Navigator','Ingenieur','Alchemist','Zauberer','Hexer','Druide','Barde','Dieb','Assassine','Spion','Agent','Detektiv','Richter','Soldat','Marine','Arzt','Diplomat','Philosoph','Gelehrter','Professor','Doktor','Meister','Mentor','Orakel','Visionär','Herold','Krieger','Paladin','Kleriker','Mönch','Barbar','Schütze','Bogenschütze','Lanzenträger','Berserker','Kriegsherr','Stammesführer','Monarch','Souverän','Konsul','Tribun','Zenturio','Legionär','Guerillero','Kämpfer','Ringer','Boxer','Fechter','Ermittler','Journalist','Reporter','Kameramann','Fotograf','Filmemacher','Regisseur','Schauspieler','Musiker','Tänzer','Dichter','Schriftsteller','Maler','Bildhauer','Architekt','Erfinder','Wissenschaftler','Entdecker','Begründer','Anführer','Gouverneur','Magistrat','Schiedsrichter','Staatsanwalt','Zeuge','Chronist','Historiker','Geograf','Kartograf','Astronom','Physiker','Chemiker','Biologe','Chirurg','Apotheker','Sanitäter','Retter','Feuerwehrmann','Polizist','Inspektor','Kommissar','Söldner','Freibeuter','Pirat','Korsär']
  }
};

function genBotNick(lang) {
  const P = BOT_NICK_PARTS[lang] || BOT_NICK_PARTS.ko;
  return P.a[Math.floor(Math.random() * P.a.length)]
       + P.b[Math.floor(Math.random() * P.b.length)];
}

let _botUserId = null;

async function initBotUser() {
  try {
    const db = await getPool();
    const [rows] = await db.execute('SELECT user_id FROM Users WHERE email = ?', [BOT_EMAIL]);
    if (rows.length > 0) {
      _botUserId = rows[0].user_id;
      // 기존 계정 닉네임이 구버전(슈퍼포켓)이면 수퍼포켓으로 업데이트
      await db.execute("UPDATE Users SET full_name=?, nickname=? WHERE user_id=? AND nickname='슈퍼포켓'", [BOT_FULLNAME, '수퍼포켓', _botUserId]);
      console.log(`[수퍼포켓 봇] 기존 계정 확인 (user_id: ${_botUserId})`);
    } else {
      const hash = await bcrypt.hash('SuperFoket2026!', 12);
      const [result] = await db.execute(
        'INSERT INTO Users (email, password_hash, full_name, nickname, kyc_status, status) VALUES (?, ?, ?, ?, ?, ?)',
        [BOT_EMAIL, hash, BOT_FULLNAME, '수퍼포켓', 'VERIFIED', 'ACTIVE']
      );
      _botUserId = result.insertId;
      console.log(`[수퍼포켓 봇] 계정 생성 완료 (user_id: ${_botUserId})`);
    }
    // 봇 시작 시 바로 1개 게시 후 이후 매 10분마다 게시
    setTimeout(postBotQuestion, 5000);
    setInterval(postBotQuestion, 10 * 60 * 1000);
    // 봇 참여: 30초 후 첫 참여, 이후 매 7분마다 랜덤 투표/베팅
    setTimeout(botParticipate, 30 * 1000);
    setInterval(botParticipate, 7 * 60 * 1000);
  } catch (err) {
    console.error('[수퍼포켓 봇] 초기화 실패:', err.message);
  }
}

async function postBotQuestion() {
  if (!_botUserId) return;
  try {
    const db = await getPool();
    // 한국어만 사용
    const lang = 'ko';
    const langData = BOT_LANG_DATA[lang];

    // 해당 언어 닉네임 랜덤 생성 (20,000 조합 풀)
    const nick = genBotNick(lang);

    // 해당 언어 질문 중 중복 방지 후 랜덤 선택
    const [posted] = await db.execute('SELECT question FROM Questions WHERE user_id = ?', [_botUserId]);
    const postedSet = new Set(posted.map(r => r.question));
    let pool = langData.questions.filter(q => !postedSet.has(q.question));
    if (pool.length === 0) pool = langData.questions; // 전부 소진 시 재사용

    const q = pool[Math.floor(Math.random() * pool.length)];

    // 닉네임 변경 후 질문 등록 (자동 승인)
    await db.execute('UPDATE Users SET nickname = ? WHERE user_id = ?', [nick, _botUserId]);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + (q.days || 30));
    const options = q.options ? JSON.stringify(q.options) : null;
    await db.execute(
      'INSERT INTO Questions (user_id, type, question, category, options, initial_prob, end_date, status) VALUES (?,?,?,?,?,?,?,?)',
      [_botUserId, q.type, q.question, q.category, options, q.initial_prob || null, endDate, 'APPROVED']
    );
    console.log(`[수퍼포켓 봇] [${lang}] "${nick}" 게시: [${q.category}] ${q.question.slice(0,40)}...`);
  } catch (err) {
    console.error('[수퍼포켓 봇] 게시 실패:', err.message);
  }
}

async function botParticipate() {
  if (!_botUserId) return;
  try {
    const db = await getPool();
    // 승인된 질문 중 랜덤 5개 선택 (중복 참여 허용)
    const [questions] = await db.execute(`
      SELECT q.question_id, q.type, q.options
      FROM Questions q
      WHERE q.status = 'APPROVED'
        AND q.end_date > NOW()
      ORDER BY RAND()
      LIMIT 5
    `);

    for (const q of questions) {
      let choice;
      if (q.type === 'vote') {
        let opts;
        try { opts = JSON.parse(q.options); } catch { opts = null; }
        if (!opts || opts.length === 0) continue;
        choice = opts[Math.floor(Math.random() * opts.length)];
      } else {
        choice = Math.random() < 0.5 ? 'YES' : 'NO';
      }
      await db.execute(
        'INSERT INTO Participations (question_id, user_id, choice) VALUES (?,?,?)',
        [q.question_id, _botUserId, choice]
      );
    }
    if (questions.length > 0)
      console.log(`[수퍼포켓 봇] ${questions.length}개 질문에 참여 완료`);
  } catch (err) {
    console.error('[수퍼포켓 봇] 참여 실패:', err.message);
  }
}

// ── 서버 시작 ─────────────────────────────────────────────
pool.getConnection()
  .then(async (conn) => {
    conn.release();
    await initDb();
    await refreshBlockedIps();
    setInterval(refreshBlockedIps, 60 * 1000); // 1분마다 갱신
    await initBotUser();
    app.listen(PORT, () => console.log(`Foket API 서버 실행 중: http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('DB 연결 실패:', err.message);
    app.listen(PORT, () => console.log(`Foket API 서버 실행 중 (DB 오프라인): http://localhost:${PORT}`));
  });
