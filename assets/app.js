/* ==================================================================
   Front Belt — application
   Routing, clinic search, sign-in, provider console, team console.
   ================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var DATA = window.FB_DATA;
  var EMAIL = 'frontbelttechnologiesltd@gmail.com';

  /* Contact form delivery.
     Empty  -> the button opens the visitor's own email app (no server needed,
               but it fails silently where no email app is set up).
     Filled -> the message is POSTed to Web3Forms and lands in the inbox
               directly, no email app involved. Get a free access key in one
               minute at https://web3forms.com (the key is emailed to you —
               which also proves the inbox receives mail). See README.md. */
  var CONTACT_KEY = '';

  var all = [];            /* every clinic this visitor is allowed to see */
  var me = null;           /* signed-in profile, or null */
  var meGeo = null;        /* {lat,lng,acc} from the device */
  var savedIds = [];
  var authRole = 'patient';
  var authMode = 'signin';
  /* Demo mode only: the local team console is opened with this code instead of
     a real account, so a visitor clicking around cannot wander into it.
     Change it to anything you like — and read README.md: a code that lives in
     the page source protects the look of the demo, not the data. Real access
     control is the Firestore rules in firestore.rules. */
  var TEAM_CODE = 'frontbelt-team';
  var dataErr = null;
  var lastLoaded = null;
  var modalOpen = false;
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
    return all.filter(function (c) {
      if (!c.published) return false;
      return statusOf(c).key !== 'hidden';
    });
  }

  function clinicForMe() {
    if (!me) return null;
    return all.filter(function (c) { return c.ownerUid === me.uid; })[0] || null;
  }

  function routeForRole(u) {
    if (!u) return '#/signin';
    return u.role === 'admin' ? '#/admin' : u.role === 'provider' ? '#/provider' : '#/account';
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

  /* ================================================================
     ROUTING
     ================================================================ */
  var ROUTES = {
    home: 'view-home', find: 'view-find', trust: 'view-trust', clinics: 'view-clinics',
    faq: 'view-faq', contact: 'view-contact', signin: 'view-signin',
    account: 'view-account', provider: 'view-provider', team: 'view-team', admin: 'view-admin'
  };
  /* routes that are nobody else's business — never linked in the nav or footer */
  var PRIVATE_ROUTES = ['team', 'admin', 'provider', 'account'];

  var TITLES = {
    home: 'Trusted clinic directory for Nairobi',
    find: 'Find a clinic near you',
    trust: 'How the trust levels work',
    clinics: 'For clinic owners',
    faq: 'Questions and answers',
    contact: 'Talk to the team',
    signin: 'Sign in',
    account: 'Your dashboard',
    provider: 'Provider console',
    team: 'Team access',
    admin: 'Team console'
  };
  function pageTitle(r) { return TITLES[r] || TITLES.home; }
  var NAV_FOR = { home: 'home', find: 'find', trust: 'trust', clinics: 'clinics', faq: 'faq', contact: 'contact' };

  function currentRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES[h] ? h : 'home';
  }

  function render() {
    var r = currentRoute();
    if (r === 'account' && !me) { location.hash = '#/signin'; return; }
    if (r === 'provider' && !me) { location.hash = '#/signin'; return; }
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

    Object.keys(ROUTES).forEach(function (k) { $(ROUTES[k]).hidden = (k !== r); });

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

    if (r === 'find') { renderFind(); }
    else if (r === 'home') { renderHome(); }
    else if (r === 'signin') { renderAuth(); }
    else if (r === 'account') { renderAccount(); }
    else if (r === 'provider') { renderProvider(); }
    else if (r === 'team') { renderTeam(); }
    else if (r === 'admin') { renderAdmin(); }

    window.scrollTo(0, 0);
  }

  /* re-render whatever is on screen after data changes */
  function renderCurrent() {
    var r = currentRoute();
    if (r === 'find') { renderFind(); return; }
    if (r === 'home') { renderHome(); return; }
    if (r === 'account') { renderAccount(); return; }
    if (r === 'team') { renderTeam(); return; }
    if (r === 'provider' || r === 'admin') {
      var a = document.activeElement;
      if (modalOpen || (a && a.closest && a.closest('#prov-body, #admin-table, #admin-requests'))) return;
      if (r === 'provider') renderProvider(); else renderAdmin();
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
    if (dataErr) { el.textContent = 'Offline · showing last known'; el.className = 'chip warn'; return; }
    if (FB.mode === 'demo') { el.textContent = 'Demo data · this browser'; el.className = 'chip seed'; return; }
    el.textContent = 'Live · checked ' + clock(lastLoaded || new Date());
    el.className = 'chip live';
  }

  FB.onClinics(function (rows, err) {
    if (err) {
      dataErr = err;
      if (!all.length) all = fallbackRows();
      setStamp();
      if (window.console) console.warn('Clinic data:', err.message);
      renderCurrent();
      return;
    }
    if (!rows) return;
    dataErr = null;
    lastLoaded = new Date();
    all = rows.filter(function (c) { return c && c.name; });
    setStamp();
    renderCurrent();
  });

  FB.onAuth(function (u) {
    me = u;
    savedIds = (u && u.saved) || [];
    syncAccountBtn();
    var r = currentRoute();
    if (r === 'account' || r === 'provider' || r === 'admin' || r === 'team') render();
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
    var open = list.filter(function (c) { return statusOf(c).key === 'open'; }).length;
    var trusted = list.filter(function (c) { return c.trust === 'Trusted' || c.trust === 'Verified' || c.trust === 'Certified'; }).length;
    var areas = {};
    list.forEach(function (c) { if (c.area) areas[c.area] = 1; });
    $('home-stats').innerHTML =
      stat(list.length, 'clinics listed') +
      stat(open, 'open right now') +
      stat(trusted, 'with a checked badge') +
      stat(Object.keys(areas).length, 'Nairobi areas');
  }
  function stat(v, label) {
    return '<div class="stat"><b>' + esc(v) + '</b><span>' + esc(label) + '</span></div>';
  }

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
    return '<article class="card' + (isPick ? ' near' : '') + '">' +
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
      '<div class="card-foot"><small>' + (c.sample ? 'Sample listing' : 'Updated ' + esc(ago(c.lastStatusAt))) + '</small>' +
      '<button class="savebtn" type="button" data-save="' + esc(c.id) + '" aria-pressed="' + saved + '" title="Save this clinic" aria-label="Save ' + esc(c.name) + '">' +
      '<svg class="ic"><use href="#i-heart"/></svg></button></div>' +
      '</article>';
  }

  function renderFind() {
    fillAreas();
    var q = ($('q').value || '').trim().toLowerCase();
    var area = $('area').value;
    var lvl = $('lvl').value;

    var list = publicClinics().filter(function (c) {
      return (!q || (c.name + ' ' + c.area + ' ' + (c.services || []).join(' ')).toLowerCase().indexOf(q) > -1) &&
        (!area || c.area === area) &&
        (!lvl || c.trust === lvl);
    });

    list.forEach(function (c) {
      c._dist = meGeo && isFinite(c.lat) ? distanceKm(meGeo.lat, meGeo.lng, c.lat, c.lng) : null;
    });

    list.sort(function (a, b) {
      var ua = statusOf(a).key === 'unknown' ? 1 : 0;
      var ub = statusOf(b).key === 'unknown' ? 1 : 0;
      if (ua !== ub) return ua - ub;
      if (a._dist != null && b._dist != null) return a._dist - b._dist;
      if (a._dist != null) return -1;
      if (b._dist != null) return 1;
      return String(a.name).localeCompare(String(b.name));
    });

    var pick = null;
    if (meGeo) {
      var pool = list.filter(function (c) { return statusOf(c).key === 'open'; });
      if (!pool.length) pool = list;
      var best = Infinity;
      pool.forEach(function (c) { if (c._dist != null && c._dist < best) { best = c._dist; pick = c; } });
    }

    $('rescount').textContent = list.length + (list.length === 1 ? ' clinic' : ' clinics') +
      (meGeo ? ' · nearest first' : ' · share your location to sort by distance');

    $('cards').innerHTML = list.length
      ? list.map(function (c) { return cardHTML(c, pick && pick.id === c.id && !q && !area && !lvl); }).join('')
      : '<div class="empty">No clinics match. Try a different area or trust level' +
        (meGeo ? '' : ', or tap “Use my location”') + '.</div>';

    if (meGeo && pick) {
      $('geo-title').textContent = 'Closest open clinic: ' + pick.name;
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
    $('geo-title').textContent = 'Find the nearest clinic to you';
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
    publicClinics().forEach(function (c) {
      if (!isFinite(c.lat) || !isFinite(c.lng)) return;
      var s = statusOf(c);
      var col = s.key === 'open' ? '#0F8A4F' : s.key === 'closed' ? '#8A6F7A' : '#B45309';
      var d = meGeo ? fmtDist(distanceKm(meGeo.lat, meGeo.lng, c.lat, c.lng)) : '';
      L.circleMarker([c.lat, c.lng], { radius: 8, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1 })
        .bindPopup('<strong>' + esc(c.name) + '</strong>' + esc(c.area) + (d ? ' · ' + esc(d) + ' away' : '') +
          '<br>' + esc(s.text) + '<br><span style="font-size:13px;color:#6E5560">' + esc(c.trust || 'Listed') + '</span>')
        .addTo(mapLayer);
      pts.push([c.lat, c.lng]);
    });
    if (meGeo) {
      L.circle([meGeo.lat, meGeo.lng], {
        radius: Math.max(60, Math.min(meGeo.acc || 80, 400)),
        color: '#E8135F', fillColor: '#E8135F', fillOpacity: .12, weight: 1
      }).addTo(mapLayer);
      L.circleMarker([meGeo.lat, meGeo.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#E8135F', fillOpacity: 1 })
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
        toast('Account created. Add your clinic in the console.', 5000);
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
    var open = list.filter(function (c) { return statusOf(c).key === 'open'; }).length;
    $('acct-stats').innerHTML = stat(savedIds.length, 'saved clinics') +
      stat(list.length, 'clinics listed') + stat(open, 'open right now');

    var mine = publicClinics().filter(function (c) { return savedIds.indexOf(c.id) > -1; });
    $('saved-cards').innerHTML = mine.length
      ? mine.map(function (c) { return cardHTML(c, false); }).join('')
      : '<div class="empty">Nothing saved yet. Tap the heart on any clinic in the clinic finder and it will wait for you here.</div>';
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
    return '' +
      '<div class="grid2">' +
      '<label>Clinic name<input class="field" id="pf-name" value="' + esc(c.name || '') + '" required></label>' +
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
      '<p class="hint">Stand at the clinic entrance and tap the button: your phone gives the coordinates, so patients nearby find you. You can also paste them from Google Maps (right-click the spot → copy coordinates).</p>' +
      '<div><strong class="small">Services offered</strong><div class="chips">' + svc + '</div></div>';
  }

  function readClinicForm(root, extra) {
    var services = Array.prototype.slice.call(root.querySelectorAll('.chipcheck input:checked')).map(function (i) { return i.value; });
    var areaSel = root.querySelector('#pf-area');
    var area = areaSel ? areaSel.value : '';
    var o = {
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

  function renderProvider() {
    var body = $('prov-body');
    if (!me) return;
    if (me.role !== 'provider' && me.role !== 'admin') {
      $('prov-title').textContent = 'Provider console';
      $('prov-sub').textContent = '';
      body.innerHTML = gate('This account is a patient account',
        'A provider account is what opens the clinic console. Create one with the email of the clinic you manage, and we will link your listing to it.',
        '<div class="row"><a class="btn btn-primary" href="#/signin" data-signin-role="provider">Create a provider account</a>' +
        '<a class="btn btn-ghost" href="#/contact">Talk to the team</a></div>');
      return;
    }

    var c = clinicForMe();
    if (!c && me.role === 'admin') {
      $('prov-title').textContent = 'You are signed in as the Front Belt team';
      $('prov-sub').textContent = '';
      body.innerHTML = gate('Team accounts do not own a clinic listing',
        'Clinic operations — enlisting, trust levels, publishing and removal — live in the team console. A provider account is what opens a clinic console.',
        '<div class="row"><a class="btn btn-primary" href="#/admin"><svg class="ic"><use href="#i-chart"/></svg> Open team console</a>' +
        '<a class="btn btn-ghost" href="#/find">See the public site</a></div>');
      return;
    }
    if (!c) {
      $('prov-title').textContent = 'Add your clinic';
      $('prov-sub').textContent = 'Takes about three minutes. The team approves it before it appears publicly.';
      body.innerHTML = '<form class="prov-card stack" id="new-clinic" novalidate>' +
        clinicFormFields({ area: '' }) +
        '<button class="btn btn-primary" type="submit"><svg class="ic"><use href="#i-plus"/></svg> Send my clinic for review</button>' +
        '<p class="ok-msg err" id="nc-err" hidden></p>' +
        '</form>';
      wireProviderForm(body, null, true);
      return;
    }

    $('prov-title').textContent = c.name;
    $('prov-sub').textContent = (c.sample ? 'Sample listing · ' : '') + c.area + ' · ' + (c.published ? 'live on the public site' : 'hidden from the public site');
    $('prov-view-link').href = '#/find';

    var s = statusOf(c);
    var busyLevel = c.busy >= 70 ? 85 : c.busy >= 40 ? 50 : 20;
    var pending = null; /* filled by request fetch below */

    var trustSteps = ['Listed', 'Verified', 'Trusted', 'Certified'];
    var reached = trustSteps.indexOf(c.trust || 'Listed');

    body.innerHTML =
      '<div class="statrow">' +
      '<div class="stat"><b>' + esc(c.trust || 'Listed') + '</b><span>Trust level</span></div>' +
      '<div class="stat ' + (s.key === 'open' ? 'ok' : s.key === 'open' ? '' : 'warn') + '"><b>' +
      (s.key === 'open' ? 'Open' : s.key === 'closed' ? 'Closed' : 'Needs update') + '</b><span>Public status</span></div>' +
      '<div class="stat"><b>' + (c.published ? 'Live' : 'Hidden') + '</b><span>Listing</span></div>' +
      '<div class="stat"><b>' + (c.lastStatusAt ? esc(ago(c.lastStatusAt)) : 'No update yet') + '</b><span>Last update</span></div>' +
      '</div>' +

      (c.lastStatusAt && (s.key === 'stale' || s.key === 'unknown')
        ? '<div class="panel" style="border-color:var(--warn)"><h3><svg class="ic"><use href="#i-warn"/></svg> Your status is out of date</h3>' +
        '<p class="muted small">' + esc(s.text) + '. Clinics that stop updating drop in search, and after seven days the listing hides itself. Save today\'s status below to fix it.</p></div>'
        : '') +

      '<div class="two">' +
      '<form class="prov-card stack" id="status-form">' +
      '<h3><svg class="ic"><use href="#i-clock"/></svg> Today\'s status</h3>' +
      '<p class="hint">This is what patients see first. It takes under a minute.</p>' +
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
      '<label>Note for patients (optional)<input class="field" id="st-note" maxlength="120" value="' + esc(c.note || '') + '" placeholder="e.g. Doctor in until 1 pm"></label>' +
      '<button class="btn btn-primary" type="submit"><svg class="ic"><use href="#i-refresh"/></svg> Save today\'s status</button>' +
      '</form>' +

      '<div class="stack">' +
      '<section class="prov-card stack">' +
      '<h3><svg class="ic"><use href="#i-eye"/></svg> Your listing</h3>' +
      '<p class="hint">' + (c.published
        ? 'Your clinic is visible to patients. Hiding it takes effect immediately and keeps your data.'
        : 'Your clinic is hidden. Ask the team to relist it when you are ready.') + '</p>' +
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
      '<h3><svg class="ic"><use href="#i-edit"/></svg> Clinic details and exact location</h3>' +
      clinicFormFields(c) +
      '<button class="btn btn-primary" type="submit">Save clinic details</button>' +
      '<p class="ok-msg err" id="pf-err" hidden></p>' +
      '</form>' +

      '<section class="prov-card" style="margin-top:1rem">' +
      '<h3><svg class="ic"><use href="#i-chart"/></svg> Recent updates</h3>' +
      '<div class="timeline" id="p-history"><p class="hint">Loading…</p></div>' +
      '</section>';

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
          toast('Status saved. Patients see it now.');
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
        if (isNew) {
          payload.ownerUid = me.uid;
          payload.published = false;
          payload.trust = 'Listed';
          payload.status = 'unknown';
        } else {
          payload.id = clinic.id;
        }
        FB.saveClinic(payload).then(function () {
          btn.disabled = false;
          if (errBox) errBox.hidden = true;
          toast(isNew ? 'Clinic sent for review. We will publish it once checked.' : 'Clinic details saved.');
          if (isNew) renderProvider();
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
      if ($('team-code').value.trim() !== TEAM_CODE) { fail('That team code is not right.'); return; }
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
        'This console is for the Front Belt team: it enlists clinics, sets trust levels and removes listings. If you run a clinic, your console is under “Provider console”.',
        '<div class="row"><a class="btn btn-primary" href="#/provider">Go to my clinic console</a><a class="btn btn-ghost" href="#/contact">Talk to the team</a></div>');
      return;
    }

    var published = all.filter(function (c) { return c.published; });
    var open = all.filter(function (c) { return statusOf(c).key === 'open'; });
    var attention = all.filter(function (c) { var s = statusOf(c); return s.key === 'stale' || s.key === 'unknown' || s.key === 'hidden'; });
    $('admin-stats').innerHTML =
      stat(all.length, 'clinics total') +
      stat(published.length, 'published') +
      stat(open.length, 'open today') +
      '<div class="stat warn"><b>' + attention.length + '</b><span>need attention</span></div>';

    var q = (adminFilter.q || '').toLowerCase();
    var rows = all.filter(function (c) {
      if (q && (c.name + ' ' + c.area).toLowerCase().indexOf(q) < 0) return false;
      var s = statusOf(c);
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
      '<th>Clinic</th><th>Trust</th><th>Status</th><th>Last update</th><th>Listing</th><th></th>' +
      '</tr></thead><tbody>' + rows.map(adminRow).join('') + '</tbody></table></div>' +
      '<p class="hint" style="margin-top:.6rem">' + rows.length + ' of ' + all.length + ' clinics shown. Trust changes reach the public site immediately.</p>'
      : '<div class="empty">No clinics match that filter.</div>';

    renderRequests();
  }

  function adminRow(c) {
    var s = statusOf(c);
    var sLabel = s.key === 'open' ? 'Open' : s.key === 'closed' ? 'Closed' : s.key === 'stale' ? 'Not updated' : s.key === 'hidden' ? 'Hiding' : 'Unknown';
    return '<tr class="' + (c.published ? '' : 'unpub') + '">' +
      '<td data-l="Clinic"><div class="name">' + esc(c.name) + '</div>' +
      '<div class="sub">' + esc(c.area) + (c.sample ? ' · sample' : '') + ' · ' + esc(Number(c.lat).toFixed(4)) + ', ' + esc(Number(c.lng).toFixed(4)) + '</div></td>' +
      '<td data-l="Trust"><select data-trust="' + esc(c.id) + '" aria-label="Trust level for ' + esc(c.name) + '">' +
      DATA.levels.map(function (l) { return '<option' + (l === (c.trust || 'Listed') ? ' selected' : '') + '>' + l + '</option>'; }).join('') +
      '</select></td>' +
      '<td data-l="Status"><span class="pill ' + s.key + '"><span class="dot"></span>' + sLabel + '</span></td>' +
      '<td data-l="Last update"><span class="sub">' + esc(ago(c.lastStatusAt)) + '</span></td>' +
      '<td data-l="Listing"><span class="chip ' + (c.published ? 'live' : 'warn') + '">' + (c.published ? 'Live' : 'Hidden') + '</span></td>' +
      '<td class="acts-cell"><div class="acts">' +
      '<button class="iconbtn" type="button" data-status="' + esc(c.id) + '" title="Update today\'s status" aria-label="Update status"><svg class="ic"><use href="#i-clock"/></svg></button>' +
      '<button class="iconbtn" type="button" data-edit="' + esc(c.id) + '" title="Edit clinic" aria-label="Edit clinic"><svg class="ic"><use href="#i-edit"/></svg></button>' +
      '<button class="iconbtn" type="button" data-pub="' + esc(c.id) + '" title="' + (c.published ? 'Remove from public listing' : 'Publish') + '" aria-label="' + (c.published ? 'Unpublish' : 'Publish') + '"><svg class="ic"><use href="#i-eye"/></svg></button>' +
      '<button class="iconbtn" type="button" data-del="' + esc(c.id) + '" title="Delete clinic" aria-label="Delete clinic"><svg class="ic"><use href="#i-trash"/></svg></button>' +
      '</div></td></tr>';
  }

  function renderRequests() {
    paintAdminRequests();
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

    openModal(isNew ? 'Add a clinic' : 'Edit clinic',
      '<form class="stack" id="ed-form" novalidate>' +
      '<div class="grid2">' +
      '<label>Clinic name<input class="field" id="ed-name" value="' + esc(c.name || '') + '" required></label>' +
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
      '<p class="hint">Tap the map or drag the pin to the clinic\'s gate. The coordinates are what distance search uses, so they should be the actual entrance, not the estate centre.</p>' +
      '<div><strong class="small">Services</strong><div class="chips">' + svc + '</div></div>' +
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
      var payload = {
        id: c.id,
        name: $('ed-name').value.trim(),
        area: $('ed-area').value,
        address: $('ed-address').value.trim(),
        phone: $('ed-phone').value.trim(),
        hours: $('ed-hours').value.trim(),
        lat: Number(latEl.value),
        lng: Number(lngEl.value),
        services: Array.prototype.slice.call(document.querySelectorAll('.chipcheck input:checked')).map(function (i) { return i.value; }),
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

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  ['q', 'area', 'lvl'].forEach(function (id) {
    $(id).addEventListener('input', renderFind);
    $(id).addEventListener('change', renderFind);
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

  function contactDone(msg) {
    $('contact-form').querySelectorAll('label, #c-submit, #c-err, #c-fallback').forEach(function (el) { el.hidden = true; });
    $('c-done-msg').textContent = msg;
    $('c-done').hidden = false;
  }

  $('c-again').addEventListener('click', function () {
    $('contact-form').reset();
    $('contact-form').querySelectorAll('label, #c-submit').forEach(function (el) { el.hidden = false; });
    $('c-done').hidden = true;
    $('c-fallback').hidden = true;
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
      toast('Opening your email app…');
      try { window.location.href = link; } catch (x) {}
      $('c-fallback').hidden = false;
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
      $('c-fallback').hidden = false;
    }).catch(function () {
      btn.disabled = false;
      paintContactButton();
      err.textContent = 'The connection dropped, so the message was not sent. Email us directly at ' + EMAIL + '.';
      err.hidden = false;
      $('c-fallback').hidden = false;
    });
  });

  /* theme before first paint where possible */
  try {
    var savedTheme = localStorage.getItem('frontbelt.theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  } catch (x) {}

  $('ftr-mode').textContent = FB.mode === 'demo'
    ? 'Demo mode — this browser only.'
    : 'Live database.';

  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/home';
  render();
})();
