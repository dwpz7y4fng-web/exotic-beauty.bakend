// Messages automatiques Exotic Beauty (WhatsApp via Whapi, SMS Twilio en secours).
// Tout est DÉSACTIVÉ tant que WHAPI_TOKEN (ou les variables Twilio) n'est pas renseigné
// sur Railway : les messages sont alors seulement écrits dans les logs.

const WHAPI_URL = (process.env.WHAPI_API_URL || 'https://gate.whapi.cloud').replace(/\/$/, '');
const STUDIO = '722 route de la Chasse, quartier Rivage, Ducos (parking privé)';
const STUDIO_MAPS = 'https://maps.app.goo.gl/3n1DRgjkgk2LMgx88'; // lien de partage Google Maps du studio
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Téléphone → format international E.164 (+596696123456). Renvoie null si invalide.
// 0696/0697 = mobile Martinique (+596) · 0596 = fixe Martinique · 0690/0691 = Guadeloupe (+590)
// 0694 = Guyane (+594) · 0692/0693 = Réunion (+262) · autres 06/07/01-05/09 = métropole (+33).
function toE164(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s.\-()]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) {
    const d = s.slice(1).replace(/\D/g, '');
    if (d.startsWith('330')) return toE164('0' + d.slice(3));   // +33 06… mal saisi
    return d.length >= 8 && d.length <= 15 ? '+' + d : null;
  }
  const d = s.replace(/\D/g, '');
  if (d.length === 9 && /^69[67]/.test(d)) return '+596' + d;     // 696 12 34 56 sans le 0
  if (d.length !== 10 || d[0] !== '0') return null;
  const n = d.slice(1);
  if (/^(69[67]|596)/.test(n)) return '+596' + n;
  if (/^(69[01]|590)/.test(n)) return '+590' + n;
  if (/^(694|594)/.test(n)) return '+594' + n;
  if (/^(69[23]|262)/.test(n)) return '+262' + n;
  if (/^[1-79]/.test(n)) return '+33' + n;
  return null;
}

function prenom(nom) { return (String(nom || '').trim().split(/\s+/)[0]) || ''; }
function dateLongue(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}
function heure(t) { return String(t).slice(0, 5).replace(':', 'h'); }
function euros(c) { const e = c / 100; return (e % 1 ? e.toFixed(2).replace('.', ',') : String(e)) + ' €'; }

let twilioClient = null;
function twilio() {
  if (twilioClient) return twilioClient;
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: tok, TWILIO_FROM_NUMBER: from } = process.env;
  if (!sid || !tok || !from || !sid.startsWith('AC')) return null;
  twilioClient = require('twilio')(sid, tok);
  return twilioClient;
}

function isEnabled() { return !!process.env.WHAPI_TOKEN || !!twilio(); }
// Les fiches de conseils sont envoyées en IMAGE : seul WhatsApp (Whapi) sait le faire,
// un SMS ne peut pas porter d'image. On vérifie donc Whapi séparément.
function hasWhapi() { return !!process.env.WHAPI_TOKEN; }

// Envoie un message et renvoie le détail de ce qui s'est passé (statut + réponse Whapi).
// Jamais d'exception. Garde-fou : aucun envoi vers un numéro qui n'est pas au format international.
async function sendDetailed(toE164Number, text, tag) {
  const to = toE164(toE164Number);
  if (!to) { console.warn(`[notif] ${tag} : numéro invalide (${toE164Number}) — rien envoyé`); return { ok: false, via: 'none', reason: 'numéro invalide', input: toE164Number }; }
  if (process.env.WHAPI_TOKEN) {
    try {
      const r = await fetch(`${WHAPI_URL}/messages/text`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHAPI_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: to.slice(1), body: text }),
        signal: AbortSignal.timeout(15000),
      });
      const raw = await r.text();
      let response; try { response = JSON.parse(raw); } catch { response = raw.slice(0, 300); }
      if (!r.ok) { console.error(`[notif] ${tag} → ${to} : Whapi a répondu ${r.status} ${raw.slice(0, 200)}`); return { ok: false, via: 'whapi', status: r.status, response, to }; }
      console.log(`[notif] ${tag} → ${to} : WhatsApp envoyé`);
      return { ok: true, via: 'whapi', status: r.status, response, to };
    } catch (err) { console.error(`[notif] ${tag} → ${to} : échec Whapi`, err.message); return { ok: false, via: 'whapi', reason: 'exception', message: err.message, to }; }
  }
  const tw = twilio();
  if (tw) {
    try {
      await tw.messages.create({ to, from: process.env.TWILIO_FROM_NUMBER, body: text });
      console.log(`[notif] ${tag} → ${to} : SMS envoyé`);
      return { ok: true, via: 'twilio', to };
    } catch (err) { console.error(`[notif] ${tag} → ${to} : échec SMS`, err.message); return { ok: false, via: 'twilio', reason: 'exception', message: err.message, to }; }
  }
  console.log(`[notif] ${tag} → ${to} : (envois désactivés — renseigner WHAPI_TOKEN) « ${text.slice(0, 80)}… »`);
  return { ok: false, via: 'none', reason: 'WHAPI_TOKEN manquant', to };
}

// Renvoie true si c'est parti, false sinon (utilisé par les crons et le webhook).
async function send(toE164Number, text, tag) {
  return (await sendDetailed(toE164Number, text, tag)).ok;
}

// Envoie une IMAGE (fiche de conseils) avec une légende, via Whapi uniquement.
// `media` peut être une URL publique (https://…/fiche.png) ou une image encodée
// en base64 (data:image/png;base64,…). Jamais d'exception, jamais d'envoi vers
// un numéro invalide. Pas de secours SMS : un SMS ne peut pas porter d'image.
async function sendImageDetailed(toE164Number, media, caption, tag) {
  const to = toE164(toE164Number);
  if (!to) { console.warn(`[notif] ${tag} : numéro invalide (${toE164Number}) — rien envoyé`); return { ok: false, via: 'none', reason: 'numéro invalide', input: toE164Number }; }
  if (!process.env.WHAPI_TOKEN) {
    console.log(`[notif] ${tag} → ${to} : (image non envoyée — WHAPI_TOKEN manquant)`);
    return { ok: false, via: 'none', reason: 'WHAPI_TOKEN manquant', to };
  }
  try {
    const r = await fetch(`${WHAPI_URL}/messages/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHAPI_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: to.slice(1), media, caption }),
      signal: AbortSignal.timeout(30000),
    });
    const raw = await r.text();
    let response; try { response = JSON.parse(raw); } catch { response = raw.slice(0, 300); }
    if (!r.ok) { console.error(`[notif] ${tag} → ${to} : Whapi a répondu ${r.status} ${raw.slice(0, 200)}`); return { ok: false, via: 'whapi', status: r.status, response, to }; }
    console.log(`[notif] ${tag} → ${to} : fiche (image) envoyée`);
    return { ok: true, via: 'whapi', status: r.status, response, to };
  } catch (err) { console.error(`[notif] ${tag} → ${to} : échec Whapi (image)`, err.message); return { ok: false, via: 'whapi', reason: 'exception', message: err.message, to }; }
}

// ─── Les textes (modifiables ici) ────────────────────────────────────────────
const textes = {
  confirmation: (b, ics) =>
    `Hello ${prenom(b.client_name)} 🌿\n\n` +
    `Votre rendez-vous chez Exotic Beauty est confirmé ✅\n\n` +
    `📋 ${b.label}\n` +
    `📅 ${dateLongue(b.date)} à ${heure(b.time)} (≈ ${b.duration} min)\n` +
    `📍 ${STUDIO}\n` +
    `🧭 Itinéraire : ${STUDIO_MAPS}\n` +
    (ics ? `➕ Ajouter à mon agenda : ${ics}\n` : '') +
    `\nAcompte réglé : ${euros(b.deposit)} · reste à régler au studio : ${euros(b.total - b.deposit)}.\n` +
    `Pensez à venir sans maquillage sur la zone traitée 😉\n\n` +
    `Je reste dispo pour toute question, répondez simplement à ce message.\n` +
    `À très vite ! Malorie — Exotic Beauty`,

  proprietaire: (b) =>
    `🗓️ Nouvelle réservation\n${b.client_name} · ${b.client_phone}\n${b.label}\n` +
    `${dateLongue(b.date)} à ${heure(b.time)} (${b.duration} min)\nAcompte payé : ${euros(b.deposit)} · reste : ${euros(b.total - b.deposit)}`,

  rappel: (b) =>
    `Bonjour ${prenom(b.client_name)}, petit rappel : je vous attends demain, ${dateLongue(b.date)} à ${heure(b.time)}, pour ${b.label}.\n\n` +
    `${STUDIO}. Venez sans maquillage sur la zone et évitez le café juste avant 😉\n\n` +
    `Un empêchement ? Répondez à ce message. À demain ! Malorie`,

  avis: (b, lien) =>
    `Bonjour ${prenom(b.client_name)}, merci encore pour votre visite d'hier ! J'espère que vous êtes ravie du résultat.\n\n` +
    `Si vous avez 30 secondes, votre avis m'aide énormément : ${lien}\n\nBelle journée ! Malorie`,

  remplissage: (b, lien) =>
    `Bonjour ${prenom(b.client_name)} ! Votre pose date de bientôt 3 semaines : c'est le bon moment pour le remplissage, pour garder une ligne pleine.\n\n` +
    `Vous pouvez réserver ici : ${lien}\n\nÀ bientôt ! Malorie`,

  relance: (nom) =>
    `Coucou ${prenom(nom)} ! Ça fait un moment qu'on ne s'est pas vues chez Exotic Beauty 💛 Envie de reprendre rendez-vous ? On vous attend !`,

  // Légende de la fiche de conseils post-séance (envoyée avec l'image).
  conseils: () =>
    `Merci pour votre visite chez Exotic Beauty ✨ Voici vos conseils pour prendre soin de votre résultat. N'hésitez pas à m'écrire si vous avez la moindre question.`,
};

module.exports = { toE164, send, sendDetailed, sendImageDetailed, textes, isEnabled, hasWhapi, STUDIO, STUDIO_MAPS };
