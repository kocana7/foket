require('/var/www/foket/node_modules/dotenv').config({ path: '/var/www/foket/.env' });
const bcrypt = require('/var/www/foket/node_modules/bcryptjs');
const mysql = require('/var/www/foket/node_modules/mysql2/promise');

async function run() {
  const hash = await bcrypt.hash('Admin@123', 10);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  await conn.execute(
    "UPDATE users SET email='admin@foketcrypto.com', password=? WHERE role IN ('admin','superadmin')",
    [hash]
  );
  const [[u]] = await conn.execute("SELECT email FROM users WHERE role IN ('admin','superadmin')");
  console.log('완료:', u.email);
  await conn.end();
}
run().catch(console.error);
