require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const sql     = require('mssql');
const path    = require('path');
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.use(cors());
app.use(express.json());

// ── 요청 로거 ────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | body:${JSON.stringify(req.body)} | auth:${req.headers['authorization'] ? 'yes' : 'no'}`);
  }
  next();
});

// ── 정적 파일 서빙 (C:\foket 루트 디렉토리) ───────────────
app.use(express.static(path.join(__dirname, '..')));
// / → main.html 기본 제공
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'main.html')));

// ── 설정 ──────────────────────────────────────────────────
const JWT_SECRET      = process.env.JWT_SECRET      || 'foket-jwt-secret-change-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';   // Google Cloud Console에서 발급
const PORT            = process.env.PORT             || 4000;

const dbConfig = {
  server:   process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME   || 'FoketDB',
  user:     process.env.DB_USER   || 'foket_app',
  password: process.env.DB_PASS   || 'Foket2026',
  options:  { trustServerCertificate: true, encrypt: false }
};

let pool;
async function getPool() {
  if (!pool || !pool.connected) {
    pool = await sql.connect(dbConfig);
  }
  return pool;
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ── 헬퍼 ─────────────────────────────────────────────────
function makeToken(user) {
  return jwt.sign({ userId: user.user_id, email: user.email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
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
  // 간단한 관리자 키 방식 (실제 운영에서는 관리자 JWT 사용 권장)
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
    const result = await db.request()
      .input('nickname', sql.NVarChar, nickname.trim())
      .query('SELECT user_id FROM dbo.Users WHERE nickname = @nickname');
    res.json({ available: result.recordset.length === 0 });
  } catch (err) {
    res.status(500).json({ available: false, reason: '서버 오류' });
  }
});

// ── 닉네임 설정 (로그인 후 미설정 회원용) ─────────────────
app.post('/api/set-nickname', authMiddleware, async (req, res) => {
  const { nickname } = req.body;
  if (!nickname || nickname.trim().length < 2)
    return res.status(400).json({ error: '닉네임은 2자 이상이어야 합니다' });
  if (nickname.trim().length > 20)
    return res.status(400).json({ error: '닉네임은 20자 이하여야 합니다' });
  try {
    const db = await getPool();
    const dup = await db.request()
      .input('nickname', sql.NVarChar, nickname.trim())
      .input('userId',   sql.BigInt,   req.user.userId)
      .query('SELECT user_id FROM dbo.Users WHERE nickname = @nickname AND user_id <> @userId');
    if (dup.recordset.length > 0)
      return res.status(409).json({ error: '이미 사용 중인 닉네임입니다' });
    await db.request()
      .input('nickname', sql.NVarChar, nickname.trim())
      .input('userId',   sql.BigInt,   req.user.userId)
      .query('UPDATE dbo.Users SET nickname = @nickname, updated_at = GETDATE() WHERE user_id = @userId');
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

    // 이메일 중복 확인
    const existing = await db.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT user_id FROM dbo.Users WHERE email = @email');
    if (existing.recordset.length > 0)
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다' });

    // 닉네임 중복 확인
    const nickDup = await db.request()
      .input('nickname', sql.NVarChar, nickname.trim())
      .query('SELECT user_id FROM dbo.Users WHERE nickname = @nickname');
    if (nickDup.recordset.length > 0)
      return res.status(409).json({ error: '이미 사용 중인 닉네임입니다' });

    const hash = await bcrypt.hash(password, 12);

    const result = await db.request()
      .input('email',     sql.NVarChar, email)
      .input('hash',      sql.NVarChar, hash)
      .input('full_name', sql.NVarChar, full_name)
      .input('nickname',  sql.NVarChar, nickname.trim())
      .query(`
        INSERT INTO dbo.Users (email, password_hash, full_name, nickname, kyc_status, status)
        OUTPUT INSERTED.user_id, INSERTED.email, INSERTED.full_name, INSERTED.nickname, INSERTED.created_at
        VALUES (@email, @hash, @full_name, @nickname, 'PENDING', 'ACTIVE')
      `);

    const user = result.recordset[0];
    const token = makeToken(user);
    res.json({ token, user: { user_id: user.user_id, email: user.email, full_name: user.full_name, nickname: user.nickname } });
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
    const result = await db.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT user_id, email, full_name, nickname, password_hash, status FROM dbo.Users WHERE email = @email');

    if (result.recordset.length === 0)
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });

    const user = result.recordset[0];
    if (user.status === 'SUSPENDED')
      return res.status(403).json({ error: '정지된 계정입니다. 고객센터에 문의하세요' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });

    // 마지막 로그인 시간 업데이트
    await db.request()
      .input('userId', sql.BigInt, user.user_id)
      .query('UPDATE dbo.Users SET last_login_at = GETDATE() WHERE user_id = @userId');

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

    // 기존 회원 조회
    const existing = await db.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT user_id, email, full_name, nickname, status FROM dbo.Users WHERE email = @email');

    let user;
    if (existing.recordset.length > 0) {
      user = existing.recordset[0];
      if (user.status === 'SUSPENDED')
        return res.status(403).json({ error: '정지된 계정입니다' });
      // 마지막 로그인 업데이트
      await db.request()
        .input('userId', sql.BigInt, user.user_id)
        .query('UPDATE dbo.Users SET last_login_at = GETDATE() WHERE user_id = @userId');
    } else {
      // 신규 회원 등록
      const result = await db.request()
        .input('email',     sql.NVarChar, email)
        .input('full_name', sql.NVarChar, name || email.split('@')[0])
        .input('googleSub', sql.NVarChar, googleSub)
        .query(`
          INSERT INTO dbo.Users (email, password_hash, full_name, kyc_status, status)
          OUTPUT INSERTED.user_id, INSERTED.email, INSERTED.full_name
          VALUES (@email, @googleSub, @full_name, 'PENDING', 'ACTIVE')
        `);
      user = result.recordset[0];
    }

    const token = makeToken(user);
    res.json({ token, user: { user_id: user.user_id, email: user.email, full_name: user.full_name, nickname: user.nickname }, isNew: !existing.recordset.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Google 인증 실패' });
  }
});

// ── 내 정보 ───────────────────────────────────────────────
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('userId', sql.BigInt, req.user.userId)
      .query('SELECT user_id, email, full_name, nickname, grade, balance, kyc_status, status, created_at FROM dbo.Users WHERE user_id = @userId');
    if (!result.recordset.length) return res.status(404).json({ error: '회원 없음' });
    res.json(result.recordset[0]);
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
    const req2 = db.request();

    if (q) {
      where += ' AND (u.email LIKE @q OR u.full_name LIKE @q OR CAST(u.user_id AS NVARCHAR) LIKE @q)';
      req2.input('q', sql.NVarChar, `%${q}%`);
    }
    if (status && status !== 'all') {
      where += ' AND u.status = @status';
      req2.input('status', sql.NVarChar, status);
    }
    if (grade && grade !== 'all') {
      where += ' AND u.grade = @grade';
      req2.input('grade', sql.NVarChar, grade);
    }

    const offset = (page - 1) * limit;
    req2.input('offset', sql.Int, offset);
    req2.input('limit',  sql.Int, parseInt(limit));

    const result = await req2.query(`
      SELECT u.user_id, u.email, u.full_name, u.nickname, u.grade, u.balance,
             u.total_traded, u.kyc_status, u.status, u.created_at,
             u.last_seen_at, COUNT(t.trade_id) AS trade_count
      FROM dbo.Users u
      LEFT JOIN dbo.Trades t ON u.user_id = t.user_id
      ${where}
      GROUP BY u.user_id, u.email, u.full_name, u.nickname, u.grade, u.balance,
               u.total_traded, u.kyc_status, u.status, u.created_at, u.last_seen_at
      ORDER BY u.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const countResult = await db.request().query(`SELECT COUNT(*) AS total FROM dbo.Users u ${where.replace(/@q|@status|@grade/g, (m) => {
      if (m === '@q') return `'%'`;
      return `''`;
    })}`);

    res.json({ users: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: 회원 정보 수정 ────────────────────────────────
app.patch('/api/admin/users/:id', adminMiddleware, async (req, res) => {
  const { full_name, email, nickname, grade, balance } = req.body;
  const fields = [];
  const request = (await getPool()).request().input('userId', sql.BigInt, req.params.id);

  if (full_name !== undefined) { fields.push('full_name = @full_name'); request.input('full_name', sql.NVarChar, full_name); }
  if (email     !== undefined) { fields.push('email = @email');         request.input('email',     sql.NVarChar, email); }
  if (nickname  !== undefined) { fields.push('nickname = @nickname');   request.input('nickname',  sql.NVarChar, nickname); }
  if (grade     !== undefined) { fields.push('grade = @grade');         request.input('grade',     sql.NVarChar, grade); }
  if (balance   !== undefined) { fields.push('balance = @balance');     request.input('balance',   sql.Decimal(18,2), balance); }

  if (!fields.length) return res.status(400).json({ error: '수정할 항목이 없습니다' });

  try {
    await request.query(`UPDATE dbo.Users SET ${fields.join(', ')}, updated_at = GETDATE() WHERE user_id = @userId`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: 회원 상태 변경 ────────────────────────────────
app.patch('/api/admin/users/:id/status', adminMiddleware, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['ACTIVE', 'SUSPENDED', 'FLAGGED'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: '유효하지 않은 상태값' });
  try {
    const db = await getPool();
    await db.request()
      .input('userId', sql.BigInt, req.params.id)
      .input('status', sql.NVarChar, status)
      .query('UPDATE dbo.Users SET status = @status, updated_at = GETDATE() WHERE user_id = @userId');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: 회원 강제탈퇴 ────────────────────────────────
app.delete('/api/admin/users/:id', adminMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const userId = req.params.id;
    // 연관 데이터 순서대로 삭제
    await db.request().input('userId', sql.BigInt, userId).query('DELETE FROM dbo.ComplianceFlags WHERE user_id = @userId');
    await db.request().input('userId', sql.BigInt, userId).query('DELETE FROM dbo.Transactions WHERE user_id = @userId');
    await db.request().input('userId', sql.BigInt, userId).query('DELETE FROM dbo.Withdrawals WHERE user_id = @userId');
    await db.request().input('userId', sql.BigInt, userId).query('DELETE FROM dbo.Trades WHERE user_id = @userId');
    await db.request().input('userId', sql.BigInt, userId).query('DELETE FROM dbo.VoteResponses WHERE user_id = @userId');
    await db.request().input('userId', sql.BigInt, userId).query('DELETE FROM dbo.Users WHERE user_id = @userId');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── Heartbeat (접속 상태 갱신) ────────────────────────────
app.post('/api/heartbeat', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('userId', sql.BigInt, req.user.userId)
      .query('UPDATE dbo.Users SET last_seen_at = GETDATE() WHERE user_id = @userId');
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

/*
  DB 초기화 (한 번만 실행):
  CREATE TABLE dbo.Questions (
    question_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    type        NVARCHAR(10) NOT NULL,        -- 'vote' | 'bet'
    question    NVARCHAR(500) NOT NULL,
    category    NVARCHAR(50),
    options     NVARCHAR(MAX),               -- JSON array (투표용)
    initial_prob INT,                        -- 내기 초기 확률 (%)
    end_date    DATETIME,
    status      NVARCHAR(20) DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
    created_at  DATETIME DEFAULT GETDATE()
  );
*/
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
    const result = await db.request()
      .input('userId',      sql.BigInt,   req.user.userId)
      .input('type',        sql.NVarChar, type)
      .input('question',    sql.NVarChar, question.trim())
      .input('category',    sql.NVarChar, category)
      .input('options',     sql.NVarChar, optionsJson)
      .input('initialProb', sql.Int,      prob)
      .input('endDate',     sql.DateTime, new Date(end_date))
      .query(`
        INSERT INTO dbo.Questions (user_id, type, question, category, options, initial_prob, end_date, status, created_at)
        OUTPUT INSERTED.question_id
        VALUES (@userId, @type, @question, @category, @options, @initialProb, @endDate, 'PENDING', GETDATE())
      `);
    res.json({ ok: true, question_id: result.recordset[0].question_id });
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
    const r = db.request();
    if (category) { where += ' AND q.category = @category'; r.input('category', sql.NVarChar, category); }
    if (type)     { where += ' AND q.type = @type';         r.input('type',     sql.NVarChar, type); }
    if (status)   { where += ' AND q.status = @status';     r.input('status',   sql.NVarChar, status); }
    const result = await r.query(`
      SELECT q.question_id, q.user_id, q.type, q.question, q.category,
             q.options, q.initial_prob, q.end_date, q.status, q.created_at,
             u.email, u.nickname, u.full_name
      FROM dbo.Questions q
      LEFT JOIN dbo.Users u ON q.user_id = u.user_id
      ${where}
      ORDER BY q.created_at DESC
    `);
    res.json({ questions: result.recordset });
  } catch (err) {
    console.error('[admin/questions GET]', err.message);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 관리자: 질문 상태 변경 (승인/거절) ───────────────────
app.patch('/api/admin/questions/:id/status', adminMiddleware, async (req, res) => {
  const { status } = req.body;
  if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status))
    return res.status(400).json({ error: '유효하지 않은 상태값' });
  try {
    const db = await getPool();
    await db.request()
      .input('id',     sql.BigInt,   req.params.id)
      .input('status', sql.NVarChar, status)
      .query('UPDATE dbo.Questions SET status = @status WHERE question_id = @id');
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
    await db.request()
      .input('id', sql.BigInt, req.params.id)
      .query('DELETE FROM dbo.Questions WHERE question_id = @id');
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/questions DELETE]', err.message);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── 공개 설정 (프론트엔드용) ──────────────────────────────
app.get('/api/public-config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID || '' });
});

// ── 서버 시작 ─────────────────────────────────────────────
getPool()
  .then(() => {
    app.listen(PORT, () => console.log(`Foket API 서버 실행 중: http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('DB 연결 실패:', err.message);
    // DB 없어도 서버는 기동
    app.listen(PORT, () => console.log(`Foket API 서버 실행 중 (DB 오프라인): http://localhost:${PORT}`));
  });
