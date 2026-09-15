require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const Stripe = require('stripe');
const twilio = require('twilio');
const cron = require('node-cron');

const app = express();
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
