require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');
const Stripe = require('stripe');
const notif = require('./notifications');
const cron = require('node-cron');

// A single request throwing an unhandled async error (e.g. a failing external API call)
// must never take the whole server down for every other visitor — log it and keep serving.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (server kept running):', err);
});

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

// ─── Horaires d'ouverture (heure de Martinique) ───────────────────────────────
// Une ligne par jour (0 = dimanche … 6 = samedi), avec les plages de travail.
// Pour changer tes horaires, modifie uniquement ce tableau (et le bloc « Horaires »
// de public/index.html pour l'affichage).
const TIMEZONE = 'America/Martinique';
const SCHEDULE = {
  0: [],                                        // dimanche : fermé
  1: [['09:00', '12:00'], ['12:30', '17:00']],  // lundi
  2: [['09:00', '12:00'], ['12:30', '17:00']],  // mardi
  3: [['09:00', '10:30'], ['12:00', '14:30']],  // mercredi (pour le moment)
  4: [['09:00', '12:00'], ['12:30', '17:00']],  // jeudi
  5: [['09:00', '12:00'], ['12:30', '17:00']],  // vendredi
  6: [['09:00', '12:00'], ['12:30', '18:00']],  // samedi
};
const SLOT_STEP_MINUTES = 30;     // on propose un début toutes les 30 min (9h00, 9h30…)
const BUFFER_MINUTES = 0;         // temps de battement entre deux clientes (ménage…)
const BLOCKED_SLOT_MINUTES = 60;  // un créneau fermé dans l'admin bloque 1 h
const DEFAULT_DURATION_MINUTES = 60;

function timeToMinutes(t) { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; }
function minutesToTime(n) { return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
function dayOfWeek(isoDate) { return new Date(isoDate + 'T12:00:00Z').getUTCDay(); }
function nowInMartinique() {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^\d{2}:\d{2}$/;

// Heures de début libres pour une prestation de `durationMinutes` ce jour-là :
// la prestation doit tenir entière dans une plage d'ouverture, sans chevaucher un
// rendez-vous existant (avec SA durée réelle) ni un créneau fermé.
async function computeAvailableTimes(db, date, durationMinutes) {
  const ranges = SCHEDULE[dayOfWeek(date)] || [];
  const now = nowInMartinique();
  if (!ranges.length || date < now.date) return [];

  const [bookedRes, blockedRes] = await Promise.all([
    db.query(
      `select b.slot_time, coalesce(sum(s.duration_minutes), 0)::int as duration
       from bookings b left join services s on s.id = any(b.service_ids)
       where b.slot_date = $1 and b.status != 'cancelled'
       group by b.id, b.slot_time`,
      [date]
    ),
    db.query('select slot_time from blocked_slots where slot_date = $1', [date]),
  ]);
  if (blockedRes.rows.some(r => r.slot_time === null)) return [];

  const busy = bookedRes.rows.map(r => {
    const start = timeToMinutes(r.slot_time);
    return [start, start + (r.duration || DEFAULT_DURATION_MINUTES) + BUFFER_MINUTES];
  }).concat(blockedRes.rows.map(r => {
    const start = timeToMinutes(r.slot_time);
    return [start, start + BLOCKED_SLOT_MINUTES];
  }));

  const available = [];
  for (const [open, close] of ranges) {
    const rangeStart = timeToMinutes(open), rangeEnd = timeToMinutes(close);
    for (let t = rangeStart; t + durationMinutes <= rangeEnd; t += SLOT_STEP_MINUTES) {
      if (date === now.date && t <= now.minutes) continue; // déjà passé
      const end = t + durationMinutes + BUFFER_MINUTES;
      if (busy.some(([bStart, bEnd]) => t < bEnd && bStart < end)) continue;
      available.push(minutesToTime(t));
    }
  }
  return available;
}

async function totalDuration(db, serviceIds) {
  if (!serviceIds.length) return { ok: true, minutes: DEFAULT_DURATION_MINUTES };
  const { rows } = await db.query('select id, duration_minutes from services where id = any($1)', [serviceIds]);
  if (rows.length !== new Set(serviceIds).size) return { ok: false };
  return { ok: true, minutes: rows.reduce((sum, s) => sum + s.duration_minutes, 0), rows };
}

// Seuils de la relance des clientes inactives — ajustables ici.
const INACTIVE_MONTHS = 2; // délai sans rendez-vous avant de considérer une cliente comme inactive
const REENGAGEMENT_COOLDOWN_WEEKS = 6; // ne jamais relancer une même cliente plus souvent que ça

// Une réservation "en attente" dont le paiement Stripe n'a jamais abouti (carte refusée,
// paiement abandonné en cours de route) bloquait son créneau indéfiniment. Ce délai la libère.
const PENDING_BOOKING_TIMEOUT_MINUTES = 30;

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
    const { rows } = await pool.query(
      `update bookings set status = 'paid' where stripe_session_id = $1 returning id`,
      [session.id]
    );
    // Confirmation à la cliente + notification à Malorie (sans bloquer la réponse à Stripe).
    for (const r of rows) notifyBookingPaid(r.id).catch(err => console.error('[notif] confirmation', r.id, err.message));
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
        select json_agg(json_build_object('id', s.id, 'label', s.label, 'price_cents', s.price_cents, 'deposit_cents', s.deposit_cents, 'duration_minutes', s.duration_minutes) order by s.label)
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

app.get('/api/admin/blocked-slots', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'select id, slot_date, slot_time, reason from blocked_slots order by slot_date, slot_time nulls first'
  );
  res.json(rows);
});

app.post('/api/admin/blocked-slots', requireAdmin, async (req, res) => {
  const { date, time, reason } = req.body;
  if (!date) return res.status(400).json({ error: 'date manquante' });
  try {
    const { rows } = await pool.query(
      'insert into blocked_slots (slot_date, slot_time, reason) values ($1, $2, $3) returning id',
      [date, time || null, reason || null]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'ce jour ou ce créneau est déjà bloqué' });
    }
    throw err;
  }
});

app.delete('/api/admin/blocked-slots/:id', requireAdmin, async (req, res) => {
  await pool.query('delete from blocked_slots where id = $1', [req.params.id]);
  res.json({ ok: true });
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

// GET /api/availability?date=2026-10-02&services=mixte,brow_lift
// Renvoie les heures de début possibles pour la durée TOTALE des prestations choisies.
app.get('/api/availability', async (req, res) => {
  const { date } = req.query;
  if (!date || !ISO_DATE.test(date)) return res.status(400).json({ error: 'date manquante' });
  const serviceIds = String(req.query.services || '').split(',').map(s => s.trim()).filter(Boolean);
  const duration = await totalDuration(pool, serviceIds);
  if (!duration.ok) return res.status(404).json({ error: 'prestation inconnue' });

  const available = await computeAvailableTimes(pool, date, duration.minutes);
  const { rows } = await pool.query(`select slot_time from bookings where slot_date = $1 and status != 'cancelled'`, [date]);
  res.json({ date, duration: duration.minutes, available, taken: rows.map(r => r.slot_time.slice(0, 5)) });
});

// GET /api/availability-range?days=14&services=volume_russe[&from=2026-10-01]
// Les heures libres jour par jour (calendrier + « Prochaines disponibilités »).
app.get('/api/availability-range', async (req, res) => {
  const from = ISO_DATE.test(req.query.from || '') ? req.query.from : nowInMartinique().date;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 31);
  const serviceIds = String(req.query.services || '').split(',').map(s => s.trim()).filter(Boolean);
  const duration = await totalDuration(pool, serviceIds);
  if (!duration.ok) return res.status(404).json({ error: 'prestation inconnue' });

  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const open = (SCHEDULE[dayOfWeek(date)] || []).length > 0;
    out.push({ date, open, available: open ? await computeAvailableTimes(pool, date, duration.minutes) : [] });
  }
  res.json({ duration: duration.minutes, days: out });
});

// GET /api/booking/:id — résumé pour la page « Merci » (l'identifiant est impossible à deviner).
app.get('/api/booking/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'réservation introuvable' });
  const { rows } = await pool.query(
    `select to_char(b.slot_date, 'YYYY-MM-DD') as date, to_char(b.slot_time, 'HH24:MI') as time, b.status, b.client_name,
       coalesce(json_agg(json_build_object('id', s.id, 'label', s.label, 'price_cents', s.price_cents,
         'deposit_cents', s.deposit_cents, 'duration_minutes', s.duration_minutes)) filter (where s.id is not null), '[]') as services
     from bookings b left join services s on s.id = any(b.service_ids)
     where b.id = $1 group by b.id`,
    [req.params.id]
  );
  const b = rows[0];
  if (!b) return res.status(404).json({ error: 'réservation introuvable' });
  res.json({
    date: b.date, time: b.time, status: b.status,
    firstName: (b.client_name || '').trim().split(/\s+/)[0] || '',
    services: b.services,
  });
});

app.post('/api/book', async (req, res) => {
  const { serviceIds, date, time, name, phone } = req.body;
  if (!Array.isArray(serviceIds) || serviceIds.length === 0 || !date || !time || !name || !phone) {
    return res.status(400).json({ error: 'champs manquants' });
  }

  if (!ISO_DATE.test(date) || !HH_MM.test(time)) return res.status(400).json({ error: 'date ou heure invalide' });
  const phoneE164 = notif.toE164(phone);
  if (!phoneE164) return res.status(400).json({ error: 'numéro de téléphone invalide (ex. 0696 12 34 56)' });
  if (new Set(serviceIds).size !== serviceIds.length) return res.status(400).json({ error: 'prestation en double' });

  const svcRes = await pool.query('select * from services where id = any($1)', [serviceIds]);
  if (svcRes.rows.length !== serviceIds.length) return res.status(404).json({ error: 'prestation inconnue' });
  const services = svcRes.rows;
  const totalDeposit = services.reduce((sum, s) => sum + s.deposit_cents, 0);
  const totalMinutes = services.reduce((sum, s) => sum + s.duration_minutes, 0);
  const labels = services.map(s => s.label).join(' + ');

  // On re-vérifie le créneau au moment de réserver, en tenant compte de la durée.
  // Le verrou (un par jour) empêche deux clientes qui valident en même temps de
  // prendre des créneaux qui se chevauchent.
  let booking;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', ['booking-day:' + date]);
    const available = await computeAvailableTimes(client, date, totalMinutes);
    if (!available.includes(time)) {
      await client.query('rollback');
      return res.status(409).json({ error: 'ce créneau vient d\'être réservé' });
    }
    const insertRes = automationReady
      ? await client.query(
        `insert into bookings (service_ids, slot_date, slot_time, client_name, client_phone, client_phone_e164)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [serviceIds, date, time, name, phone, phoneE164])
      : await client.query(
        `insert into bookings (service_ids, slot_date, slot_time, client_name, client_phone)
         values ($1, $2, $3, $4, $5) returning id`,
        [serviceIds, date, time, name, phone]);
    await client.query('commit');
    booking = insertRes.rows[0];
  } catch (err) {
    await client.query('rollback').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'ce créneau vient d\'être réservé' });
    }
    throw err;
  } finally {
    client.release();
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create({
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
  } catch (err) {
    console.error('Échec de création de la session Stripe pour', booking.id, err.message);
    await pool.query(`update bookings set status = 'cancelled' where id = $1`, [booking.id]);
    return res.status(502).json({ error: 'le paiement n\'a pas pu être initié — merci de réessayer.' });
  }

  await pool.query('update bookings set stripe_session_id = $1 where id = $2', [session.id, booking.id]);
  res.json({ checkoutUrl: session.url });
});

// Relance hebdomadaire des clientes inactives (aucun rendez-vous depuis INACTIVE_MONTHS,
// et aucun déjà programmé) — chaque lundi à 10h (heure de Martinique).
cron.schedule('0 10 * * 1', async () => {
  if (!notif.isEnabled()) return console.log('[notif] relance inactives : envois désactivés');
  const { rows } = await pool.query(`
    with norm_bookings as (
      select regexp_replace(client_phone, '\\D', '', 'g') as phone_norm, slot_date, status
      from bookings
    ),
    last_appt as (
      select phone_norm, max(slot_date) as last_date
      from norm_bookings
      where status != 'cancelled'
      group by phone_norm
    ),
    upcoming_phones as (
      select distinct phone_norm
      from norm_bookings
      where status != 'cancelled' and slot_date >= current_date
    )
    select c.id, c.name, c.phone
    from clients c
    join last_appt la on regexp_replace(c.phone, '\\D', '', 'g') = la.phone_norm
    where c.phone is not null and c.phone != ''
      and c.planity_deleted_at is null
      and la.last_date < current_date - make_interval(months => $1)
      and la.phone_norm not in (select phone_norm from upcoming_phones)
      and (c.last_reengagement_sms_at is null or c.last_reengagement_sms_at < now() - make_interval(weeks => $2))
  `, [INACTIVE_MONTHS, REENGAGEMENT_COOLDOWN_WEEKS]);

  for (const c of rows) {
    if (await notif.send(c.phone, notif.textes.relance(c.name), 'relance ' + c.id)) {
      await pool.query('update clients set last_reengagement_sms_at = now() where id = $1', [c.id]);
    }
  }
}, { timezone: TIMEZONE });

// ─── Messages automatiques (WhatsApp) ────────────────────────────────────────
// Nécessite la migration 002 (colonnes *_sent_at). Tant qu'elle n'est pas passée,
// le site fonctionne normalement et les automatisations restent en veille.
const AUTOMATION_COLUMNS = ['client_phone_e164', 'confirmation_sent_at', 'owner_notified_at', 'review_sent_at', 'refill_sent_at'];
let automationReady = false;
async function checkAutomationSchema() {
  const { rows } = await pool.query(
    `select column_name from information_schema.columns where table_name = 'bookings' and column_name = any($1)`,
    [AUTOMATION_COLUMNS]
  );
  automationReady = rows.length === AUTOMATION_COLUMNS.length;
  console.log(automationReady
    ? `[notif] automatisations prêtes (${notif.isEnabled() ? 'envois ACTIVÉS' : 'envois désactivés : WHAPI_TOKEN manquant'})`
    : '[notif] automatisations en veille : exécuter migrations/002 sur la base');
}
checkAutomationSchema().catch(err => console.error('[notif] vérification du schéma', err.message));

const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP || '+33770211399';
const GOOGLE_REVIEW_URL = process.env.GOOGLE_REVIEW_URL || 'https://share.google/yrCwNb4M34qAONocz';
const POSE_IDS = ['cil_a_cil', 'mixte', 'volume_russe', 'wispy_volume_russe', 'wispy_mixte', 'wispy_cil_a_cil', 'wet_volume_russe',
  'offre_cil_a_cil', 'offre_mixte', 'offre_volume_russe'];
const REFILL_FOR = {
  cil_a_cil: 'remplissage_cil_a_cil', wispy_cil_a_cil: 'remplissage_cil_a_cil', offre_cil_a_cil: 'remplissage_cil_a_cil',
  mixte: 'remplissage_mixte', wispy_mixte: 'remplissage_mixte', offre_mixte: 'remplissage_mixte',
  volume_russe: 'remplissage_volume_russe', wispy_volume_russe: 'remplissage_volume_russe', wet_volume_russe: 'remplissage_volume_russe', offre_volume_russe: 'remplissage_volume_russe',
};
const REFILL_AFTER_DAYS = 18;

// Réservations avec leurs prestations (libellé, total, acompte, durée).
function bookingSelect(where) {
  return `
    select b.id, b.client_name, b.client_phone, b.client_phone_e164, b.service_ids,
      to_char(b.slot_date, 'YYYY-MM-DD') as date, to_char(b.slot_time, 'HH24:MI') as time,
      coalesce(string_agg(s.label, ' + ' order by s.duration_minutes desc), '') as label,
      coalesce(sum(s.price_cents), 0)::int as total, coalesce(sum(s.deposit_cents), 0)::int as deposit,
      coalesce(sum(s.duration_minutes), 0)::int as duration
    from bookings b left join services s on s.id = any(b.service_ids)
    where ${where}
    group by b.id`;
}

// Envoi « une seule fois » : on réserve le drapeau AVANT d'envoyer (un seul processus gagne),
// et on le remet à zéro si l'envoi échoue, pour réessayer au prochain passage.
async function sendOnce(bookingId, column, to, text, tag) {
  const claimed = await pool.query(`update bookings set ${column} = now() where id = $1 and ${column} is null returning id`, [bookingId]);
  if (!claimed.rowCount) return false;
  const ok = await notif.send(to, text, tag);
  if (!ok) await pool.query(`update bookings set ${column} = null where id = $1`, [bookingId]);
  return ok;
}

async function notifyBookingPaid(id) {
  if (!automationReady || !notif.isEnabled()) return;
  const { rows } = await pool.query(bookingSelect('b.id = $1'), [id]);
  const b = rows[0];
  if (!b) return;
  if (b.client_phone_e164) await sendOnce(b.id, 'confirmation_sent_at', b.client_phone_e164, notif.textes.confirmation(b), 'confirmation ' + b.id);
  await sendOnce(b.id, 'owner_notified_at', OWNER_WHATSAPP, notif.textes.proprietaire(b), 'notif Malorie ' + b.id);
}

function isoShift(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Seules les réservations faites sur le site (numéro au format international) reçoivent
// ces messages : les rendez-vous importés de Planity ne sont pas relancés en double.
async function runReminders() {
  if (!automationReady || !notif.isEnabled()) return;
  const tomorrow = isoShift(nowInMartinique().date, 1);
  const { rows } = await pool.query(bookingSelect(`b.slot_date = $1 and b.status in ('paid', 'confirmed') and b.reminder_sent = false and b.client_phone_e164 is not null`), [tomorrow]);
  for (const b of rows) {
    const claimed = await pool.query('update bookings set reminder_sent = true where id = $1 and reminder_sent = false returning id', [b.id]);
    if (!claimed.rowCount) continue;
    if (!await notif.send(b.client_phone_e164, notif.textes.rappel(b), 'rappel ' + b.id)) {
      await pool.query('update bookings set reminder_sent = false where id = $1', [b.id]);
    }
  }
}

async function runReviewRequests() {
  if (!automationReady || !notif.isEnabled()) return;
  const yesterday = isoShift(nowInMartinique().date, -1);
  const { rows } = await pool.query(bookingSelect(`b.slot_date = $1 and b.status in ('paid', 'confirmed') and b.review_sent_at is null and b.client_phone_e164 is not null`), [yesterday]);
  for (const b of rows) await sendOnce(b.id, 'review_sent_at', b.client_phone_e164, notif.textes.avis(b, GOOGLE_REVIEW_URL), 'avis ' + b.id);
}

async function runRefillReminders() {
  if (!automationReady || !notif.isEnabled()) return;
  const today = nowInMartinique().date;
  const poseDay = isoShift(today, -REFILL_AFTER_DAYS);
  const { rows } = await pool.query(bookingSelect(
    `b.slot_date = $1 and b.status in ('paid', 'confirmed') and b.refill_sent_at is null and b.client_phone_e164 is not null
     and b.service_ids && $2::text[]
     and not exists (select 1 from bookings o where o.client_phone_e164 = b.client_phone_e164 and o.status != 'cancelled' and o.slot_date > b.slot_date)`
  ), [poseDay, POSE_IDS]);
  for (const b of rows) {
    const pose = b.service_ids.find(id => REFILL_FOR[id]);
    const lien = `${SITE_URL}/prestation.html?c=remplissage&p=${REFILL_FOR[pose]}`;
    await sendOnce(b.id, 'refill_sent_at', b.client_phone_e164, notif.textes.remplissage(b, lien), 'remplissage ' + b.id);
  }
}

const logErr = (tag) => (err) => console.error(`[notif] ${tag}`, err.message);
cron.schedule('0 18 * * *', () => runReminders().catch(logErr('rappels J-1')), { timezone: TIMEZONE });
cron.schedule('0 10 * * *', () => {
  runReviewRequests().catch(logErr('avis J+1'));
  runRefillReminders().catch(logErr('remplissage J+18'));
}, { timezone: TIMEZONE });
// Filet de sécurité : si une confirmation a échoué (Whapi indisponible…), on réessaie toutes les 15 min.
cron.schedule('*/15 * * * *', async () => {
  if (!automationReady) await checkAutomationSchema().catch(logErr('vérification du schéma'));
  if (!automationReady || !notif.isEnabled()) return;
  const { rows } = await pool.query(
    `select id from bookings where status = 'paid' and created_at > now() - interval '2 days'
     and (owner_notified_at is null or (confirmation_sent_at is null and client_phone_e164 is not null))`
  );
  for (const r of rows) await notifyBookingPaid(r.id).catch(logErr('reprise confirmation'));
}, { timezone: TIMEZONE });

// Libère les créneaux bloqués par un paiement Stripe jamais abouti (carte refusée, paiement
// abandonné) : une réservation "en attente" trop ancienne est annulée automatiquement.
async function releaseStalePendingBookings() {
  const { rowCount } = await pool.query(
    `update bookings set status = 'cancelled'
     where status = 'pending' and created_at < now() - make_interval(mins => $1)`,
    [PENDING_BOOKING_TIMEOUT_MINUTES]
  );
  if (rowCount > 0) console.log(`${rowCount} réservation(s) en attente expirée(s) libérée(s).`);
}
releaseStalePendingBookings().catch(err => console.error('Échec du nettoyage initial des réservations en attente', err.message));
cron.schedule('*/10 * * * *', () => {
  releaseStalePendingBookings().catch(err => console.error('Échec du nettoyage des réservations en attente', err.message));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Exotic Beauty server running on port ${PORT}`));

// Pour les tests manuels (node -e "require('./server').runReminders()").
module.exports = { runReminders, runReviewRequests, runRefillReminders, notifyBookingPaid };
