/**
 * MSSQL 연결 (Foket 관리자/메인 페이지 저장용)
 * .env에 MSSQL 설정이 있으면 사용하고, 없으면 null 반환 (localStorage 사용)
 */
let pool = null;

function getMssqlConfig() {
  const host = process.env.MSSQL_HOST || process.env.MSSQL_SERVER;
  const user = process.env.MSSQL_USER;
  const password = process.env.MSSQL_PASSWORD;
  const database = process.env.MSSQL_DATABASE || 'FoketDB';
  if (!host || !user || !password) return null;
  return {
    server: host,
    port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user,
    password,
    database,
    options: {
      encrypt: process.env.MSSQL_ENCRYPT === 'true',
      trustServerCertificate: process.env.MSSQL_TRUST_CERT !== 'false',
      enableArithAbort: true,
      instanceName: process.env.MSSQL_INSTANCE || undefined,
    },
  };
}

async function getPool() {
  if (pool) return pool;
  const config = getMssqlConfig();
  if (!config) return null;
  try {
    const sql = require('mssql');
    pool = await sql.connect(config);
    console.log('  MSSQL connected: FoketDB (AppStorage)');
    return pool;
  } catch (err) {
    console.warn('  MSSQL not configured or connection failed:', err.message);
    return null;
  }
}

async function queryStorage(key) {
  const p = await getPool();
  if (!p) return null;
  try {
    const r = await p.request()
      .input('key', require('mssql').NVARCHAR(128), key)
      .query('SELECT [Value] FROM [dbo].[AppStorage] WHERE [Key] = @key');
    if (r.recordset && r.recordset.length > 0) return r.recordset[0].Value;
    return null;
  } catch (e) {
    console.error('MSSQL storage get error:', e.message);
    return null;
  }
}

async function saveStorage(key, value) {
  const p = await getPool();
  if (!p) return false;
  try {
    const sql = require('mssql');
    await p.request()
      .input('key', sql.NVARCHAR(128), key)
      .input('value', sql.NVARCHAR(sql.MAX), typeof value === 'string' ? value : JSON.stringify(value))
      .query(`
        MERGE [dbo].[AppStorage] AS t
        USING (SELECT @key AS [Key], @value AS [Value]) AS s
        ON t.[Key] = s.[Key]
        WHEN MATCHED THEN UPDATE SET [Value] = s.[Value], [UpdatedAt] = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT ([Key], [Value]) VALUES (s.[Key], s.[Value]);
      `);
    return true;
  } catch (e) {
    console.error('MSSQL storage set error:', e.message);
    return false;
  }
}

module.exports = {
  getPool,
  getMssqlConfig,
  queryStorage,
  saveStorage,
};
