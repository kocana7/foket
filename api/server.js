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

    await db.execute('UPDATE Users SET last_login_at = NOW() WHERE user_id = ?', [user.user_id]);

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
      await db.execute('UPDATE Users SET last_login_at = NOW() WHERE user_id = ?', [user.user_id]);
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

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [rows] = await db.execute(
      `SELECT u.user_id, u.email, u.full_name, u.nickname, u.grade, u.balance,
              u.kyc_status, u.status, u.created_at, u.last_seen_at
       FROM Users u ${where}
       ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({ users: rows, total: rows.length });
  } catch (err) {
    console.error(err);
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
              u.email, u.nickname, u.full_name
       FROM Questions q
       LEFT JOIN Users u ON q.user_id = u.user_id
       ${where}
       ORDER BY q.created_at DESC`,
      params
    );
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

// ── DB 초기화 (테이블 없으면 생성) ────────────────────────
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

    console.log('DB 초기화 완료 (Users, Questions 테이블 확인)');
  } catch (err) {
    console.error('DB 초기화 실패:', err.message);
  }
}

// ── 서버 시작 ─────────────────────────────────────────────
pool.getConnection()
  .then(async (conn) => {
    conn.release();
    await initDb();
    app.listen(PORT, () => console.log(`Foket API 서버 실행 중: http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('DB 연결 실패:', err.message);
    app.listen(PORT, () => console.log(`Foket API 서버 실행 중 (DB 오프라인): http://localhost:${PORT}`));
  });
