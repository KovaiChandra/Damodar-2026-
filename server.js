const express = require('express');
const mysql   = require('mysql2/promise');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

require('dotenv').config();

const DATA_FILE = path.join(__dirname, 'registrations_local.json');

function readLocalRegistrations() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading local file:', e.message);
  }
  return [];
}

function saveLocalRegistration(entry) {
  try {
    const list = readLocalRegistrations();
    list.unshift(entry);
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing local file:', e.message);
  }
}

let pool = null;
if (process.env.DB_HOST && process.env.DB_USER) {
  try {
    pool = mysql.createPool({
      host    : process.env.DB_HOST,
      port    : process.env.DB_PORT || 3306,
      user    : process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'railway',
      ssl     : process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      waitForConnections: true,
      connectionLimit   : 5,
      connectTimeout    : 5000,
    });
  } catch (err) {
    console.warn('DB Pool initialization skipped or failed:', err.message);
  }
}

async function initDb() {
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
    try {
      await conn.execute(`ALTER TABLE damodara_registrations ADD COLUMN mentor_name VARCHAR(255) DEFAULT NULL`);
    } catch (_) {}
    console.log('✅ MySQL DB table ready.');
  } finally {
    conn.release();
  }
}

// POST /api/register
app.post('/api/register', async (req, res) => {
  const { name, phone, address, mentorName, mentor_name, email, area, capacity, prefWeek, notes } = req.body;
  if (!name || !phone || !address) {
    return res.status(400).json({ error: 'Please provide Name, Mobile Number, and Address.' });
  }

  const assignedMentor = mentor_name || mentorName || 'General / None';
  const assignedArea   = area || (address ? address.substring(0, 80) : 'Coimbatore');
  const assignedCap    = capacity || 'Family / Group';

  const entry = {
    id: Date.now(),
    name,
    phone,
    address,
    mentor_name: assignedMentor,
    area: assignedArea,
    capacity: assignedCap,
    email: email || '',
    pref_week: prefWeek || '',
    notes: notes || '',
    created_at: new Date().toISOString()
  };

  // Always save locally to prevent data loss
  saveLocalRegistration(entry);

  // Try DB
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
      console.warn('MySQL save failed (saved to local backup):', dbErr.message);
      try {
        await pool.execute(
          `INSERT INTO damodara_registrations
             (name, phone, email, area, address, capacity, pref_week, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [name, phone, email || null, assignedArea, address, assignedCap, prefWeek || null, (notes ? notes + ' | Mentor: ' : 'Mentor: ') + assignedMentor]
        );
        dbSaved = true;
      } catch (_) {}
    }
  }

  res.json({ ok: true, saved: true, dbSaved });
});

// GET /api/registrations (admin)
app.get('/api/registrations', async (req, res) => {
  if (pool) {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM damodara_registrations ORDER BY id DESC'
      );
      return res.json(rows);
    } catch (err) {
      console.warn('DB select failed, falling back to local file:', err.message);
    }
  }
  const localRows = readLocalRegistrations();
  res.json(localRows);
});

// Serve /admin console
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
if (pool) {
  initDb()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`\n🪔  Damodar Month site (with DB) → http://localhost:${PORT}\n`);
      });
    })
    .catch(err => {
      console.warn('DB init skipped:', err.message);
      app.listen(PORT, () => {
        console.log(`\n🪔  Damodar Month site (local mode) → http://localhost:${PORT}\n`);
      });
    });
} else {
  app.listen(PORT, () => {
    console.log(`\n🪔  Damodar Month site (local mode) → http://localhost:${PORT}\n`);
  });
}
