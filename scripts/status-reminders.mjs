#!/usr/bin/env node
/* ------------------------------------------------------------------
   Front Belt — the reminder that reaches a partner who never opens the site.

   Run once a day by .github/workflows/status-reminders.yml. What it does:

     1. reads every published listing straight from Firestore's REST API —
        the same public read the website itself does, so no extra keys
     2. decides in East Africa Time which Health listings are due a nudge:
        today is one of the partner's working days, and today's status is
        still missing
     3. emails that partner through Brevo

   With no BREVO_API_KEY (or DRY_RUN=1) it sends nothing and prints who it
   would have emailed — which is how it is safe to run before setup.
-------------------------------------------------------------------*/
import { readFileSync } from 'node:fs';

const TZ = 'Africa/Nairobi';
const APP_URL = process.env.APP_URL || 'https://mwanzia-faith.github.io/Reload_FB/';
const SENDER_EMAIL = (process.env.SENDER_EMAIL || 'frontbelttechnologiesltd@gmail.com').trim();
const SENDER_NAME = (process.env.SENDER_NAME || 'Front Belt').trim();
const KEY = (process.env.BREVO_API_KEY || '').trim();
const DRY = !KEY || process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');

/* ---------- firebase config (public by design, so no secret needed) ---------- */
function firebaseConfig() {
  const src = readFileSync(new URL('../assets/firebase-config.js', import.meta.url), 'utf8');
  const pick = (name) => {
    const m = src.match(new RegExp(name + "\\s*:\\s*[\"']([^\"']+)[\"']"));
    return m ? m[1] : '';
  };
  return { apiKey: pick('apiKey'), projectId: pick('projectId') };
}

/* ---------- reading Firestore's REST shape ---------- */
function value(f) {
  if (!f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return Number(f.doubleValue);
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(value);
  if ('nullValue' in f) return null;
  return null;
}
function fieldsOf(doc) {
  const out = {};
  const f = (doc.fields || {});
  for (const k of Object.keys(f)) out[k] = value(f[k]);
  return out;
}

async function publishedListings(cfg) {
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents:runQuery?key=${cfg.apiKey}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'clinics' }],
      where: { fieldFilter: { field: { fieldPath: 'published' }, op: 'EQUAL', value: { booleanValue: true } } }
    }
  };
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Firestore answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  return rows.filter((r) => r.document).map((r) => Object.assign({ id: r.document.name.split('/').pop() }, fieldsOf(r.document)));
}

/* ---------- dates, in the timezone the partners live in ---------- */
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const DAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const dayKey = (d) => dateFmt.format(d);                 // 2026-11-24
const weekday = (d) => DAY[dayFmt.format(d)];            // 0..6

function workDays(c) {
  const d = Array.isArray(c.openDays) ? c.openDays.map(Number).filter((n) => n >= 0 && n <= 6) : [];
  return d.length ? d : [0, 1, 2, 3, 4, 5, 6];
}

/* a listing is due when it is open today and today has no status yet */
function isDue(c, now) {
  if (String(c.category || '') !== 'health') return false;
  if (c.reviewState && c.reviewState !== 'approved') return false;
  if (c.remindOn === false) return false;
  if (!c.remindEmail) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.remindEmail))) return false;
  if (!workDays(c).includes(weekday(now))) return false;
  if (!c.lastStatusAt) return true;
  return dayKey(new Date(c.lastStatusAt)) !== dayKey(now);
}

/* ---------- the email ---------- */
function emailFor(c) {
  const name = c.name || 'your business';
  const link = APP_URL.replace(/\/$/, '') + '/#/partner';
  const subject = `Today's status for ${name} is still missing`;
  const text = [
    `Good morning,`,
    '',
    `${name} shows "not updated today" to everyone searching near it.`,
    'It takes under a minute to fix:',
    '',
    `1. Open your console: ${link}`,
    '2. Tap "Open now" or "Closed today"',
    '',
    'If you are not opening today and it is normally a working day, tap "Closed today" — it is one tap and customers stop wondering.',
    '',
    'Days you tick as closed in your console are never counted as missed, and this reminder is not sent on them.',
    '',
    '— Front Belt',
    'You are getting this because your listing asked for an email reminder. Turn it off in your console under Daily reminder.'
  ].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.55;color:#1b2733;max-width:520px">
  <p>Good morning,</p>
  <p><strong>${escapeHtml(name)}</strong> shows &ldquo;not updated today&rdquo; to everyone searching near it. It takes under a minute to fix.</p>
  <p style="margin:22px 0"><a href="${link}" style="background:#12305A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Open my console</a></p>
  <p>Tap <strong>Open now</strong> or <strong>Closed today</strong>. If you are not opening today and it is normally a working day, &ldquo;Closed today&rdquo; is one tap and customers stop wondering.</p>
  <p style="color:#5b6b7a;font-size:14px">Days you tick as closed in your console are never counted as missed, and this reminder is not sent on them.</p>
  <p style="color:#5b6b7a;font-size:14px">&mdash; Front Belt<br>You get this because your listing asked for an email reminder. Turn it off in your console under <em>Daily reminder</em>.</p>
</div>`;
  return { subject, text, html };
}

/* GitHub Actions logs on a public repo are public, so an address is never
   printed in full. */
function maskAddr(e) {
  const parts = String(e || '').split('@');
  return (parts[0] || '').slice(0, 2) + '***@' + (parts[1] || '');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function send(c, mail) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': KEY },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: String(c.remindEmail).trim(), name: c.name || '' }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text
    })
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json().catch(() => ({}));
}

/* ---------- self-test: the rules that decide who gets an email ---------- */
if (process.argv.includes('--self-test')) {
  const today = new Date();
  const stale = new Date(Date.now() - 2 * 86400000).toISOString();
  const base = { category: 'health', reviewState: 'approved', remindEmail: 'owner@example.co.ke', lastStatusAt: stale };
  const openToday = { openDays: [weekday(today)] };
  const cases = [
    ['two days quiet, open today', Object.assign({}, base, openToday), true],
    ['status already saved today', Object.assign({}, base, openToday, { lastStatusAt: today.toISOString() }), false],
    ['closed today', Object.assign({}, base, { openDays: [(weekday(today) + 1) % 7] }), false],
    ['no working days given (opens every day)', Object.assign({}, base), true],
    ['email reminders switched off', Object.assign({}, base, openToday, { remindOn: false }), false],
    ['no email address', Object.assign({}, base, openToday, { remindEmail: '' }), false],
    ['not a Health listing', Object.assign({}, base, openToday, { category: 'food' }), false],
    ['still waiting for review', Object.assign({}, base, openToday, { reviewState: 'pending' }), false]
  ];
  let bad = 0;
  for (const [label, listing, expected] of cases) {
    const got = isDue(listing, today);
    if (got !== expected) bad++;
    console.log(`${got === expected ? 'ok  ' : 'FAIL'} ${label}: ${got ? 'emailed' : 'skipped'}`);
  }
  console.log(bad ? `${bad} case(s) wrong` : 'All cases behave as intended.');
  process.exit(bad ? 1 : 0);
}

/* ---------- run ---------- */
const cfg = firebaseConfig();
if (!cfg.apiKey || !cfg.projectId) {
  console.error('No Firebase config found in assets/firebase-config.js — nothing to read.');
  process.exit(1);
}

const now = new Date();
console.log(`Front Belt reminders · ${dayKey(now)} (${DAY_LONG[weekday(now)]}) · ${TZ}`);

let listings;
try {
  listings = await publishedListings(cfg);
} catch (err) {
  console.error('Could not read the listings:', err.message);
  process.exit(1);
}

const due = listings.filter((c) => isDue(c, now));
console.log(`${listings.length} published listing(s) read, ${due.length} due a reminder.`);

/* --explain: say why each listing was skipped, which is the question you will
   actually have the first morning nothing arrives */
if (process.argv.includes('--explain')) {
  for (const c of listings) {
    const why = [];
    if (String(c.category || '') !== 'health') why.push('not Health');
    if (c.reviewState && c.reviewState !== 'approved') why.push('not approved (' + c.reviewState + ')');
    if (c.remindOn === false) why.push('email reminders off');
    if (!c.remindEmail) why.push('no reminder email saved');
    if (!workDays(c).includes(weekday(now))) why.push('closed today');
    if (c.lastStatusAt && dayKey(new Date(c.lastStatusAt)) === dayKey(now)) why.push('status already saved today');
    console.log(`  ${c.name}: ${why.length ? 'skip — ' + why.join(', ') : 'DUE'}`);
  }
}

if (!due.length) process.exit(0);

if (DRY) {
  console.log(KEY ? 'Dry run requested — nothing sent.' : 'No BREVO_API_KEY set — nothing sent. This is the list it would have emailed:');
  due.forEach((c) => console.log(`  • ${c.name} <${maskAddr(c.remindEmail)}> — last status ${c.lastStatusAt || 'never'}`));
  process.exit(0);
}

let failed = 0;
for (const c of due) {
  try {
    await send(c, emailFor(c));
    console.log(`sent → ${c.name} <${maskAddr(c.remindEmail)}>`);
  } catch (err) {
    failed++;
    console.error(`failed → ${c.name} <${maskAddr(c.remindEmail)}>: ${err.message}`);
  }
}
console.log(`Done. ${due.length - failed} sent, ${failed} failed.`);
process.exit(failed ? 1 : 0);
