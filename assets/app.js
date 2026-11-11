/* ==================================================================
   Front Belt — application
   Routing, clinic search, sign-in, provider console, team console.
   ================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var DATA = window.FB_DATA;
  var CATS = DATA.categories || [];
  var EMAIL = 'frontbelttechnologiesltd@gmail.com';

  function catById(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i];
    return null;
  }
  /* a listing with no category predates the categories — it is a health place */
  function catOf(c) { return catById(c && c.category) || catById('health') || CATS[0]; }
  function isHealth(c) { return !!(catOf(c) || {}).health; }

  /* ---------------- review workflow ----------------
     A partner submits -> received -> in review -> approved or denied.
     Nothing reaches the public site until the team has approved it.
     Listings made before this workflow, and listings the team enters
     itself, carry no state and count as approved. */
  var REVIEW_LABEL = {
    pending: 'Received', in_review: 'In review', approved: 'Approved', denied: 'Not approved'
  };
  function reviewState(c) { return (c && c.reviewState) || 'approved'; }
  function approved(c) { return reviewState(c) === 'approved'; }
  function isAwaiting(c) { var s = reviewState(c); return s === 'pending' || s === 'in_review'; }

  /* WhatsApp and OpenStreetMap links — the phone the partner gave us,
     normalised to the international form wa.me expects. */
  function waNumber(p) {
    var d = String(p || '').replace(/[^0-9]/g, '');
    if (!d) return '';
    if (d.indexOf('254') === 0) return d;
    if (d.charAt(0) === '0') return '254' + d.slice(1);
    if (d.length === 9) return '254' + d;
    return d;
  }
  function waURL(c) {
    var n = waNumber(c && c.phone);
    if (!n) return '';
    return 'https://wa.me/' + n + '?text=' +
      encodeURIComponent('Hello ' + (c.name || '') + ', I found you on Front Belt.');
  }
  function osmURL(c) {
    if (!isFinite(c.lat) || !isFinite(c.lng)) return '';
    return 'https://www.openstreetmap.org/?mlat=' + c.lat + '&mlon=' + c.lng + '#map=17/' + c.lat + '/' + c.lng;
  }

  /* Contact form delivery.
     Empty  -> the button opens the visitor's own email app (no server needed,
               but it fails silently where no email app is set up).
     Filled -> the message is POSTed to Web3Forms and lands in the inbox
               directly, no email app involved. Get a free access key in one
               minute at https://web3forms.com (the key is emailed to you —
               which also proves the inbox receives mail). See README.md. */
  var CONTACT_KEY = '';

  /* Front Belt's own WhatsApp line, international format without the plus —
     for example '254712345678'. Empty means the contact page asks people to
     email instead of showing a link that goes nowhere. */
  var WA_NUMBER = '';

  var all = [];            /* every clinic this visitor is allowed to see */
  var me = null;           /* signed-in profile, or null */
  var meGeo = null;        /* {lat,lng,acc} from the device */
  var savedIds = [];
  var curList = [];   /* what the list view is showing right now — the map draws this */
  var authRole = 'patient';
  var authMode = 'signin';
  /* Demo mode only: the local team console is opened with this code instead of
     a real account, so a visitor clicking around cannot wander into it.
     Change it to anything you like — and read README.md: a code that lives in
     the page source protects the look of the demo, not the data. Real access
     control is the Firestore rules in firestore.rules. */
  var TEAM_CODE = 'ILOVEFB';
  var dataErr = null;
  var lastLoaded = null;
  var samplesOn = false;   /* visitor asked to preview sample listings */
  var activeCat = null;    /* category id being browsed, or null for all */
  var modalOpen = false;
  var pdMap = null;        /* map inside the place-detail sheet */
  var pdMode = 'driving';
  var watchId = null;

  var map = null, mapLayer = null, mapReady = false, mapLoading = null;
  var lastReqs = [];
  var provClinicId = null;
  var adminFilter = { q: '', f: '' };

  /* ---------------- small helpers ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.hidden = true; }, ms || 3600);
  }
  function clock(d) {
    d = d || new Date();
    var h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2);
    return (h % 12 || 12) + ':' + m + ' ' + (h < 12 ? 'am' : 'pm');
  }
  function dayDiff(isoStr) {
    var d = new Date(isoStr);
    if (isNaN(d)) return 99;
    var a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var n = new Date();
    var b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((b - a) / 86400000);
  }
  function ago(isoStr) {
    if (!isoStr) return 'never';
    var m = Math.round((Date.now() - Date.parse(isoStr)) / 60000);
    if (!isFinite(m)) return 'never';
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var d = dayDiff(isoStr);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }
  function distanceKm(a, b, c, d) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (c - a) * rad, dLng = (d - b) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function fmtDist(km) {
    if (km == null || !isFinite(km)) return '';
    if (km < 0.95) {
      var m = Math.round(km * 1000 / 10) * 10;
      return m < 50 ? 'under 50 m' : m + ' m';
    }
    return km < 10 ? km.toFixed(1) + ' km' : Math.round(km) + ' km';
  }
  function firstName(s) {
    s = String(s || '').trim();
    if (!s) return 'You';
    if (s.indexOf('@') > -1) s = s.split('@')[0];
    return s.split(/\s+/)[0];
  }

  /* ---------------- derived public status ----------------
     0 days since update  -> what the clinic reported
     1–2 days             -> "Not updated today"
     3–6 days             -> "Status unknown" (drops in the list)
     7+ days              -> hidden from the public site          */
  function statusOf(c) {
    /* only Health carries a daily status. Everything else is found by
       where it is, not by whether it reported in this morning. */
    if (!isHealth(c)) return { key: 'na', text: '', days: 0 };
    if (!c.lastStatusAt) return { key: 'unknown', text: 'Status unknown', days: 99 };
    var days = dayDiff(c.lastStatusAt);
    if (days <= 0 && (c.status === 'open' || c.status === 'closed')) {
      return c.status === 'open'
        ? { key: 'open', text: 'Open today · updated ' + clock(new Date(c.lastStatusAt)), days: 0 }
        : { key: 'closed', text: 'Closed today', days: 0 };
    }
    if (days < 3) return { key: 'stale', text: 'Not updated today', days: days };
    if (days < 7) return { key: 'unknown', text: 'Status unknown', days: days };
    return { key: 'hidden', text: 'Not updated for ' + days + ' days', days: days };
  }

  function publicClinics() {
    var live = all.filter(function (c) {
      if (!c.published) return false;
      if (!approved(c)) return false;       /* still in the review queue */
      return statusOf(c).key !== 'hidden';
    });
    /* an empty directory is honest, but a visitor should still be able to
       see what the categories look like — on request, never mixed in */
    if (!live.length && samplesOn) return fallbackRows();
    return live;
  }

  function clinicForMe() {
    if (!me) return null;
    return all.filter(function (c) { return c.ownerUid === me.uid; })[0] || null;
  }

  function routeForRole(u) {
    if (!u) return '#/signin';
    return u.role === 'admin' ? '#/admin' : u.role === 'provider' ? '#/partner' : '#/account';
  }

  function isTeam() { return !!(me && me.role === 'admin'); }

  /* ---------------- modal ---------------- */
  function openModal(title, html, cls) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    $('sheet').className = 'sheet' + (cls ? ' ' + cls : '');
    $('modal').hidden = false;
    modalOpen = true;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    $('modal').hidden = true;
    $('modal-body').innerHTML = '';
    modalOpen = false;
    document.body.style.overflow = '';
    if (pdMap) { try { pdMap.remove(); } catch (x) {} pdMap = null; }
  }
  function confirmDialog(o) {
    return new Promise(function (resolve) {
      openModal(o.title || 'Are you sure?',
        '<div class="stack">' +
        '<p class="muted">' + esc(o.body || '') + '</p>' +
        '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn btn-ghost" data-confirm="no">Cancel</button>' +
        '<button class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-confirm="yes">' + esc(o.confirm || 'Confirm') + '</button>' +
        '</div></div>');
      $('modal-body').addEventListener('click', function (e) {
        var b = e.target.closest('[data-confirm]');
        if (!b) return;
        closeModal();
        resolve(b.getAttribute('data-confirm') === 'yes');
      });
    });
  }

  /* ---------------- place detail: the “Start” sheet ----------------
     Tap any listing and it opens here with the map, the facts, and a
     Start button that hands over to Google Maps for turn-by-turn. */
  function openPlace(id) {
    var c = all.filter(function (x) { return x.id === id; })[0];
    if (!c && samplesOn) c = fallbackRows().filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var k = catOf(c);
    var dist = (meGeo && isFinite(c.lat) && isFinite(c.lng))
      ? distanceKm(meGeo.lat, meGeo.lng, c.lat, c.lng) : null;
    var saved = savedIds.indexOf(c.id) > -1;
    var s = statusOf(c);

    var rows = '';
    if (c.type) rows += '<dt>Type</dt><dd>' + esc(c.type) + '</dd>';
    if (c.area) rows += '<dt>Area</dt><dd>' + esc(c.area) + '</dd>';
    if (c.address) rows += '<dt>Address</dt><dd>' + esc(c.address) + '</dd>';
    if (dist != null) rows += '<dt>From you</dt><dd>' + esc(fmtDist(dist)) + ' away</dd>';
    if (c.hours) rows += '<dt>Hours</dt><dd>' + esc(c.hours) + '</dd>';
    if (c.phone) rows += '<dt>Phone</dt><dd>' + esc(c.phone) + '</dd>';
    if (k.health && (s.key === 'open' || s.key === 'closed' || s.key === 'stale' || s.key === 'unknown')) {
      rows += '<dt>Status</dt><dd>' + esc(s.text) + '</dd>';
      if (s.key === 'open') rows += '<dt>Wait</dt><dd>' + (c.waitMinutes ? 'about ' + esc(c.waitMinutes) + ' min' : 'not reported') + '</dd>';
    }
    if ((c.services || []).length) rows += '<dt>' + (k.health ? 'Services' : 'Offers') + '</dt><dd>' + esc(c.services.join(', ')) + '</dd>';
    if (!c.sample && c.verifiedAt) rows += '<dt>Confirmed</dt><dd>' + esc(ago(c.verifiedAt)) + '</dd>';
    if (!c.sample && c.source === 'openstreetmap') rows += '<dt>Source</dt><dd>OpenStreetMap contributors</dd>';
    if (c.sample) rows += '<dt>Note</dt><dd>Sample listing — a demonstration, not a real place.</dd>';

    pdMode = 'driving';
    var html =
      '<div class="pd-head" style="--cc:' + esc(k.color) + '">' +
      '<span class="picon"><svg class="ic"><use href="#' + esc(k.icon) + '"/></svg></span>' +
      '<span class="pmeta"><span class="ptype">' + esc(c.type || k.label) + '</span>' +
      '<h3>' + esc(c.name) + '</h3>' +
      (c.trust && c.trust !== 'Listed' ? '<span class="badge b-' + esc(c.trust) + '">' + esc(c.trust) + '</span>' : '') +
      '</span></div>' +
      '<dl class="pd-kv">' + rows + '</dl>' +
      (isFinite(c.lat) ? '<div id="pd-map" aria-label="Map preview of ' + esc(c.name) + '"></div>' : '') +
      '<div class="modes" id="pd-modes">' +
      '<button type="button" data-mode="driving" aria-pressed="true">Drive</button>' +
      '<button type="button" data-mode="walking" aria-pressed="false">Walk</button>' +
      '<button type="button" data-mode="transit" aria-pressed="false">Transit</button>' +
      '</div>' +
      '<div class="pd-actions">' +
      '<a class="btn btn-primary" id="pd-start" href="' + esc(dirURL(c, 'driving')) + '" target="_blank" rel="noopener">' +
      '<svg class="ic"><use href="#i-nav"/></svg> Start</a>' +
      (c.phone ? '<a class="btn btn-ghost" href="tel:' + esc(String(c.phone).replace(/\s+/g, '')) + '"><svg class="ic"><use href="#i-phone"/></svg> Call</a>' : '') +
      (waURL(c) ? '<a class="btn btn-ghost" href="' + esc(waURL(c)) + '" target="_blank" rel="noopener"><svg class="ic"><use href="#i-whatsapp"/></svg> WhatsApp</a>' : '') +
      '<button class="btn btn-ghost" type="button" data-save="' + esc(c.id) + '"><svg class="ic"><use href="#i-heart"/></svg> ' + (saved ? 'Saved' : 'Save') + '</button>' +
      '</div>' +
      (dist == null ? '<p class="hint">Share your location and the Start button begins from where you are standing.</p>' : '') +
      (osmURL(c) ? '<p class="hint">Start opens whichever map app your phone has. <a href="' + esc(osmURL(c)) + '" target="_blank" rel="noopener">See this place on OpenStreetMap</a>.</p>' : '');

    openModal(k.label + ' · ' + (c.type || 'listing'), html, 'place');

    var modes = $('pd-modes');
    if (modes) modes.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) return;
      pdMode = b.getAttribute('data-mode');
      modes.querySelectorAll('[data-mode]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      var st = $('pd-start');
      if (st) st.href = dirURL(c, pdMode);
    });

    if (isFinite(c.lat)) {
      loadLeaflet().then(function () {
        var box = $('pd-map');
        if (!box || !window.L) return;
        try {
          pdMap = L.map('pd-map', { scrollWheelZoom: false }).setView([c.lat, c.lng], 15);
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
          }).addTo(pdMap);
          var pts = [[c.lat, c.lng]];
          L.circleMarker([c.lat, c.lng], { radius: 9, color: '#fff', weight: 2, fillColor: k.color, fillOpacity: 1 })
            .bindPopup('<strong>' + esc(c.name) + '</strong>' + esc(c.area || ''))
            .addTo(pdMap);
          if (meGeo) {
            L.circleMarker([meGeo.lat, meGeo.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#2563EB', fillOpacity: 1 })
              .bindPopup('<strong>You are here</strong>').addTo(pdMap);
            pts.push([meGeo.lat, meGeo.lng]);
          }
          pdMap.fitBounds(pts, { padding: [34, 34], maxZoom: 16 });
          setTimeout(function () { if (pdMap) pdMap.invalidateSize(); }, 170);
        } catch (x) { if (pdMap) { try { pdMap.remove(); } catch (y) {} pdMap = null; } }
      }).catch(function () { /* no map, the Start button still works */ });
    }
  }

  /* ================================================================
     ROUTING
     ================================================================ */
  var ROUTES = {
    home: 'view-home', find: 'view-find', cat: 'view-find', trust: 'view-trust', about: 'view-about',
    partners: 'view-partners', clinics: 'view-partners',
    faq: 'view-faq', contact: 'view-contact', signin: 'view-signin',
    account: 'view-account', partner: 'view-provider', provider: 'view-provider',
    team: 'view-team', admin: 'view-admin'
  };
  /* routes that are nobody else's business — never linked in the nav or footer */
  var PRIVATE_ROUTES = ['team', 'admin', 'partner', 'provider', 'account'];

  var TITLES = {
    home: 'Connect, compare and access what is near you',
    find: 'Find what you need near you',
    trust: 'How the trust levels work',
    about: 'What makes Front Belt different',
    partners: 'List your business on Front Belt',
    clinics: 'List your business on Front Belt',
    faq: 'Questions and answers',
    contact: 'Talk to the team',
    signin: 'Sign in',
    account: 'Your dashboard',
    partner: 'Partner console',
    provider: 'Partner console',
    team: 'Team access',
    admin: 'Team console'
  };
  function pageTitle(r) {
    if (r === 'cat') {
      var c = catById(currentCat());
      if (c) return c.label + ' near you';
    }
    return TITLES[r] || TITLES.home;
  }
  var NAV_FOR = { home: 'home', find: 'find', cat: 'find', trust: 'trust', about: 'about', partners: 'partners', clinics: 'partners', faq: 'faq', contact: 'contact' };

  function currentRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    if (ROUTES[h]) return h;
    if (h.indexOf('c/') === 0 && catById(h.slice(2))) return 'cat';
    return 'home';
  }
  function currentCat() {
    var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return h.indexOf('c/') === 0 && catById(h.slice(2)) ? h.slice(2) : null;
  }

  function render() {
    var r = currentRoute();
    if (r === 'account' && !me) { location.hash = '#/signin'; return; }
    if ((r === 'partner' || r === 'provider') && !me) { location.hash = '#/signin'; return; }
    /* The team console has its own door: not signed in at all, or signed in as
       an ordinary account, never lands on it. */
    if (r === 'admin' && !isTeam()) {
      $('admin-stats').innerHTML = '';
      $('admin-requests').innerHTML = '';
      $('admin-table').innerHTML = '';
      location.hash = '#/team';
      return;
    }
    if (r === 'team' && isTeam()) { location.hash = '#/admin'; return; }

    var viewId = ROUTES[r];
    Object.keys(ROUTES).forEach(function (k) { $(ROUTES[k]).hidden = (ROUTES[k] !== viewId); });

    document.title = pageTitle(r) + ' · Front Belt';
    var meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', PRIVATE_ROUTES.indexOf(r) > -1 ? 'noindex,nofollow' : 'index,follow');

    var navKey = NAV_FOR[r];
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === navKey) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });

    $('mainnav').classList.remove('open');
    var mb = document.querySelector('[data-menu]');
    if (mb) mb.setAttribute('aria-expanded', 'false');

    if (r !== 'signin') { /* leave fields alone */ }

    if (r === 'find' || r === 'cat') { setCatState(r === 'cat' ? currentCat() : null); renderFind(); }
    else if (r === 'home') { renderHome(); }
    else if (r === 'signin') { renderAuth(); }
    else if (r === 'account') { renderAccount(); }
    else if (r === 'partner' || r === 'provider') { renderProvider(); }
    else if (r === 'team') { renderTeam(); }
    else if (r === 'admin') { renderAdmin(); }

    window.scrollTo(0, 0);
  }

  /* re-render whatever is on screen after data changes */
  function renderCurrent() {
    var r = currentRoute();
    if (r === 'find' || r === 'cat') { renderFind(); return; }
    if (r === 'home') { renderHome(); return; }
    if (r === 'account') { renderAccount(); return; }
    if (r === 'team') { renderTeam(); return; }
    if (r === 'partner' || r === 'provider' || r === 'admin') {
      var a = document.activeElement;
      if (modalOpen || (a && a.closest && a.closest('#prov-body, #admin-table, #admin-requests, #admin-approvals'))) return;
      if (r === 'admin') renderAdmin(); else renderProvider();
    }
  }

  /* ================================================================
     DATA
     ================================================================ */
  function fallbackRows() {
    return (DATA.clinics || []).map(function (c) {
      var o = JSON.parse(JSON.stringify(c));
      var mins = o.minutesAgo || 60;
      delete o.minutesAgo;
      o.lastStatusAt = new Date(Date.now() - mins * 60000).toISOString();
      o.published = true;
      o.sample = true;
      return o;
    });
  }

  function setStamp() {
    var el = $('data-stamp');
    if (!el) return;
    if (dataErr) {
      var samplesOnly = all.length && all.every(function (c) { return c.sample; });
      el.textContent = samplesOnly ? 'Offline · showing sample listings' : 'Offline · showing last known';
      el.className = 'chip warn';
      return;
    }
    if (samplesOn && !all.length) { el.textContent = 'Sample listings · preview'; el.className = 'chip seed'; return; }
    if (FB.mode === 'demo') { el.textContent = 'Demo data · this browser'; el.className = 'chip seed'; return; }
    el.textContent = 'Live · checked ' + clock(lastLoaded || new Date());
    el.className = 'chip live';
  }

  function setFtrMode(text) { var f = $('ftr-mode'); if (f) f.textContent = text; }

  FB.onClinics(function (rows, err) {
    if (err) {
      dataErr = err;
      if (!all.length) all = fallbackRows();
      setStamp();
      setFtrMode('Database not reachable — sample listings shown.');
      if (window.console) console.warn('Clinic data:', err.message);
      renderCurrent();
      return;
    }
    if (!rows) return;
    dataErr = null;
    lastLoaded = new Date();
    all = rows.filter(function (c) { return c && c.name; });
    if (all.length) samplesOn = false;   /* real data replaces the preview */
    setStamp();
    setFtrMode('Live database.');
    renderCurrent();
  });

  /* A configured database that never answers (wrong config, Firestore not
     created yet, rules not published) leaves the site with nothing to show.
     Say so instead of presenting an empty directory as if it were correct. */
  function watchFirstLoad() {
    if (FB.mode !== 'firebase') return;
    setTimeout(function () {
      if (lastLoaded || dataErr) return;
      dataErr = new Error('The database did not answer yet.');
      if (!all.length) all = fallbackRows();
      setStamp();
      renderCurrent();
      setFtrMode('Database not connected yet — sample listings shown.');
    }, 9000);
  }
  watchFirstLoad();

  FB.onAuth(function (u) {
    me = u;
    savedIds = (u && u.saved) || [];
    syncAccountBtn();
    var r = currentRoute();
    if (r === 'account' || r === 'partner' || r === 'provider' || r === 'admin' || r === 'team') render();
  });

  function syncAccountBtn() {
    var b = $('account-btn');
    if (!b) return;
    if (me) {
      b.href = routeForRole(me);
      b.innerHTML = '<svg class="ic"><use href="#i-user"/></svg><span>' +
        esc(me.role === 'admin' ? 'Team' : firstName(me.name || me.email)) + '</span>';
      b.setAttribute('title', (me.name || me.email) + ' · ' + me.role);
    } else {
      b.href = '#/signin';
      b.innerHTML = '<svg class="ic"><use href="#i-user"/></svg><span>Sign in</span>';
      b.removeAttribute('title');
    }
  }

  /* ================================================================
     HOME
     ================================================================ */
  function renderHome() {
    var list = publicClinics();
    var open = list.filter(function (c) { return isHealth(c) && statusOf(c).key === 'open'; }).length;
    var trusted = list.filter(function (c) { return c.trust === 'Trusted' || c.trust === 'Verified' || c.trust === 'Certified'; }).length;
    var areas = {};
    list.forEach(function (c) { if (c.area) areas[c.area] = 1; });

    var grid = $('cat-grid');
    if (grid) {
      grid.innerHTML = CATS.map(function (k) {
        var n = list.filter(function (c) { return catOf(c).id === k.id; }).length;
        return '<a class="catcard" href="#/c/' + esc(k.id) + '" style="--cc:' + esc(k.color) + '">' +
          '<span class="cat-ic"><svg class="ic"><use href="#' + esc(k.icon) + '"/></svg></span>' +
          '<span class="cat-txt"><h3>' + esc(k.label) + '</h3><p>' + esc(k.tag) + '</p></span>' +
          (n ? '<span class="cat-count">' + n + '</span>' : '') +
          '<svg class="ic rolearrow"><use href="#i-arrow"/></svg>' +
          '</a>';
      }).join('');
    }

    $('home-stats').innerHTML =
      stat(list.length, 'places listed') +
      stat(CATS.length, 'categories') +
      stat(trusted, 'with a checked badge') +
      stat(Object.keys(areas).length, 'Nairobi areas');

    renderRegister();
  }
  function stat(v, label) {
    return '<div class="stat"><b>' + esc(v) + '</b><span>' + esc(label) + '</span></div>';
  }

  /* the homepage register: the directory, as the council registers do it —
     a plain sortable-looking table, searchable, newest confirmation first */
  function renderRegister() {
    var box = $('reg-rows');
    if (!box) return;
    var qIn = $('reg-q');
    var q = (qIn && qIn.value || '').trim().toLowerCase();
    var list = publicClinics().slice();

    list.forEach(function (c) {
      c._dist = (meGeo && isFinite(c.lat) && isFinite(c.lng))
        ? distanceKm(meGeo.lat, meGeo.lng, c.lat, c.lng) : null;
    });
    if (q) {
      list = list.filter(function (c) {
        return (c.name + ' ' + (c.area || '') + ' ' + (c.type || '') + ' ' + catOf(c).label)
          .toLowerCase().indexOf(q) > -1;
      });
    }
    var rank = ['Certified', 'Trusted', 'Verified', 'Listed'];
    list.sort(function (a, b) {
      var ra = rank.indexOf(a.trust || 'Listed'), rb = rank.indexOf(b.trust || 'Listed');
      if (ra !== rb) return ra - rb;
      if (a._dist != null && b._dist != null && a._dist !== b._dist) return a._dist - b._dist;
      return String(a.name).localeCompare(String(b.name));
    });

    /* one from each category first, so the register shows the range of the
       directory rather than six clinics in a row, then the rest by rank */
    var LIMIT = 6, rows = [], used = {};
    list.forEach(function (c) {
      var k = catOf(c).id;
      if (!used[k] && rows.length < LIMIT) { used[k] = 1; rows.push(c); }
    });
    list.forEach(function (c) {
      if (rows.length < LIMIT && rows.indexOf(c) < 0) rows.push(c);
    });
    if (!rows.length) {
      box.innerHTML = '<div class="reg-empty">' +
        (q ? 'Nothing on this page matches that search.'
           : 'Nothing has been confirmed yet. The register fills as partners are approved — until then, look at the sample listings to see how it works.') +
        '<div class="row">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-samples>See sample listings</button>' +
        '<a class="btn btn-primary btn-sm" href="#/partners">List your business</a>' +
        '</div></div>';
      return;
    }

    box.innerHTML = '<table class="regtbl">' +
      '<thead><tr>' +
      '<th>Listing</th><th>Category</th><th>Area</th><th>Distance</th><th>Status</th><th aria-label="Open"></th>' +
      '</tr></thead><tbody>' +
      rows.map(function (c) {
        var k = catOf(c), s = statusOf(c);
        var status = isHealth(c)
          ? '<span class="pill ' + esc(s.key) + '"><span class="dot"></span>' + esc(String(s.text).split(' \u00b7 ')[0]) + '</span>'
          : '<span class="rsub">' + esc(c.hours || 'Hours not given') + '</span>';
        return '<tr>' +
          '<td data-l="Listing"><div class="rname">' + esc(c.name) +
            (c.sample ? ' <span class="rsub">(sample)</span>' : '') + '</div>' +
            '<div class="rsub">' + esc(c.type || k.label) + '</div></td>' +
          '<td data-l="Category"><span class="chip" style="background:color-mix(in srgb,' + esc(k.color) + ' 14%,transparent);color:' + esc(k.color) + '">' + esc(k.label) + '</span></td>' +
          '<td data-l="Area">' + esc(c.area || '\u2014') + '</td>' +
          '<td data-l="Distance">' + (c._dist != null ? esc(fmtDist(c._dist)) : '<span class="rsub">share location</span>') + '</td>' +
          '<td data-l="Status">' + status + '</td>' +
          '<td class="racts"><button class="btn btn-ghost btn-sm" type="button" data-open="' + esc(c.id) + '">Open</button></td>' +
          '</tr>';
      }).join('') +
      '</tbody></table>';
  }
  var regQ = $('reg-q');
  if (regQ) regQ.addEventListener('input', renderRegister);

  /* ================================================================
     FIND
     ================================================================ */
  function fillAreas() {
    var sel = $('area'), keep = sel.value, areas = [];
    publicClinics().forEach(function (c) { if (c.area && areas.indexOf(c.area) < 0) areas.push(c.area); });
    areas.sort();
    sel.innerHTML = '<option value="">All areas</option>' +
      areas.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('');
    if (areas.indexOf(keep) > -1) sel.value = keep;
  }

  function cardHTML(c, isPick) {
    var s = statusOf(c);
    var dist = (meGeo && isFinite(c.lat) && isFinite(c.lng))
      ? distanceKm(meGeo.lat, meGeo.lng, c.lat, c.lng) : null;
    var saved = savedIds.indexOf(c.id) > -1;
    var busyLabel = c.busy >= 70 ? 'busy' : c.busy >= 40 ? 'steady' : 'quiet';
    return '<article class="card' + (isPick ? ' near' : '') + '" data-open="' + esc(c.id) + '" tabindex="0" role="button" aria-label="Open ' + esc(c.name) + '">' +
      '<div class="top"><h3>' + esc(c.name) + '</h3>' +
      '<span class="badge b-' + esc(c.trust || 'Listed') + '">' + esc(c.trust || 'Listed') + '</span></div>' +
      (isPick ? '<span class="ribbon"><svg class="ic"><use href="#i-pin"/></svg>Closest open clinic</span>' : '') +
      '<span class="pill ' + s.key + '"><span class="dot"></span>' + esc(s.text) + '</span>' +
      '<div class="meta">' +
      '<span>' + esc(c.area) + '</span>' +
      (dist != null ? '<span class="dist">' + esc(fmtDist(dist)) + ' away</span>' : '') +
      (s.key === 'open' ? '<span>Wait: ' + (c.waitMinutes ? 'about ' + esc(c.waitMinutes) + ' min' : 'not reported') + '</span>' : '') +
      '</div>' +
      (s.key === 'open' && c.busy ? '<div class="bar"><i style="width:' + Math.min(100, Math.max(4, c.busy)) + '%"></i></div>' : '') +
      (c.services && c.services.length ? '<div class="meta"><span>' + esc(c.services.slice(0, 2).join(' · ')) + '</span></div>' : '') +
      '<div class="card-foot">' +
      '<a class="pdir" href="' + esc(dirURL(c)) + '" target="_blank" rel="noopener" data-dir="' + esc(c.id) + '" title="Get directions to ' + esc(c.name) + '">' +
      '<svg class="ic"><use href="#i-nav"/></svg> Directions</a>' +
      '<span class="row" style="gap:.5rem">' +
      '<small>' + (c.sample ? 'Sample listing' : 'Updated ' + esc(ago(c.lastStatusAt))) + '</small>' +
      (waURL(c) ? '<a class="savebtn" href="' + esc(waURL(c)) + '" target="_blank" rel="noopener" title="Message on WhatsApp" aria-label="WhatsApp ' + esc(c.name) + '"><svg class="ic"><use href="#i-whatsapp"/></svg></a>' : '') +
      '<button class="savebtn" type="button" data-save="' + esc(c.id) + '" aria-pressed="' + saved + '" title="Save this place" aria-label="Save ' + esc(c.name) + '">' +
      '<svg class="ic"><use href="#i-heart"/></svg></button></span>' +
      '</div>' +
      '</article>';
  }

  /* Google Maps opens with the destination pinned and, when the visitor
     shared a location, their position as the origin — the app finds the
     place, Maps does the turn-by-turn and the “Start” button drives it. */
  function dirURL(c, mode) {
    var dest = (isFinite(c.lat) && isFinite(c.lng))
      ? c.lat + ',' + c.lng
      : encodeURIComponent((c.name || '') + ' ' + (c.address || '') + ' ' + (c.area || ''));
    var u = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) +
      '&travelmode=' + (mode || 'driving');
    if (meGeo && isFinite(c.lat)) u += '&origin=' + meGeo.lat + ',' + meGeo.lng;
    return u;
  }

  function cardFor(c, isPick) {
    return isHealth(c) ? cardHTML(c, isPick) : placeCardHTML(c);
  }

  /* every category except Health: found by where it is and how far —
     type, tags, hours and a directions button, no wait time */
  function placeCardHTML(c) {
    var k = catOf(c);
    var dist = (meGeo && isFinite(c.lat) && isFinite(c.lng))
      ? distanceKm(meGeo.lat, meGeo.lng, c.lat, c.lng) : null;
    var saved = savedIds.indexOf(c.id) > -1;
    var tags = (c.services || []).slice(0, 3).join(' · ');
    return '<article class="card pcard" data-open="' + esc(c.id) + '" tabindex="0" role="button" aria-label="Open ' + esc(c.name) + '">' +
      '<div class="ptop">' +
      '<span class="picon"><svg class="ic"><use href="#' + esc(k.icon) + '"/></svg></span>' +
      '<span class="pmeta"><span class="ptype">' + esc(c.type || k.label) + '</span>' +
      '<h3>' + esc(c.name) + '</h3></span>' +
      (c.trust && c.trust !== 'Listed' ? '<span class="badge b-' + esc(c.trust) + '">' + esc(c.trust) + '</span>' : '') +
      '</div>' +
      '<div class="pbody">' +
      '<div class="meta">' +
      '<span>' + esc(c.area) + '</span>' +
      (dist != null ? '<span class="dist">' + esc(fmtDist(dist)) + ' away</span>' : '') +
      (c.hours ? '<span>' + esc(c.hours) + '</span>' : '') +
      '</div>' +
      (tags ? '<div class="meta"><span>' + esc(tags) + '</span></div>' : '') +
      '</div>' +
      '<div class="card-foot">' +
      '<a class="pdir" href="' + esc(dirURL(c)) + '" target="_blank" rel="noopener" data-dir="' + esc(c.id) + '" title="Get directions to ' + esc(c.name) + '">' +
      '<svg class="ic"><use href="#i-nav"/></svg> Directions</a>' +
      '<span class="row" style="gap:.4rem">' +
      (waURL(c) ? '<a class="savebtn" href="' + esc(waURL(c)) + '" target="_blank" rel="noopener" title="Message on WhatsApp" aria-label="WhatsApp ' + esc(c.name) + '"><svg class="ic"><use href="#i-whatsapp"/></svg></a>' : '') +
      '<button class="savebtn" type="button" data-save="' + esc(c.id) + '" aria-pressed="' + saved + '" title="Save this place" aria-label="Save ' + esc(c.name) + '">' +
      '<svg class="ic"><use href="#i-heart"/></svg></button></span>' +
      '</div>' +
      '</article>';
  }  /* the same view serves “#/find” (every category) and “#/c/food” (one) */
  function setCatState(id) {
    activeCat = id && catById(id) ? id : null;
    var k = activeCat ? catById(activeCat) : null;
    var view = $('view-find');
    if (!view) return;
    if (k) {
      view.setAttribute('data-cat', k.id);
      view.style.setProperty('--cc', k.color);
      $('find-eyebrow').innerHTML = '<svg class="ic"><use href="#' + esc(k.icon) + '"/></svg> ' + esc(k.label);
      $('find-title').textContent = k.label + ' near you';
      $('find-lead').textContent = k.health
        ? 'Share your location and the nearest clinics and pharmacies come first, with today\u2019s status, wait time and directions.'
        : 'Share your location and the nearest ' + k.label.toLowerCase() + ' listings come first \u2014 where it is, how far it is, and directions from where you are standing.';
      $('cat-back').hidden = false;
      $('cards').className = 'cards cat-' + k.id;
    } else {
      view.setAttribute('data-cat', '');
      view.style.removeProperty('--cc');
      $('find-eyebrow').innerHTML = '<svg class="ic"><use href="#i-grid"/></svg> Explore';
      $('find-title').textContent = 'What do you need, near you?';
      $('find-lead').textContent = 'You do not need to know the area name. Share your location and Front Belt puts the closest ones first, with the real distance from where you are standing.';
      $('cat-back').hidden = true;
      $('cards').className = 'cards';
    }
    renderChips();
  }

  function renderChips() {
    var box = $('cat-chips');
    if (!box) return;
    var html = '<a href="#/find"' + (!activeCat ? ' aria-current="true"' : '') + ' style="--cc:#0E7490">' +
      '<svg class="ic"><use href="#i-grid"/></svg> All</a>';
    html += CATS.map(function (k) {
      return '<a href="#/c/' + k.id + '"' + (activeCat === k.id ? ' aria-current="true"' : '') +
        ' style="--cc:' + esc(k.color) + '"><svg class="ic"><use href="#' + esc(k.icon) + '"/></svg> ' + esc(k.label) + '</a>';
    }).join('');
    box.innerHTML = html;
  }

  function renderFind() {
    fillAreas();
    renderChips();
    var k = activeCat ? catById(activeCat) : null;
    var q = ($('q').value || '').trim().toLowerCase();
    var area = $('area').value;
    var lvl = $('lvl').value;

    var list = publicClinics().filter(function (c) {
      if (activeCat && catOf(c).id !== activeCat) return false;
      return (!q || (c.name + ' ' + c.area + ' ' + (c.type || '') + ' ' + (c.services || []).join(' ')).toLowerCase().indexOf(q) > -1) &&
        (!area || c.area === area) &&
        (!lvl || c.trust === lvl);
    });

    list.forEach(function (c) {
      c._dist = meGeo && isFinite(c.lat) ? distanceKm(meGeo.lat, meGeo.lng, c.lat, c.lng) : null;
    });

    list.sort(function (a, b) {
      /* stale health listings drop; everything else is judged on distance */
      var ua = isHealth(a) && statusOf(a).key === 'unknown' ? 1 : 0;
      var ub = isHealth(b) && statusOf(b).key === 'unknown' ? 1 : 0;
      if (ua !== ub) return ua - ub;
      if (a._dist != null && b._dist != null) return a._dist - b._dist;
      if (a._dist != null) return -1;
      if (b._dist != null) return 1;
      return String(a.name).localeCompare(String(b.name));
    });
    curList = list;

    var pick = null;
    if (meGeo) {
      var pool = list.filter(function (c) { return isHealth(c) && statusOf(c).key === 'open'; });
      if (!pool.length) pool = list;

      var best = Infinity;
      pool.forEach(function (c) { if (c._dist != null && c._dist < best) { best = c._dist; pick = c; } });
    }

    $('rescount').textContent = list.length + (list.length === 1 ? ' place' : ' places') +
      (meGeo ? ' · nearest first' : ' · share your location to sort by distance');

    var emptyHTML;
    if (!list.length && !all.length && !samplesOn && !dataErr) {        emptyHTML = '<div class="empty">' +
        (k ? 'No ' + esc(k.label.toLowerCase()) + ' listings yet.' : 'Nothing listed yet.') +
        ' Be the first to add one, or look around with the sample places.' +
        '<div class="row" style="justify-content:center;margin-top:.9rem">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-samples>Preview sample listings</button>' +
        '<a class="btn btn-primary btn-sm" href="#/partners">List my business</a>' +
        '</div></div>';
    } else if (!list.length) {
      emptyHTML = '<div class="empty">No places match. Try a different area or search' +
        (meGeo ? '' : ', or tap \u201cUse my location\u201d') + '.</div>';
    } else {
      emptyHTML = list.map(function (c) {
        var isPick = pick && pick.id === c.id && !q && !area && !lvl && isHealth(c);
        return cardFor(c, isPick);
      }).join('');
    }
    $('cards').innerHTML = emptyHTML;

    if (meGeo && pick) {
      $('geo-title').textContent = (isHealth(pick) && statusOf(pick).key === 'open' ? 'Closest open clinic: ' : 'Closest to you: ') + pick.name;
      $('geo-sub').textContent = 'In ' + pick.area + ', ' + fmtDist(pick._dist) + ' away. The list is sorted nearest first.';
    }

    setStamp();
    if (mapReady) drawMap();
  }

  /* ---------------- location ---------------- */
  function setStatus(parts) {
    var box = $('geo-status');
    box.innerHTML = parts.map(function (p) {
      if (p.link) return '<button class="linkish" type="button" data-geo><svg class="ic"><use href="#i-refresh"/></svg>' + esc(p.text) + '</button>';
      return '<span class="chip ' + (p.cls || '') + '">' + esc(p.text) + '</span>';
    }).join('');
  }

  function locate() {
    var btn = $('geo-btn');
    if (!navigator.geolocation) {
      setStatus([{ text: 'This browser cannot share location. Pick your area instead.', cls: 'warn' }]);
      return;
    }
    if (!window.isSecureContext) {
      setStatus([{ text: 'Location needs an https:// address. Pick your area instead.', cls: 'warn' }]);
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Finding you…';
    $('geo-sub').textContent = 'Waiting for your device to share its location…';
    navigator.geolocation.getCurrentPosition(onPosition, onGeoError, {
      enableHighAccuracy: true, timeout: 12000, maximumAge: 20000
    });
  }

  function onPosition(pos) { applyMe(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy); }
  function onMove(pos) {
    if (!meGeo) return;
    if (distanceKm(meGeo.lat, meGeo.lng, pos.coords.latitude, pos.coords.longitude) < 0.03) return;
    applyMe(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
  }

  function applyMe(lat, lng, acc) {
    meGeo = { lat: lat, lng: lng, acc: acc || 0 };
    var btn = $('geo-btn');
    btn.disabled = false;
    btn.innerHTML = '<svg class="ic"><use href="#i-crosshair"/></svg> Update my location';
    setStatus([
      { text: 'Location on', cls: 'live' },
      { text: 'Accurate to about ±' + Math.max(10, Math.round(meGeo.acc)) + ' m' },
      { text: 'Refresh', link: true }
    ]);
    renderFind();
  }

  function onGeoError(err) {
    var btn = $('geo-btn');
    btn.disabled = false;
    btn.innerHTML = '<svg class="ic"><use href="#i-crosshair"/></svg> Try my location again';
    $('geo-title').textContent = 'Find the nearest place to you';
    $('geo-sub').textContent = 'No location, no problem: search by name or choose an area.';
    var msg = err && err.code === 1
      ? 'Location is blocked. Allow it in your browser, or pick your area below.'
      : err && err.code === 3
        ? 'Your device took too long to find you. Try again, or pick your area below.'
        : 'We could not read your location. Pick your area below instead.';
    setStatus([{ text: msg, cls: 'warn' }]);
  }

  /* ---------------- map ---------------- */
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (mapLoading) return mapLoading;
    mapLoading = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = resolve;
      s.onerror = function () { mapLoading = null; reject(new Error('map')); };
      document.head.appendChild(s);
    });
    return mapLoading;
  }

  function showMap() {
    $('mapwrap').hidden = false;
    var btn = $('map-toggle');
    btn.querySelector('span').textContent = 'Hide map';
    loadLeaflet().then(function () {
      if (!map) {
        map = L.map('map', { scrollWheelZoom: false }).setView([DATA.nairobi.lat, DATA.nairobi.lng], 12);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        mapLayer = L.layerGroup().addTo(map);
        mapReady = true;
      }
      drawMap();
      setTimeout(function () { map.invalidateSize(); }, 180);
    }).catch(function () {
      $('map').innerHTML = '<p class="mapnote" style="padding:1rem">The map could not load. The list below still works.</p>';
    });
  }

  function drawMap() {
    if (!map || !mapLayer) return;
    mapLayer.clearLayers();
    var pts = [];
    /* only what the list is showing: the active category, search and filters */
    curList.forEach(function (c) {
      if (!isFinite(c.lat) || !isFinite(c.lng)) return;
      var s = statusOf(c);
      var col = isHealth(c)
        ? (s.key === 'open' ? '#0F8A4F' : s.key === 'closed' ? '#8A6F7A' : '#B45309')
        : catOf(c).color;
      var d = meGeo ? fmtDist(distanceKm(meGeo.lat, meGeo.lng, c.lat, c.lng)) : '';
      L.circleMarker([c.lat, c.lng], { radius: 8, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1 })
        .bindPopup('<strong>' + esc(c.name) + '</strong>' + esc(c.area) + (d ? ' · ' + esc(d) + ' away' : '') +
          (c.sample ? '<br><em>Sample listing</em>' : '') +
          '<br>' + esc(isHealth(c) ? s.text : (c.type || catOf(c).label)) +
          '<br><span style="font-size:13px;color:#6E5560">' + esc(c.trust || 'Listed') + '</span>' +
          '<br><a href="' + esc(dirURL(c)) + '" target="_blank" rel="noopener">Directions</a>')
        .addTo(mapLayer);
      pts.push([c.lat, c.lng]);
    });
    if (meGeo) {
      L.circle([meGeo.lat, meGeo.lng], {
        radius: Math.max(60, Math.min(meGeo.acc || 80, 400)),
        color: '#2563EB', fillColor: '#2563EB', fillOpacity: .12, weight: 1
      }).addTo(mapLayer);
      L.circleMarker([meGeo.lat, meGeo.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#2563EB', fillOpacity: 1 })
        .bindPopup('<strong>You are here</strong>±' + Math.max(10, Math.round(meGeo.acc || 0)) + ' m')
        .addTo(mapLayer);
      pts.push([meGeo.lat, meGeo.lng]);
    }
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  }

  /* ================================================================
     SIGN IN
     ================================================================ */
  function renderAuth() {
    var isUp = authMode === 'signup';
    $('auth-title').textContent = isUp ? 'Create your account' : 'Sign in to Front Belt';
    $('auth-sub').textContent = isUp
      ? 'Choose who you are, and the site will open in the right place every time you return.'
      : 'Your account already knows if you are a patient or a clinic. Pick the same thing you signed up with and we will take you straight there.';
    $('l-name').hidden = !isUp;
    $('a-name').required = isUp;
    $('auth-submit').textContent = isUp ? 'Create account' : 'Sign in';
    $('auth-switch-text').textContent = isUp ? 'Already have an account?' : 'New here?';
    $('auth-switch').textContent = isUp ? 'Sign in instead' : 'Create an account';
    $('a-pass').setAttribute('autocomplete', isUp ? 'new-password' : 'current-password');
    $('auth-err').hidden = true;

    document.querySelectorAll('[data-role]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-role') === authRole));
    });

    $('mode-note').textContent = FB.mode === 'demo'
      ? 'Demo mode: accounts and clinics are stored in this browser only, so you can try the whole workflow. Nothing is sent anywhere.'
      : 'Accounts are managed by Firebase Authentication. Your clinic and its data live in the Front Belt database.';
    $('auth-note').textContent = FB.mode === 'demo'
      ? 'Use any email with a password of 6+ characters. This browser keeps the account.'
      : 'Use the email you were invited with, or create an account.';
  }

  function switchAuthMode() {
    authMode = authMode === 'signup' ? 'signin' : 'signup';
    renderAuth();
  }

  $('auth-switch').addEventListener('click', switchAuthMode);

  document.querySelectorAll('[data-role]').forEach(function (b) {
    b.addEventListener('click', function () {
      authRole = b.getAttribute('data-role');
      document.querySelectorAll('[data-role]').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
    });
  });

  $('auth-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('auth-err');
    var email = $('a-email').value.trim();
    var pass = $('a-pass').value;
    var name = $('a-name').value.trim();
    err.hidden = true;

    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Enter a valid email address.'; err.hidden = false; return; }
    if (pass.length < 6) { err.textContent = 'Use at least 6 characters for the password.'; err.hidden = false; return; }
    if (authMode === 'signup' && !name) { err.textContent = 'Please add your name.'; err.hidden = false; return; }

    var btn = $('auth-submit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> ' + (authMode === 'signup' ? 'Creating…' : 'Signing in…');

    var call = authMode === 'signup'
      ? FB.signUp({ email: email, password: pass, name: name, role: authRole })
      : FB.signIn({ email: email, password: pass });

    call.then(function (u) {
      btn.disabled = false;
      btn.textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
      $('a-pass').value = '';
      toast('Signed in as ' + (u.name || u.email));
      if (authMode === 'signup' && authRole === 'provider' && u.role !== 'provider' && u.role !== 'admin') {
        toast('Account created. Add your listing in the console.', 5000);
      }
      location.hash = routeForRole(u);
    }).catch(function (e2) {
      btn.disabled = false;
      btn.textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
      err.textContent = e2.message || 'That did not work. Try again.';
      err.hidden = false;
    });
  });


  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-signin-role]')) {
      authRole = e.target.closest('[data-signin-role]').getAttribute('data-signin-role');
      authMode = 'signup';
    }
    if (e.target.closest('[data-signout]')) {
      FB.signOut().then(function () {
        toast('Signed out');
        location.hash = '#/home';
      });
    }
  });

  /* ================================================================
     PATIENT DASHBOARD
     ================================================================ */
  function renderAccount() {
    if (!me) return;
    $('acct-hello').textContent = 'Hello, ' + firstName(me.name || me.email);
    var list = publicClinics();
    var open = list.filter(function (c) { return isHealth(c) && statusOf(c).key === 'open'; }).length;
    $('acct-stats').innerHTML = stat(savedIds.length, 'saved places') +
      stat(list.length, 'places listed') + stat(open, 'open right now');

    var mine = publicClinics().filter(function (c) { return savedIds.indexOf(c.id) > -1; });
    $('saved-cards').innerHTML = mine.length
      ? mine.map(function (c) { return cardFor(c, false); }).join('')
      : '<div class="empty">Nothing saved yet. Tap the heart on any listing and it will wait for you here.</div>';
  }

  /* ================================================================
     PROVIDER CONSOLE
     ================================================================ */
  function gate(title, body, cta) {
    return '<div class="prov-card stack" style="max-width:640px">' +
      '<h3>' + esc(title) + '</h3><p class="muted">' + esc(body) + '</p>' + (cta || '') + '</div>';
  }

  function clinicFormFields(c) {
    c = c || {};
    var areaOpts = DATA.areas.map(function (a) {
      return '<option value="' + esc(a) + '">' + esc(a) + '</option>';
    }).join('');
    var svc = DATA.services.map(function (s) {
      var on = (c.services || []).indexOf(s) > -1;
      return '<label class="chipcheck"><input type="checkbox" value="' + esc(s) + '"' + (on ? ' checked' : '') + '> ' + esc(s) + '</label>';
    }).join('');
    var cur = catOf(c);
    var catOpts = CATS.map(function (k) {
      return '<option value="' + esc(k.id) + '"' + (k.id === cur.id ? ' selected' : '') + '>' + esc(k.label) + '</option>';
    }).join('');
    var typeOpts = (cur.types || []).map(function (t) {
      return '<option' + (t === c.type ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
    var svcBlock =
      '<div id="pf-svc"' + (cur.health ? '' : ' hidden') + '><strong class="small">Services offered</strong><div class="chips">' + svc + '</div></div>' +
      '<div id="pf-tags-wrap"' + (cur.health ? ' hidden' : '') + '><label>What you offer (comma separated)' +
      '<input class="field" id="pf-tags" value="' + esc((c.services || []).join(', ')) + '" placeholder="e.g. Fresh bread, Cakes, Delivery"></label></div>';
    return '' +
      '<div class="grid2">' +
      '<label>Category<select class="field" id="pf-cat">' + catOpts + '</select></label>' +
      '<label>Type<select class="field" id="pf-type"><option value="">Choose a type</option>' + typeOpts + '</select></label>' +
      '</div>' +
      '<div class="grid2">' +
      '<label>Name<input class="field" id="pf-name" value="' + esc(c.name || '') + '" required></label>' +
      '<label>Area<select class="field" id="pf-area"><option value="">Choose an area</option>' + areaOpts + '</select></label>' +
      '</div>' +
      '<label>Address or landmark<input class="field" id="pf-address" value="' + esc(c.address || '') + '" placeholder="e.g. Ground floor, Ngong Road"></label>' +
      '<div class="grid2">' +
      '<label>Phone<input class="field" id="pf-phone" type="tel" value="' + esc(c.phone || '') + '" placeholder="+254 …"></label>' +
      '<label>Opening hours<input class="field" id="pf-hours" value="' + esc(c.hours || '') + '" placeholder="Mon–Sat 8:00–18:00"></label>' +
      '</div>' +
      '<div class="grid3">' +
      '<label>Latitude<input class="field" id="pf-lat" type="number" step="any" value="' + esc(c.lat != null ? c.lat : '') + '" placeholder="-1.2921" required></label>' +
      '<label>Longitude<input class="field" id="pf-lng" type="number" step="any" value="' + esc(c.lng != null ? c.lng : '') + '" placeholder="36.7836" required></label>' +
      '<label>&nbsp;<button class="btn btn-ghost btn-sm" type="button" id="pf-capture"><svg class="ic"><use href="#i-crosshair"/></svg> Use my current location</button></label>' +
      '</div>' +
      '<p class="hint">Stand at the entrance and tap the button: your phone gives the coordinates, so people nearby find you. You can also paste them from Google Maps (right-click the spot → copy coordinates).</p>' +
      svcBlock;
  }

  function readClinicForm(root, extra) {
    var tagsWrap = root.querySelector('#pf-tags-wrap');
    var tagsEl = tagsWrap && !tagsWrap.hidden ? root.querySelector('#pf-tags') : null;
    var services = tagsEl
      ? tagsEl.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
      : Array.prototype.slice.call(root.querySelectorAll('.chipcheck input:checked')).map(function (i) { return i.value; });
    var areaSel = root.querySelector('#pf-area');
    var area = areaSel ? areaSel.value : '';
    var catSel = root.querySelector('#pf-cat');
    var typeSel = root.querySelector('#pf-type');
    var o = {
      category: catSel ? catSel.value : 'health',
      type: typeSel ? typeSel.value : '',
      name: root.querySelector('#pf-name').value.trim(),
      area: area,
      address: root.querySelector('#pf-address').value.trim(),
      phone: root.querySelector('#pf-phone').value.trim(),
      hours: root.querySelector('#pf-hours').value.trim(),
      lat: Number(root.querySelector('#pf-lat').value),
      lng: Number(root.querySelector('#pf-lng').value),
      services: services
    };
    if (areaSel && !area) {
      /* allow an area we have not listed yet */
      var typed = prompt('That area is not in the list yet. Type the Nairobi area name:');
      o.area = (typed || '').trim();
    }
    return Object.assign(o, extra || {});
  }

  function capture(cb) {
    if (!navigator.geolocation) return toast('This browser cannot read your location.');
    if (!window.isSecureContext) return toast('Location needs an https:// address.');
    toast('Reading your location…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      cb(pos.coords.latitude, pos.coords.longitude);
      toast('Coordinates captured to ±' + Math.round(pos.coords.accuracy) + ' m');
    }, function () {
      toast('Could not read your location. Type the coordinates instead.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  /* ---------------- the review tracker ----------------
     The same three steps the team sees, on the partner's side, so the wait
     is never a mystery and a rejection is a to-do list. */
  function trackerHTML(c) {
    var s = reviewState(c);
    var decided = s === 'approved' || s === 'denied';
    var rows = [
      { label: 'Received', when: c.submittedAt, on: true },
      { label: 'In review', when: c.reviewStartedAt, on: s === 'in_review' || decided },
      { label: s === 'denied' ? 'Not approved' : 'Approved', when: c.reviewedAt, on: decided, bad: s === 'denied' }
    ];
    return '<section class="prov-card stack reviewcard">' +
      '<h3><svg class="ic"><use href="#i-doc"/></svg> Review status <span class="rvchip rv-' + esc(s) + '">' + esc(REVIEW_LABEL[s] || s) + '</span></h3>' +
      '<ol class="tracker">' + rows.map(function (r) {
        return '<li class="' + (r.on ? 'on' : '') + (r.bad ? ' bad' : '') + '">' +
          '<span class="tk-dot"></span>' +
          '<span class="tk-txt"><strong>' + esc(r.label) + '</strong>' +
          '<small>' + (r.on && r.when ? esc(ago(r.when)) : r.on ? 'done' : 'waiting') + '</small></span></li>';
      }).join('') + '</ol>' +
      '<p class="hint">Reviewed by a person on the Front Belt team, not a script. We aim to answer within ' + esc(DATA.reviewWindow || '2 working days') + '.</p>' +
      '</section>';
  }

  function waitingPanel(c) {
    return '<div class="panel" style="margin-top:1rem">' +
      '<h3><svg class="ic"><use href="#i-clock"/></svg> While you wait</h3>' +
      '<ul>' +
      '<li>Your listing is <strong>not visible to the public yet</strong> — nothing shows until we approve it.</li>' +
      '<li>Listing is free during early access. There is nothing to pay.</li>' +
      '<li>If we need to ask you something, we use the phone number you gave us.</li>' +
      '<li>You can still fix a typo below; your listing stays in the queue.</li>' +
      '</ul></div>';
  }

  function deniedPanel(c) {
    var checks = c.deniedChecks || [];
    return '<div class="panel denycard" style="margin-top:1rem">' +
      '<h3><svg class="ic"><use href="#i-warn"/></svg> Why it was not approved</h3>' +
      '<p class="muted">' + (c.deniedReason ? esc(c.deniedReason) : 'One or more requirements were not met.') + '</p>' +
      (checks.length
        ? '<ul class="denylist">' + checks.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'
        : '') +
      '<p class="hint">Fix these in the form below and resubmit. Everything you already typed is kept.</p>' +
      '</div>';
  }

  function renderProvider() {
    var body = $('prov-body');
    if (!me) return;
    if (me.role !== 'provider' && me.role !== 'admin') {
      $('prov-title').textContent = 'Partner console';
      $('prov-sub').textContent = '';
      body.innerHTML = gate('This is a personal account',
        'A partner account is what opens the listing console. Create one with the email of the business you manage and we will link your listing to it.',
        '<div class="row"><a class="btn btn-primary" href="#/signin" data-signin-role="provider">Create a partner account</a>' +
        '<a class="btn btn-ghost" href="#/partners">What partners get</a></div>');
      return;
    }

    var c = clinicForMe();
    if (!c && me.role === 'admin') {
      $('prov-title').textContent = 'You are signed in as the Front Belt team';
      $('prov-sub').textContent = '';
      body.innerHTML = gate('Team accounts do not own a listing',
        'Directory operations — reviewing submissions, trust levels, publishing and removal — live in the team console. A partner account is what opens a partner console.',
        '<div class="row"><a class="btn btn-primary" href="#/admin"><svg class="ic"><use href="#i-chart"/></svg> Open team console</a>' +
        '<a class="btn btn-ghost" href="#/find">See the public site</a></div>');
      return;
    }
    if (!c) {
      $('prov-title').textContent = 'Add your listing';
      $('prov-sub').textContent = 'Takes about three minutes. The Front Belt team reviews it before it appears publicly.';
      body.innerHTML =
        '<div class="panel" style="margin-bottom:1rem">' +
        '<h3><svg class="ic"><use href="#i-doc"/></svg> What happens after you send it</h3>' +
        '<ol class="tracker compact">' +
        '<li class="on"><span class="tk-dot"></span><span class="tk-txt"><strong>Received</strong><small>the moment you send it</small></span></li>' +
        '<li><span class="tk-dot"></span><span class="tk-txt"><strong>In review</strong><small>a person checks the pin, phone, name and category</small></span></li>' +
        '<li><span class="tk-dot"></span><span class="tk-txt"><strong>Approved — or told exactly why not</strong><small>we aim for ' + esc(DATA.reviewWindow || '2 working days') + '</small></span></li>' +
        '</ol></div>' +
        '<form class="prov-card stack" id="new-clinic" novalidate>' +
        clinicFormFields({ area: '' }) +
        '<button class="btn btn-primary" type="submit"><svg class="ic"><use href="#i-plus"/></svg> Send my listing for review</button>' +
        '<p class="ok-msg err" id="nc-err" hidden></p>' +
        '</form>';
      wireProviderForm(body, null, true);
      return;
    }

    /* not yet approved: the partner sees where it stands, and can fix it */
    if (!approved(c)) {
      var rs = reviewState(c);
      var denied = rs === 'denied';
      $('prov-title').textContent = denied ? 'Your listing needs a fix' : 'Your listing is with us';
      $('prov-sub').textContent = (c.name || 'Your listing') + (c.type ? ' · ' + c.type : '') + (c.area ? ' · ' + c.area : '');
      $('prov-view-link').hidden = true;
      body.innerHTML = trackerHTML(c) +
        (denied ? deniedPanel(c) : waitingPanel(c)) +
        '<form class="prov-card stack" id="profile-form" style="margin-top:1rem">' +
        '<h3><svg class="ic"><use href="#i-edit"/></svg> Your details</h3>' +
        clinicFormFields(c) +
        '<button class="btn btn-primary" type="submit">' +
        (denied ? '<svg class="ic"><use href="#i-refresh"/></svg> Fix and resubmit' : 'Save changes') +
        '</button>' +
        '<p class="ok-msg err" id="pf-err" hidden></p>' +
        '</form>';
      if ($('pf-area')) $('pf-area').value = c.area || '';
      provClinicId = c.id;
      wireProviderForm(body, c, false);
      return;
    }

    $('prov-title').textContent = c.name;
    $('prov-sub').textContent = (c.sample ? 'Sample listing · ' : '') + (c.type ? c.type + ' · ' : '') + c.area +
      ' · ' + (c.published ? 'live on the public site' : 'hidden from the public site');
    $('prov-view-link').hidden = false;
    $('prov-view-link').href = '#/find';

    var s = statusOf(c);
    var k = catOf(c);
    var busyLevel = c.busy >= 70 ? 85 : c.busy >= 40 ? 50 : 20;
    var pending = null; /* filled by request fetch below */

    var trustSteps = ['Listed', 'Verified', 'Trusted', 'Certified'];
    var reached = trustSteps.indexOf(c.trust || 'Listed');

    /* only Health has a daily status; the others show category and hours */
    var statusStat = k.health
      ? '<div class="stat ' + (s.key === 'open' ? 'ok' : (s.key === 'stale' || s.key === 'unknown' || s.key === 'hidden') ? 'warn' : '') + '"><b>' +
        (s.key === 'open' ? 'Open' : s.key === 'closed' ? 'Closed' : 'Needs update') + '</b><span>Public status</span></div>'
      : '<div class="stat"><b>' + esc(c.type || k.label) + '</b><span>Category</span></div>';
    var lastStat = k.health
      ? '<div class="stat"><b>' + (c.lastStatusAt ? esc(ago(c.lastStatusAt)) : 'No update yet') + '</b><span>Last update</span></div>'
      : '<div class="stat"><b>' + esc(c.hours || 'Not set') + '</b><span>Opening hours</span></div>';

    body.innerHTML = trackerHTML(c) +
      '<div class="statrow" style="margin-top:1rem">' +
      '<div class="stat"><b>' + esc(c.trust || 'Listed') + '</b><span>Trust level</span></div>' +
      statusStat +
      '<div class="stat"><b>' + (c.published ? 'Live' : 'Hidden') + '</b><span>Listing</span></div>' +
      lastStat +
      '</div>' +

      (c.lastStatusAt && (s.key === 'stale' || s.key === 'unknown')
        ? '<div class="panel" style="border-color:var(--warn)"><h3><svg class="ic"><use href="#i-warn"/></svg> Your status is out of date</h3>' +
        '<p class="muted small">' + esc(s.text) + '. Clinics that stop updating drop in search, and after seven days the listing hides itself. Save today\'s status below to fix it.</p></div>'
        : '') +

      '<div class="two">' +
      '<form class="prov-card stack" id="status-form">' +
      '<h3><svg class="ic"><use href="#i-clock"/></svg> Today\'s status</h3>' +
      '<p class="hint">This is what people see first. It takes under a minute.</p>' +
      '<div class="statuspick" id="st-pick">' +
      '<button type="button" data-st="open" aria-pressed="' + (c.status === 'open') + '"><svg class="ic"><use href="#i-check"/></svg> Open now</button>' +
      '<button type="button" data-st="closed" aria-pressed="' + (c.status === 'closed') + '"><svg class="ic"><use href="#i-close"/></svg> Closed today</button>' +
      '</div>' +
      '<div class="grid2">' +
      '<label>Expected wait (minutes)<input class="field" id="st-wait" type="number" min="0" max="240" value="' + (c.waitMinutes != null ? c.waitMinutes : '') + '"></label>' +
      '<label>How busy<select class="field" id="st-busy">' +
      '<option value="20"' + (busyLevel === 20 ? ' selected' : '') + '>Quiet</option>' +
      '<option value="50"' + (busyLevel === 50 ? ' selected' : '') + '>Steady</option>' +
      '<option value="85"' + (busyLevel === 85 ? ' selected' : '') + '>Busy</option>' +
      '</select></label>' +
      '</div>' +
      '<label>Note for customers (optional)<input class="field" id="st-note" maxlength="120" value="' + esc(c.note || '') + '" placeholder="e.g. Doctor in until 1 pm"></label>' +
      '<button class="btn btn-primary" type="submit"><svg class="ic"><use href="#i-refresh"/></svg> Save today\'s status</button>' +
      '</form>' +

      '<div class="stack">' +
      '<section class="prov-card stack">' +
      '<h3><svg class="ic"><use href="#i-eye"/></svg> Your listing</h3>' +
      '<p class="hint">' + (c.published
        ? 'Your business is visible to people searching nearby. Hiding it takes effect immediately and keeps your data.'
        : 'Your listing is hidden. Ask the team to relist it when you are ready.') + '</p>' +
      (c.published
        ? '<button class="btn btn-ghost btn-sm" type="button" data-hide="' + esc(c.id) + '"><svg class="ic"><use href="#i-eye"/></svg> Hide my listing</button>'
        : '<button class="btn btn-ghost btn-sm" type="button" data-relist="' + esc(c.id) + '"><svg class="ic"><use href="#i-refresh"/></svg> Ask to be relisted</button>') +
      '</section>' +

      '<section class="prov-card stack">' +
      '<h3><svg class="ic"><use href="#i-shield"/></svg> Trust level</h3>' +
      '<div class="trustpath">' + trustSteps.map(function (t, i) {
        return '<span class="tstep' + (i <= reached ? ' on' : '') + '">' + esc(t) + '</span>';
      }).join('') + '</div>' +
      '<p class="hint">Only the Front Belt team can raise a level. Apply with your documents and a reviewer will check them.</p>' +
      '<div id="prov-request"></div>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-verify="' + esc(c.id) + '"><svg class="ic"><use href="#i-shield"/></svg> Apply for an upgrade</button>' +
      '</section>' +
      '</div></div>' +

      '<form class="prov-card stack" id="profile-form" style="margin-top:1rem">' +
      '<h3><svg class="ic"><use href="#i-edit"/></svg> Details and exact location</h3>' +
      clinicFormFields(c) +
      '<button class="btn btn-primary" type="submit">Save listing details</button>' +
      '<p class="ok-msg err" id="pf-err" hidden></p>' +
      '</form>' +

      '<section class="prov-card" style="margin-top:1rem">' +
      '<h3><svg class="ic"><use href="#i-chart"/></svg> Recent updates</h3>' +
      '<div class="timeline" id="p-history"><p class="hint">Loading…</p></div>' +
      '</section>';

    /* non-health listings have no daily status to keep */
    if (!k.health) {
      var stForm = body.querySelector('#status-form');
      if (stForm) stForm.remove();
      Array.prototype.slice.call(body.querySelectorAll('section.prov-card')).forEach(function (sec) {
        if (sec.querySelector('#p-history')) sec.remove();
      });
    }

    if ($('pf-area')) $('pf-area').value = c.area || '';
    provClinicId = c.id;
    wireProviderForm(body, c, false);

    FB.history(c.id).then(function (rows) {
      var box = $('p-history');
      if (!box) return;
      box.innerHTML = rows.length ? rows.map(function (u) {
        return '<div class="tl-item"><span class="tl-dot ' + esc(u.status) + '"></span>' +
          '<span>' + esc(u.status === 'open' ? 'Open' : u.status === 'closed' ? 'Closed' : 'Status unknown') +
          (u.waitMinutes != null ? ' · about ' + esc(u.waitMinutes) + ' min wait' : '') +
          (u.note ? ' · ' + esc(u.note) : '') + '</span>' +
          '<span class="tl-when">' + esc(ago(u.createdAt)) + '</span></div>';
      }).join('') : '<p class="hint">No updates recorded yet. Save today\'s status and it will appear here.</p>';
    });

    paintProviderRequest();
  }

  function wireProviderForm(root, clinic, isNew) {
    var pickState = clinic ? clinic.status : null;

    var pick = root.querySelector('#st-pick');
    if (pick) {
      pick.addEventListener('click', function (e) {
        var b = e.target.closest('[data-st]');
        if (!b) return;
        pickState = b.getAttribute('data-st');
        pick.querySelectorAll('[data-st]').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
      });
    }

    var cap = root.querySelector('#pf-capture');
    if (cap) {
      cap.addEventListener('click', function () {
        capture(function (lat, lng) {
          root.querySelector('#pf-lat').value = lat.toFixed(6);
          root.querySelector('#pf-lng').value = lng.toFixed(6);
        });
      });
    }

    /* changing the category swaps the type list and the services field */
    var catSel = root.querySelector('#pf-cat');
    if (catSel) {
      catSel.addEventListener('change', function () {
        var k = catById(catSel.value) || catById('health');
        var typeSel = root.querySelector('#pf-type');
        if (typeSel) {
          typeSel.innerHTML = '<option value="">Choose a type</option>' +
            (k.types || []).map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
        }
        var svcBox = root.querySelector('#pf-svc'), tagsBox = root.querySelector('#pf-tags-wrap');
        if (svcBox) svcBox.hidden = !k.health;
        if (tagsBox) tagsBox.hidden = !!k.health;
      });
    }

    var statusForm = root.querySelector('#status-form');
    if (statusForm) {
      statusForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!pickState) { toast('Choose “Open now” or “Closed today” first.'); return; }
        var btn = statusForm.querySelector('[type="submit"]');
        btn.disabled = true;
        FB.logStatus(clinic.id, {
          status: pickState,
          waitMinutes: root.querySelector('#st-wait').value === '' ? null : Number(root.querySelector('#st-wait').value),
          busy: Number(root.querySelector('#st-busy').value),
          note: root.querySelector('#st-note').value
        }).then(function () {
          btn.disabled = false;
          toast('Status saved. People see it now.');
        }).catch(function (err) {
          btn.disabled = false;
          toast(err.message);
        });
      });
    }

    [root.querySelector('#profile-form'), root.querySelector('#new-clinic')].forEach(function (form) {
      if (!form) return;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var errBox = form.querySelector('.ok-msg');
        var data;
        try { data = readClinicForm(form); } catch (x) { return; }
        var btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        var payload = Object.assign({}, data);
        var resubmitting = !isNew && reviewState(clinic) === 'denied';
        if (isNew) {
          payload.ownerUid = me.uid;
          payload.published = false;
          payload.trust = 'Listed';
          payload.status = 'unknown';
          payload.reviewState = 'pending';
        } else {
          payload.id = clinic.id;
          if (resubmitting) payload.reviewState = 'pending';
        }
        FB.saveClinic(payload).then(function () {
          btn.disabled = false;
          if (errBox) errBox.hidden = true;
          toast(isNew ? 'Sent. The Front Belt team will review it — you can follow the status here.'
            : resubmitting ? 'Sent back for review. We will tell you as soon as it is decided.'
              : 'Listing details saved.');
          renderProvider();
        }).catch(function (err) {
          btn.disabled = false;
          toast(err.message);
          if (errBox) { errBox.textContent = err.message; errBox.hidden = false; }
        });
      });
    });
  }

  /* provider actions */
  document.addEventListener('click', function (e) {
    var hide = e.target.closest('[data-hide]');
    if (hide) {
      confirmDialog({
        title: 'Hide your listing?',
        body: 'It comes off the public site immediately. Your details stay saved, and you can ask to be relisted at any time.',
        confirm: 'Hide it'
      }).then(function (yes) {
        if (!yes) return;
        FB.setPublished(hide.getAttribute('data-hide'), false)
          .then(function () { toast('Listing hidden.'); renderProvider(); })
          .catch(function (err) { toast(err.message); });
      });
      return;
    }

    var relist = e.target.closest('[data-relist]');
    if (relist) {
      FB.createRequest({
        clinicId: relist.getAttribute('data-relist'),
        clinicName: ($('prov-title') || {}).textContent || '',
        message: 'Please relist this clinic.'
      }).then(function () { toast('Asked the team to relist you.'); })
        .catch(function (err) { toast(err.message); });
      return;
    }

    var verify = e.target.closest('[data-verify]');
    if (verify) {
      openVerifyModal(verify.getAttribute('data-verify'));
    }
  });

  function openVerifyModal(clinicId) {
    var c = all.filter(function (x) { return x.id === clinicId; })[0] || {};
    var levels = ['Verified', 'Trusted', 'Certified'];
    openModal('Apply for a trust upgrade',
      '<form class="stack" id="verify-form">' +
      '<p class="hint">A reviewer checks these against the registration and licence records. Only the Front Belt team can change a level.</p>' +
      '<label>Level you are applying for<select class="field" id="v-level">' +
      levels.map(function (l) { return '<option>' + l + '</option>'; }).join('') +
      '</select></label>' +
      '<div class="grid2">' +
      '<label>Registration number<input class="field" id="v-reg" value="' + esc(c.registrationNo || '') + '" required></label>' +
      '<label>Licence reference<input class="field" id="v-lic" value="' + esc(c.licenceRef || '') + '" required></label>' +
      '</div>' +
      '<label>Anything we should know<textarea class="field" id="v-msg" rows="3" placeholder="Optional"></textarea></label>' +
      '<button class="btn btn-primary" type="submit">Send application</button>' +
      '<p class="ok-msg err" id="v-err" hidden></p>' +
      '</form>');

    $('verify-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var reg = $('v-reg').value.trim(), lic = $('v-lic').value.trim();
      if (!reg || !lic) { $('v-err').textContent = 'Both the registration number and licence reference are needed.'; $('v-err').hidden = false; return; }
      FB.createRequest({
        clinicId: c.id, clinicName: c.name, levelRequested: $('v-level').value,
        registrationNo: reg, licenceRef: lic, message: $('v-msg').value.trim()
      }).then(function () {
        closeModal();
        toast('Application sent. The team reviews them in order.');
        renderProvider();
      }).catch(function (err) { $('v-err').textContent = err.message; $('v-err').hidden = false; });
    });
  }

  /* ================================================================
     TEAM ACCESS
     Its own entrance, with no link from anywhere on the public site.
     ================================================================ */
  function renderTeam() {
    var demo = FB.mode === 'demo';
    var signedIn = !!me && !isTeam();

    $('team-signedin').hidden = !signedIn;
    $('team-form').hidden = signedIn;

    if (signedIn) {
      $('team-signedin-msg').textContent = 'You are signed in as ' + (me.name || me.email) +
        ' (' + me.role + '). Entering this console needs a team account, so nothing here is shown to you.';
    }

    $('team-creds').hidden = demo;
    $('team-code-wrap').hidden = !demo;
    $('team-note').textContent = demo
      ? 'Demo mode: clinics and accounts live in this browser only. The team code is what keeps a visitor clicking around out of this console — it is not real security, and it is visible in the page source.'
      : 'Use your Front Belt team account. If your account is not a team account, you will be returned here.';
    $('team-err').hidden = true;
  }

  $('team-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('team-err'), btn = $('team-submit');
    err.hidden = true;

    function fail(msg) {
      btn.disabled = false;
      btn.innerHTML = '<svg class="ic"><use href="#i-lock"/></svg> Enter team console';
      err.textContent = msg;
      err.hidden = false;
    }

    if (FB.mode === 'demo') {
      /* typed on a phone, so case and stray spaces should not matter */
      if ($('team-code').value.trim().toUpperCase() !== TEAM_CODE.toUpperCase()) { fail('That team code is not right.'); return; }
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Opening…';
      FB.demoAdmin().then(function () {
        $('team-code').value = '';
        btn.disabled = false;
        btn.innerHTML = '<svg class="ic"><use href="#i-lock"/></svg> Enter team console';
        toast('Team console open');
        location.hash = '#/admin';
      }).catch(function (e2) { fail(e2.message || 'Could not open the console.'); });
      return;
    }

    var email = $('team-email').value.trim(), pass = $('team-pass').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) { fail('Enter the team email address.'); return; }
    if (pass.length < 6) { fail('Enter the password for that account.'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Checking…';
    FB.signIn({ email: email, password: pass }).then(function (u) {
      btn.disabled = false;
      btn.innerHTML = '<svg class="ic"><use href="#i-lock"/></svg> Enter team console';
      $('team-pass').value = '';
      if (u.role !== 'admin') {
        FB.signOut();
        fail('That account is not a Front Belt team account.');
        return;
      }
      toast('Welcome back, ' + (u.name || 'team'));
      location.hash = '#/admin';
    }).catch(function (e2) { fail(e2.message || 'That did not work. Try again.'); });
  });

  /* ================================================================
     TEAM (ADMIN) CONSOLE
     ================================================================ */

  function renderAdmin() {
    if (!me) return;
    if (me.role !== 'admin') {
      $('admin-stats').innerHTML = '';
      $('admin-requests').innerHTML = '';
      $('admin-table').innerHTML = gate('Team access only',
        'This console is for the Front Belt team: it reviews submissions, sets trust levels and removes listings. If you run a business, your console is under “Partner console”.',
        '<div class="row"><a class="btn btn-primary" href="#/partner">Go to my partner console</a><a class="btn btn-ghost" href="#/contact">Talk to the team</a></div>');
      return;
    }

    var published = all.filter(function (c) { return c.published; });
    var open = all.filter(function (c) { return statusOf(c).key === 'open'; });
    var attention = all.filter(function (c) { var s = statusOf(c); return s.key === 'stale' || s.key === 'unknown' || s.key === 'hidden'; });
    var awaiting = all.filter(function (c) { return isAwaiting(c); });
    $('admin-stats').innerHTML =
      '<div class="stat' + (awaiting.length ? ' warn' : '') + '"><b>' + awaiting.length + '</b><span>awaiting review</span></div>' +
      stat(all.length, 'listings total') +
      stat(published.length, 'published') +
      stat(open.length, 'open now') +
      '<div class="stat warn"><b>' + attention.length + '</b><span>need attention</span></div>';

    paintApprovals();
    paintImport();

    var q = (adminFilter.q || '').toLowerCase();
    var rows = all.filter(function (c) {
      if (q && (c.name + ' ' + c.area).toLowerCase().indexOf(q) < 0) return false;
      var s = statusOf(c);
      if (adminFilter.f === 'awaiting') return isAwaiting(c);
      if (adminFilter.f === 'open') return s.key === 'open';
      if (adminFilter.f === 'stale') return s.key === 'stale' || s.key === 'unknown' || s.key === 'hidden';
      if (adminFilter.f === 'hidden') return !c.published;
      return true;
    }).sort(function (a, b) {
      var sa = statusOf(a), sb = statusOf(b);
      var pa = sa.key === 'stale' || sa.key === 'unknown' || sa.key === 'hidden' ? 0 : 1;
      var pb = sb.key === 'stale' || sb.key === 'unknown' || sb.key === 'hidden' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return String(a.name).localeCompare(String(b.name));
    });

    $('admin-table').innerHTML = rows.length
      ? '<div class="tablewrap"><table class="tbl"><thead><tr>' +
      '<th>Listing</th><th>Trust</th><th>Status / type</th><th>Update / hours</th><th>Listing state</th><th></th>' +
      '</tr></thead><tbody>' + rows.map(adminRow).join('') + '</tbody></table></div>' +
      '<p class="hint" style="margin-top:.6rem">' + rows.length + ' of ' + all.length + ' listings shown. Trust changes reach the public site immediately.</p>'
      : '<div class="empty">No listings match that filter.</div>';

    renderRequests();
  }

  function adminRow(c) {
    var s = statusOf(c);
    var k = catOf(c);
    var sLabel = s.key === 'open' ? 'Open' : s.key === 'closed' ? 'Closed' : s.key === 'stale' ? 'Not updated' : s.key === 'hidden' ? 'Hiding' : 'Unknown';
    var statusCell = k.health
      ? '<td data-l="Status"><span class="pill ' + s.key + '"><span class="dot"></span>' + sLabel + '</span></td>' +
        '<td data-l="Last update"><span class="sub">' + esc(ago(c.lastStatusAt)) + '</span></td>'
      : '<td data-l="Type"><span class="chip" style="background:color-mix(in srgb,' + esc(k.color) + ' 14%,var(--surface));color:' + esc(k.color) + '">' + esc(c.type || k.label) + '</span></td>' +
        '<td data-l="Hours"><span class="sub">' + esc(c.hours || '—') + '</span></td>';
    var statusBtn = k.health
      ? '<button class="iconbtn" type="button" data-status="' + esc(c.id) + '" title="Update today\'s status" aria-label="Update status"><svg class="ic"><use href="#i-clock"/></svg></button>'
      : '';
    return '<tr class="' + (c.published ? '' : 'unpub') + '">' +
      '<td data-l="Listing"><div class="name">' + esc(c.name) + '</div>' +
      '<div class="sub">' + esc(k.label) + ' · ' + esc(c.area) + (c.sample ? ' · sample' : '') + ' · ' + esc(Number(c.lat).toFixed(4)) + ', ' + esc(Number(c.lng).toFixed(4)) + '</div></td>' +
      '<td data-l="Trust"><select data-trust="' + esc(c.id) + '" aria-label="Trust level for ' + esc(c.name) + '">' +
      DATA.levels.map(function (l) { return '<option' + (l === (c.trust || 'Listed') ? ' selected' : '') + '>' + l + '</option>'; }).join('') +
      '</select></td>' +
      statusCell +
      '<td data-l="Listing"><span class="chip ' + (c.published ? 'live' : 'warn') + '">' + (c.published ? 'Live' : 'Hidden') + '</span></td>' +
      '<td class="acts-cell"><div class="acts">' +
      statusBtn +
      '<button class="iconbtn" type="button" data-edit="' + esc(c.id) + '" title="Edit listing" aria-label="Edit listing"><svg class="ic"><use href="#i-edit"/></svg></button>' +
      '<button class="iconbtn" type="button" data-pub="' + esc(c.id) + '" title="' + (c.published ? 'Remove from public listing' : 'Publish') + '" aria-label="' + (c.published ? 'Unpublish' : 'Publish') + '"><svg class="ic"><use href="#i-eye"/></svg></button>' +
      '<button class="iconbtn" type="button" data-del="' + esc(c.id) + '" title="Delete listing" aria-label="Delete listing"><svg class="ic"><use href="#i-trash"/></svg></button>' +
      '</div></td></tr>';
  }

  function renderRequests() {
    paintAdminRequests();
  }

  /* ================================================================
     THE REVIEW QUEUE — what the team works through
     ================================================================ */
  function paintApprovals() {
    var box = $('admin-approvals');
    if (!box || !me || me.role !== 'admin') return;
    var rank = { pending: 0, in_review: 1, denied: 2 };
    var queue = all.filter(function (c) { return rank[reviewState(c)] != null; })
      .sort(function (a, b) {
        var d = rank[reviewState(a)] - rank[reviewState(b)];
        if (d) return d;
        return String(a.submittedAt || '').localeCompare(String(b.submittedAt || ''));
      });
    if (!queue.length) {
      box.innerHTML = '<div class="panel" style="margin-bottom:1rem"><h3><svg class="ic"><use href="#i-check"/></svg> Review queue is clear</h3>' +
        '<p class="muted small">Nothing is waiting for a decision. New partner submissions appear here the moment they are sent.</p></div>';
      return;
    }
    box.innerHTML = '<div class="prov-card stack queuecard">' +
      '<h3><svg class="ic"><use href="#i-doc"/></svg> ' + queue.length + ' listing' + (queue.length === 1 ? '' : 's') + ' in the review queue</h3>' +
      '<p class="hint">Approve puts it live immediately. “Not approved” sends the partner the exact reasons you tick.</p>' +
      queue.map(function (c) {
        var s = reviewState(c);
        return '<div class="qrow">' +
          '<div class="qmain">' +
          '<strong>' + esc(c.name || 'Untitled') + '</strong> <span class="rvchip rv-' + esc(s) + '">' + esc(REVIEW_LABEL[s]) + '</span>' +
          '<div class="small muted">' + esc(catOf(c).label) + (c.type ? ' · ' + esc(c.type) : '') + ' · ' + esc(c.area || 'no area set') +
          ' · ' + esc(Number(c.lat).toFixed(4)) + ', ' + esc(Number(c.lng).toFixed(4)) + '</div>' +
          '<div class="small muted">' + (c.phone ? esc(c.phone) : 'no phone given') + ' · sent ' + esc(ago(c.submittedAt)) + '</div>' +
          (c.deniedChecks && c.deniedChecks.length
            ? '<div class="small deny-inline">Returned for: ' + esc(c.deniedChecks.join(' · ')) + '</div>' : '') +
          '</div>' +
          '<div class="acts">' +
          (s === 'pending'
            ? '<button class="btn btn-ghost btn-sm" type="button" data-review="' + esc(c.id) + '" data-do="in_review"><svg class="ic"><use href="#i-eye"/></svg> Start review</button>'
            : '') +
          '<button class="btn btn-primary btn-sm" type="button" data-review="' + esc(c.id) + '" data-do="approved"><svg class="ic"><use href="#i-check"/></svg> Approve</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-review="' + esc(c.id) + '" data-do="denied"><svg class="ic"><use href="#i-warn"/></svg> Not approved</button>' +
          '</div></div>';
      }).join('') + '</div>';
  }

  /* why a listing was turned down — the partner sees these words */
  function openDenyModal(c) {
    var checks = DATA.reviewChecks || [];
    openModal('Why is this not approved?',
      '<form class="stack" id="deny-form">' +
      '<p class="hint">The partner sees exactly this — the reasons you tick and your note — so be specific enough for them to act on.</p>' +
      '<div class="chips col">' + checks.map(function (x) {
        return '<label class="chipcheck wide"><input type="checkbox" value="' + esc(x) + '"> ' + esc(x) + '</label>';
      }).join('') + '</div>' +
      '<label>Anything else they should know<textarea class="field" id="dn-note" rows="3" placeholder="e.g. The pin sits on the estate centre — please move it to your gate."></textarea></label>' +
      '<button class="btn btn-primary" type="submit">Send the decision</button>' +
      '<p class="ok-msg err" id="dn-err" hidden></p>' +
      '</form>');

    $('deny-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var picked = Array.prototype.slice.call(document.querySelectorAll('#deny-form input:checked'))
        .map(function (i) { return i.value; });
      var note = $('dn-note').value.trim();
      if (!picked.length && !note) {
        $('dn-err').textContent = 'Tick at least one reason, or write one.';
        $('dn-err').hidden = false;
        return;
      }
      var btn = $('deny-form').querySelector('[type="submit"]');
      btn.disabled = true;
      FB.reviewListing(c.id, 'denied', { checks: picked, reason: note }).then(function () {
        closeModal();
        toast('Decision sent — the partner sees it in their console.');
        renderAdmin();
      }).catch(function (err) {
        btn.disabled = false;
        $('dn-err').textContent = err.message;
        $('dn-err').hidden = false;
      });
    });
  }

  /* ================================================================
     OPEN MAP DATA — OpenStreetMap, not Google
     Tiles and this import both come from the open map. Overpass is a
     read-only public API; anything it returns is a DRAFT for a human
     to confirm by phone, never a published listing.
     ================================================================ */
  var OVERPASS_TAGS = {
    health: ['amenity~"^(clinic|pharmacy|hospital|doctors|dentist)$"', 'healthcare~"^(clinic|centre|doctor|pharmacy)$"'],
    food: ['amenity~"^(restaurant|cafe|fast_food|bakery|food_court)$"', 'shop~"^(bakery|butcher|greengrocer)$"'],
    beauty: ['shop~"^(hairdresser|beauty)$"', 'amenity~"^(spa)$"'],
    tech: ['shop~"^(mobile_phone|electronics|computer)$"', 'amenity~"^(bank|mobile_money_agent|bureau_de_change|payment_centre)$"'],
    books: ['shop~"^(books|stationery|newsagent)$"', 'amenity~"^(library)$"'],
    home: ['shop~"^(furniture|hardware|houseware|doityourself|bed|kitchen)$"'],
    stay: ['tourism~"^(hotel|hostel|guest_house|apartment|motel)$"']
  };
  var OSM_TYPE_HINT = [
    ['clinic', 'Clinic'], ['pharmacy', 'Pharmacy'], ['hospital', 'Hospital'], ['dentist', 'Dental clinic'],
    ['doctors', 'Clinic'], ['restaurant', 'Restaurant'], ['cafe', 'Café'], ['fast_food', 'Fast food'],
    ['bakery', 'Bakery'], ['butcher', 'Butchery'], ['hairdresser', 'Salon'], ['beauty', 'Salon'],
    ['spa', 'Spa'], ['mobile_phone', 'Phone shop'], ['electronics', 'Electrical shop'], ['bank', 'Bank'],
    ['mobile_money_agent', 'M-Pesa agent'], ['books', 'Bookshop'], ['stationery', 'Stationery'],
    ['library', 'Library'], ['furniture', 'Furniture store'], ['hardware', 'Hardware'],
    ['houseware', 'Home décor'], ['hotel', 'Hotel'], ['hostel', 'Hostel'], ['guest_house', 'Guest house'],
    ['apartment', 'Serviced apartment']
  ];
  var importResults = [];

  function paintImport() {
    var box = $('admin-import');
    if (!box || !me || me.role !== 'admin') return;
    if (box.getAttribute('data-painted') === '1') return;
    box.setAttribute('data-painted', '1');
    box.innerHTML = '<div class="prov-card stack importcard">' +
      '<h3><svg class="ic"><use href="#i-globe"/></svg> Open map data — OpenStreetMap</h3>' +
      '<p class="hint">Front Belt does not rent its map from Google. The tiles are OpenStreetMap, and this tool reads the same open database (Overpass API) to find businesses near an area that are <em>not</em> on Front Belt yet. Everything it finds arrives as a draft for a reviewer to confirm by phone — nothing is published automatically. Data &copy; OpenStreetMap contributors, ODbL.</p>' +
      '<div class="grid3">' +
      '<label>Category<select class="field" id="imp-cat">' + CATS.map(function (k) {
        return '<option value="' + esc(k.id) + '">' + esc(k.label) + '</option>';
      }).join('') + '</select></label>' +
      '<label>Area<input class="field" id="imp-area" placeholder="e.g. Kilimani" value="Kilimani"></label>' +
      '<label>Radius (km)<input class="field" id="imp-radius" type="number" min="0.5" max="5" step="0.5" value="1.5"></label>' +
      '</div>' +
      '<div class="row">' +
      '<button class="btn btn-ghost btn-sm" type="button" id="imp-run"><svg class="ic"><use href="#i-search"/></svg> Search the open map</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" id="imp-mine"><svg class="ic"><use href="#i-pin"/></svg> Use my location instead</button>' +
      '</div>' +
      '<div id="imp-results"></div>' +
      '</div>';
  }

  function impSetStatus(html) {
    var r = $('imp-results');
    if (r) r.innerHTML = html;
  }

  /* area name -> coordinates, through Nominatim (the open geocoder) */
  function geocodeArea(name) {
    return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ke&q=' +
      encodeURIComponent(name + ', Nairobi, Kenya'))
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!rows || !rows.length) throw new Error('We could not find “' + name + '” on the open map. Try another area name.');
        return { lat: Number(rows[0].lat), lng: Number(rows[0].lon), label: name };
      });
  }

  function runImport(centre) {
    var cat = $('imp-cat').value;
    var radius = Math.max(0.5, Math.min(5, Number($('imp-radius').value) || 1.5)) * 1000;
    var tags = OVERPASS_TAGS[cat] || OVERPASS_TAGS.health;
    var body = '[out:json][timeout:25];(' + tags.map(function (t) {
      return 'node(around:' + radius + ',' + centre.lat + ',' + centre.lng + ')[' + t + '];' +
        'way(around:' + radius + ',' + centre.lat + ',' + centre.lng + ')[' + t + '];';
    }).join('') + ');out center 80;';

    impSetStatus('<p class="hint"><span class="spin"></span> Reading the open map…</p>');
    /* Overpass takes the query as a GET parameter, and its public servers are
       often busy, so a second mirror is tried before giving up. */
    var HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    function ask(i) {
      if (i >= HOSTS.length) return Promise.reject(new Error('The open map is busy right now. Try again in a minute.'));
      return fetch(HOSTS[i] + '?data=' + encodeURIComponent(body), { headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('busy'); return r.json(); })
        .catch(function () { return ask(i + 1); });
    }
    ask(0).then(function (res) {
      var have = {};
      all.forEach(function (c) { if (c.name) have[String(c.name).toLowerCase()] = 1; });
      var seen = {};
      importResults = (res.elements || []).map(function (el) {
        var t = el.tags || {};
        var name = t.name || t['name:en'] || '';
        if (!name) return null;
        var lat = el.lat != null ? el.lat : (el.center && el.center.lat);
        var lng = el.lon != null ? el.lon : (el.center && el.center.lon);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        if (have[name.toLowerCase()] || seen[name.toLowerCase()]) return null;
        seen[name.toLowerCase()] = 1;
        return {
          id: 'osm/' + el.type + '/' + el.id,
          name: name,
          lat: lat, lng: lng,
          phone: t.phone || t['contact:phone'] || t['contact:mobile'] || '',
          hours: t.opening_hours || '',
          address: [t['addr:street'], t['addr:suburb']].filter(Boolean).join(', '),
          type: osmType(t),
          dist: distanceKm(centre.lat, centre.lng, lat, lng)
        };
      }).filter(Boolean).sort(function (a, b) { return a.dist - b.dist; });

      if (!importResults.length) {
        impSetStatus('<p class="hint">Nothing new found there. Either the area is already covered or OpenStreetMap has nothing mapped in that radius — try a bigger radius.</p>');
        return;
      }
      impSetStatus('<p class="hint">' + importResults.length + ' place' + (importResults.length === 1 ? '' : 's') +
        ' found near ' + esc(centre.label || 'that point') + ' that are not on Front Belt yet. Add them as drafts, then phone to confirm before they go live.</p>' +
        '<div class="row" style="margin:.6rem 0"><button class="btn btn-primary btn-sm" type="button" id="imp-add-all"><svg class="ic"><use href="#i-plus"/></svg> Add all ' + importResults.length + ' as drafts</button></div>' +
        '<div class="importlist">' + importResults.map(function (r) {
          return '<div class="improw"><div>' +
            '<strong>' + esc(r.name) + '</strong>' +
            '<div class="small muted">' + esc(r.type) + ' · ' + esc(fmtDist(r.dist)) + ' from the centre' +
            (r.phone ? ' · ' + esc(r.phone) : ' · no phone in OSM') + (r.hours ? ' · ' + esc(r.hours) : '') + '</div>' +
            '</div><button class="btn btn-ghost btn-sm" type="button" data-imp="' + esc(r.id) + '">Add as draft</button></div>';
        }).join('') + '</div>');
    }).catch(function (err) {
      impSetStatus('<p class="hint">' + esc(err.message || 'The open map could not be reached.') + '</p>');
    });
  }

  function osmType(t) {
    var probe = t.amenity || t.shop || t.tourism || t.healthcare || t.office || '';
    for (var i = 0; i < OSM_TYPE_HINT.length; i++) {
      if (OSM_TYPE_HINT[i][0] === probe) return OSM_TYPE_HINT[i][1];
    }
    return 'Other';
  }

  /* an OSM find becomes a normal Front Belt draft — the same review queue */
  function addOSMDraft(r) {
    var cat = $('imp-cat').value;
    var k = catById(cat) || CATS[0];
    var type = (k.types || []).indexOf(r.type) > -1 ? r.type : (k.types || [])[0] || '';
    return FB.saveClinic({
      category: cat, type: type, name: r.name, area: ($('imp-area').value || '').trim(),
      address: r.address, lat: r.lat, lng: r.lng, phone: r.phone, hours: r.hours,
      services: [], note: 'Imported from OpenStreetMap — phone to confirm before publishing.',
      reviewState: 'pending', published: false, trust: 'Listed',
      ownerUid: null, source: 'openstreetmap', sourceRef: r.id
    });
  }

  /* one subscription drives both consoles */
  function paintRequests() {
    paintProviderRequest();
    paintAdminRequests();
  }

  function paintProviderRequest() {
    var box = $('prov-request');
    if (!box || !provClinicId) return;
    var mine = lastReqs.filter(function (r) {
      return r.clinicId === provClinicId && r.state === 'pending';
    })[0];
    box.innerHTML = mine
      ? '<p class="ok-msg" style="background:var(--warn-soft);color:var(--warn)">' +
        esc(mine.levelRequested) + ' application sent ' + esc(ago(mine.createdAt)) + ' — waiting for review.</p>'
      : '';
  }

  function paintAdminRequests() {
    var box = $('admin-requests');
    if (!box || !me || me.role !== 'admin') return;
    var pending = lastReqs.filter(function (r) { return r.state === 'pending'; });
    if (!pending.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="prov-card stack" style="margin-bottom:1rem;border-color:var(--yellow)">' +
      '<h3><svg class="ic"><use href="#i-shield"/></svg> ' + pending.length + ' verification ' + (pending.length === 1 ? 'request' : 'requests') + ' waiting</h3>' +
      pending.map(function (r) {
        return '<div class="reqrow">' +
          '<div><strong>' + esc(r.clinicName || 'Clinic') + '</strong>' +
          '<div class="small muted">Applying for ' + esc(r.levelRequested || 'Verified') +
          ' · reg ' + esc(r.registrationNo || '—') + ' · licence ' + esc(r.licenceRef || '—') +
          ' · ' + esc(ago(r.createdAt)) + '</div>' +
          (r.message ? '<div class="small muted">“' + esc(r.message) + '”</div>' : '') + '</div>' +
          '<div class="row" style="gap:.4rem">' +
          '<button class="btn btn-primary btn-sm" type="button" data-approve="' + esc(r.id) + '">Approve &amp; publish</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-decline="' + esc(r.id) + '">Decline</button>' +
          '</div></div>';
      }).join('') + '</div>';
  }

  FB.onRequests(function (reqs) {
    lastReqs = reqs || [];
    paintRequests();
  });

  /* admin actions */
  document.addEventListener('click', function (e) {
    var t;

    if ((t = e.target.closest('[data-approve]'))) {
      var reqId = t.getAttribute('data-approve');
      var r = lastReqs.filter(function (x) { return x.id === reqId; })[0];
      if (!r) { toast('That request is no longer open.'); return; }
      FB.setTrust(r.clinicId, r.levelRequested)
        .then(function () { return FB.setPublished(r.clinicId, true); })
        .then(function () { return FB.resolveRequest(reqId, 'approved'); })
        .then(function () {
          toast((r.clinicName || 'The clinic') + ' is now ' + r.levelRequested + ' and live on the site.');
          renderAdmin();
        })
        .catch(function (err) { toast(err.message); });
      return;
    }

    if ((t = e.target.closest('[data-decline]'))) {
      FB.resolveRequest(t.getAttribute('data-decline'), 'declined', 'Did not meet the requirements for that level.')
        .then(function () { toast('Request declined.'); renderAdmin(); })
        .catch(function (err) { toast(err.message); });
      return;
    }

    /* ---- the review queue ---- */
    if ((t = e.target.closest('[data-review]'))) {
      var rvId = t.getAttribute('data-review');
      var rvDo = t.getAttribute('data-do');
      var rvC = all.filter(function (x) { return x.id === rvId; })[0];
      if (!rvC) { toast('That listing is no longer available.'); return; }
      if (rvDo === 'denied') { openDenyModal(rvC); return; }
      FB.reviewListing(rvId, rvDo).then(function () {
        toast(rvDo === 'approved'
          ? (rvC.name || 'The listing') + ' is approved and live.'
          : 'Marked as in review.');
        renderAdmin();
      }).catch(function (err) { toast(err.message); });
      return;
    }

    /* ---- open map data ---- */
    if (e.target.closest('#imp-run')) {
      var areaName = ($('imp-area').value || '').trim();
      if (!areaName) { toast('Type an area name first, e.g. Kilimani.'); return; }
      impSetStatus('<p class="hint"><span class="spin"></span> Finding ' + esc(areaName) + ' on the open map…</p>');
      geocodeArea(areaName).then(runImport).catch(function (err) { impSetStatus('<p class="hint">' + esc(err.message) + '</p>'); });
      return;
    }
    if (e.target.closest('#imp-mine')) {
      toast('Reading your location…');
      capture(function (lat, lng) { runImport({ lat: lat, lng: lng, label: 'your location' }); });
      return;
    }
    if ((t = e.target.closest('[data-imp]'))) {
      var impId = t.getAttribute('data-imp');
      var found = importResults.filter(function (r) { return r.id === impId; })[0];
      if (!found) return;
      t.disabled = true;
      addOSMDraft(found).then(function () {
        t.textContent = 'Added';
        importResults = importResults.filter(function (r) { return r.id !== impId; });
        toast(found.name + ' added as a draft. Confirm it by phone, then approve.');
      }).catch(function (err) {
        t.disabled = false;
        toast(err.message);
      });
      return;
    }
    if (e.target.closest('#imp-add-all')) {
      var batch = importResults.slice();
      if (!batch.length) return;
      confirmDialog({
        title: 'Add all ' + batch.length + ' as drafts?',
        body: 'They arrive unapproved, in the review queue, marked as imported from OpenStreetMap. Nothing appears publicly until someone confirms it by phone and approves it.',
        confirm: 'Add ' + batch.length + ' drafts'
      }).then(function (yes) {
        if (!yes) return;
        var done = 0;
        (function next() {
          if (!batch.length) {
            importResults = [];
            toast(done + ' draft' + (done === 1 ? '' : 's') + ' added to the review queue.');
            renderAdmin();
            return;
          }
          addOSMDraft(batch.shift()).then(function () { done++; next(); })
            .catch(function (err) { toast(err.message); });
        })();
      });
      return;
    }

    if ((t = e.target.closest('[data-edit]'))) { openEditor(t.getAttribute('data-edit')); return; }
    if ((t = e.target.closest('[data-status]'))) { openStatusModal(t.getAttribute('data-status')); return; }

    if ((t = e.target.closest('[data-pub]'))) {
      var id = t.getAttribute('data-pub');
      var c = all.filter(function (x) { return x.id === id; })[0];
      if (!c) return;
      var next = !c.published;
      FB.setPublished(id, next)
        .then(function () {
          toast(next ? 'Published — visible to patients now.' : 'Removed from the public listing.');
          renderAdmin();
        })
        .catch(function (err) { toast(err.message); });
      return;
    }

    if ((t = e.target.closest('[data-del]'))) {
      var did = t.getAttribute('data-del');
      var cl = all.filter(function (x) { return x.id === did; })[0] || {};
      confirmDialog({
        title: 'Delete this clinic?',
        body: '“' + (cl.name || 'This clinic') + '” is removed from the database and from the public site. Its update history goes with it. To take a clinic down temporarily, use the eye button instead.',
        confirm: 'Delete permanently',
        danger: true
      }).then(function (yes) {
        if (!yes) return;
        FB.deleteClinic(did).then(function () {
          toast('Clinic deleted.');
          renderAdmin();
        }).catch(function (err) { toast(err.message); });
      });
      return;
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target.closest('[data-trust]');
    if (!t) return;
    FB.setTrust(t.getAttribute('data-trust'), t.value)
      .then(function () { toast('Trust level set to ' + t.value + '. The public badge follows within seconds.'); })
      .catch(function (err) { toast(err.message); });
  });

  /* ---- clinic editor ---- */
  function openEditor(id) {
    var c = id ? all.filter(function (x) { return x.id === id; })[0] : null;
    var isNew = !c;
    c = c || {};

    var areaOpts = DATA.areas.map(function (a) {
      return '<option value="' + esc(a) + '"' + (a === c.area ? ' selected' : '') + '>' + esc(a) + '</option>';
    }).join('');
    var svc = DATA.services.map(function (s) {
      var on = (c.services || []).indexOf(s) > -1;
      return '<label class="chipcheck"><input type="checkbox" value="' + esc(s) + '"' + (on ? ' checked' : '') + '> ' + esc(s) + '</label>';
    }).join('');
    var cur = catOf(c);
    var catOpts = CATS.map(function (kk) {
      return '<option value="' + esc(kk.id) + '"' + (kk.id === cur.id ? ' selected' : '') + '>' + esc(kk.label) + '</option>';
    }).join('');
    var typeOpts = (cur.types || []).map(function (t) {
      return '<option' + (t === c.type ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
    var svcBlock =
      '<div id="ed-svc"' + (cur.health ? '' : ' hidden') + '><strong class="small">Services</strong><div class="chips">' + svc + '</div></div>' +
      '<div id="ed-tags-wrap"' + (cur.health ? ' hidden' : '') + '><label>What they offer (comma separated)' +
      '<input class="field" id="ed-tags" value="' + esc((c.services || []).join(', ')) + '" placeholder="e.g. Fresh bread, Cakes"></label></div>';

    openModal(isNew ? 'Add a listing' : 'Edit listing',
      '<form class="stack" id="ed-form" novalidate>' +
      '<div class="grid2">' +
      '<label>Category<select class="field" id="ed-cat">' + catOpts + '</select></label>' +
      '<label>Type<select class="field" id="ed-type"><option value="">Choose a type</option>' + typeOpts + '</select></label>' +
      '</div>' +
      '<div class="grid2">' +
      '<label>Name<input class="field" id="ed-name" value="' + esc(c.name || '') + '" required></label>' +
      '<label>Area<select class="field" id="ed-area"><option value="">Choose an area</option>' + areaOpts + '</select></label>' +
      '</div>' +
      '<label>Address or landmark<input class="field" id="ed-address" value="' + esc(c.address || '') + '"></label>' +
      '<div class="grid2">' +
      '<label>Phone<input class="field" id="ed-phone" value="' + esc(c.phone || '') + '"></label>' +
      '<label>Opening hours<input class="field" id="ed-hours" value="' + esc(c.hours || '') + '"></label>' +
      '</div>' +
      '<div class="grid3">' +
      '<label>Latitude<input class="field" id="ed-lat" type="number" step="any" value="' + esc(c.lat != null ? c.lat : '') + '" placeholder="-1.2921" required></label>' +
      '<label>Longitude<input class="field" id="ed-lng" type="number" step="any" value="' + esc(c.lng != null ? c.lng : '') + '" placeholder="36.7836" required></label>' +
      '<label>&nbsp;<button class="btn btn-ghost btn-sm" type="button" id="ed-capture"><svg class="ic"><use href="#i-crosshair"/></svg> Use my location</button></label>' +
      '</div>' +
      '<div id="ed-map"></div>' +
      '<p class="hint">Tap the map or drag the pin to the entrance. The coordinates are what distance search uses, so they should be the actual door, not the estate centre.</p>' +
      svcBlock +
      '<div class="grid2">' +
      '<label>Trust level<select class="field" id="ed-trust">' +
      DATA.levels.map(function (l) { return '<option' + (l === (c.trust || 'Listed') ? ' selected' : '') + '>' + l + '</option>'; }).join('') +
      '</select></label>' +
      '<label>Public listing<select class="field" id="ed-pub">' +
      '<option value="1"' + (c.published !== false ? ' selected' : '') + '>Live — visible to patients</option>' +
      '<option value="0"' + (c.published === false ? ' selected' : '') + '>Hidden</option>' +
      '</select></label>' +
      '</div>' +
      '<div class="grid2">' +
      '<label>Registration number<input class="field" id="ed-reg" value="' + esc(c.registrationNo || '') + '"></label>' +
      '<label>Licence reference<input class="field" id="ed-lic" value="' + esc(c.licenceRef || '') + '"></label>' +
      '</div>' +
      '<button class="btn btn-primary" type="submit"><svg class="ic"><use href="#i-check"/></svg> ' + (isNew ? 'Add clinic' : 'Save changes') + '</button>' +
      '<p class="ok-msg err" id="ed-err" hidden></p>' +
      '</form>');

    var latEl = $('ed-lat'), lngEl = $('ed-lng');

    var edCat = $('ed-cat');
    if (edCat) edCat.addEventListener('change', function () {
      var kk = catById(edCat.value) || catById('health');
      var typeSel = $('ed-type');
      if (typeSel) {
        typeSel.innerHTML = '<option value="">Choose a type</option>' +
          (kk.types || []).map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
      }
      var svcBox = $('ed-svc'), tagsBox = $('ed-tags-wrap');
      if (svcBox) svcBox.hidden = !kk.health;
      if (tagsBox) tagsBox.hidden = !!kk.health;
    });

    $('ed-capture').addEventListener('click', function () {
      capture(function (lat, lng) {
        latEl.value = lat.toFixed(6);
        lngEl.value = lng.toFixed(6);
        if (pickMap && pickMarker) { pickMarker.setLatLng([lat, lng]); pickMap.setView([lat, lng], 16); }
      });
    });

    var pickMap = null, pickMarker = null;
    loadLeaflet().then(function () {
      var box = $('ed-map');
      if (!box) return;
      var lat = parseFloat(latEl.value), lng = parseFloat(lngEl.value);
      var has = isFinite(lat) && isFinite(lng);
      pickMap = L.map('ed-map', { scrollWheelZoom: false }).setView(
        has ? [lat, lng] : [DATA.nairobi.lat, DATA.nairobi.lng], has ? 16 : 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
      }).addTo(pickMap);
      pickMarker = L.marker(has ? [lat, lng] : [DATA.nairobi.lat, DATA.nairobi.lng], { draggable: true }).addTo(pickMap);
      function setFrom(latlng) {
        latEl.value = latlng.lat.toFixed(6);
        lngEl.value = latlng.lng.toFixed(6);
      }
      pickMarker.on('dragend', function () { setFrom(pickMarker.getLatLng()); });
      pickMap.on('click', function (e) { pickMarker.setLatLng(e.latlng); setFrom(e.latlng); });
      setTimeout(function () { pickMap.invalidateSize(); }, 150);
    }).catch(function () { /* no map, coordinates still editable */ });

    $('ed-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('ed-err');
      err.hidden = true;
      var tagsWrap = $('ed-tags-wrap');
      var tagsEl = tagsWrap && !tagsWrap.hidden ? $('ed-tags') : null;
      var payload = {
        id: c.id,
        category: $('ed-cat') ? $('ed-cat').value : (c.category || 'health'),
        type: $('ed-type') ? $('ed-type').value : (c.type || ''),
        name: $('ed-name').value.trim(),
        area: $('ed-area').value,
        address: $('ed-address').value.trim(),
        phone: $('ed-phone').value.trim(),
        hours: $('ed-hours').value.trim(),
        lat: Number(latEl.value),
        lng: Number(lngEl.value),
        services: tagsEl
          ? tagsEl.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
          : Array.prototype.slice.call(document.querySelectorAll('.chipcheck input:checked')).map(function (i) { return i.value; }),
        trust: $('ed-trust').value,
        published: $('ed-pub').value === '1',
        registrationNo: $('ed-reg').value.trim(),
        licenceRef: $('ed-lic').value.trim(),
        ownerUid: c.ownerUid || null,
        status: c.status || 'unknown',
        waitMinutes: c.waitMinutes == null ? null : c.waitMinutes,
        busy: c.busy || 0,
        lastStatusAt: c.lastStatusAt || null
      };
      if (!payload.area) { err.textContent = 'Choose the area.'; err.hidden = false; return; }
      if (!isFinite(payload.lat) || payload.lat < -90 || payload.lat > 90) { err.textContent = 'Latitude must be between -90 and 90.'; err.hidden = false; return; }
      if (!isFinite(payload.lng) || payload.lng < -180 || payload.lng > 180) { err.textContent = 'Longitude must be between -180 and 180.'; err.hidden = false; return; }

      var btn = $('ed-form').querySelector('[type="submit"]');
      btn.disabled = true;
      FB.saveClinic(payload).then(function () {
        btn.disabled = false;
        closeModal();
        toast(isNew ? 'Clinic added.' : 'Clinic updated.');
        renderAdmin();
      }).catch(function (er) {
        btn.disabled = false;
        err.textContent = er.message;
        err.hidden = false;
      });
    });
  }

  /* ---- quick status modal (team) ---- */
  function openStatusModal(id) {
    var c = all.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var level = c.busy >= 70 ? 85 : c.busy >= 40 ? 50 : 20;
    openModal('Update ' + c.name,
      '<form class="stack" id="qs-form">' +
      '<p class="hint">Recorded as a team update. The clinic sees it in its history too.</p>' +
      '<div class="statuspick" id="qs-pick">' +
      '<button type="button" data-st="open" aria-pressed="' + (c.status === 'open') + '"><svg class="ic"><use href="#i-check"/></svg> Open now</button>' +
      '<button type="button" data-st="closed" aria-pressed="' + (c.status === 'closed') + '"><svg class="ic"><use href="#i-close"/></svg> Closed today</button>' +
      '</div>' +
      '<div class="grid2">' +
      '<label>Wait (minutes)<input class="field" id="qs-wait" type="number" min="0" max="240" value="' + (c.waitMinutes != null ? c.waitMinutes : '') + '"></label>' +
      '<label>How busy<select class="field" id="qs-busy">' +
      '<option value="20"' + (level === 20 ? ' selected' : '') + '>Quiet</option>' +
      '<option value="50"' + (level === 50 ? ' selected' : '') + '>Steady</option>' +
      '<option value="85"' + (level === 85 ? ' selected' : '') + '>Busy</option></select></label>' +
      '</div>' +
      '<label>Note<input class="field" id="qs-note" maxlength="120" value="' + esc(c.note || '') + '"></label>' +
      '<button class="btn btn-primary" type="submit">Save status</button>' +
      '</form>');

    var pickState = c.status;
    $('qs-pick').addEventListener('click', function (e) {
      var b = e.target.closest('[data-st]');
      if (!b) return;
      pickState = b.getAttribute('data-st');
      $('qs-pick').querySelectorAll('[data-st]').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
    });
    $('qs-form').addEventListener('submit', function (e) {
      e.preventDefault();
      FB.logStatus(id, {
        status: pickState,
        waitMinutes: $('qs-wait').value === '' ? null : Number($('qs-wait').value),
        busy: Number($('qs-busy').value),
        note: $('qs-note').value
      }).then(function () {
        closeModal();
        toast('Status saved.');
        renderAdmin();
      }).catch(function (err) { toast(err.message); });
    });
  }

  $('add-clinic').addEventListener('click', function () { openEditor(null); });

  $('admin-q').addEventListener('input', function () {
    adminFilter.q = this.value;
    renderAdmin();
  });
  $('admin-filter').addEventListener('change', function () {
    adminFilter.f = this.value;
    renderAdmin();
  });

  /* ================================================================
     GLOBAL UI
     ================================================================ */
  document.addEventListener('click', function (e) {
    var t;

    if ((t = e.target.closest('[data-samples]'))) {
      samplesOn = true;
      renderCurrent();
      toast('Showing sample listings so you can see how each category looks.');
      return;
    }

    /* the Directions link opens Maps on its own — do not also open the sheet */
    if (e.target.closest('[data-dir]')) return;

    if ((t = e.target.closest('[data-open]'))) {
      if (e.target.closest('[data-save]') || e.target.closest('a')) return;
      openPlace(t.getAttribute('data-open'));
      return;
    }

    if ((t = e.target.closest('[data-geo]'))) {
      e.preventDefault();
      locate();
      return;
    }

    if ((t = e.target.closest('[data-maptoggle]'))) {
      var wrap = $('mapwrap');
      if (wrap.hidden) showMap();
      else { wrap.hidden = true; t.querySelector('span').textContent = 'Show map'; }
      return;
    }

    if ((t = e.target.closest('[data-save]'))) {
      if (!me) {
        toast('Sign in to save clinics.');
        location.hash = '#/signin';
        return;
      }
      FB.toggleSaved(t.getAttribute('data-save')).then(function (added) {
        toast(added ? 'Saved. Find it in your dashboard.' : 'Removed from saved.');
      }).catch(function (err) { toast(err.message); });
      return;
    }

    if ((t = e.target.closest('[data-theme-toggle]'))) {
      var r = document.documentElement;
      var cur = r.getAttribute('data-theme');
      var dark = cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      r.setAttribute('data-theme', dark ? 'light' : 'dark');
      try { localStorage.setItem('frontbelt.theme', dark ? 'light' : 'dark'); } catch (x) {}
      return;
    }

    if ((t = e.target.closest('[data-menu]'))) {
      var open = $('mainnav').classList.toggle('open');
      t.setAttribute('aria-expanded', String(open));
      return;
    }

    if ((t = e.target.closest('[data-tab]'))) {
      var w = t.getAttribute('data-tab');
      $('t-pat').setAttribute('aria-selected', String(w === 'pat'));
      $('t-own').setAttribute('aria-selected', String(w === 'own'));
      $('faq-pat').hidden = w !== 'pat';
      $('faq-own').hidden = w !== 'own';
      return;
    }

    if ((t = e.target.closest('[data-copy]'))) {
      var src = $(t.getAttribute('data-copy'));
      if (!src) return;
      var txt = src.textContent;
      var done = function () {
        $('copied').hidden = false;
        setTimeout(function () { $('copied').hidden = true; }, 2000);
      };
      try {
        navigator.clipboard.writeText(txt).then(done, function () {
          var range = document.createRange();
          range.selectNodeContents(src);
          var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        });
      } catch (x) { /* older browsers */ }
      return;
    }

    if (e.target.closest('[data-close]') || e.target === $('modal')) { closeModal(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
    var el = document.activeElement;
    if ((e.key === 'Enter' || e.key === ' ') && el && el.closest && el.closest('[data-open]')) {
      e.preventDefault();
      openPlace(el.getAttribute('data-open'));
    }
  });

  ['q', 'area', 'lvl'].forEach(function (id) {
    $(id).addEventListener('input', renderFind);
    $(id).addEventListener('change', renderFind);
  });

  /* the home search box hands its words to the explore view */
  var heroForm = $('hero-search');
  if (heroForm) heroForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var val = ($('hero-q').value || '').trim();
    location.hash = '#/find';
    setTimeout(function () {
      if ($('q')) { $('q').value = val; renderFind(); }
    }, 70);
  });

  /* the contact page shows a WhatsApp link only when a line is configured */
  (function paintWhatsApp() {
    var line = $('wa-line');
    if (!line || !WA_NUMBER) return;
    line.innerHTML = '<a href="https://wa.me/' + waNumber(WA_NUMBER) + '" target="_blank" rel="noopener">Message us on WhatsApp</a> — ' +
      esc(WA_NUMBER) + ' during working hours.';
  })();

  /* the install prompt: the web app's bridge to the native apps */
  var installEvent = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvent = e;
    var b = $('install-btn');
    if (b) b.hidden = false;
  });
  function doInstall() {
    if (!installEvent) {
      toast('Open your browser menu and choose “Add to Home screen”.');
      return;
    }
    installEvent.prompt();
    installEvent.userChoice.then(function () {
      installEvent = null;
      var b = $('install-btn');
      if (b) b.hidden = true;
    });
  }
  var installBtn = $('install-btn');
  if (installBtn) installBtn.addEventListener('click', doInstall);
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-install]');
    if (t) { e.preventDefault(); doInstall(); }
  });

  /* the button says what will actually happen */
  function paintContactButton() {
    var b = $('c-submit');
    if (!b) return;
    b.innerHTML = CONTACT_KEY
      ? '<svg class="ic"><use href="#i-mail"/></svg> Send message'
      : '<svg class="ic"><use href="#i-mail"/></svg> Open in my email app';
  }
  paintContactButton();

  /* hidden markup can lag the script by a few minutes in a browser cache,
     so every optional element is checked rather than assumed */
  function show(id, on) { var el = $(id); if (el) el.hidden = !on; }

  function contactDone(msg) {
    $('contact-form').querySelectorAll('label, #c-submit, #c-err, #c-fallback').forEach(function (el) { el.hidden = true; });
    if ($('c-done-msg')) $('c-done-msg').textContent = msg;
    show('c-done', true);
  }

  var againBtn = $('c-again');
  if (againBtn) againBtn.addEventListener('click', function () {
    $('contact-form').reset();
    $('contact-form').querySelectorAll('label, #c-submit').forEach(function (el) { el.hidden = false; });
    show('c-done', false);
    show('c-fallback', false);
    $('c-name').focus();
  });

  $('contact-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = $('c-name').value.trim();
    var em = $('c-email').value.trim();
    var msg = $('c-msg').value.trim();
    var topic = $('c-topic').value;
    var err = $('c-err');
    if (!n || !/^\S+@\S+\.\S+$/.test(em) || !msg) {
      err.textContent = 'Please add your name, a valid email and a message.';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    var subject = topic + ' — ' + n;
    var body = 'Name: ' + n + '\nEmail: ' + em + '\nAbout: ' + topic + '\n\n' + msg;

    if (!CONTACT_KEY) {
      var link = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      /* show the written address first: handing off to a mail app can take
         over the page, and the visitor must not lose the way to reach us */
      show('c-fallback', true);
      toast('Opening your email app…');
      try { window.location.href = link; } catch (x) {}
      return;
    }

    /* send it ourselves, so it works on a phone with no mail app */
    var btn = $('c-submit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Sending…';
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: CONTACT_KEY,
        subject: 'Front Belt website — ' + subject,
        name: n,
        email: em,
        topic: topic,
        message: msg,
        botcheck: false
      })
    }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (res) {
      btn.disabled = false;
      paintContactButton();
      if (res && res.success) {
        contactDone('Thank you, ' + n + '. Your message is on its way — we reply within two working days.');
        return;
      }
      err.textContent = 'That did not send (' + ((res && res.message) || 'no answer from the mail service') +
        '). You can email us directly at ' + EMAIL + '.';
      err.hidden = false;
      show('c-fallback', true);
    }).catch(function () {
      btn.disabled = false;
      paintContactButton();
      err.textContent = 'The connection dropped, so the message was not sent. Email us directly at ' + EMAIL + '.';
      err.hidden = false;
      show('c-fallback', true);
    });
  });

  /* theme before first paint where possible */
  try {
    var savedTheme = localStorage.getItem('frontbelt.theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  } catch (x) {}

  setFtrMode(FB.mode === 'demo' ? 'Demo mode — this browser only.' : 'Live database.');

  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/home';
  render();
})();
