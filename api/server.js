require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const sql     = require('mssql');
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.use(cors());
app.use(express.json());

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
  if (!pool) {
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

// ── 이메일 회원가입 ───────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { full_name, email, password } = req.body;
  if (!full_name || !email || !password)
    return res.status(400).json({ error: '이름, 이메일, 비밀번호를 입력하세요' });
  if (password.length < 8)
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다' });

  try {
    const db = await getPool();

    // 이메일 중복 확인
    const existing = await db.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT user_id FROM dbo.Users WHERE email = @email');
    if (existing.recordset.length > 0)
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다' });

    const hash = await bcrypt.hash(password, 12);

    const result = await db.request()
      .input('email',     sql.NVarChar, email)
      .input('hash',      sql.NVarChar, hash)
      .input('full_name', sql.NVarChar, full_name)
      .query(`
        INSERT INTO dbo.Users (email, password_hash, full_name, kyc_status, status)
        OUTPUT INSERTED.user_id, INSERTED.email, INSERTED.full_name, INSERTED.created_at
        VALUES (@email, @hash, @full_name, 'PENDING', 'ACTIVE')
      `);

    const user = result.recordset[0];
    const token = makeToken(user);
    res.json({ token, user: { user_id: user.user_id, email: user.email, full_name: user.full_name } });
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
      .query('SELECT user_id, email, full_name, password_hash, status FROM dbo.Users WHERE email = @email');

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
    res.json({ token, user: { user_id: user.user_id, email: user.email, full_name: user.full_name } });
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
      .query('SELECT user_id, email, full_name, status FROM dbo.Users WHERE email = @email');

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
    res.json({ token, user: { user_id: user.user_id, email: user.email, full_name: user.full_name }, isNew: !existing.recordset.length });
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
      SELECT u.user_id, u.email, u.full_name, u.grade, u.balance,
             u.total_traded, u.kyc_status, u.status, u.created_at,
             u.last_seen_at, COUNT(t.trade_id) AS trade_count
      FROM dbo.Users u
      LEFT JOIN dbo.Trades t ON u.user_id = t.user_id
      ${where}
      GROUP BY u.user_id, u.email, u.full_name, u.grade, u.balance,
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
