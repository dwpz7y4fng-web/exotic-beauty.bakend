require('dotenv').config();
const path = require('path');
const fs = require('fs');
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

// ─── Connexion à l'admin : « se souvenir de cet appareil » pendant 1 an ─────────
// On se connecte une fois (identifiant + mot de passe = ADMIN_USER / ADMIN_PASSWORD sur
// Railway), puis un cookie signé garde l'appareil connecté 1 an.
// Déconnecter TOUS les appareils d'un coup = changer ADMIN_PASSWORD sur Railway.
const ADMIN_COOKIE = 'eb_admin';
const ADMIN_SESSION_DAYS = 365;

function adminKey() {
  return crypto.createHash('sha256')
    .update(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASSWORD}:${process.env.ADMIN_SESSION_SECRET || ''}`)
    .digest();
}
function signAdminSession(expiresAt) {
  return expiresAt + '.' + crypto.createHmac('sha256', adminKey()).update(String(expiresAt)).digest('base64url');
}
function readCookie(req, name) {
  const found = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}
function hasValidAdminSession(req) {
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) return false;
  const value = readCookie(req, ADMIN_COOKIE);
  if (!value || !value.includes('.')) return false;
  const expiresAt = Number(value.split('.')[0]);
  if (!expiresAt || expiresAt < Date.now()) return false;
  return safeEqual(value, signAdminSession(expiresAt));
}
function hasValidBasicAuth(req) {
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString();
  const sep = decoded.indexOf(':');
  const user = decoded.slice(0, sep), pass = decoded.slice(sep + 1);
  return !!(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD && sep > 0 && pass &&
    safeEqual(user, process.env.ADMIN_USER) && safeEqual(pass, process.env.ADMIN_PASSWORD));
}

function requireAdmin(req, res, next) {
  if (hasValidAdminSession(req) || hasValidBasicAuth(req)) return next();
  if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'connexion requise' });
  res.redirect('/admin/login');
}

// Anti-essais en rafale : 10 tentatives ratées max par adresse IP et par quart d'heure.
const loginFailures = new Map();
function tooManyFailures(ip) {
  const now = Date.now(), recent = (loginFailures.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
  loginFailures.set(ip, recent);
  return recent.length >= 10;
}

function loginPage(message) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex"><title>Connexion — Admin Exotic Beauty</title>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700&family=IBM+Plex+Mono&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F3F6F7;font-family:'Hanken Grotesk',system-ui,sans-serif;color:#1E2B31;padding:24px}
form{width:100%;max-width:380px;background:#fff;border:1px solid #D9E0E3;border-radius:16px;padding:28px 24px;display:flex;flex-direction:column;gap:14px}
.k{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5F6B70}
h1{margin:0 0 6px;font-size:26px;letter-spacing:-.02em}
label{display:flex;flex-direction:column;gap:6px}
input[type=text],input[type=password]{height:52px;border-radius:12px;border:1.5px solid #D9E0E3;padding:0 14px;font:inherit;font-size:16px}
input:focus{outline:none;border-color:#1E2B31}
button{min-height:52px;border:none;border-radius:9999px;background:#1E2B31;color:#fff;font:inherit;font-weight:600;font-size:16px;cursor:pointer;margin-top:6px}
.err{background:#F8ECEC;color:#A33A3A;border-radius:10px;padding:10px 12px;font-size:14px}
.aide{font-size:13px;color:#5F6B70;line-height:1.5;margin:0}
</style></head><body>
<form method="post" action="/admin/login">
  <div class="k">Exotic Beauty · Admin</div>
  <h1>Connexion</h1>
  ${message ? `<div class="err">${message}</div>` : ''}
  <label><span class="k">Identifiant</span><input type="text" name="username" autocomplete="username" autocapitalize="none" required></label>
  <label><span class="k">Mot de passe</span><input type="password" name="password" autocomplete="current-password" required></label>
  <button type="submit">Se connecter</button>
  <p class="aide">Vous resterez connectée sur cet appareil pendant 1 an.</p>
</form></body></html>`;
}

app.get('/admin/login', (req, res) => {
  if (hasValidAdminSession(req)) return res.redirect('/admin');
  res.send(loginPage(''));
});

app.post('/admin/login', express.urlencoded({ extended: false }), (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '?';
  if (tooManyFailures(ip)) return res.status(429).send(loginPage('Trop de tentatives. Réessayez dans 15 minutes.'));
  const { username = '', password = '' } = req.body || {};
  const ok = process.env.ADMIN_USER && process.env.ADMIN_PASSWORD && password &&
    safeEqual(String(username).trim(), process.env.ADMIN_USER) && safeEqual(String(password), process.env.ADMIN_PASSWORD);
  if (!ok) {
    loginFailures.get(ip).push(Date.now());
    return res.status(401).send(loginPage('Identifiant ou mot de passe incorrect.'));
  }
  loginFailures.delete(ip);
  const expiresAt = Date.now() + ADMIN_SESSION_DAYS * 24 * 3600 * 1000;
  res.cookie(ADMIN_COOKIE, signAdminSession(expiresAt), {
    httpOnly: true, secure: req.secure || req.headers['x-forwarded-proto'] === 'https' || req.hostname === 'localhost',
    sameSite: 'lax', maxAge: ADMIN_SESSION_DAYS * 24 * 3600 * 1000, path: '/',
  });
  res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.redirect('/admin/login');
});

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
  const zoneSelect = massageZoneReady ? 'b.massage_zone,' : 'null as massage_zone,';
  const { rows } = await pool.query(`
    select b.id, b.slot_date, b.slot_time, b.client_name, b.client_phone, b.status, b.created_at, ${zoneSelect}
      coalesce((
        select json_agg(json_build_object('id', s.id, 'label', s.label, 'price_cents', s.price_cents, 'deposit_cents', s.deposit_cents, 'duration_minutes', s.duration_minutes) order by s.label)
        from services s where s.id = any(b.service_ids)
      ), '[]') as services
    from bookings b
    order by b.slot_date desc, b.slot_time desc
  `);
  res.json(rows);
});

const BOOKING_STATUSES = ['pending', 'paid', 'confirmed', 'cancelled', 'absente'];

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

// Outil de diagnostic : envoie un WhatsApp de test vers n'importe quel numéro et renvoie la
// réponse brute de Whapi. Avec ?bookingId=<uuid>, envoie la vraie confirmation de ce RDV
// (pratique pour prévisualiser le message sans attendre une vraie réservation).
app.get('/api/admin/test-notif', requireAdmin, async (req, res) => {
  const to = req.query.to;
  if (!to) return res.status(400).json({ error: 'paramètre ?to=+33… requis' });
  let text = 'Test Exotic Beauty ✅ Si vous recevez ce message, WhatsApp fonctionne.';
  let bookingId = null;
  if (req.query.bookingId && /^[0-9a-f-]{36}$/i.test(req.query.bookingId)) {
    const { rows } = await pool.query(bookingSelect('b.id = $1'), [req.query.bookingId]);
    if (rows[0]) { bookingId = rows[0].id; text = notif.textes.confirmation(rows[0], `${SITE_URL}/api/calendar/${rows[0].id}.ics`); }
  }
  const result = await notif.sendDetailed(to, text, 'test-notif');
  res.json({ to, bookingId, whapiActif: notif.isEnabled(), result });
});

// ─── Fiches de conseils post-séance (admin) ───────────────────────────────────
// Réglages : interrupteur ON/OFF, état de Whapi, liste des prestations qui ont une fiche.
app.get('/api/admin/care-sheets/settings', requireAdmin, async (req, res) => {
  res.json({
    enabled: await careSheetsEnabled(),
    whapiActif: notif.hasWhapi(),
    ready: careSchemaReady,
    ficheServiceIds: Object.keys(CARE_SHEET_FOR),
    fiches: Object.entries(CARE_SHEETS).map(([key, m]) => ({ key, label: m.label })),
  });
});

app.post('/api/admin/care-sheets/settings', requireAdmin, async (req, res) => {
  if (!careSchemaReady) return res.status(409).json({ error: 'exécuter d\'abord migrations/003 sur la base' });
  const enabled = !!(req.body && req.body.enabled);
  await setSetting('care_sheets_enabled', enabled ? 'true' : 'false');
  res.json({ ok: true, enabled });
});

// Historique des fiches envoyées (200 dernières), cliente + date + fiche.
app.get('/api/admin/care-sheets', requireAdmin, async (req, res) => {
  if (!careSchemaReady) return res.json([]);
  const { rows } = await pool.query(`
    select cs.id, cs.fiche, cs.manual, to_char(cs.sent_at, 'YYYY-MM-DD"T"HH24:MI') as sent_at,
      b.id as booking_id, b.client_name, b.client_phone, to_char(b.slot_date, 'YYYY-MM-DD') as date
    from care_sheets_sent cs join bookings b on b.id = cs.booking_id
    order by cs.sent_at desc limit 200`);
  res.json(rows.map(r => ({ ...r, ficheLabel: (CARE_SHEETS[r.fiche] || {}).label || r.fiche })));
});

// Renvoi manuel : une fiche précise, ou toutes les fiches d'un rendez-vous.
app.post('/api/admin/care-sheets/resend', requireAdmin, async (req, res) => {
  if (!careSchemaReady) return res.status(409).json({ error: 'exécuter d\'abord migrations/003 sur la base' });
  const { bookingId, fiche } = req.body || {};
  if (!bookingId) return res.status(400).json({ error: 'bookingId requis' });
  if (fiche && !CARE_SHEETS[fiche]) return res.status(400).json({ error: 'fiche inconnue' });
  const { rows } = await pool.query(bookingSelect('b.id = $1'), [bookingId]);
  const b = rows[0];
  if (!b) return res.status(404).json({ error: 'réservation introuvable' });
  if (!b.client_phone_e164) return res.status(400).json({ error: 'numéro non valide pour WhatsApp' });
  const fiches = fiche ? [fiche] : careSheetsForBooking(b.service_ids);
  if (!fiches.length) return res.status(400).json({ error: 'aucune fiche pour cette prestation' });
  const results = [];
  for (const f of fiches) results.push({ fiche: f, ...(await sendCareSheetOnce(b, f, { manual: true })) });
  res.json({ ok: results.every(r => r.ok), results });
});

// Test : envoie une fiche vers un numéro donné, sans rien enregistrer dans l'historique.
app.get('/api/admin/care-sheets/test', requireAdmin, async (req, res) => {
  const to = req.query.to;
  const fiche = req.query.fiche || 'extensions';
  if (!to) return res.status(400).json({ error: 'paramètre ?to=0696… requis' });
  if (!CARE_SHEETS[fiche]) return res.status(400).json({ error: 'fiche inconnue (extensions, lash_lift, brow_lift, teinture, ombre)' });
  const media = careSheetDataUrl(fiche);
  if (!media) return res.status(500).json({ error: 'image de la fiche introuvable sur le serveur' });
  const result = await notif.sendImageDetailed(to, media, notif.textes.conseils(), 'test-fiche');
  res.json({ to, fiche, whapiActif: notif.hasWhapi(), result });
});

// ─── Rappel de la veille : texte d'accès + plan (admin, modifiable) ────────────
app.get('/api/admin/reminder-access', requireAdmin, async (req, res) => {
  res.json({
    text: await getReminderAccessText(),
    ready: careSchemaReady,
    whapiActif: notif.hasWhapi(),
    hasCustomImage: !!(await getSetting('reminder_plan_image', '')),
  });
});

app.post('/api/admin/reminder-access', requireAdmin, async (req, res) => {
  if (!careSchemaReady) return res.status(409).json({ error: 'exécuter d\'abord migrations/003 sur la base' });
  const text = req.body && typeof req.body.text === 'string' ? req.body.text : null;
  if (text === null) return res.status(400).json({ error: 'texte manquant' });
  await setSetting('reminder_access_text', text);
  res.json({ ok: true });
});

app.post('/api/admin/reminder-access/image', requireAdmin, upload.single('file'), async (req, res) => {
  if (!careSchemaReady) return res.status(409).json({ error: 'exécuter d\'abord migrations/003 sur la base' });
  if (!req.file) return res.status(400).json({ error: 'aucune image reçue' });
  if (!/^image\/(png|jpe?g|webp)$/.test(req.file.mimetype)) return res.status(400).json({ error: 'format non supporté (png, jpg)' });
  await setSetting('reminder_plan_image', `data:${req.file.mimetype};base64,` + req.file.buffer.toString('base64'));
  res.json({ ok: true });
});

app.delete('/api/admin/reminder-access/image', requireAdmin, async (req, res) => {
  if (!careSchemaReady) return res.status(409).json({ error: 'exécuter d\'abord migrations/003 sur la base' });
  await setSetting('reminder_plan_image', '');
  res.json({ ok: true });
});

// Aperçu de l'image actuelle (personnalisée ou plan par défaut).
app.get('/api/admin/reminder-access/image', requireAdmin, async (req, res) => {
  const dataUrl = await getReminderPlanDataUrl();
  const m = /^data:(image\/[a-z]+);base64,([\s\S]*)$/.exec(dataUrl || '');
  if (!m) return res.status(404).send('aucune image');
  res.set('Content-Type', m[1]);
  res.send(Buffer.from(m[2], 'base64'));
});

// Test : envoie le rappel complet (accès + plan) vers un numéro, sur un RDV d'exemple.
app.get('/api/admin/reminder-access/test', requireAdmin, async (req, res) => {
  const phoneE164 = notif.toE164(req.query.to);
  if (!phoneE164) return res.status(400).json({ error: 'paramètre ?to=0696… (numéro valide) requis' });
  const sample = {
    id: 'test', client_name: 'Test', client_phone_e164: phoneE164,
    date: isoShift(nowInMartinique().date, 1), time: '14:00', label: 'Lash lift avec teinture', duration: 45,
  };
  const ok = await sendReminderWithAccess(sample);
  res.json({ to: phoneE164, whapiActif: notif.hasWhapi(), ok });
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

// Fichier .ics « Ajouter à mon agenda » (lien mis dans le WhatsApp de confirmation).
// Public : identifiant UUID impossible à deviner, comme /api/booking/:id.
function icsEscape(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsStampUTC(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
function buildIcs(b) {
  // Martinique = UTC-4 toute l'année (pas d'heure d'été) → offset fixe, pas de VTIMEZONE.
  const start = new Date(`${b.date}T${b.time}:00-04:00`);
  const end = new Date(start.getTime() + (b.duration || 60) * 60000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Exotic Beauty//Reservation//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${b.id}@exotic-beauty`,
    `DTSTAMP:${icsStampUTC(new Date())}`,
    `DTSTART:${icsStampUTC(start)}`,
    `DTEND:${icsStampUTC(end)}`,
    `SUMMARY:${icsEscape((b.label || 'Rendez-vous') + ' — Exotic Beauty')}`,
    `LOCATION:${icsEscape(notif.STUDIO)}`,
    `DESCRIPTION:${icsEscape('Rendez-vous chez Exotic Beauty.\nItinéraire : ' + notif.STUDIO_MAPS + '\nUn empêchement ? Répondez au WhatsApp de confirmation.')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';
}

app.get('/api/calendar/:id.ics', async (req, res) => {
  const id = String(req.params.id).replace(/\.ics$/i, '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).send('réservation introuvable');
  const { rows } = await pool.query(bookingSelect('b.id = $1'), [id]);
  const b = rows[0];
  if (!b) return res.status(404).send('réservation introuvable');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="rendez-vous-exotic-beauty.ics"');
  res.send(buildIcs(b));
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

  // Parenthèse détente : on enregistre la zone choisie (si la colonne existe et la durée ≥ 30 min).
  const zone = MASSAGE_ZONES.includes(req.body.massageZone) ? req.body.massageZone : null;
  if (massageZoneReady && zone && totalMinutes > MASSAGE_MIN_DURATION) {
    await pool.query('update bookings set massage_zone = $1 where id = $2', [zone, booking.id])
      .catch(err => console.error('[parenthèse] enregistrement zone', err.message));
  }

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

// ─── Fiches de conseils post-séance ───────────────────────────────────────────
// Chaque fiche = une image dans public/images/soins/ + un libellé lisible.
const CARE_SHEETS = {
  extensions: { file: 'soins-extensions.png', label: 'Extensions de cils' },
  lash_lift:  { file: 'soins-lash-lift.png',  label: 'Lash lift' },
  brow_lift:  { file: 'soins-brow-lift.png',  label: 'Brow lift' },
  teinture:   { file: 'soins-teinture.png',   label: 'Teinture cils / sourcils' },
  ombre:      { file: 'soins-ombre-brows.png', label: 'Ombré powder brows' },
};
// Prestation → fiche(s) à ENVOYER. L'offre regard (extensions + brow lift) déclenche
// les deux fiches. Les remplissages, la dépose et les épilations ne déclenchent rien.
const CARE_SHEET_FOR = {
  cil_a_cil: ['extensions'], mixte: ['extensions'], volume_russe: ['extensions'],
  wispy_cil_a_cil: ['extensions'], wispy_mixte: ['extensions'], wispy_volume_russe: ['extensions'], wet_volume_russe: ['extensions'],
  offre_cil_a_cil: ['extensions', 'brow_lift'], offre_mixte: ['extensions', 'brow_lift'], offre_volume_russe: ['extensions', 'brow_lift'],
  lash_lift: ['lash_lift'],
  brow_lift: ['brow_lift'], brow_lift_teinture: ['brow_lift'],
  teinture_hybride: ['teinture'],
  ombre_powder_brow: ['ombre'],
};
// Prestation → fiche(s) que la cliente CONNAÎT déjà si elle l'a faite par le passé.
// Les remplissages comptent pour la fiche extensions (la pose a déjà été faite).
const CARE_SHEET_KNOWN_FROM = {
  ...CARE_SHEET_FOR,
  remplissage_cil_a_cil: ['extensions'], remplissage_mixte: ['extensions'], remplissage_volume_russe: ['extensions'],
};
// Inverse : fiche → liste des prestations qui prouvent que la cliente la connaît.
const KNOWN_SERVICE_IDS = {};
for (const [sid, fiches] of Object.entries(CARE_SHEET_KNOWN_FROM)) {
  for (const f of fiches) (KNOWN_SERVICE_IDS[f] || (KNOWN_SERVICE_IDS[f] = [])).push(sid);
}

function careSheetsForBooking(serviceIds) {
  const set = new Set();
  for (const id of serviceIds || []) for (const f of (CARE_SHEET_FOR[id] || [])) set.add(f);
  return [...set];
}

// Lecture de l'image en base64 (envoyée directement à Whapi, sans dépendre d'une URL
// publique). Mise en cache : les fiches ne changent pas souvent.
const careSheetCache = new Map();
function careSheetDataUrl(fiche) {
  if (careSheetCache.has(fiche)) return careSheetCache.get(fiche);
  const meta = CARE_SHEETS[fiche];
  if (!meta) return null;
  try {
    const b64 = fs.readFileSync(path.join(__dirname, 'public', 'images', 'soins', meta.file)).toString('base64');
    const url = `data:image/png;base64,${b64}`;
    careSheetCache.set(fiche, url);
    return url;
  } catch (err) {
    console.error('[fiche] image introuvable', meta.file, err.message);
    return null;
  }
}

// Le schéma des fiches a besoin des tables app_settings + care_sheets_sent (migration 003).
let careSchemaReady = false;
async function checkCareSchema() {
  try {
    const { rows } = await pool.query(
      `select table_name from information_schema.tables where table_name in ('app_settings', 'care_sheets_sent')`
    );
    careSchemaReady = rows.length === 2;
  } catch { careSchemaReady = false; }
}

async function getSetting(key, def) {
  try {
    const { rows } = await pool.query('select value from app_settings where key = $1', [key]);
    return rows[0] ? rows[0].value : def;
  } catch { return def; }
}
async function setSetting(key, value) {
  await pool.query(
    `insert into app_settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value`,
    [key, String(value)]
  );
}
async function careSheetsEnabled() { return (await getSetting('care_sheets_enabled', 'true')) !== 'false'; }

// Réserve l'envoi (une ligne par rendez-vous + fiche) AVANT d'envoyer : on évite tout
// doublon, et on efface la ligne si l'envoi a échoué pour réessayer plus tard.
// `manual` (bouton « Renvoyer » de l'admin) force l'envoi même si déjà envoyée.
async function sendCareSheetOnce(booking, fiche, { manual = false } = {}) {
  const media = careSheetDataUrl(fiche);
  if (!media) return { ok: false, reason: 'image manquante' };
  if (!booking.client_phone_e164) return { ok: false, reason: 'numéro invalide' };
  if (manual) await pool.query('delete from care_sheets_sent where booking_id = $1 and fiche = $2', [booking.id, fiche]).catch(() => {});
  let claimed;
  try {
    claimed = await pool.query(
      `insert into care_sheets_sent (booking_id, fiche, client_phone_e164, manual)
       values ($1, $2, $3, $4) on conflict (booking_id, fiche) do nothing returning id`,
      [booking.id, fiche, booking.client_phone_e164, manual]
    );
  } catch (err) { console.error('[fiche] réservation en base', err.message); return { ok: false, reason: 'base de données' }; }
  if (!claimed.rowCount) return { ok: false, reason: 'déjà envoyée' };
  const detail = await notif.sendImageDetailed(booking.client_phone_e164, media, notif.textes.conseils(), `fiche ${fiche} ${booking.id}`);
  if (!detail.ok) {
    await pool.query('delete from care_sheets_sent where booking_id = $1 and fiche = $2', [booking.id, fiche]).catch(() => {});
    return { ok: false, reason: detail.reason || detail.message || ('Whapi ' + detail.status) };
  }
  return { ok: true };
}

// La cliente connaît-elle déjà cette fiche ? (déjà reçue, ou prestation déjà faite avant
// ce rendez-vous — rendez-vous d'avant la mise en place compris). Repérage par le numéro
// au format international, avec secours sur les 9 derniers chiffres du numéro brut (utile
// pour les anciens rendez-vous importés de Planity, sans numéro international).
async function clientAlreadyKnows(booking, fiche) {
  const suffix = String(booking.client_phone || '').replace(/\D/g, '').slice(-9);
  const already = await pool.query(
    `select 1 from care_sheets_sent cs join bookings o on o.id = cs.booking_id
      where cs.fiche = $1 and o.id <> $2 and o.client_phone_e164 = $3 limit 1`,
    [fiche, booking.id, booking.client_phone_e164]
  );
  if (already.rowCount) return true;
  const prior = await pool.query(
    `select 1 from bookings o
      where o.id <> $1
        and o.status not in ('cancelled', 'absente')
        and o.service_ids && $2::text[]
        and (o.client_phone_e164 = $3 or right(regexp_replace(coalesce(o.client_phone, ''), '\\D', '', 'g'), 9) = $4)
        and (o.slot_date < $5 or (o.slot_date = $5 and o.slot_time < $6))
      limit 1`,
    [booking.id, KNOWN_SERVICE_IDS[fiche] || [], booking.client_phone_e164, suffix, booking.date, booking.time]
  );
  return prior.rowCount > 0;
}

// Heure d'envoi d'une fiche : fin du rendez-vous + 1 h, jamais entre 20 h et 8 h
// (dans ce cas, reporté à 9 h le matin), en heure de Martinique.
const CARE_SHEET_DELAY_MIN = 60;
const CARE_QUIET_START = 20 * 60;  // 20:00
const CARE_QUIET_END = 8 * 60;     // 08:00
const CARE_MORNING = 9 * 60;       // 09:00
function careSheetSendMoment(dateIso, timeHHMM, durationMin) {
  let minutes = timeToMinutes(timeHHMM) + (durationMin || 0) + CARE_SHEET_DELAY_MIN;
  let date = dateIso;
  while (minutes >= 24 * 60) { minutes -= 24 * 60; date = isoShift(date, 1); }
  if (minutes >= CARE_QUIET_START) { date = isoShift(date, 1); minutes = CARE_MORNING; }
  else if (minutes < CARE_QUIET_END) { minutes = CARE_MORNING; }
  return { date, minutes };
}

// Toutes les ~15 min : envoie les fiches des rendez-vous terminés depuis ~1 h,
// une seule fois, seulement à la 1ʳᵉ fois que la cliente fait la prestation.
async function runCareSheets() {
  if (!careSchemaReady) await checkCareSchema();
  if (!careSchemaReady || !notif.hasWhapi()) return;
  if (!(await careSheetsEnabled())) return;
  const now = nowInMartinique();
  const since = isoShift(now.date, -2);
  const { rows } = await pool.query(bookingSelect(
    `b.slot_date >= $1 and b.slot_date <= $2 and b.status in ('paid', 'confirmed') and b.client_phone_e164 is not null`
  ), [since, now.date]);
  for (const b of rows) {
    const fiches = careSheetsForBooking(b.service_ids);
    if (!fiches.length) continue;
    const moment = careSheetSendMoment(b.date, b.time, b.duration);
    if (now.date < moment.date || (now.date === moment.date && now.minutes < moment.minutes)) continue;
    for (const fiche of fiches) {
      if (await clientAlreadyKnows(b, fiche)) continue;
      await sendCareSheetOnce(b, fiche).catch(err => console.error('[fiche]', err.message));
    }
  }
}
checkCareSchema().catch(err => console.error('[fiche] vérification du schéma', err.message));

// La « parenthèse détente » : zone de massage choisie à la réservation (migration 004).
const MASSAGE_ZONES = ['tempes', 'mains', 'epaules'];
const MASSAGE_MIN_DURATION = 30; // proposée seulement pour les prestations de plus de 30 min
let massageZoneReady = false;
async function checkMassageZoneSchema() {
  try {
    const { rows } = await pool.query(`select 1 from information_schema.columns where table_name = 'bookings' and column_name = 'massage_zone'`);
    massageZoneReady = rows.length > 0;
  } catch { massageZoneReady = false; }
}
checkMassageZoneSchema().catch(err => console.error('[parenthèse] vérification du schéma', err.message));

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
  if (b.client_phone_e164) await sendOnce(b.id, 'confirmation_sent_at', b.client_phone_e164, notif.textes.confirmation(b, `${SITE_URL}/api/calendar/${b.id}.ics`), 'confirmation ' + b.id);
  await sendOnce(b.id, 'owner_notified_at', OWNER_WHATSAPP, notif.textes.proprietaire(b), 'notif Malorie ' + b.id);
}

function isoShift(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Infos d'accès au studio (ajoutées au rappel de la veille) ─────────────────
// Le texte et l'image du plan sont modifiables par Malorie dans l'admin (table
// app_settings). Valeurs par défaut ci-dessous tant qu'elle n'a rien changé.
const DEFAULT_ACCESS_TEXT =
`📍 Comment venir au studio

Adresse : 722 route de la Chassaing, quartier Durivage, Ducos
Le numéro 722 est effacé : repérez plutôt le n° 716, juste à côté.

🚗 Stationnement
Garez-vous le long du trottoir, derrière les poubelles.
Envoyez-moi un message à votre arrivée : je vous ouvre la barrière.

🚶‍♀️ Pour rejoindre le studio
1. Descendez l'allée : le parking est sur votre gauche.
2. Face à vous, un bateau avec une bâche bleue : prenez l'escalier en gravillons sur la gauche et montez jusqu'à la piscine.
3. Longez la piscine par la gauche et montez l'escalier en fer : l'accueil se trouve juste en face.

Installez-vous à l'accueil, je viens vous chercher pour votre rendez-vous 🤍`;

const WHATSAPP_CAPTION_LIMIT = 1024;  // au-delà, on coupe en 2 messages (photo + texte)

async function getReminderAccessText() { return await getSetting('reminder_access_text', DEFAULT_ACCESS_TEXT); }

let defaultPlanCache = null;
function defaultPlanDataUrl() {
  if (defaultPlanCache !== null) return defaultPlanCache;
  try {
    defaultPlanCache = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'public', 'images', 'acces', 'plan-acces.png')).toString('base64');
  } catch (err) { console.error('[rappel] plan d\'accès introuvable', err.message); defaultPlanCache = ''; }
  return defaultPlanCache;
}
async function getReminderPlanDataUrl() {
  const custom = await getSetting('reminder_plan_image', '');
  return custom || defaultPlanDataUrl();
}

// Envoie le rappel de la veille : rappel du RDV + bloc accès, avec le plan en image.
// Si le texte dépasse la limite d'une légende WhatsApp, on coupe en 2 messages :
// d'abord la photo du plan, puis le texte complet. Renvoie true si l'essentiel est parti.
async function sendReminderWithAccess(b) {
  const accessText = (await getReminderAccessText() || '').trim();
  const full = accessText ? (notif.textes.rappel(b) + '\n\n' + accessText) : notif.textes.rappel(b);
  const media = notif.hasWhapi() ? await getReminderPlanDataUrl() : null;
  if (media) {
    if (full.length <= WHATSAPP_CAPTION_LIMIT) {
      return (await notif.sendImageDetailed(b.client_phone_e164, media, full, 'rappel ' + b.id)).ok;
    }
    await notif.sendImageDetailed(b.client_phone_e164, media, '', 'rappel-photo ' + b.id).catch(() => {});
    return await notif.send(b.client_phone_e164, full, 'rappel-texte ' + b.id);
  }
  // Whapi indisponible : on envoie au moins le texte (SMS possible), sans le plan.
  return await notif.send(b.client_phone_e164, full, 'rappel ' + b.id);
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
    if (!await sendReminderWithAccess(b)) {
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
// Fiches de conseils post-séance : toutes les 15 min (décalé de 5 min des autres envois).
cron.schedule('5,20,35,50 * * * *', () => runCareSheets().catch(logErr('fiches conseils')), { timezone: TIMEZONE });
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
module.exports = { runReminders, runReviewRequests, runRefillReminders, notifyBookingPaid, runCareSheets };
