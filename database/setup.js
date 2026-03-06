/**
 * Database Setup Script
 * Run: node database/setup.js
 * Creates the database and all tables with seed data
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function setup() {
  console.log('\n  FoketCrypto Database Setup\n  ==========================\n');

  // Connect without database first
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4',
    multipleStatements: true
  });

  console.log('  ✓ Connected to MySQL');

  // Create database
  await conn.query('CREATE DATABASE IF NOT EXISTS `foketcrypto_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
  console.log('  ✓ Database "foketcrypto_db" created/verified');

  await conn.query('USE `foketcrypto_db`;');

  // Run schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);
  console.log('  ✓ Schema applied');

  // Create default admin with hashed password
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@foketcrypto.com';
  const hash = await bcrypt.hash(adminPassword, 10);

  await conn.query(
    `INSERT INTO users (email, password, username, role) VALUES (?, ?, 'Administrator', 'superadmin')
     ON DUPLICATE KEY UPDATE password = ?`,
    [adminEmail, hash, hash]
  );
  console.log(`  ✓ Admin user: ${adminEmail}`);
  console.log(`  ✓ Admin password: ${adminPassword}`);

  await conn.end();
  console.log('\n  Setup complete! Now run: npm start\n');
}

setup().catch(err => {
  console.error('\n  Setup failed:', err.message);
  console.error('  Make sure MySQL is running and .env is configured\n');
  process.exit(1);
});
