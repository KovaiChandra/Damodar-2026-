// Vercel serverless function — handles both POST (register) and GET (admin list)
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host    : process.env.DB_HOST,
  port    : process.env.DB_PORT || 3306,
  user    : process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl     : process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  waitForConnections: true,
  connectionLimit   : 3,
});

async function ensureTable() {
  const conn = await pool.getConnection();
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS damodara_registrations (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(255) NOT NULL,
      phone      VARCHAR(50)  NOT NULL,
      email      VARCHAR(255),
      area       VARCHAR(255) NOT NULL,
      address    TEXT         NOT NULL,
      capacity   VARCHAR(50)  NOT NULL,
      pref_week  VARCHAR(50),
      notes      TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  conn.release();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTable();

    if (req.method === 'POST') {
      const { name, phone, email, area, address, capacity, prefWeek, notes } = req.body;
      if (!name || !phone || !area || !address || !capacity) {
        return res.status(400).json({ error: 'Required fields missing.' });
      }
      await pool.execute(
        `INSERT INTO damodara_registrations
           (name, phone, email, area, address, capacity, pref_week, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, phone, email||null, area, address, capacity, prefWeek||null, notes||null]
      );
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const [rows] = await pool.execute(
        'SELECT * FROM damodara_registrations ORDER BY id DESC'
      );
      return res.status(200).json(rows);
    }

    res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
};
