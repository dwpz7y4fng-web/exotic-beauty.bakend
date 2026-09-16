require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');
const Stripe = require('stripe');
const twilio = require('twilio');
const cron = require('node-cron');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
const OPEN_HOURS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    if (
      process.env.ADMIN_USER && process.env.ADMIN_PASSWORD &&
      user && pass &&
      safeEqual(user, process.env.ADMIN_USER) &&
      safeEqual(pass, process.env.ADMIN_PASSWORD)
    ) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Exotic Beauty Admin"');
  res.status(401).send('Authentification requise');
}

app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature invalide: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    await pool.query(
      `update bookings set status = 'paid' where stripe_session_id = $1`,
      [session.id]
    );
  }
  res.json({ received: true });
});

app.use(express.json());

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
});

app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(`
    select b.id, b.slot_date, b.slot_time, b.client_name, b.client_phone, b.status, b.created_at,
      coalesce((
        select json_agg(json_build_object('id', s.id, 'label', s.label, 'price_cents', s.price_cents, 'deposit_cents', s.deposit_cents) order by s.label)
        from services s where s.id = any(b.service_ids)
      ), '[]') as services
    from bookings b
    order by b.slot_date desc, b.slot_time desc
  `);
  res.json(rows);
});

const BOOKING_STATUSES = ['pending', 'paid', 'confirmed', 'cancelled'];

app.post('/api/admin/bookings', requireAdmin, async (req, res) => {
  const { serviceIds, date, time, name, phone, status } = req.body;
  if (!Array.isArray(serviceIds) || serviceIds.length === 0 || !date || !time || !name || !phone) {
    return res.status(400).json({ error: 'champs manquants' });
  }
  const bookingStatus = status || 'confirmed';
  if (!BOOKING_STATUSES.includes(bookingStatus)) {
    return res.status(400).json({ error: 'statut invalide' });
  }

  const svcRes = await pool.query('select id from services where id = any($1)', [serviceIds]);
  if (svcRes.rows.length !== serviceIds.length) return res.status(404).json({ error: 'prestation inconnue' });

  try {
    const insertRes = await pool.query(
      `insert into bookings (service_ids, slot_date, slot_time, client_name, client_phone, status)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [serviceIds, date, time, name, phone, bookingStatus]
    );
    res.status(201).json({ id: insertRes.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'ce créneau est déjà pris' });
    }
    throw err;
  }
});

app.patch('/api/admin/bookings/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const existingRes = await pool.query('select * from bookings where id = $1', [id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: 'réservation introuvable' });

  const serviceIds = req.body.serviceIds || existing.service_ids;
  const date = req.body.date || existing.slot_date.toISOString().slice(0, 10);
  const time = req.body.time || existing.slot_time.slice(0, 5);
  const name = req.body.name || existing.client_name;
  const phone = req.body.phone || existing.client_phone;
  const status = req.body.status || existing.status;

  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    return res.status(400).json({ error: 'au moins une prestation requise' });
  }
  if (!BOOKING_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'statut invalide' });
  }

  const svcRes = await pool.query('select id from services where id = any($1)', [serviceIds]);
  if (svcRes.rows.length !== serviceIds.length) return res.status(404).json({ error: 'prestation inconnue' });

  try {
    await pool.query(
      `update bookings set service_ids = $1, slot_date = $2, slot_time = $3, client_name = $4, client_phone = $5, status = $6
       where id = $7`,
      [serviceIds, date, time, name, phone, status, id]
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'ce créneau est déjà pris' });
    }
    throw err;
  }
});

app.get('/api/admin/clients', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'select id, name, phone, email, comments, gender, planity_created_at, planity_deleted_at from clients order by name'
  );
  res.json(rows);
});

app.post('/api/admin/clients/import', requireAdmin, async (req, res) => {
  const { clients } = req.body;
  if (!Array.isArray(clients) || clients.length === 0) {
    return res.status(400).json({ error: 'aucune cliente à importer' });
  }

  let imported = 0;
  let skipped = 0;
  for (const c of clients) {
    const name = (c.name || '').trim();
    if (!name) { skipped++; continue; }
    const phone = (c.phone || '').trim() || null;
    const email = (c.email || '').trim() || null;
    const comments = (c.comments || '').trim() || null;
    const gender = (c.gender || '').trim() || null;
    const createdAt = c.createdAt || null;
    const deletedAt = c.deletedAt || null;

    if (phone) {
      await pool.query(
        `insert into clients (name, phone, email, comments, gender, planity_created_at, planity_deleted_at)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (phone) where phone is not null and phone != ''
         do update set name = excluded.name, email = excluded.email, comments = excluded.comments,
           gender = excluded.gender, planity_created_at = excluded.planity_created_at,
           planity_deleted_at = excluded.planity_deleted_at`,
        [name, phone, email, comments, gender, createdAt, deletedAt]
      );
    } else {
      await pool.query(
        `insert into clients (name, phone, email, comments, gender, planity_created_at, planity_deleted_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [name, phone, email, comments, gender, createdAt, deletedAt]
      );
    }
    imported++;
  }

  res.json({ imported, skipped });
});

function foldLabel(str) {
  return (str || '')
    .normalize('NFKC')
    .replace(/ /g, ' ')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

app.post('/api/admin/bookings/import-planity', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'aucun fichier' });

  const svcRes = await pool.query('select id, label from services');
  const byFold = new Map();
  for (const s of svcRes.rows) byFold.set(foldLabel(s.label), s.id);
  const bareBrowLift = svcRes.rows.find(s => s.label === 'Brow lift (sans teinture)');
  if (bareBrowLift) byFold.set('brow lift', bareBrowLift.id);
  const mixte = svcRes.rows.find(s => s.label === 'Mixte');
  if (mixte) byFold.set('pose mixte', mixte.id);

  let workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: 'fichier illisible — est-ce bien un .xlsx exporté de Planity ?' });
  }

  const sheet = workbook.getWorksheet('Détails RDV');
  if (!sheet) return res.status(400).json({ error: 'feuille "Détails RDV" introuvable dans ce fichier' });

  const headers = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headers[String(cell.value).trim()] = colNumber;
  });
  const col = (name) => headers[name];
  const cellText = (row, name) => {
    const c = col(name);
    if (!c) return null;
    const v = row.getCell(c).value;
    if (v == null) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object' && v.text) return v.text;
    return v;
  };

  let imported = 0, conflicts = 0, skipped = 0;
  const unmatched = new Set();

  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const clientName = cellText(row, 'Nom du client');
    const dateRdv = cellText(row, 'Date du RDV');
    const heureRdv = cellText(row, 'Heure du RDV');
    const prestaName = cellText(row, 'Nom prestation');
    const phone = cellText(row, 'Telephone');
    const venu = cellText(row, 'Venu');

    if (!clientName || !dateRdv || !heureRdv || !prestaName) { skipped++; continue; }

    const isoDate = dateRdv instanceof Date ? dateRdv.toISOString().slice(0, 10) : String(dateRdv).trim().slice(0, 10);
    const time = heureRdv instanceof Date ? heureRdv.toISOString().slice(11, 16) : String(heureRdv).trim().slice(0, 5);

    const parts = String(prestaName).split('+').map(foldLabel);
    const serviceIds = [];
    let allMatched = true;
    for (const p of parts) {
      const id = byFold.get(p);
      if (id) serviceIds.push(id);
      else { allMatched = false; unmatched.add(p); }
    }
    if (!allMatched || serviceIds.length === 0) { skipped++; continue; }

    const status = venu === 'Non' ? 'cancelled' : 'confirmed';

    try {
      await pool.query(
        `insert into bookings (service_ids, slot_date, slot_time, client_name, client_phone, status)
         values ($1, $2, $3, $4, $5, $6)`,
        [serviceIds, isoDate, time, String(clientName).trim(), (phone || '').toString().trim(), status]
      );
      imported++;
    } catch (err) {
      if (err.code === '23505') { conflicts++; }
      else throw err;
    }
  }

  res.json({ imported, conflicts, skipped, unmatched: [...unmatched] });
});

app.use(express.static('public'));

app.get('/api/services', async (req, res) => {
  const { rows } = await pool.query('select id, label, duration_minutes, price_cents, deposit_cents from services');
  res.json(rows);
});

app.get('/api/availability', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date manquante' });

  const { rows } = await pool.query(
    `select slot_time from bookings where slot_date = $1 and status != 'cancelled'`,
    [date]
  );
  const taken = rows.map(r => r.slot_time.slice(0, 5));
  const available = OPEN_HOURS.filter(h => !taken.includes(h));
  res.json({ date, available, taken });
});

app.post('/api/book', async (req, res) => {
  const { serviceIds, date, time, name, phone } = req.body;
  if (!Array.isArray(serviceIds) || serviceIds.length === 0 || !date || !time || !name || !phone) {
    return res.status(400).json({ error: 'champs manquants' });
  }

  const svcRes = await pool.query('select * from services where id = any($1)', [serviceIds]);
  if (svcRes.rows.length !== serviceIds.length) return res.status(404).json({ error: 'prestation inconnue' });
  const services = svcRes.rows;
  const totalDeposit = services.reduce((sum, s) => sum + s.deposit_cents, 0);
  const labels = services.map(s => s.label).join(' + ');

  let booking;
  try {
    const insertRes = await pool.query(
      `insert into bookings (service_ids, slot_date, slot_time, client_name, client_phone)
       values ($1, $2, $3, $4, $5) returning id`,
      [serviceIds, date, time, name, phone]
    );
    booking = insertRes.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'ce créneau vient d\'être réservé' });
    }
    throw err;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: { name: `Acompte — ${labels} (${date} ${time})` },
        unit_amount: totalDeposit,
      },
      quantity: 1,
    }],
    success_url: `${SITE_URL}/confirmation.html?booking=${booking.id}`,
    cancel_url: `${SITE_URL}/?cancelled=1`,
  });

  await pool.query('update bookings set stripe_session_id = $1 where id = $2', [session.id, booking.id]);
  res.json({ checkoutUrl: session.url });
});

cron.schedule('0 10 * * *', async () => {
  const { rows } = await pool.query(`
    select b.*, (select string_agg(s.label, ' + ' order by s.label) from services s where s.id = any(b.service_ids)) as label
    from bookings b
    where b.status = 'paid'
      and b.reminder_sent = false
      and b.slot_date = (current_date + interval '1 day')::date
  `);

  for (const b of rows) {
    try {
      await twilioClient.messages.create({
        to: b.client_phone,
        from: process.env.TWILIO_FROM_NUMBER,
        body: `Exotic Beauty — rappel : rendez-vous demain à ${b.slot_time.slice(0,5)} pour ${b.label}. À très vite !`,
      });
      await pool.query('update bookings set reminder_sent = true where id = $1', [b.id]);
    } catch (err) {
      console.error('Échec envoi SMS pour', b.id, err.message);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Exotic Beauty server running on port ${PORT}`));
