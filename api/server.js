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

    const lim = parseInt(limit) || 50;
    const offset = (parseInt(page) - 1) * lim;
    const [rows] = await db.execute(
      `SELECT u.user_id, u.email, u.full_name, u.nickname, u.grade, u.balance,
              u.kyc_status, u.status, u.created_at, u.last_seen_at
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
  try {
    const db = await getPool();
    let where = "WHERE q.status = 'APPROVED'";
    const params = [];
    if (category) { where += ' AND q.category = ?'; params.push(category); }
    const [rows] = await db.execute(
      `SELECT q.question_id, q.type, q.question, q.category,
              q.options, q.initial_prob, q.end_date, q.created_at,
              u.nickname
       FROM Questions q
       LEFT JOIN Users u ON q.user_id = u.user_id
       ${where}
       ORDER BY q.created_at DESC`,
      params
    );
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
      { name: 'grade',         sql: "ALTER TABLE Users ADD COLUMN grade VARCHAR(20) DEFAULT 'BASIC'" },
      { name: 'balance',       sql: 'ALTER TABLE Users ADD COLUMN balance DECIMAL(18,2) DEFAULT 0' },
      { name: 'kyc_status',    sql: "ALTER TABLE Users ADD COLUMN kyc_status VARCHAR(20) DEFAULT 'PENDING'" },
      { name: 'status',        sql: "ALTER TABLE Users ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE'" },
      { name: 'last_login_at', sql: 'ALTER TABLE Users ADD COLUMN last_login_at DATETIME' },
      { name: 'last_seen_at',  sql: 'ALTER TABLE Users ADD COLUMN last_seen_at DATETIME' },
      { name: 'updated_at',    sql: 'ALTER TABLE Users ADD COLUMN updated_at DATETIME DEFAULT NOW()' },
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
        UNIQUE KEY uq_user_question (user_id, question_id)
      ) CHARACTER SET utf8mb4
    `);

    console.log('DB 초기화 완료 (Users, Questions, Participations 테이블 확인)');
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
    // 랜덤 언어 선택
    const langs = Object.keys(BOT_LANG_DATA);
    const lang = langs[Math.floor(Math.random() * langs.length)];
    const langData = BOT_LANG_DATA[lang];

    // 해당 언어 닉네임 랜덤 선택
    const nick = langData.nicknames[Math.floor(Math.random() * langData.nicknames.length)];

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
    // 아직 참여 안 한 승인된 질문 목록
    const [questions] = await db.execute(`
      SELECT q.question_id, q.type, q.options
      FROM Questions q
      WHERE q.status = 'APPROVED'
        AND q.end_date > NOW()
        AND q.question_id NOT IN (
          SELECT question_id FROM Participations WHERE user_id = ?
        )
      ORDER BY RAND()
      LIMIT 5
    `, [_botUserId]);

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
        'INSERT IGNORE INTO Participations (question_id, user_id, choice) VALUES (?,?,?)',
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
    await initBotUser();
    app.listen(PORT, () => console.log(`Foket API 서버 실행 중: http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('DB 연결 실패:', err.message);
    app.listen(PORT, () => console.log(`Foket API 서버 실행 중 (DB 오프라인): http://localhost:${PORT}`));
  });
