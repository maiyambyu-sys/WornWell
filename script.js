  // ── PAGE NAV ──
  const PAGES = ['home','story','menu','membership','waitlist','services','faq','reserve'];
  function showPage(name) {
    PAGES.forEach(p => document.getElementById('page-'+p).classList.remove('active'));
    document.getElementById('page-'+name).classList.add('active');
    ['story','menu','membership','waitlist','services','faq','reserve'].forEach(id => {
      const el = document.getElementById('nl-'+id);
      if (el) el.classList.toggle('active-link', id === name);
    });
    window.scrollTo({top:0, behavior:'smooth'});
    if (name === 'reserve') { buildCalendar(); goStep(1); }
    _recordPage(name);
  }

  // ── PRICING CLICK TRACKING ──
  const PLAN_LABELS = {
    dropin: 'Day Pass - $10/child',
    monthly: 'Monthly Membership - $55/mo',
    village: 'Village - $99/mo'
  };

  const FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSeTSCD8GPVuXic5z4hLCWogvmre0kmm1pie5Llkxg9uTzLKQg/viewform?embedded=true';
  const PLAN_ENTRY = 'entry.372018414';

  function trackClick(plan) {
    const label = PLAN_LABELS[plan] || 'Priority Waitlist';

    // Update badge on waitlist page
    const badge = document.getElementById('waitlist-plan-text');
    if (badge) badge.textContent = 'Interested in: ' + label;

    // Update ALL form iframes with the pre-filled plan value
    const url = FORM_BASE + '&' + PLAN_ENTRY + '=' + encodeURIComponent(label);
    document.querySelectorAll('iframe[data-gform]').forEach(f => f.src = url);

    // Record in behavior tracking
    _recordPlanClick(label);
  }

  // ── RESERVE STEPS ──
  function goStep(n) {
    document.querySelectorAll('.reserve-step').forEach(s => s.classList.remove('active'));
    document.getElementById('step-'+n).classList.add('active');
    window.scrollTo({top:0, behavior:'smooth'});
    if (n === 3) buildPaymentSummary();
    if (n === 4) { buildConfirmation(); _recordComplete(); }
    _recordStep(n);
  }

  // ── FORM TOGGLE ──
  function toggleForm(id) {
    const body = document.getElementById(id);
    const arrow = document.getElementById(id+'-arrow');
    body.classList.toggle('open');
    if (arrow) arrow.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0)';
  }

  // ── CALENDAR ──
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DOW  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  // 90-min sessions: 8:00am start, last start 2:30pm so end by 4:00pm
  // starts: 8:00, 9:30, 11:00, 12:30, 14:00, 15:30 → display as 8:00 AM – 9:30 AM etc
  const SESSION_STARTS = [
    {start:'8:00 AM',  end:'9:30 AM'},
    {start:'9:30 AM',  end:'11:00 AM'},
    {start:'11:00 AM', end:'12:30 PM'},
    {start:'12:30 PM', end:'2:00 PM'},
    {start:'2:00 PM',  end:'3:30 PM'},
    {start:'3:30 PM',  end:'5:00 PM'}  // note: last slot starts 3:30, would end 5 — adjust if needed
  ];

  const state = { date:null, session:null, kids:[] };

  function isAvail(d) {
    const date = new Date(2026,2,d);
    return d >= 23 && d <= 28 && date.getDay() !== 0;
  }

  function buildCalendar() {
    const grid = document.getElementById('cal-grid');
    if (!grid) return;
    grid.innerHTML = '';
    DAYS.forEach(d => {
      const el = document.createElement('div');
      el.className = 'cal-day-label'; el.textContent = d; grid.appendChild(el);
    });
    const firstDow = new Date(2026,2,1).getDay();
    for (let i=0; i<firstDow; i++) {
      const el = document.createElement('div'); el.className='cal-day empty'; grid.appendChild(el);
    }
    for (let d=1; d<=31; d++) {
      const el = document.createElement('div');
      el.textContent = d;
      const key = '2026-03-'+String(d).padStart(2,'0');
      if (isAvail(d)) {
        el.className = 'cal-day available'+(state.date===key?' selected':'');
        el.onclick = () => selectDate(key, d);
      } else {
        el.className = 'cal-day unavailable';
      }
      grid.appendChild(el);
    }
  }

  function selectDate(key, day) {
    state.date = key; state.session = null;
    buildCalendar();
    const dow = new Date(2026,2,day).getDay();
    document.getElementById('selected-date-label').textContent = DOW[dow]+', March '+day;
    buildSessions();
    document.getElementById('time-section').style.display = 'block';
    document.getElementById('btn-next-1').disabled = true;
    _recordDate(DOW[dow] + ', March ' + day);
  }

  const MAX_PER_SLOT = 5;

  // slotCounts: { "2026-03-23|8:00 AM": 2, ... }
  let slotCounts = {};

  async function loadSlotCounts() {
    const keys = [];
    for (let d = 23; d <= 28; d++) {
      const date = new Date(2026, 2, d);
      if (date.getDay() === 0) continue;
      SESSION_STARTS.forEach(s => {
        keys.push(`slot|2026-03-${String(d).padStart(2,'0')}|${s.start}`);
      });
    }
    slotCounts = {};
    for (const key of keys) {
      try {
        const result = await window.storage.get(key);
        slotCounts[key] = result ? parseInt(result.value) : 0;
      } catch(e) {
        slotCounts[key] = 0;
      }
    }
  }

  function getSlotKey(date, sessionStart) {
    return `slot|${date}|${sessionStart}`;
  }

  function getCount(date, sessionStart) {
    return slotCounts[getSlotKey(date, sessionStart)] || 0;
  }

  async function incrementSlot(date, sessionStart) {
    const key = getSlotKey(date, sessionStart);
    const current = getCount(date, sessionStart);
    const newCount = current + 1;
    slotCounts[key] = newCount;
    try {
      await window.storage.set(key, String(newCount));
    } catch(e) {
      console.error('Storage write failed', e);
    }
  }

  function buildSessions() {
    const grid = document.getElementById('time-grid'); grid.innerHTML='';
    SESSION_STARTS.forEach(s => {
      const el = document.createElement('div');
      const isSelected = state.session && state.session.start === s.start;
      const count = state.date ? getCount(state.date, s.start) : 0;
      const isFull = count >= MAX_PER_SLOT;
      const remaining = MAX_PER_SLOT - count;

      if (isFull) {
        el.className = 'time-slot full';
        el.innerHTML = s.start +
          '<span class="time-slot-end">→ ' + s.end + '</span>' +
          '<span class="slot-count full-label">Sold out</span>';
      } else {
        el.className = 'time-slot' + (isSelected ? ' selected' : '');
        const countClass = remaining <= 2 ? 'low' : 'open';
        const countLabel = remaining === 1 ? '1 spot left!' : remaining + ' spots left';
        el.innerHTML = s.start +
          '<span class="time-slot-end">→ ' + s.end + '</span>' +
          '<span class="slot-count ' + countClass + '">' + countLabel + '</span>';
        el.onclick = () => {
          state.session = s; buildSessions();
          document.getElementById('btn-next-1').disabled = false;
          _recordTime(s.start + ' – ' + s.end);
        };
      }
      grid.appendChild(el);
    });
  }

  // ── KIDS ──
  function addKid() {
    const inp = document.getElementById('kid-age-input');
    const v = inp.value.trim(); if(!v) return;
    state.kids.push(v); inp.value=''; renderKids();
    document.getElementById('err-kids').classList.remove('show');
  }
  document.addEventListener('DOMContentLoaded', () => {
    const ki = document.getElementById('kid-age-input');
    if(ki) ki.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();addKid();} });
  });
  function removeKid(i) { state.kids.splice(i,1); renderKids(); }
  function renderKids() {
    const row = document.getElementById('kids-row'); row.innerHTML='';
    state.kids.forEach((k,i) => {
      const tag=document.createElement('div'); tag.className='kid-tag';
      tag.innerHTML=`<span>${k}</span><button onclick="removeKid(${i})">×</button>`;
      row.appendChild(tag);
    });
  }

  // ── CONTACT ──
  function submitContact() {
    const fields = ['fname','lname','phone','email','city'].map(id => document.getElementById(id).value.trim());
    let ok = true;
    if (fields.some(f=>!f)) { document.getElementById('err-contact').classList.add('show'); ok=false; }
    else document.getElementById('err-contact').classList.remove('show');
    if (state.kids.length===0) { document.getElementById('err-kids').classList.add('show'); ok=false; }
    else document.getElementById('err-kids').classList.remove('show');
    if (ok) goStep(3);
  }

  // ── PAYMENT SUMMARY ──
  function buildPaymentSummary() {
    const el = document.getElementById('payment-summary');
    const d = parseInt(state.date.split('-')[2]);
    const dow = new Date(2026,2,d).getDay();
    el.innerHTML=`
      <div class="summary-item"><span>Date</span><span>${DOW[dow]}, March ${d}</span></div>
      <div class="summary-item"><span>Session</span><span>${state.session.start} – ${state.session.end}</span></div>
      <div class="summary-item"><span>Name</span><span>${document.getElementById('fname').value} ${document.getElementById('lname').value}</span></div>
      <div class="summary-item"><span>Kids</span><span>${state.kids.join(', ')}</span></div>`;
  }

  // ── CONFIRMATION ──
  async function buildConfirmation() {
    // Increment the slot count when user confirms payment
    if (state.date && state.session) {
      await incrementSlot(state.date, state.session.start);
    }
    const el = document.getElementById('confirm-details');
    const d = parseInt(state.date.split('-')[2]);
    const dow = new Date(2026,2,d).getDay();
    el.innerHTML=`
      <div class="confirm-row"><span>Name</span><span>${document.getElementById('fname').value} ${document.getElementById('lname').value}</span></div>
      <div class="confirm-row"><span>Date</span><span>${DOW[dow]}, March ${d}, 2026</span></div>
      <div class="confirm-row"><span>Session</span><span>${state.session.start} – ${state.session.end}</span></div>
      <div class="confirm-row"><span>Kids</span><span>${state.kids.join(', ')}</span></div>
      <div class="confirm-row"><span>Email</span><span>${document.getElementById('email').value}</span></div>
      <div class="confirm-row"><span>Phone</span><span>${document.getElementById('phone').value}</span></div>
      `;
  }

  // ══════════════════════════════════════════════
  //  BEHAVIOR TRACKING (localStorage)
  //  Tracks drop-off, navigation, and interest
  //  without requiring any external service.
  //  To see your data: open browser console and
  //  type: wornwellData()
  // ══════════════════════════════════════════════

  const LS_KEY = 'ww_sessions';

  function _loadSessions() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch(e) { return []; }
  }
  function _saveSessions(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch(e) {}
  }
  function _getSession() {
    const s = _loadSessions(); return s[s.length - 1] || null;
  }
  function _updateSession(updates) {
    const sessions = _loadSessions();
    if (!sessions.length) return;
    Object.assign(sessions[sessions.length - 1], updates, { lastSeen: new Date().toISOString() });
    _saveSessions(sessions);
  }
  function _startSession() {
    const sessions = _loadSessions();
    sessions.push({
      id: Date.now(),
      started: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      pagesVisited: [],
      reserveStepsReached: [],
      dateSelected: null,
      timeSelected: null,
      pricingViewed: false,
      planClicked: null,
      membershipPageViewed: false,
      dropOffStep: null,
      dropOffPage: null,
      dropOffNote: null,
      completed: false
    });
    _saveSessions(sessions);
  }
  function _recordPage(name) {
    const s = _getSession(); if (!s) return;
    const pages = s.pagesVisited || [];
    if (pages[pages.length - 1] !== name) pages.push(name);
    const updates = { pagesVisited: pages };
    // detect drop-off from reserve flow
    if (s.reserveStepsReached.length > 0 && !['reserve','waitlist'].includes(name) && !s.completed && !s.dropOffPage) {
      const lastStep = Math.max(...s.reserveStepsReached);
      updates.dropOffPage = name;
      updates.dropOffStep = lastStep;
      updates.dropOffNote = lastStep === 3 ? 'Viewed pricing — did not select a plan'
        : lastStep === 2 ? 'Entered contact info — left before pricing'
        : 'Started reservation — left before contact step';
    }
    // detect drop-off from membership page
    if (name !== 'membership' && s.membershipPageViewed && !s.planClicked && !s.dropOffPage && !s.completed) {
      updates.dropOffPage = name;
      updates.dropOffNote = 'Viewed membership pricing — did not click a plan';
    }
    if (name === 'membership') updates.membershipPageViewed = true;
    _updateSession(updates);
  }
  function _recordStep(n) {
    const s = _getSession(); if (!s) return;
    const steps = s.reserveStepsReached || [];
    if (!steps.includes(n)) steps.push(n);
    const updates = { reserveStepsReached: steps };
    if (n === 3) updates.pricingViewed = true;
    if (n >= (s.dropOffStep || 0)) { updates.dropOffStep = null; updates.dropOffPage = null; updates.dropOffNote = null; }
    _updateSession(updates);
  }
  function _recordDate(date) { _updateSession({ dateSelected: date }); }
  function _recordTime(time) { _updateSession({ timeSelected: time }); }
  function _recordPlanClick(plan) {
    _updateSession({ planClicked: plan, dropOffStep: null, dropOffPage: null, dropOffNote: null });
  }
  function _recordComplete() {
    _updateSession({ completed: true, dropOffStep: null, dropOffPage: null, dropOffNote: null });
  }

  // ── Console dashboard — type wornwellData() in browser console ──
  window.wornwellData = function() {
    const sessions = _loadSessions();
    console.group('%c🌊 Worn Well Visitor Data', 'color:#5C96B0;font-size:15px;font-weight:bold');
    console.log('Total sessions tracked:', sessions.length);

    const dropOffs = sessions.filter(s => s.dropOffNote);
    console.group('⚠️  Drop-offs (' + dropOffs.length + ')');
    dropOffs.forEach(s => {
      const info = [
        '[' + new Date(s.started).toLocaleDateString() + ']',
        s.dropOffNote,
        s.dateSelected ? '| Date: ' + s.dateSelected : '',
        s.timeSelected ? '| Time: ' + s.timeSelected : '',
        '→ Left to: ' + (s.dropOffPage || 'unknown')
      ].filter(Boolean).join(' ');
      console.log(info);
    });
    console.groupEnd();

    const completed = sessions.filter(s => s.completed);
    console.group('✅ Completed (' + completed.length + ')');
    completed.forEach(s => console.log('[' + new Date(s.started).toLocaleDateString() + '] Plan:', s.planClicked));
    console.groupEnd();

    const pricingViewed = sessions.filter(s => s.pricingViewed || s.membershipPageViewed);
    const rate = pricingViewed.length ? Math.round(completed.length / pricingViewed.length * 100) + '%' : 'n/a';
    console.log('📊 Viewed pricing:', pricingViewed.length, '| Converted:', completed.length, '| Rate:', rate);
    console.log('📋 Full data:', sessions);
    console.groupEnd();
    return sessions;
  };

  _startSession();
</script>
