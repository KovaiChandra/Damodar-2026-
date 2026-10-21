const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

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

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  console.log('✅ Supabase client initialized.');
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
    name, phone, address,
    mentor_name: assignedMentor,
    area: assignedArea,
    capacity: assignedCap,
    email: email || '',
    pref_week: prefWeek || '',
    notes: notes || '',
    created_at: new Date().toISOString()
  };

  // Always save locally as backup
  saveLocalRegistration(entry);

  let dbSaved = false;
  if (supabase) {
    const { error } = await supabase.from('damodara_registrations').insert([{
      name,
      phone,
      email: email || null,
      area: assignedArea,
      address,
      capacity: assignedCap,
      mentor_name: assignedMentor,
      pref_week: prefWeek || null,
      notes: notes || null
    }]);
    if (error) {
      console.warn('Supabase save failed (saved to local backup):', error.message);
    } else {
      dbSaved = true;
    }
  }

  res.json({ ok: true, saved: true, dbSaved });
});

// GET /api/registrations (admin)
app.get('/api/registrations', async (req, res) => {
  if (supabase) {
    const { data, error } = await supabase
      .from('damodara_registrations')
      .select('*')
      .order('id', { ascending: false });
    if (!error) return res.json(data);
    console.warn('Supabase fetch failed, falling back to local file:', error.message);
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

app.listen(PORT, () => {
  console.log(`\n🪔  Damodar Month site → http://localhost:${PORT}\n`);
});
