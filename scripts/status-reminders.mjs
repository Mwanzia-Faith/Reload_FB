#!/usr/bin/env node
/* ------------------------------------------------------------------
   Front Belt — the reminder that reaches a partner who never opens the site.

   Run several times a day by .github/workflows/status-reminders.yml. What it
   does:

     1. reads every published listing straight from Firestore's REST API —
        the same public read the website itself does, so no extra keys
     2. decides in East Africa Time which Health listings are due a nudge:
        today is one of the partner's working days, and today's status is
        still missing
     3. emails that partner through Brevo
     4. does it twice: once in the morning, and again in the afternoon if the
        status is *still* missing — the second one says so plainly

   The clock at run time picks which of the two messages goes out, not the
   schedule. GitHub starts scheduled runs late — often by hours — so a run
   meant for 08:00 that starts at 17:00 must not say "Good morning": it
   becomes the afternoon nudge instead.

   Because a nudge can therefore be tried more than once in its window, the
   run records the slots it has sent in .reminder-state.json (carried between
   runs by the workflow's cache) and never sends the same one twice a day.

   With no BREVO_API_KEY (or DRY_RUN=1) it sends nothing and prints who it
   would have emailed — which is how it is safe to run before setup.

   --test-to=you@example.com sends one real message now (subject marked
   [Test]) through the same call, ignoring who is due, so the key and sender
   can be proved without waiting for a morning where a status is missing.
-------------------------------------------------------------------*/
import { readFileSync, writeFileSync } from 'node:fs';

const TZ = 'Africa/Nairobi';
const APP_URL = process.env.APP_URL || 'https://mwanzia-faith.github.io/Reload_FB/';
const SENDER_EMAIL = (process.env.SENDER_EMAIL || 'frontbelttechnologiesltd@gmail.com').trim();
const SENDER_NAME = (process.env.SENDER_NAME || 'Front Belt').trim();
const KEY = (process.env.BREVO_API_KEY || '').trim();
const DRY = !KEY || process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');
const STATE_PATH = process.env.REMINDER_STATE || '.reminder-state.json';

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
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false });
const DAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const dayKey = (d) => dateFmt.format(d);                 // 2026-11-24
const weekday = (d) => DAY[dayFmt.format(d)];            // 0..6
const hourOf = (d) => Number(hourFmt.format(d)) % 24;     // 0..23 in Nairobi

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

/* ---------- which nudge is this run? ----------
   Morning before 12:00, afternoon after it, and nothing outside 07:00–21:00:
   a nudge that only starts at half past nine at night is not worth sending. */
function slotFor(now) {
  const h = hourOf(now);
  if (h < 7 || h >= 21) return null;
  return h < 12 ? 'morning' : 'evening';
}

/* ---------- the once-a-day guard ----------
   Three scheduled runs offer each nudge, so a late start is caught by the
   next one. This file stops the partner hearing the same nudge twice. */
function readState() {
  try {
    const raw = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}
function sentToday(state, day, slot) {
  const slots = state[day];
  return Array.isArray(slots) && slots.includes(slot);
}
function recordSend(state, day, slot) {
  const cutoff = Date.now() - 4 * 86400000;
  const next = {};
  for (const d of Object.keys(state)) {
    const t = Date.parse(d + 'T00:00:00Z');
    if (!Number.isNaN(t) && t >= cutoff) next[d] = state[d];
  }
  const slots = Array.isArray(next[day]) ? next[day].slice() : [];
  if (!slots.includes(slot)) slots.push(slot);
  next[day] = slots;
  try {
    writeFileSync(STATE_PATH, JSON.stringify(next));
  } catch (err) {
    console.error(`could not write ${STATE_PATH} (${err.message}) — a later run today may repeat this nudge`);
  }
}

/* ---------- the email ---------- */
function emailFor(c, slot) {
  const name = c.name || 'your business';
  const link = APP_URL.replace(/\/$/, '') + '/#/partner';
  const evening = slot === 'evening';
  const subject = evening
    ? `Still no status for ${name} today`
    : `Today's status for ${name} is still missing`;
  const greeting = evening ? 'Hello again,' : 'Good morning,';
  /* the name is escaped separately, so a business called "Kariuki & Sons"
     cannot break the HTML of its own reminder */
  const opening = evening
    ? ' still shows "not updated today" to everyone searching near it. We asked this morning and it has not been updated yet — it takes under a minute to fix:'
    : ' shows "not updated today" to everyone searching near it. It takes under a minute to fix:';
  const closedNote = evening
    ? 'If you are already closed for the day, tap "Closed today" — one tap, and tomorrow starts from a clean status.'
    : 'If you are not opening today and it is normally a working day, tap "Closed today" — it is one tap and customers stop wondering.';
  const text = [
    greeting,
    '',
    name + opening,
    '',
    `1. Open your console: ${link}`,
    '2. Tap "Open now" or "Closed today"',
    '',
    closedNote,
    '',
    'Days you tick as closed in your console are never counted as missed, and this reminder is not sent on them.',
    '',
    '— Front Belt',
    'You are getting this because your listing asked for an email reminder. Turn it off in your console under Daily reminder.'
  ].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.55;color:#1b2733;max-width:520px">
  <p>${greeting}</p>
  <p><strong>${escapeHtml(name)}</strong>${escapeHtml(opening)}</p>
  <p style="margin:22px 0"><a href="${link}" style="background:#12305A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Open my console</a></p>
  <p>${closedNote}</p>
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
  /* the clock decides which nudge a run is, so the boundaries matter */
  const at = (h) => new Date(Date.UTC(2026, 10, 28, h - 3, 0, 0));
  const slots = [
    ['06:00 EAT — too early', at(6), null],
    ['07:00 EAT — morning', at(7), 'morning'],
    ['08:00 EAT — morning', at(8), 'morning'],
    ['11:59 EAT — still morning', at(11), 'morning'],
    ['12:00 EAT — afternoon', at(12), 'evening'],
    ['16:00 EAT — afternoon', at(16), 'evening'],
    ['20:59 EAT — late afternoon', at(20), 'evening'],
    ['21:00 EAT — too late to send', at(21), null]
  ];
  for (const [label, when, expected] of slots) {
    const got = slotFor(when);
    if (got !== expected) bad++;
    console.log(`${got === expected ? 'ok  ' : 'FAIL'} ${label}: ${got || 'skipped'}`);
  }
  const guard = { '2026-11-28': ['morning'] };
  const guardCases = [
    ['morning already sent today', sentToday(guard, '2026-11-28', 'morning'), true],
    ['afternoon still allowed after the morning one', sentToday(guard, '2026-11-28', 'evening'), false],
    ['a new day starts clean', sentToday(guard, '2026-11-29', 'morning'), false]
  ];
  for (const [label, got, expected] of guardCases) {
    if (got !== expected) bad++;
    console.log(`${got === expected ? 'ok  ' : 'FAIL'} ${label}: ${got ? 'already sent' : 'allowed'}`);
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
const today = dayKey(now);
console.log(`Front Belt reminders · ${today} (${DAY_LONG[weekday(now)]}) · ${TZ} · ${String(hourOf(now)).padStart(2, '0')}:00`);
/* the From line in the log, so every run shows the name and address a partner
   will actually see — and a SENDER_EMAIL secret set to something else is
   visible here instead of being discovered in an inbox */
console.log(`from: ${SENDER_NAME} <${SENDER_EMAIL}>`);

const state = readState();
const slot = slotFor(now);
if (!slot) {
  console.log(`It is ${hourOf(now)}:00 in Nairobi — outside the 07:00–21:00 window, so no reminder is sent.`);
} else {
  console.log(`this run is the ${slot} reminder`);
  if (sentToday(state, today, slot)) {
    console.log(`the ${slot} reminder already went out today — nothing to do.`);
    if (!DRY) process.exit(0);
  }
}

let listings;
try {
  listings = await publishedListings(cfg);
} catch (err) {
  console.error('Could not read the listings:', err.message);
  process.exit(1);
}

/* --test-to (or TEST_TO in the workflow): one real message now, through the
   same Brevo call the scheduled run uses. It ignores who is due, so the key,
   the sender and the inbox can be proved today instead of waiting for a day
   where the status is missing. */
const testArg = process.argv.find((a) => a.startsWith('--test-to='))
  || (String(process.env.TEST_TO || '').trim() ? '--test-to=' + String(process.env.TEST_TO).trim() : '');
if (testArg) {
  const to = testArg.slice('--test-to='.length).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error('--test-to needs an email address, e.g. --test-to=you@example.com');
    process.exit(1);
  }
  if (!KEY) {
    console.error('No BREVO_API_KEY set here — cannot send the test. Run it from the workflow, where the secret is.');
    process.exit(1);
  }
  const sample = listings.find((c) => String(c.category || '') === 'health') || { name: 'your business' };
  const which = slot || 'morning';
  const mail = emailFor(Object.assign({}, sample, { remindEmail: to }), which);
  mail.subject = `[Test] ${which} reminder — ` + mail.subject;
  try {
    await send({ remindEmail: to, name: sample.name || '' }, mail);
    console.log(`test (${which} copy) sent → ${maskAddr(to)} — check that inbox, including spam.`);
  } catch (err) {
    console.error(`test failed → ${maskAddr(to)}: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

const due = listings.filter((c) => isDue(c, now));
console.log(`${listings.length} published listing(s) read, ${due.length} due the ${slot || 'no'} reminder.`);

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
    if (c.lastStatusAt && dayKey(new Date(c.lastStatusAt)) === today) why.push('status already saved today');
    console.log(`  ${c.name}: ${why.length ? 'skip — ' + why.join(', ') : 'DUE'}`);
  }
}

if (!slot) process.exit(0);
if (!due.length) process.exit(0);

if (DRY) {
  console.log(KEY ? 'Dry run requested — nothing sent.' : 'No BREVO_API_KEY set — nothing sent. This is the list it would have emailed:');
  due.forEach((c) => console.log(`  • ${c.name} <${maskAddr(c.remindEmail)}> — last status ${c.lastStatusAt || 'never'}`));
  process.exit(0);
}

let failed = 0;
for (const c of due) {
  try {
    await send(c, emailFor(c, slot));
    console.log(`sent (${slot}) → ${c.name} <${maskAddr(c.remindEmail)}>`);
  } catch (err) {
    failed++;
    console.error(`failed (${slot}) → ${c.name} <${maskAddr(c.remindEmail)}>: ${err.message}`);
  }
}
/* only a nudge that actually reached someone is written down, so a failed
   send is retried by the next scheduled run today */
if (due.length > failed) recordSend(state, today, slot);
console.log(`Done. ${due.length - failed} sent, ${failed} failed.`);
process.exit(failed ? 1 : 0);
