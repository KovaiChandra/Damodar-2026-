const express = require('express');
const mysql   = require('mysql2/promise');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// DB pool — set credentials via .env or environment variables
// Copy .env.example to .env and fill in your Railway/MySQL credentials
require('dotenv').config();

const pool = mysql.createPool({
  host    : process.env.DB_HOST,
  port    : process.env.DB_PORT     || 3306,
  user    : process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME     || 'railway',
  ssl     : process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  waitForConnections: true,
  connectionLimit   : 5,
});

// Create table on startup
async function initDb() {
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
  console.log('DB table ready.');
}

// POST /api/register
app.post('/api/register', async (req, res) => {
  const { name, phone, email, area, address, capacity, prefWeek, notes } = req.body;
  if (!name || !phone || !area || !address || !capacity) {
    return res.status(400).json({ error: 'Required fields missing.' });
  }
  try {
    await pool.execute(
      `INSERT INTO damodara_registrations
         (name, phone, email, area, address, capacity, pref_week, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, email||null, area, address, capacity, prefWeek||null, notes||null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error. Please try again.' });
  }
});

// GET /api/registrations  (admin)
app.get('/api/registrations', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM damodara_registrations ORDER BY id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// Serve index.html for everything else
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🪔  Damodar Month site → http://localhost:${PORT}\n`);
    });
  })
  .catch(err => {
    console.error('DB init failed:', err.message);
    // Start server anyway so static files are served
    app.listen(PORT, () => {
      console.log(`\n🪔  Damodar Month site (no DB) → http://localhost:${PORT}\n`);
    });
  });
