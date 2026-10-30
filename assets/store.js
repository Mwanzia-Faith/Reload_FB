/* ------------------------------------------------------------------
   Front Belt — data layer
   One API, two backends:

   demo      localStorage. Works the moment the page loads, per browser.
             Every console is usable, so the workflow can be tried
             before a database exists.
   firebase  Firestore + Firebase Auth, used automatically as soon as
             assets/firebase-config.js holds a real project config.
             Changes reached by onSnapshot, so a trust upgrade shows on
             the public page without a reload.

   Reads are synchronous-callback based (onClinics) because Firestore
   pushes updates; everything that writes returns a Promise.
-------------------------------------------------------------------*/
(function () {
  'use strict';

  var CFG = window.FIREBASE_CONFIG || {};
  var MODE = (CFG.apiKey && CFG.projectId && CFG.appId) ? 'firebase' : 'demo';
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';
  var DEMO_KEY = 'frontbelt.v3';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function iso(msAgo) { return new Date(Date.now() - (msAgo || 0)).toISOString(); }
  function rid(p) { return p + Math.random().toString(36).slice(2, 10); }

  /* ================================================================
     DEMO BACKEND
     ================================================================ */
  var state = null;
  var authCbs = [];
  var clinicCbs = [];
  var reqCbs = [];

  function seedState() {
    var clinics = (window.FB_DATA.clinics || []).map(function (c) {
      var o = clone(c);
      var mins = o.minutesAgo || 60;
      delete o.minutesAgo;
      o.lastStatusAt = iso(mins * 60000);
      o.updatedAt = o.lastStatusAt;
      o.createdAt = iso(60 * 24 * 30);
      o.published = true;
      o.ownerUid = null;
      o.registrationNo = '';
      o.licenceRef = '';
      o.note = '';
      return o;
    });
    return { users: [], session: null, clinics: clinics, requests: [], updates: [] };
  }

  function loadState() {
    if (state) return state;
    try {
      var raw = localStorage.getItem(DEMO_KEY);
      if (raw) { state = JSON.parse(raw); }
    } catch (e) { /* private mode, or corrupt */ }
    if (!state || !Array.isArray(state.clinics)) {
      state = seedState();
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    }
    if (!state.users) state.users = [];
    if (!state.requests) state.requests = [];
    if (!state.updates) state.updates = [];
    return state;
  }

  function persist() {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    emit();
  }

  /* let other tabs / the same tab know something changed */
  function emit() {
    var rows = loadState().clinics.slice();
    clinicCbs.forEach(function (cb) { try { cb(rows, null); } catch (e) { console.error(e); } });
    var reqs = loadState().requests.slice();
    reqCbs.forEach(function (cb) { try { cb(reqs, null); } catch (e) { console.error(e); } });
    authCbs.forEach(function (cb) { try { cb(currentUser()); } catch (e) { console.error(e); } });
  }

  if (MODE === 'demo') {
    window.addEventListener('storage', function (e) {
      if (e.key !== DEMO_KEY) return;
      state = null; loadState(); emit();
    });
  }

  function currentUser() {
    if (MODE !== 'demo') return fbUser;
    var s = loadState();
    if (!s.session) return null;
    var u = s.users.filter(function (x) { return x.uid === s.session; })[0];
    if (!u) return null;
    return { uid: u.uid, email: u.email, name: u.name, role: u.role, saved: u.saved || [] };
  }

  /* password digest — SHA-256 when the browser allows it, else a local hash.
     Demo only: real accounts are handled by Firebase Auth. */
  function fnv(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'f' + (h >>> 0).toString(16);
  }
  function digest(s) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      try {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('');
        }).catch(function () { return fnv(s); });
      } catch (e) { /* fall through */ }
    }
    return Promise.resolve(fnv(s));
  }

  function demoSignUp(o) {
    var s = loadState();
    var email = String(o.email || '').trim().toLowerCase();
    if (s.users.some(function (u) { return u.email === email; })) {
      return Promise.reject(new Error('An account with this email already exists. Switch to sign in.'));
    }
    return digest(o.password).then(function (hash) {
      var u = {
        uid: rid('u_'), email: email, name: String(o.name || '').trim() || email.split('@')[0],
        role: o.role === 'provider' ? 'provider' : 'patient',
        passHash: hash, saved: [], createdAt: new Date().toISOString()
      };
      s.users.push(u); s.session = u.uid; persist();
      return publicUser(u);
    });
  }

  function publicUser(u) {
    return { uid: u.uid, email: u.email, name: u.name, role: u.role, saved: u.saved || [] };
  }

  function demoSignIn(o) {
    var s = loadState();
    var email = String(o.email || '').trim().toLowerCase();
    var u = s.users.filter(function (x) { return x.email === email; })[0];
    if (!u) return Promise.reject(new Error('No account found for that email on this browser. Create an account instead.'));
    return digest(o.password).then(function (hash) {
      if (hash !== u.passHash) throw new Error('That password does not match this account.');
      s.session = u.uid; persist();
      return publicUser(u);
    });
  }

  /* ================================================================
     FIREBASE BACKEND
     ================================================================ */
  var sdkP = null, fbUser = null, fbUnsub = null, fbPendingRole = 'patient';

  function loadSdk() {
    if (sdkP) return sdkP;
    sdkP = Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js')
    ]).then(function (m) {
      var appLib = m[0], authLib = m[1], dbLib = m[2];
      var app = appLib.getApps().length ? appLib.getApp() : appLib.initializeApp(CFG);
      return { appLib: appLib, authLib: authLib, dbLib: dbLib, auth: authLib.getAuth(app), db: dbLib.getFirestore(app) };
    });
    return sdkP;
  }

  function friendly(err) {
    var code = (err && err.code) || '';
    var map = {
      'auth/invalid-credential': 'Email or password is not correct.',
      'auth/invalid-login-credentials': 'Email or password is not correct.',
      'auth/wrong-password': 'That password does not match this account.',
      'auth/user-not-found': 'No account found for that email.',
      'auth/email-already-in-use': 'An account with this email already exists. Switch to sign in.',
      'auth/weak-password': 'Use at least 6 characters for the password.',
      'auth/invalid-email': 'That email address does not look right.',
      'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
      'auth/network-request-failed': 'The network dropped. Check your connection and try again.',
      'permission-denied': 'This account is not allowed to do that.',
      'missing-or-insufficient-permissions': 'This account is not allowed to do that.',
      'unavailable': 'The database is unreachable right now. Try again in a moment.'
    };
    return new Error(map[code] || map[(err && err.message || '').toLowerCase()] || (err && err.message) || 'Something went wrong.');
  }

  function notifyClinics(rows, err) {
    clinicCbs.forEach(function (cb) { try { cb(rows, err); } catch (e) { console.error(e); } });
  }

  function connectClinics() {
    if (MODE !== 'firebase') return;
    if (fbUnsub) { try { fbUnsub(); } catch (e) {} fbUnsub = null; }
    loadSdk().then(function (S) {
      var col = S.dbLib.collection(S.db, 'clinics');
      /* signed-out visitors may only read published clinics, so the query
         has to say so — Firestore rejects queries it cannot prove are safe */
      var q = fbUser
        ? S.dbLib.query(col, S.dbLib.orderBy('name'))
        : S.dbLib.query(col, S.dbLib.where('published', '==', true));
      fbUnsub = S.dbLib.onSnapshot(q, function (snap) {
        var rows = snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; });
        notifyClinics(rows, null);
      }, function (err) {
        notifyClinics(null, friendly(err));
      });
    }).catch(function (err) { notifyClinics(null, friendly(err)); });
  }

  function ensureProfile(U) {
    loadSdk().then(function (S) {
      var ref = S.dbLib.doc(S.db, 'users', U.uid);
      return S.dbLib.getDoc(ref).then(function (snap) {
        if (snap.exists()) return snap.data();
        var base = {
          name: (U.displayName || (U.email || '').split('@')[0]),
          email: U.email || '',
          role: fbPendingRole === 'provider' ? 'provider' : 'patient',
          saved: [],
          createdAt: new Date().toISOString()
        };
        return S.dbLib.setDoc(ref, base).then(function () { return base; });
      });
    }).then(function (profile) {
      fbUser = {
        uid: U.uid, email: U.email || '', name: profile.name || '',
        role: profile.role || 'patient', saved: profile.saved || []
      };
      authCbs.forEach(function (cb) { try { cb(fbUser); } catch (e) {} });
      connectClinics();
    }).catch(function (err) {
      console.error('Profile load failed', err);
      fbUser = { uid: U.uid, email: U.email || '', name: '', role: 'patient', saved: [] };
      authCbs.forEach(function (cb) { try { cb(fbUser); } catch (e) {} });
      connectClinics();
    });
  }

  if (MODE === 'firebase') {
    loadSdk().then(function (S) {
      S.authLib.onAuthStateChanged(S.auth, function (U) {
        if (U) { ensureProfile(U); }
        else {
          fbUser = null;
          authCbs.forEach(function (cb) { try { cb(null); } catch (e) {} });
          connectClinics();
        }
      });
    }).catch(function (err) {
      console.error('Firebase failed to start:', err);
      notifyClinics(null, new Error('Could not reach the database. Showing sample data.'));
    });
  }

  /* ================================================================
     PUBLIC API
     ================================================================ */
  var FB = {
    mode: MODE,

    /* ---- auth ---- */
    user: currentUser,

    onAuth: function (cb) {
      authCbs.push(cb);
      cb(currentUser());
      return function () { authCbs = authCbs.filter(function (f) { return f !== cb; }); };
    },

    signUp: function (o) {
      if (MODE === 'demo') return demoSignUp(o);
      fbPendingRole = o.role === 'provider' ? 'provider' : 'patient';
      return loadSdk().then(function (S) {
        return S.authLib.createUserWithEmailAndPassword(S.auth, o.email, o.password)
          .then(function (cred) {
            if (o.name) return S.authLib.updateProfile(cred.user, { displayName: o.name }).then(function () { return cred.user; });
            return cred.user;
          });
      }).then(function (U) {
        return ensureProfilePromise(U);
      }).catch(function (err) { throw friendly(err); });
    },

    signIn: function (o) {
      if (MODE === 'demo') return demoSignIn(o);
      return loadSdk().then(function (S) {
        return S.authLib.signInWithEmailAndPassword(S.auth, o.email, o.password);
      }).then(function (cred) {
        return ensureProfilePromise(cred.user);
      }).catch(function (err) { throw friendly(err); });
    },

    signOut: function () {
      if (MODE === 'demo') {
        var s = loadState(); s.session = null; persist();
        return Promise.resolve();
      }
      return loadSdk().then(function (S) { return S.authLib.signOut(S.auth); });
    },

    /* demo-only helper so the team console can be previewed */
    demoAdmin: function () {
      var s = loadState();
      var u = s.users.filter(function (x) { return x.email === 'team@frontbelt.demo'; })[0];
      if (!u) {
        u = { uid: 'u_team', email: 'team@frontbelt.demo', name: 'Front Belt team', role: 'admin', passHash: fnv('demo'), saved: [], createdAt: new Date().toISOString() };
        s.users.push(u);
      }
      s.session = u.uid; persist();
      return Promise.resolve(publicUser(u));
    },

    /* ---- clinics ---- */
    onClinics: function (cb) {
      clinicCbs.push(cb);
      if (MODE === 'demo') {
        cb(loadState().clinics.slice(), null);
      } else {
        loadSdk().then(function () { cb(null, null); });
        if (clinicCbs.length === 1) connectClinics();
      }
      return function () { clinicCbs = clinicCbs.filter(function (f) { return f !== cb; }); };
    },

    saveClinic: function (data) {
      var payload = {
        name: String(data.name || '').trim(),
        area: String(data.area || '').trim(),
        address: String(data.address || '').trim(),
        lat: Number(data.lat),
        lng: Number(data.lng),
        phone: String(data.phone || '').trim(),
        hours: String(data.hours || '').trim(),
        services: Array.isArray(data.services) ? data.services : [],
        note: String(data.note || '').trim(),
        registrationNo: String(data.registrationNo || '').trim(),
        licenceRef: String(data.licenceRef || '').trim()
      };
      if (!payload.name) return Promise.reject(new Error('Give the clinic a name.'));
      if (!payload.area) return Promise.reject(new Error('Choose the area.'));
      if (!isFinite(payload.lat) || payload.lat < -90 || payload.lat > 90) return Promise.reject(new Error('Latitude must be between -90 and 90.'));
      if (!isFinite(payload.lng) || payload.lng < -180 || payload.lng > 180) return Promise.reject(new Error('Longitude must be between -180 and 180.'));

      payload.updatedAt = new Date().toISOString();

      if (MODE === 'demo') {
        var s = loadState();
        if (data.id) {
          var i = s.clinics.findIndex(function (c) { return c.id === data.id; });
          if (i < 0) return Promise.reject(new Error('That clinic no longer exists.'));
          Object.assign(s.clinics[i], payload);
          s.clinics[i].sample = false;
          persist();
          return Promise.resolve(data.id);
        }
        if (data.trust) payload.trust = data.trust;
        else payload.trust = 'Listed';
        payload.published = !!data.published;
        payload.ownerUid = data.ownerUid || null;
        payload.status = data.status || 'unknown';
        payload.waitMinutes = data.waitMinutes == null ? null : data.waitMinutes;
        payload.busy = data.busy || 0;
        payload.lastStatusAt = data.lastStatusAt || null;
        payload.createdAt = new Date().toISOString();
        payload.sample = false;
        payload.id = rid('c_');
        s.clinics.push(payload);
        persist();
        return Promise.resolve(payload.id);
      }

      return loadSdk().then(function (S) {
        if (data.id) {
          var ref = S.dbLib.doc(S.db, 'clinics', data.id);
          return S.dbLib.updateDoc(ref, payload).then(function () { return data.id; });
        }
        var base = Object.assign(payload, {
          trust: data.trust || 'Listed',
          published: !!data.published,
          ownerUid: data.ownerUid || null,
          status: data.status || 'unknown',
          waitMinutes: data.waitMinutes == null ? null : data.waitMinutes,
          busy: data.busy || 0,
          lastStatusAt: data.lastStatusAt || null,
          createdAt: new Date().toISOString()
        });
        return S.dbLib.addDoc(S.dbLib.collection(S.db, 'clinics'), base).then(function (r) { return r.id; });
      }).catch(function (err) { throw friendly(err); });
    },

    setTrust: function (id, level) {
      return setField(id, { trust: level, trustUpdatedAt: new Date().toISOString() });
    },

    setPublished: function (id, val) {
      return setField(id, { published: !!val });
    },

    deleteClinic: function (id) {
      if (MODE === 'demo') {
        var s = loadState();
        s.clinics = s.clinics.filter(function (c) { return c.id !== id; });
        s.requests = s.requests.filter(function (r) { return r.clinicId !== id; });
        persist();
        return Promise.resolve();
      }
      return loadSdk().then(function (S) {
        return S.dbLib.deleteDoc(S.dbLib.doc(S.db, 'clinics', id));
      }).catch(function (err) { throw friendly(err); });
    },

    logStatus: function (id, patch) {
      var entry = {
        status: patch.status,
        waitMinutes: patch.waitMinutes == null ? null : Number(patch.waitMinutes),
        busy: Number(patch.busy || 0),
        note: String(patch.note || ''),
        createdAt: new Date().toISOString()
      };
      var s;
      if (MODE === 'demo') {
        s = loadState();
        var c = s.clinics.filter(function (x) { return x.id === id; })[0];
        if (!c) return Promise.reject(new Error('That clinic no longer exists.'));
        Object.assign(c, entry, { lastStatusAt: entry.createdAt, updatedAt: entry.createdAt });
        entry.id = rid('h_'); entry.clinicId = id; entry.by = (currentUser() || {}).name || 'clinic';
        s.updates.unshift(entry);
        persist();
        return Promise.resolve();
      }
      return loadSdk().then(function (S) {
        var ref = S.dbLib.doc(S.db, 'clinics', id);
        return S.dbLib.updateDoc(ref, {
          status: entry.status, waitMinutes: entry.waitMinutes, busy: entry.busy,
          note: entry.note, lastStatusAt: entry.createdAt, updatedAt: entry.createdAt
        }).then(function () {
          return S.dbLib.addDoc(S.dbLib.collection(S.db, 'clinics', id, 'updates'), entry);
        });
      }).catch(function (err) { throw friendly(err); });
    },

    history: function (id) {
      if (MODE === 'demo') {
        var rows = loadState().updates.filter(function (u) { return u.clinicId === id; }).slice(0, 15);
        return Promise.resolve(rows);
      }
      return loadSdk().then(function (S) {
        return S.dbLib.getDocs(S.dbLib.query(
          S.dbLib.collection(S.db, 'clinics', id, 'updates'),
          S.dbLib.orderBy('createdAt', 'desc'),
          S.dbLib.limit(15)
        ));
      }).then(function (snap) {
        return snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; });
      }).catch(function () { return []; });
    },

    /* ---- verification requests ---- */
    onRequests: function (cb) {
      if (MODE === 'demo') {
        reqCbs.push(cb); cb(loadState().requests.slice(), null);
        return function () { reqCbs = reqCbs.filter(function (f) { return f !== cb; }); };
      }
      var stop = null;
      loadSdk().then(function (S) {
        stop = S.dbLib.onSnapshot(S.dbLib.query(S.dbLib.collection(S.db, 'requests'), S.dbLib.orderBy('createdAt', 'desc')), function (snap) {
          cb(snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; }), null);
        }, function (err) { cb([], friendly(err)); });
      });
      return function () { if (stop) stop(); };
    },

    createRequest: function (r) {
      var entry = {
        clinicId: r.clinicId || '',
        clinicName: r.clinicName || '',
        ownerUid: r.ownerUid || (currentUser() || {}).uid || '',
        email: (currentUser() || {}).email || r.email || '',
        levelRequested: r.levelRequested || 'Verified',
        registrationNo: r.registrationNo || '',
        licenceRef: r.licenceRef || '',
        message: r.message || '',
        state: 'pending',
        createdAt: new Date().toISOString()
      };
      if (MODE === 'demo') {
        var s = loadState();
        entry.id = rid('r_');
        s.requests.unshift(entry);
        persist();
        return Promise.resolve(entry.id);
      }
      return loadSdk().then(function (S) {
        return S.dbLib.addDoc(S.dbLib.collection(S.db, 'requests'), entry).then(function (x) { return x.id; });
      }).catch(function (err) { throw friendly(err); });
    },

    resolveRequest: function (id, state_, note) {
      if (MODE === 'demo') {
        var s = loadState();
        var r = s.requests.filter(function (x) { return x.id === id; })[0];
        if (!r) return Promise.resolve();
        r.state = state_; r.reviewNote = note || ''; r.reviewedAt = new Date().toISOString();
        persist();
        return Promise.resolve();
      }
      return loadSdk().then(function (S) {
        return S.dbLib.updateDoc(S.dbLib.doc(S.db, 'requests', id), {
          state: state_, reviewNote: note || '', reviewedAt: new Date().toISOString()
        });
      }).catch(function (err) { throw friendly(err); });
    },

    /* ---- patient saved clinics ---- */
    toggleSaved: function (clinicId) {
      var u = currentUser();
      if (!u) return Promise.resolve(false);
      var saved = (u.saved || []).slice();
      var idx = saved.indexOf(clinicId);
      if (idx > -1) saved.splice(idx, 1); else saved.push(clinicId);

      if (MODE === 'demo') {
        var s = loadState();
        var row = s.users.filter(function (x) { return x.uid === u.uid; })[0];
        if (row) row.saved = saved;
        try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)); } catch (e) {}
        authCbs.forEach(function (cb) { try { cb(currentUser()); } catch (e) {} });
        return Promise.resolve(idx === -1);
      }
      return loadSdk().then(function (S) {
        return S.dbLib.updateDoc(S.dbLib.doc(S.db, 'users', u.uid), { saved: saved });
      }).then(function () {
        fbUser.saved = saved;
        authCbs.forEach(function (cb) { try { cb(fbUser); } catch (e) {} });
        return idx === -1;
      }).catch(function (err) { throw friendly(err); });
    }
  };

  function setField(id, patch) {
    if (MODE === 'demo') {
      var s = loadState();
      var c = s.clinics.filter(function (x) { return x.id === id; })[0];
      if (!c) return Promise.reject(new Error('That clinic no longer exists.'));
      Object.assign(c, patch, { updatedAt: new Date().toISOString() });
      persist();
      return Promise.resolve();
    }
    return loadSdk().then(function (S) {
      return S.dbLib.updateDoc(S.dbLib.doc(S.db, 'clinics', id), patch);
    }).catch(function (err) { throw friendly(err); });
  }

  function ensureProfilePromise(U) {
    return new Promise(function (resolve, reject) {
      loadSdk().then(function (S) {
        ensureProfile(U);
        /* ensureProfile fills fbUser asynchronously; wait for it */
        var tries = 0;
        (function poll() {
          if (fbUser && fbUser.uid === U.uid) return resolve(fbUser);
          if (tries++ > 60) return reject(new Error('Signed in, but the profile did not load. Try reloading.'));
          setTimeout(poll, 50);
        })();
      }).catch(reject);
    });
  }

  window.FB = FB;
})();
