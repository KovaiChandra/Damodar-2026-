// Vercel serverless function — handles both POST (register) and GET (admin list)
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

let pool = null;
if (process.env.DB_HOST && process.env.DB_USER) {
  try {
    pool = mysql.createPool({
      host    : process.env.DB_HOST,
      port    : process.env.DB_PORT || 3306,
      user    : process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl     : process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      waitForConnections: true,
      connectionLimit   : 3,
      connectTimeout    : 6000,
    });
  } catch (e) {
    console.error('Pool initialization failed:', e.message);
  }
}

async function ensureTable() {
  if (!pool) return;
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS damodara_registrations (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        phone       VARCHAR(50)  NOT NULL,
        email       VARCHAR(255),
        area        VARCHAR(255) DEFAULT 'Coimbatore',
        address     TEXT         NOT NULL,
        capacity    VARCHAR(50)  DEFAULT 'Home / Group',
        mentor_name VARCHAR(255) DEFAULT NULL,
        pref_week   VARCHAR(50),
        notes       TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Ensure mentor_name exists if table was created previously
    try {
      await conn.execute(`ALTER TABLE damodara_registrations ADD COLUMN mentor_name VARCHAR(255) DEFAULT NULL`);
    } catch (_) {
      // Column might already exist
    }
  } finally {
    conn.release();
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (pool) {
      try {
        await ensureTable();
      } catch (err) {
        console.warn('DB ensureTable warning:', err.message);
      }
    }

    if (req.method === 'POST') {
      const { name, phone, address, mentorName, mentor_name, email, area, capacity, prefWeek, notes } = req.body;
      if (!name || !phone || !address) {
        return res.status(400).json({ error: 'Please provide Name, Phone Number, and Address.' });
      }

      const assignedMentor = mentor_name || mentorName || 'General / None';
      const assignedArea   = area || (address ? address.substring(0, 80) : 'Coimbatore');
      const assignedCap    = capacity || 'Family / Group';

      let dbSaved = false;
      if (pool) {
        try {
          await pool.execute(
            `INSERT INTO damodara_registrations
               (name, phone, email, area, address, capacity, mentor_name, pref_week, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, phone, email || null, assignedArea, address, assignedCap, assignedMentor, prefWeek || null, notes || null]
          );
          dbSaved = true;
        } catch (dbErr) {
          console.error('MySQL insert error:', dbErr.message);
          // Try inserting without mentor_name if schema mismatch
          try {
            await pool.execute(
              `INSERT INTO damodara_registrations
                 (name, phone, email, area, address, capacity, pref_week, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [name, phone, email || null, assignedArea, address, assignedCap, prefWeek || null, (notes ? notes + ' | Mentor: ' : 'Mentor: ') + assignedMentor]
            );
            dbSaved = true;
          } catch (fallbackErr) {
            console.error('MySQL secondary fallback failed:', fallbackErr.message);
          }
        }
      }

      return res.status(200).json({ ok: true, savedToDb: dbSaved });
    }

    if (req.method === 'GET') {
      if (pool) {
        try {
          const [rows] = await pool.execute(
            'SELECT * FROM damodara_registrations ORDER BY id DESC'
          );
          return res.status(200).json(rows);
        } catch (e) {
          console.error('Fetch DB failed:', e.message);
        }
      }
      return res.status(200).json([]);
    }

    res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error. Please try again or WhatsApp directly.' });
  }
};
