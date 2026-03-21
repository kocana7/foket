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

    console.log('DB 초기화 완료 (Users, Questions 테이블 확인)');
  } catch (err) {
    console.error('DB 초기화 실패:', err.message);
  }
}

// ── 수퍼포켓 봇 ───────────────────────────────────────────
const BOT_EMAIL = 'superfoket@foket.com';
const BOT_FULLNAME = 'SuperFoket'; // 수퍼포켓

const BOT_NICKNAMES = [
  '달빛나그네','새벽별','파란하늘','바람의노래','은하수여행자','별빛소나타',
  '봄비소리','노을지기','구름위산책','자정의시인','여명의빛','초록소풍',
  '밤하늘탐험가','햇살조각','산너머봄','이슬맺힌풀','뭉게구름','저녁노을',
  '새벽이슬','흐르는강물','고요한숲','달콤한꿈','작은별','푸른파도',
  '바람타는사람','빛나는하루','은빛물결','조용한아침','따스한햇볕','꿈꾸는고래',
  '별을모으는자','하늘길손','풀잎이슬','반짝이는밤','노래하는바람','수평선너머',
  '흰구름여행','봄날의기억','청명한하늘','달그림자'
];

const BOT_QUESTIONS = [
  // 정치
  { type:'bet',  category:'politics', question:'이재명 대통령 국정 지지율이 2분기에 50%를 돌파할까요?', initial_prob:52, days:30 },
  { type:'vote', category:'politics', question:'2026년 상반기 가장 중요한 정치 이슈는 무엇인가요?', options:['경제 정책','외교 안보','복지 확대','교육 개혁','환경 정책'], days:20 },
  { type:'bet',  category:'politics', question:'한미 정상회담이 2026년 상반기 내에 열릴까요?', initial_prob:67, days:45 },
  { type:'vote', category:'politics', question:'현 정부의 부동산 정책에 대한 평가는?', options:['매우 긍정적','긍정적','보통','부정적','매우 부정적'], days:14 },
  { type:'bet',  category:'politics', question:'6·25 기념일 전 남북 대화 채널이 재개될까요?', initial_prob:31, days:60 },
  { type:'vote', category:'politics', question:'가장 기대되는 2026년 하반기 정책 과제는?', options:['AI 산업 육성','주거 안정화','저출생 대책','기후 위기 대응','의료 개혁'], days:25 },

  // 스포츠
  { type:'bet',  category:'sports', question:'손흥민이 2025-26 시즌 EPL에서 15골 이상 넣을까요?', initial_prob:58, days:60 },
  { type:'vote', category:'sports', question:'2026 FIFA 월드컵에서 한국의 최종 성적은?', options:['16강','8강','4강','결승','우승'], days:90 },
  { type:'bet',  category:'sports', question:'KBO 리그 2026 시즌 정규리그 우승팀은 두산 베어스일까요?', initial_prob:22, days:120 },
  { type:'vote', category:'sports', question:'2026 파리 올림픽 한국 금메달 예상 종목은?', options:['양궁','태권도','유도','펜싱','수영'], days:40 },
  { type:'bet',  category:'sports', question:'류현진이 2026 KBO 시즌에서 10승 이상 거둘까요?', initial_prob:44, days:100 },
  { type:'vote', category:'sports', question:'이번 달 가장 기대되는 스포츠 경기는?', options:['K리그','KBO','NBA 플레이오프','EPL 빅매치','UFC'], days:10 },

  // 문화
  { type:'bet',  category:'culture', question:'BTS가 2026년 완전체 컴백 앨범을 발표할까요?', initial_prob:71, days:60 },
  { type:'vote', category:'culture', question:'올해 가장 기대되는 K-드라마 장르는?', options:['로맨스','스릴러','판타지','시대극','의학드라마'], days:20 },
  { type:'bet',  category:'culture', question:'한국 영화가 2026 칸 영화제에서 수상할까요?', initial_prob:38, days:50 },
  { type:'vote', category:'culture', question:'2026년 최고의 K-팝 걸그룹은?', options:['블랙핑크','NewJeans','aespa','IVE','LE SSERAFIM'], days:30 },
  { type:'bet',  category:'culture', question:'넷플릭스 오리지널 한국 드라마가 글로벌 TOP 10에 진입할까요?', initial_prob:62, days:45 },
  { type:'vote', category:'culture', question:'이번 여름 가장 기대되는 국내 영화는?', options:['액션 블록버스터','로맨스 코미디','공포 스릴러','애니메이션','다큐멘터리'], days:30 },

  // 트레이딩
  { type:'bet',  category:'trading', question:'비트코인이 2026년 2분기 안에 10만 달러를 재돌파할까요?', initial_prob:55, days:60 },
  { type:'bet',  category:'trading', question:'코스피 지수가 올해 2,800선을 회복할까요?', initial_prob:48, days:90 },
  { type:'vote', category:'trading', question:'2026년 가장 유망한 투자 자산은?', options:['AI 관련주','비트코인','부동산 리츠','금·원자재','채권'], days:30 },
  { type:'bet',  category:'trading', question:'삼성전자 주가가 연내 8만원을 돌파할까요?', initial_prob:41, days:120 },
  { type:'bet',  category:'trading', question:'이더리움이 4,000달러 이상을 유지할까요?', initial_prob:49, days:30 },
  { type:'vote', category:'trading', question:'현재 가장 리스크가 높은 투자 자산은?', options:['알트코인','중국 주식','부동산','레버리지 ETF','스타트업 투자'], days:14 },

  // 날씨
  { type:'bet',  category:'weather', question:'서울 2026년 7월 최고기온이 38도를 넘을까요?', initial_prob:63, days:90 },
  { type:'vote', category:'weather', question:'올여름 최악의 자연재해 유형을 예상한다면?', options:['폭염','태풍','집중호우','가뭄','산불'], days:30 },
  { type:'bet',  category:'weather', question:'올해 태풍이 한반도에 직접 상륙할까요?', initial_prob:57, days:120 },
  { type:'vote', category:'weather', question:'이번 여름 체감 더위 수준은?', options:['역대급 폭염','평년보다 더움','평년 수준','평년보다 시원','선선한 여름'], days:20 },
  { type:'bet',  category:'weather', question:'2026년 장마 기간이 30일 이상 이어질까요?', initial_prob:45, days:60 },

  // 경제
  { type:'bet',  category:'economy', question:'2026년 한국 경제 성장률이 2.5%를 넘을까요?', initial_prob:53, days:60 },
  { type:'vote', category:'economy', question:'2026년 한국 경제의 가장 큰 위협 요인은?', options:['고금리 지속','수출 부진','내수 침체','환율 불안','부동산 급락'], days:25 },
  { type:'bet',  category:'economy', question:'한국은행이 올해 기준금리를 추가 인하할까요?', initial_prob:66, days:45 },
  { type:'vote', category:'economy', question:'2026년 서울 아파트 가격 전망은?', options:['10% 이상 상승','5~10% 상승','보합','5~10% 하락','10% 이상 하락'], days:30 },
  { type:'bet',  category:'economy', question:'원/달러 환율이 연내 1,300원 아래로 내려올까요?', initial_prob:39, days:90 },

  // 발언
  { type:'bet',  category:'statement', question:'일론 머스크가 X(트위터)를 2026년 내에 매각할까요?', initial_prob:19, days:90 },
  { type:'vote', category:'statement', question:'트럼프 전 대통령 발언 중 가장 논란이 된 건?', options:['관세 발언','NATO 탈퇴론','우크라이나 발언','AI 규제 반대','이민 정책'], days:20 },
  { type:'bet',  category:'statement', question:'오픈AI CEO 샘 알트만이 2026년 하반기에 한국을 방문할까요?', initial_prob:33, days:60 },
  { type:'vote', category:'statement', question:'최근 가장 파장이 컸던 정치인 발언은?', options:['경제 관련 발언','외교 발언','안보 발언','복지 공약','환경 관련'], days:10 },
  { type:'bet',  category:'statement', question:'젠슨 황 엔비디아 CEO가 올해 다시 한국을 찾을까요?', initial_prob:72, days:60 },

  // 과학
  { type:'bet',  category:'science', question:'GPT-5가 2026년 상반기에 공식 출시될까요?', initial_prob:61, days:45 },
  { type:'vote', category:'science', question:'2026년 가장 기대되는 기술 트렌드는?', options:['생성형 AI','양자 컴퓨팅','자율주행차','인간형 로봇','바이오테크'], days:20 },
  { type:'bet',  category:'science', question:'삼성 갤럭시 S27이 온디바이스 AI로 주목받을까요?', initial_prob:68, days:60 },
  { type:'vote', category:'science', question:'AI가 가장 먼저 대체할 직종은?', options:['콜센터 상담원','번역가','회계사','의료 진단','콘텐츠 제작'], days:25 },
  { type:'bet',  category:'science', question:'SpaceX 스타십이 2026년 유인 달 궤도 비행에 성공할까요?', initial_prob:42, days:90 },
  { type:'vote', category:'science', question:'한국 AI 경쟁력, 글로벌 몇 위권이라고 생각하나요?', options:['1~3위','4~5위','6~10위','11~20위','20위 이하'], days:20 },

  // 나의 이웃
  { type:'vote', category:'neighbor', question:'우리 동네에 가장 필요한 편의시설은?', options:['카페·베이커리','공원·녹지','헬스장','도서관','어린이집'], days:14 },
  { type:'bet',  category:'neighbor', question:'우리 동네 아파트 단지에 스타벅스가 올해 입점할까요?', initial_prob:28, days:60 },
  { type:'vote', category:'neighbor', question:'이번 주말 나들이 장소로 어디가 가장 좋을까요?', options:['한강공원','북악산 등산','코엑스 쇼핑','강남 맛집 투어','교외 드라이브'], days:5 },
  { type:'bet',  category:'neighbor', question:'올여름 우리 동네 정전 사태가 발생할까요?', initial_prob:17, days:90 },
  { type:'vote', category:'neighbor', question:'동네 주민이 가장 불편함을 느끼는 점은?', options:['주차 문제','쓰레기 무단투기','소음','치안','대중교통 부족'], days:10 },

  // 기타
  { type:'bet',  category:'etc', question:'2026년 한국 출산율이 소폭 반등(0.8 이상)할까요?', initial_prob:34, days:60 },
  { type:'vote', category:'etc', question:'올해 가장 핫한 음식 트렌드는?', options:['마라탕·마라샹궈','헬시플레저 식단','무알콜 음료','한식 파인다이닝','비건 푸드'], days:20 },
  { type:'bet',  category:'etc', question:'2026 항저우 아시안게임에서 한국이 종합 2위를 달성할까요?', initial_prob:47, days:80 },
  { type:'vote', category:'etc', question:'2026년 가장 많이 쓰이는 신조어는?', options:['AI 관련 용어','경제 신조어','MZ 밈 단어','정치 은어','외래어 혼합'], days:30 },
  { type:'bet',  category:'etc', question:'올해 국내 편의점 수가 6만 개를 돌파할까요?', initial_prob:58, days:90 },
];

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
  } catch (err) {
    console.error('[수퍼포켓 봇] 초기화 실패:', err.message);
  }
}

async function postBotQuestion() {
  if (!_botUserId) return;
  try {
    const db = await getPool();
    // 아직 게시 안 한 질문 중 카테고리 랜덤 선택 (중복 방지)
    const [posted] = await db.execute('SELECT question FROM Questions WHERE user_id = ?', [_botUserId]);
    const postedSet = new Set(posted.map(r => r.question));
    let remaining = BOT_QUESTIONS.filter(q => !postedSet.has(q.question));
    if (remaining.length === 0) remaining = BOT_QUESTIONS; // 전부 소진 시 재사용
    // 카테고리 목록에서 랜덤 카테고리 먼저 고른 뒤, 해당 카테고리 질문 중 랜덤 선택
    const cats = [...new Set(remaining.map(q => q.category))];
    const pickedCat = cats[Math.floor(Math.random() * cats.length)];
    const catPool = remaining.filter(q => q.category === pickedCat);
    const q = catPool[Math.floor(Math.random() * catPool.length)];

    // 랜덤 닉네임으로 변경
    const nick = BOT_NICKNAMES[Math.floor(Math.random() * BOT_NICKNAMES.length)];
    await db.execute('UPDATE Users SET nickname = ? WHERE user_id = ?', [nick, _botUserId]);

    // 질문 등록 (자동 승인)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + (q.days || 30));
    const options = q.options ? JSON.stringify(q.options) : null;
    await db.execute(
      'INSERT INTO Questions (user_id, type, question, category, options, initial_prob, end_date, status) VALUES (?,?,?,?,?,?,?,?)',
      [_botUserId, q.type, q.question, q.category, options, q.initial_prob || null, endDate, 'APPROVED']
    );
    console.log(`[수퍼포켓 봇] "${nick}" 으로 게시: [${q.category}] ${q.question.slice(0,40)}...`);
  } catch (err) {
    console.error('[수퍼포켓 봇] 게시 실패:', err.message);
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
