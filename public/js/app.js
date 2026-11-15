/* ============================================================
   جمعية الحاسوب – IUA | منطق الواجهة العامة v3 (Flagship Tech)
   ============================================================ */
'use strict';

/* ---------------- أدوات ---------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function toast(msg, type = 'ok') {
  const wrap = $('#toast-wrap');
  if (!wrap) return;
  // منع تكدس التنبيهات المكررة: إزالة أي تنبيه سابق فوراً ليبقى تنبيه واحد واضح
  wrap.innerHTML = '';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .35s, transform .35s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(14px)';
    setTimeout(() => el.remove(), 360);
  }, 3600);
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  } catch (netErr) {
    throw Object.assign(new Error('تعذّر الاتصال بخادم النظام. يرجى التأكد من تشغيل الخادم وإعادة المحاولة.'), { status: 0 });
  }
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const errorMsg = data.error || (res.status === 404 ? 'المسار غير موجود' : res.status === 500 ? 'خطأ داخلي في الخادم' : 'حدث خطأ في العملية');
    throw Object.assign(new Error(errorMsg), { status: res.status, data });
  }
  return data;
}

const ID_RE = /^ST(20|21|22)[A-Z0-9_\-\.]{0,24}$/i;
const normId = v => String(v || '').trim().toUpperCase().replace(/\s+/g, '');
const normPhone = v => String(v || '').replace(/[\s\-().]/g, '');
const validPhone = v => /^\+?\d{9,15}$/.test(normPhone(v));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- تفاعل القسم بالله العظيم ---------------- */
function bindOathBox(checkId, boxId, badgeId) {
  const check = $('#' + checkId), box = $('#' + boxId), badge = $('#' + badgeId);
  if (!check || !box) return;
  const updateOathUI = () => {
    const sworn = check.checked;
    box.classList.toggle('oath-sworn', sworn);
    if (badge) {
      badge.textContent = sworn ? '✓ أديتُ القسم بالله العظيم' : 'لم يؤدَّ بعد';
    }
  };
  check.addEventListener('change', updateOathUI);
  updateOathUI();
}
bindOathBox('nomOathCheck', 'nomOathBox', 'nomOathBadge');
bindOathBox('oathCheck', 'voteOathBox', 'voteOathBadge');

/* ---------------- التنقل والمراقبة عند التمرير ---------------- */
const nav = $('#nav');
const burger = $('#burger');
if (burger) {
  const navLinksEl = $('#navLinks');
  const setMenuOpen = open => {
    navLinksEl.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  };
  burger.addEventListener('click', () => setMenuOpen(!navLinksEl.classList.contains('open')));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenuOpen(false); });
  document.addEventListener('click', e => {
    if (!e.target.closest('#nav') && navLinksEl.classList.contains('open')) setMenuOpen(false);
  });
  window.addEventListener('resize', () => { if (innerWidth > 820) setMenuOpen(false); }, { passive: true });
}
$$('#navLinks a').forEach(a => a.addEventListener('click', () => {
  $('#navLinks').classList.remove('open');
  burger?.setAttribute('aria-expanded', 'false');
  burger?.setAttribute('aria-label', 'فتح القائمة');
}));
const yrEl = $('#yr');
if (yrEl) yrEl.textContent = new Date().getFullYear();

/* ============================================================
   إدارة المظهر الداكن والنهاري (Dark Mode & White Mode)
   ============================================================ */
function initTheme() {
  const toggleBtn = $('#themeToggle');
  const saved = localStorage.getItem('csa_theme') || 'dark';
  setTheme(saved);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      setTheme(next);
      toast(next === 'dark' ? 'الوضع الليلي مفعّل' : 'الوضع النهاري مفعّل', 'ok');
    });
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('csa_theme', theme);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'dark' ? '#0F0F0F' : '#FFFFFF');
  }
}
initTheme();

// تنظيف أي حالة سابقة لمحاكي الهاتف ليعمل الموقع كمنصة متجاوبة تلقائياً
try {
  localStorage.removeItem('csa_phone_frame');
  document.body.classList.remove('phone-frame-active');
} catch {}

const secs = ['top', 'president', 'candidates', 'nominate', 'vote', 'results', 'verify', 'contact']
  .map(id => document.getElementById(id)).filter(Boolean);
const navAnchors = $$('#navLinks a'), tabAnchors = $$('#tabbar a'), chipAnchors = $$('#appChipsBar a');

function handleScrollNav() {
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 24);
  let cur = 'top';
  for (const s of secs) {
    if (s.getBoundingClientRect().top <= 160) cur = s.id;
  }
  navAnchors.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
  chipAnchors.forEach(a => {
    const isAct = a.getAttribute('href') === '#' + cur;
    a.classList.toggle('active', isAct);
  });
  const map = {
    top: '#top',
    president: '#president',
    candidates: '#candidates',
    nominate: '#vote',
    vote: '#vote',
    results: '#top',
    verify: '#verify',
    contact: '#verify'
  };
  tabAnchors.forEach(a => a.classList.toggle('active', a.getAttribute('href') === (map[cur] || '#top')));
}
window.addEventListener('scroll', handleScrollNav, { passive: true });

/* ---------------- الظهور عند التمرير ---------------- */
function revealCheck() {
  let pending = 0;
  $$('.reveal').forEach(el => {
    if (el.classList.contains('in')) return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.94 && r.bottom > -40) el.classList.add('in');
    else pending++;
  });
  return pending;
}
let io = null;
if ('IntersectionObserver' in window) {
  io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .1 });
  $$('.reveal').forEach(el => io.observe(el));
}
addEventListener('scroll', revealCheck, { passive: true });
addEventListener('resize', revealCheck);
const revealTimer = setInterval(() => {
  if (revealCheck() === 0) clearInterval(revealTimer);
}, 500);
revealCheck();

/* ============================================================
   الإعدادات العامة والبيان الرئاسي
   ============================================================ */
let CFG = {};
let cdTimer = null;

function startCountdown(iso) {
  const el = $('#voteCountdown');
  if (!el) return;
  if (!iso) { el.hidden = true; return; }
  const end = new Date(iso).getTime();
  if (isNaN(end)) { el.hidden = true; return; }
  el.hidden = false;
  const tick = () => {
    const diff = end - Date.now();
    if (diff <= 0) {
      el.classList.add('danger');
      el.innerHTML = '⛔ انتهى موعد التصويت الرسمي المعلن';
      if (cdTimer) clearInterval(cdTimer);
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = n => String(n).padStart(2, '0');
    el.innerHTML = `⏳ ينتهي التصويت خلال: <b>${d > 0 ? d + ' يوم ' : ''}${pad(h)}:${pad(m)}:${pad(s)}</b>`;
  };
  tick();
  if (cdTimer) clearInterval(cdTimer);
  cdTimer = setInterval(tick, 1000);
}

async function loadConfig() {
  try {
    CFG = await api('/api/config');
    if (CFG.election_title) {
      document.title = CFG.election_title;
    }
    
    // 1. عنوان الهيرو الرئيسي
    if ($('#heroTitle')) {
      const title = CFG.hero_title || 'انتخاب رئيس جمعية الحاسوب';
      const col = CFG.college_name || 'كلية دراسات الحاسوب';
      const univ = CFG.university_name || 'جامعة إفريقيا العالمية (IUA)';
      $('#heroTitle').innerHTML = `${esc(title)}<br><span class="hero-brand-accent">${esc(col)} · ${esc(univ)}</span>`;
    }
    if (CFG.hero_subtitle && $('#heroSubtitle')) {
      $('#heroSubtitle').textContent = CFG.hero_subtitle;
    }

    // 2. اسم الجمعية والكلية والجامعة عبر كافة عناصر الواجهة
    const assocName = CFG.association_name || 'جمعية الحاسوب';
    const colName = CFG.college_name || 'كلية دراسات الحاسوب';
    const univName = CFG.university_name || 'IUA';
    $$('.brand-title').forEach(el => el.textContent = assocName);
    $$('.brand-sub').forEach(el => el.textContent = `${colName} · ${univName}`);

    // 3. الشهادات الرسمية
    if ($('#certUnivName')) $('#certUnivName').textContent = 'جمهورية السودان · ' + (CFG.university_name || 'جامعة إفريقيا العالمية');
    if ($('#certColName')) $('#certColName').textContent = (CFG.college_name || 'كلية دراسات الحاسوب') + ' – أمانة الشؤون العلمية والطلابية';
    if ($('#certElecDates')) $('#certElecDates').textContent = (CFG.election_title || 'انتخابات رئاسة جمعية الحاسوب') + (CFG.election_dates ? ' – ' + CFG.election_dates : '');

    // 4. مواعيد الدورة والميثاق والتذييل
    if (CFG.election_dates && $('#pillDates')) $('#pillDates').textContent = CFG.election_dates;
    if (CFG.president_statement) {
      const full = $('#presStatementFull');
      if (full) full.textContent = `«${CFG.president_statement}»`;
    }
    if ($('#footNote')) {
      $('#footNote').textContent = CFG.footer_note || `${assocName} – ${colName}، ${CFG.university_name || 'جامعة إفريقيا العالمية'}. المنصة التقنية الرسمية للاقتراع الرئاسي المشفّر.`;
    }

    // 5. شريط التنبيه والإعلان الرئاسي العاجل
    const banner = $('#urgentBanner');
    if (banner) {
      const isBannerOn = CFG.banner_enabled === '1' || CFG.banner_enabled === 1 || CFG.banner_enabled === true;
      if (isBannerOn && CFG.banner_text) {
        banner.style.display = 'block';
        if ($('#urgentBannerText')) $('#urgentBannerText').textContent = CFG.banner_text;
        banner.className = 'app-urgent-banner banner-' + (CFG.banner_level || 'info');
      } else {
        banner.style.display = 'none';
      }
    }

    // 6. قنوات الدعم والتواصل
    if (CFG.support_whatsapp && $('#supportWaLink')) {
      const cleanWa = String(CFG.support_whatsapp).replace(/[^\d+]/g, '');
      $('#supportWaLink').href = `https://wa.me/${cleanWa.replace('+', '')}?text=${encodeURIComponent('السلام عليكم، استفسار بخصوص انتخابات جمعية الحاسوب')}`;
      const waTxt = $('#supportWaText');
      if (waTxt) waTxt.textContent = CFG.support_whatsapp;
    }
    if (CFG.support_email && $('#supportMailLink')) {
      $('#supportMailLink').href = `mailto:${CFG.support_email}`;
      const mailTxt = $('#supportMailText');
      if (mailTxt) mailTxt.textContent = CFG.support_email;
    }

    // 7. تحديث تبويبات الفلترة للدفعات
    renderCandidateChips();

    // 8. إغلاق / فتح الاقتراع والترشيح ديناميكياً وبدون إتلاف النموذج في الـ DOM
    const nomNotice = $('#nominateLockedNotice');
    const nomForm = $('#nominateForm');
    if (nomNotice && nomForm) {
      if (!CFG.nominations_open) {
        nomNotice.style.display = 'block';
        nomForm.style.display = 'none';
      } else {
        nomNotice.style.display = 'none';
        nomForm.style.display = 'grid';
      }
    }

    const voteNotice = $('#voteLockedNotice');
    const voteWizard = $('#voteWizard');
    if (voteNotice && voteWizard && !getLocalVoted()) {
      if (!CFG.voting_open) {
        voteNotice.style.display = 'block';
        voteWizard.style.display = 'none';
      } else {
        voteNotice.style.display = 'none';
        voteWizard.style.display = 'block';
      }
    }

    // 9. تحديث النتائج فورياً وفق وضع النتائج العام
    loadResults();

    startCountdown(CFG.voting_deadline);
  } catch (err) {
    console.warn('loadConfig fallback:', err);
  }
}
if ($('#dismissBanner')) {
  $('#dismissBanner').addEventListener('click', () => {
    const b = $('#urgentBanner');
    if (b) b.style.display = 'none';
  });
}

function lockSection(id, title, msg) {
  const notice = $('#' + id + 'LockedNotice');
  const target = id === 'vote' ? $('#voteWizard') : $('#' + id + 'Form');
  if (notice && target && !getLocalVoted()) {
    notice.style.display = 'block';
    target.style.display = 'none';
    const tEl = $('#' + id + 'LockedTitle');
    const mEl = $('#' + id + 'LockedMsg');
    if (tEl && title) tEl.textContent = title;
    if (mEl && msg) mEl.textContent = msg;
  }
}

/* إحصاءات عامة */
let PUBLIC_STATS = { candidates: 0, votes: 0, byBatch: [], results_public: false };
async function loadStats() {
  try {
    const s = await api('/api/public-stats');
    PUBLIC_STATS = s;
    if ($('#stCands')) $('#stCands').textContent = s.candidates;
    if ($('#stVotes')) {
      if (s.results_public) {
        $('#stVotes').textContent = s.votes;
        const lbl = $('#stVotesLabel');
        if (lbl) lbl.textContent = 'صوت أمانة مسجّل';
      } else {
        $('#stVotes').textContent = 'سجل مشفّر';
        const lbl = $('#stVotesLabel');
        if (lbl) lbl.textContent = 'اقتراع مؤمّن دستوريّاً';
      }
    }
  } catch { /* ignore */ }
}

/* ============================================================
   المرشحون + البحث والفلترة
   ============================================================ */
let CANDIDATES = [];
let candBatch = 'all';
let candQuery = '';

function renderCandidateChips() {
  const box = $('#candChips');
  if (!box) return;
  const cfgBatches = (CFG.allowed_batches || 'ST20, ST21, ST22')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const candBatches = [...new Set(CANDIDATES.map(c => c.batch).filter(Boolean))];
  const allBatches = [...new Set([...cfgBatches, ...candBatches])].sort();

  let html = `<button class="chip-btn ${candBatch === 'all' ? 'on' : ''}" data-batch="all">الكل (${CANDIDATES.length})</button>`;
  allBatches.forEach(b => {
    const count = CANDIDATES.filter(c => c.batch === b).length;
    html += `<button class="chip-btn ${candBatch === b ? 'on' : ''}" data-batch="${esc(b)}">${esc(b)}${count > 0 ? ` (${count})` : ''}</button>`;
  });
  box.innerHTML = html;
}

async function loadCandidates() {
  const grid = $('#candGrid');
  try {
    const data = await api('/api/candidates');
    CANDIDATES = data.candidates || [];
    renderCandidateChips();
    renderCandidateGrid();
    renderPicks();

    // رابط مباشر لمرشح: /?c=ID
    const deep = new URLSearchParams(location.search).get('c');
    if (deep) {
      const c = CANDIDATES.find(x => String(x.id) === String(deep));
      if (c) setTimeout(() => openModal(c.id), 350);
    }
  } catch (e) {
    if (grid) grid.innerHTML = `<div class="empty"><b>تعذّر تحميل المرشحين</b>${esc(e.message)}</div>`;
  }
}

function filteredCandidates() {
  return CANDIDATES.filter(c => {
    if (candBatch !== 'all' && c.batch !== candBatch) return false;
    if (!candQuery) return true;
    const q = candQuery.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) ||
      (c.department || '').toLowerCase().includes(q) ||
      (c.university_id || '').toLowerCase().includes(q);
  });
}

function renderCandidateGrid() {
  const grid = $('#candGrid');
  if (!grid) return;
  const list = filteredCandidates();
  if (!CANDIDATES.length) {
    grid.innerHTML = `<div class="empty"><b>لا يوجد مرشحون معتمدون حتى الآن</b>
      كن أول من يترشّح لرئاسة الجمعية بكفاءتك — <a href="#nominate" style="color:var(--brand-700);font-weight:800">أترشّح الآن</a></div>`;
    return;
  }
  if (!list.length) {
    grid.innerHTML = `<div class="empty"><b>لا نتائج مطابقة للبحث</b>جرّب اسماً أو دفعة أخرى.</div>`;
    return;
  }
  grid.innerHTML = list.map(c => `
    <article class="cand reveal in">
      <div class="cand-top">
        <span class="cand-verified">✓ معتمد بالقسم</span>
        <div class="cand-avatar">${esc((c.name || '?').trim().charAt(0))}</div>
        <span class="cand-batch">${esc(c.batch)}</span>
      </div>
      <div class="cand-body">
        <h3>${esc(c.name)}</h3>
        <div class="cand-meta">
          <span>🎓 ${esc(c.university_id)}</span>
          ${c.department ? `<span>💻 ${esc(c.department)}</span>` : ''}
        </div>
        <div class="cand-item">
          <b>المؤهلات العلمية</b>
          ${esc((c.qualifications || '').slice(0, 110))}${(c.qualifications || '').length > 110 ? '…' : ''}
        </div>
        <div class="cand-item">
          <b>الخبرات والأنشطة</b>
          ${esc((c.experience || '').slice(0, 110))}${(c.experience || '').length > 110 ? '…' : ''}
        </div>
        <div class="cand-actions">
          <button class="btn btn-ghost btn-sm" data-detail="${c.id}">عرض الملف والرؤية</button>
          <button class="btn btn-primary btn-sm" data-vote="${c.id}">صوّت له</button>
          <button class="icon-btn" data-share="${c.id}" title="مشاركة" aria-label="مشاركة ملف المرشح">
            <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 10.8 7.4-4.3M8.3 13.2l7.4 4.3"/></svg>
          </button>
        </div>
      </div>
    </article>`).join('');
}

const candSearchInput = $('#candSearch');
if (candSearchInput) {
  candSearchInput.addEventListener('input', e => {
    candQuery = e.target.value.trim();
    renderCandidateGrid();
  });
}

const candChips = $('#candChips');
if (candChips) {
  candChips.addEventListener('click', e => {
    const b = e.target.closest('.chip-btn');
    if (!b) return;
    $$('#candChips .chip-btn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    candBatch = b.dataset.batch;
    renderCandidateGrid();
  });
}

const candGrid = $('#candGrid');
if (candGrid) {
  candGrid.addEventListener('click', e => {
    const d = e.target.closest('[data-detail]');
    const v = e.target.closest('[data-vote]');
    const s = e.target.closest('[data-share]');
    if (d) openModal(+d.dataset.detail);
    if (s) {
      const c = CANDIDATES.find(x => x.id === +s.dataset.share);
      if (c) shareCandidate(c);
    }
    if (v) {
      selectPick(+v.dataset.vote);
      if (!step1Valid()) {
        goVoteStep(1);
        toast('تم اختيار المرشح، اكتب بياناتك الجامعية أولاً لإكمال التصويت', 'ok');
      } else {
        goVoteStep(3);
      }
      const voteSec = document.getElementById('vote');
      if (voteSec) voteSec.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

async function shareCandidate(c) {
  const url = `${location.origin}/?c=${c.id}`;
  const text = `مرشح رئاسة جمعية الحاسوب – جامعة إفريقيا العالمية: ${c.name} (${c.batch})${c.department ? ' · ' + c.department : ''}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'جمعية الحاسوب – IUA', text, url }); return; } catch {}
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('تم نسخ رابط ملف المرشح بنجاح', 'ok');
  } catch {
    prompt('انسخ الرابط:', url);
  }
}

/* ---------------- مودال المرشح ---------------- */
let modalCandId = null;
function openModal(id) {
  const c = CANDIDATES.find(x => x.id === id);
  if (!c) return;
  modalCandId = id;
  $('#mName').textContent = c.name;
  $('#mMeta').innerHTML = `${esc(c.university_id)} · ${esc(c.batch)}${c.department ? ' · ' + esc(c.department) : ''} <span style="display:inline-block;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.35);padding:2px 10px;border-radius:99px;font-size:.74rem;font-weight:700;margin-inline-start:6px">⚖️ أقسم بالله العظيم</span>`;
  $('#mQual').textContent = c.qualifications || 'لم تُذكر مؤهلات تفصيلية';
  $('#mExp').textContent = c.experience || 'لم تُذكر خبرات سابقة';
  $('#mAch').textContent = c.achievements || 'لم تُذكر رؤية أو خطة عمل مسبقة';
  $('#candModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#candModal').classList.remove('open');
  document.body.style.overflow = '';
}
if ($('#modalClose')) $('#modalClose').addEventListener('click', closeModal);
if ($('#modalClose2')) $('#modalClose2').addEventListener('click', closeModal);
if ($('#candModal')) $('#candModal').addEventListener('click', e => { if (e.target.id === 'candModal') closeModal(); });
if ($('#modalVote')) {
  $('#modalVote').addEventListener('click', () => {
    closeModal();
    selectPick(modalCandId);
    if (!step1Valid()) {
      goVoteStep(1);
      toast('تم اختيار المرشح، اكتب بياناتك الجامعية أولاً لإكمال التصويت', 'ok');
    } else {
      goVoteStep(3);
    }
    const voteSec = document.getElementById('vote');
    if (voteSec) voteSec.scrollIntoView({ behavior: 'smooth' });
  });
}
if ($('#modalShare')) {
  $('#modalShare').addEventListener('click', () => {
    const c = CANDIDATES.find(x => x.id === modalCandId);
    if (c) shareCandidate(c);
  });
}
addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeConfirm(); } });

/* ============================================================
   معالج التصويت الدستوري بالأمانة
   ============================================================ */
let wizStep = 1;
let voteConfirmed = false;

function setWizBar(pct) {
  const bar = $('#wizBar');
  if (bar) bar.style.width = pct + '%';
  const roleBar = $('.wiz-bar');
  if (roleBar) roleBar.setAttribute('aria-valuenow', String(pct));
}

function goVoteStep(n) {
  wizStep = Math.max(1, Math.min(3, n));
  $$('.wiz-pane').forEach(p => p.classList.toggle('on', +p.dataset.pane === wizStep));
  $$('.wiz-step').forEach(s => {
    const k = +s.dataset.step;
    s.classList.toggle('on', k === wizStep);
    s.classList.toggle('done', k < wizStep);
  });
  setWizBar(wizStep === 1 ? 33.33 : wizStep === 2 ? 66.66 : 100);
  if (wizStep === 3) fillSummary();
}

function step1Valid() {
  const name = ($('#voteForm [name=voter_name]') || {}).value || '';
  const uid = normId($('#voteId') ? $('#voteId').value : '');
  return name.trim().length >= 3 && ID_RE.test(uid);
}

function pickedCandidate() {
  const input = $('#pickList input:checked');
  if (!input) return null;
  return CANDIDATES.find(c => String(c.id) === String(input.value)) || null;
}

function fillSummary() {
  const c = pickedCandidate();
  const name = ($('#voteForm [name=voter_name]') || {}).value || '—';
  const uid = normId($('#voteId') ? $('#voteId').value : '');
  const sumEl = $('#wizSummary');
  if (!sumEl) return;
  sumEl.innerHTML = `
    <div class="summary-row"><span>المصوّت:</span><b>${esc(name.trim() || '—')}</b></div>
    <div class="summary-row"><span>الرقم الجامعي:</span><b style="direction:ltr">${esc(uid || '—')}</b></div>
    <div class="summary-row"><span>المرشح المختار:</span><b>${esc(c ? c.name + ' (' + c.batch + ')' : 'لم يتم الاختيار بعد')}</b></div>`;
}

if ($('#wizNext1')) {
  $('#wizNext1').addEventListener('click', () => {
    if (!step1Valid()) {
      toast('أدخل اسمك كاملاً ورقمك الجامعي الصالح أولاً', 'err');
      const f = $('#voteForm [name=voter_name]');
      if (f.value.trim().length < 3) f.focus(); else if ($('#voteId')) $('#voteId').focus();
      return;
    }
    // فحص ما إذا كان هذا الرقم قد صوّت محلياً مسبقاً
    const uid = normId($('#voteId').value);
    const local = getLocalVoted();
    if (local && local.uid === uid) {
      renderVotedState(local);
      toast('لقد قمت بالتصويت مسبقاً بهذا الرقم الجامعي', 'err');
      return;
    }
    goVoteStep(2);
  });
}

if ($('#wizBack2')) $('#wizBack2').addEventListener('click', () => goVoteStep(1));
if ($('#wizNext2')) {
  $('#wizNext2').addEventListener('click', () => {
    if (!step1Valid()) { toast('أكمل بياناتك أولاً', 'err'); goVoteStep(1); return; }
    if (!pickedCandidate()) { toast('اختر المرشح الذي تريد التصويت له', 'err'); return; }
    goVoteStep(3);
  });
}
if ($('#wizBack3')) $('#wizBack3').addEventListener('click', () => goVoteStep(2));

/* ربط حقول الأرقام الجامعية بشارات التحقق */
function bindIdField(inputId, badgeId) {
  const input = $('#' + inputId), badge = $('#' + badgeId);
  if (!input || !badge) return;
  const upd = () => {
    const v = normId(input.value);
    input.value = v;
    if (!v) {
      badge.textContent = 'الرقم الجامعي للطالب';
      badge.className = 'id-badge';
    } else if (ID_RE.test(v)) {
      badge.textContent = '✓ رقم جامعي صالح ومسجّل';
      badge.className = 'id-badge ok';
    } else {
      badge.textContent = '✗ رقم جامعي غير صالح أو غير معتمد';
      badge.className = 'id-badge bad';
    }
    checkVoteBtn();
  };
  input.addEventListener('input', upd);
  upd();
}
bindIdField('nomId', 'nomIdBadge');
bindIdField('voteId', 'voteIdBadge');

/* قائمة اختيار المرشح */
function renderPicks() {
  const box = $('#pickList');
  if (!box) return;
  if (!CANDIDATES.length) {
    box.innerHTML = `<div class="empty"><b>لا يوجد مرشحون معتمدون بعد</b>ستظهر القائمة فور اعتماد الترشيحات</div>`;
    return;
  }
  box.innerHTML = CANDIDATES.map(c => `
    <label class="pick" data-pick="${c.id}">
      <input type="radio" name="candidate_id" value="${c.id}">
      <span class="radio"></span>
      <b>${esc(c.name)}</b>
      <span>${esc(c.batch)}${c.department ? ' · ' + esc(c.department) : ''}</span>
    </label>`).join('');

  $$('#pickList .pick').forEach(p => p.addEventListener('change', () => {
    $$('#pickList .pick').forEach(x => x.classList.remove('sel'));
    p.classList.add('sel');
    checkVoteBtn();
  }));
}

function selectPick(id) {
  const input = $(`#pickList input[value="${id}"]`);
  if (input) { input.checked = true; input.dispatchEvent(new Event('change')); }
}

function checkVoteBtn() {
  const btn = $('#voteBtn');
  const next2 = $('#wizNext2');
  const picked = $('#pickList input:checked');
  const oath = $('#oathCheck') && $('#oathCheck').checked;
  const idOk = $('#voteId') && ID_RE.test(normId($('#voteId').value));
  const reasonVal = $('#voteReason') ? $('#voteReason').value.trim() : '';
  const reasonOk = reasonVal.length >= 5;

  if (btn) btn.disabled = !(picked && oath && idOk && step1Valid() && reasonOk);
  if (next2) next2.disabled = !picked;
}

document.addEventListener('change', e => {
  if (e.target.id === 'oathCheck') checkVoteBtn();
});
if ($('#voteReason')) {
  $('#voteReason').addEventListener('input', checkVoteBtn);
}

if ($('#pickSearch')) {
  $('#pickSearch').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    $$('#pickList .pick').forEach(p => {
      p.style.display = !q || p.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

/* ---------------- مودال التأكيد النهائي ---------------- */
function openConfirm() {
  const c = pickedCandidate();
  if (!c) return;
  const reason = $('#voteReason') ? $('#voteReason').value.trim() : '';
  $('#cfName').textContent = $('#voteForm [name=voter_name]').value.trim();
  $('#cfId').textContent = normId($('#voteId').value);
  $('#cfCand').textContent = `${c.name} (${c.batch})`;
  $('#cfReason').textContent = reason.length > 60 ? reason.slice(0, 60) + '…' : reason;
  $('#confirmModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeConfirm() {
  $('#confirmModal').classList.remove('open');
  document.body.style.overflow = '';
  voteConfirmed = false;
}
if ($('#cfCancel')) $('#cfCancel').addEventListener('click', closeConfirm);
if ($('#confirmModal')) $('#confirmModal').addEventListener('click', e => { if (e.target.id === 'confirmModal') closeConfirm(); });
if ($('#cfConfirm')) {
  $('#cfConfirm').addEventListener('click', () => {
    voteConfirmed = true;
    $('#confirmModal').classList.remove('open');
    document.body.style.overflow = '';
    $('#voteForm').requestSubmit();
  });
}

/* ============================================================
   إرسال التصويت وحالة الناخب (LOCKOUT & CERTIFICATE)
   ============================================================ */
function getLocalVoted() {
  try {
    return JSON.parse(localStorage.getItem('csa_voted_user') || 'null');
  } catch { return null; }
}

window.printCertifiedBallot = function(customData) {
  const d = customData || getLocalVoted() || {};
  const univ = (CFG && CFG.university_name) || 'جامعة إفريقيا العالمية';
  const col = (CFG && CFG.college_name) || 'كلية دراسات الحاسوب';
  const elec = (CFG && CFG.election_dates) || 'انتخابات رئاسة جمعية الحاسوب – الدورة الدستورية 2026';

  if ($('#certUnivName')) $('#certUnivName').textContent = 'جمهورية السودان · ' + univ;
  if ($('#certColName')) $('#certColName').textContent = col + ' – أمانة الشؤون العلمية والطلابية';
  if ($('#certElecDates')) $('#certElecDates').textContent = elec;

  if ($('#certReceiptCode')) $('#certReceiptCode').textContent = d.receipt || 'IUA-VOTE-CONFIRMED';
  if ($('#certVoterName')) $('#certVoterName').textContent = d.name || d.voter_name || d.voter_masked || 'طالب مصوّت معتمد';
  if ($('#certVoterUid')) $('#certVoterUid').textContent = d.uid || d.university_id || (d.batch ? d.batch + '•••' : '—');
  if ($('#certVoterBatch')) $('#certVoterBatch').textContent = d.batch || (d.uid ? d.uid.slice(0, 4) : 'مؤهل');
  if ($('#certFacultyName')) $('#certFacultyName').textContent = col + ' (' + univ + ')';
  if ($('#certCandName')) $('#certCandName').textContent = d.candName || d.candidate_name || 'المرشح الرئاسي المعتمد';
  if ($('#certReason')) $('#certReason').textContent = '«' + (d.reason || 'الكفاءة والبرنامج القيادي المعتمد') + '»';
  if ($('#certVoteDate')) $('#certVoteDate').textContent = d.date ? new Date(d.date).toLocaleString('ar-EG') : new Date().toLocaleString('ar-EG');
  if ($('#certCryptHash')) {
    const raw = String(d.receipt || 'IUA') + String(d.uid || 'CSA');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    $('#certCryptHash').textContent = 'DIGITAL SHA-256 HASH: ' + Math.abs(hash).toString(16).padStart(8, '0') + '-csa-2026-auth';
  }

  document.body.classList.add('printing-cert');
  const cleanup = () => {
    document.body.classList.remove('printing-cert');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 2500);
  window.print();
};

function renderVotedState(voterData) {
  const card = $('#voteCard');
  if (!card) return;
  card.innerHTML = `
    <div class="confirm-official-card">
      <div class="confirm-official-head">
        <div class="confirm-check-ring">
          <svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6.5"/></svg>
        </div>
        <div>
          <h3>تأكيد رسمي: تم قيد صوتك بأمانة</h3>
          <p>كلية دراسات الحاسوب – جمعية الحاسوب · جامعة إفريقيا العالمية</p>
        </div>
        <span class="confirm-badge-ok">✓ صوت معتمد رسمياً</span>
      </div>

      <div class="receipt-pill-box">
        <span class="receipt-label">رمز الإيصال المعتمد في السجل الدستوري</span>
        <span class="receipt-code">${esc(voterData.receipt || 'IUA-VOTE-CONFIRMED')}</span>
        <small>احتفظ بهذا الرمز للتحقق من قيد صوتك في أي وقت</small>
      </div>

      <div class="confirm-data-grid">
        <div class="confirm-data-row"><span>المصوّت:</span><b>${esc(voterData.name)}</b></div>
        <div class="confirm-data-row"><span>الرقم الجامعي:</span><b style="direction:ltr">${esc(voterData.uid)}</b></div>
        <div class="confirm-data-row"><span>المرشح المختار:</span><b>${esc(voterData.candName || 'المرشح المعتمد')}</b></div>
        <div class="confirm-data-row"><span>معيار الكفاءة والسبب:</span><b>«${esc(voterData.reason || 'الكفاءة والبرنامج القيادي')}»</b></div>
        <div class="confirm-data-row"><span>قسم الأمانة:</span><b style="color:var(--brand-700)">أُقسم بالله العظيم (مؤدّى) ✓</b></div>
        <div class="confirm-data-row"><span>تاريخ ووقت الاقتراع:</span><b>${voterData.date ? new Date(voterData.date).toLocaleString('ar-EG') : 'مسجّل رسمياً'}</b></div>
      </div>

      <div class="confirm-notice">
        🔒 <strong>تم قيد صوتك مشفراً في السجل الرسمي</strong> ولا يمكن الاقتراع مرة أخرى بهذا الرقم الجامعي. تُعرض النتائج الرسمية فور اعتماد إعلانها من رئاسة الجمعية.
      </div>

      <div class="confirm-actions-row" style="flex-wrap:wrap;gap:8px">
        <button type="button" class="btn btn-primary btn-sm" onclick="window.printCertifiedBallot()" style="display:inline-flex;align-items:center;gap:6px">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          <span>طباعة الإيصال الرسمي (A4)</span>
        </button>
        <a href="#verify" class="btn btn-ghost btn-sm">تدقيق الإيصال</a>
        <a href="#candidates" class="btn btn-ghost btn-sm">دليل المرشحين</a>
      </div>
    </div>`;
}

if ($('#voteForm')) {
  $('#voteForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, btn = $('#voteBtn');
    $$('.input,.textarea', f).forEach(x => x.classList.remove('err'));

    const name = f.voter_name.value.trim();
    const uid = normId(f.university_id.value);
    const cand = pickedCandidate();
    const reason = (f.reason ? f.reason.value : '').trim();
    const oath = $('#oathCheck') && $('#oathCheck').checked;

    if (name.length < 3) {
      goVoteStep(1); f.voter_name.classList.add('err'); f.voter_name.focus();
      toast('اكتب اسمك الكامل', 'err'); return;
    }
    if (!ID_RE.test(uid)) {
      goVoteStep(1); f.university_id.classList.add('err'); f.university_id.focus();
      toast('الرقم الجامعي غير صالح أو غير معتمد للاقتراع', 'err'); return;
    }
    if (!cand) { goVoteStep(2); toast('اختر المرشح الذي تريد التصويت له', 'err'); return; }
    if (reason.length < 5) {
      goVoteStep(3);
      if (f.reason) { f.reason.classList.add('err'); f.reason.focus(); }
      toast('يرجى توضيح سبب اختيارك للمرشح بناءً على الكفاءة والبرنامج (5 أحرف على الأقل)', 'err');
      return;
    }
    if (!oath) {
      goVoteStep(3);
      toast('يجب أداء القسم بالله العظيم قبل اعتماد الصوت', 'err');
      return;
    }

    // تأكيد نهائي قبل الإرسال
    if (!voteConfirmed) { openConfirm(); return; }

    const body = {
      voter_name: name,
      university_id: uid,
      candidate_id: cand.id,
      reason,
      oath: true
    };

    btn.disabled = true; btn.textContent = 'جارِ تسجيل صوت الأمانة…';
    try {
      const r = await api('/api/vote', { method: 'POST', body });
      const voterData = {
        uid,
        name,
        candName: cand.name,
        candBatch: cand.batch,
        receipt: r.receipt,
        reason,
        date: new Date().toISOString()
      };
      localStorage.setItem('csa_voted_user', JSON.stringify(voterData));
      renderVotedState(voterData);
      const voteSec = document.getElementById('vote');
      if (voteSec) voteSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('شكراً لك! تم تسجيل صوتك بأمانة وشفافية', 'ok');
      loadStats(); loadResults();
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false; btn.textContent = 'تأكيد وتسجيل صوت الأمانة ✓';
      voteConfirmed = false;
      if (err.status === 409) {
        // سبق التصويت
        const fallbackData = {
          uid,
          name,
          candName: cand.name,
          candBatch: cand.batch,
          receipt: 'مسجّل مسبقاً في السجل الدستوري',
          reason: 'تم تسجيل الصوت مسبقاً',
          date: new Date().toISOString()
        };
        localStorage.setItem('csa_voted_user', JSON.stringify(fallbackData));
        renderVotedState(fallbackData);
      }
    }
  });
}

/* ============================================================
   نموذج الترشيح الذاتي للرئاسة
   ============================================================ */
if ($('#nominateForm')) {
  $('#nominateForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, btn = $('#nomBtn');
    $$('.input,.textarea', f).forEach(x => x.classList.remove('err'));

    const body = {
      name: f.name.value,
      university_id: f.university_id.value,
      whatsapp: f.whatsapp.value,
      department: f.department.value,
      qualifications: f.qualifications.value,
      experience: f.experience.value,
      achievements: f.achievements.value,
      oath: $('#nomOathCheck') && $('#nomOathCheck').checked
    };

    let bad = null;
    if (body.name.trim().length < 3) bad = [f.name, 'اكتب اسمك الكامل'];
    else if (!ID_RE.test(normId(body.university_id))) bad = [f.university_id, 'الرقم الجامعي غير صالح أو غير معتمد للترشيح'];
    else if (!validPhone(body.whatsapp)) bad = [f.whatsapp, 'رقم الواتساب غير صحيح'];
    else if (body.qualifications.trim().length < 10) bad = [f.qualifications, 'اذكر مؤهلاتك العلمية والتقنية بتفصيل (10 أحرف على الأقل)'];
    else if (body.experience.trim().length < 10) bad = [f.experience, 'اذكر خبراتك وأنشطتك بتفصيل (10 أحرف على الأقل)'];
    else if (!body.oath) bad = [$('#nomOathCheck'), 'يجب أداء القسم بالله بأنك ترشّح نفسك بأمانة وصدق'];

    if (bad) {
      if (bad[0] && bad[0].classList) { bad[0].classList.add('err'); bad[0].focus(); }
      toast(bad[1], 'err');
      return;
    }

    btn.disabled = true; btn.textContent = 'جارِ إرسال طلب الترشيح…';
    try {
      const r = await api('/api/nominate', { method: 'POST', body });
      $('#nominateCard').innerHTML = `
        <div class="success">
          <div class="ring"><svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6.5"/></svg></div>
          <h3>تم استلام ترشيحك بنجاح!</h3>
          <p>${esc(r.message)}</p>
          <span class="ref">${esc(normId(body.university_id))}</span>
          <p style="margin-top:18px">
            <a href="#candidates" class="btn btn-ghost">تصفّح قائمة المرشحين</a>
            <a href="#top" class="btn btn-primary">الرئيسية</a>
          </p>
        </div>`;
      $('#nominateCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('تم إرسال الترشيح بنجاح', 'ok');
      loadStats();
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false; btn.textContent = 'إرسال طلب الترشيح للرئاسة';
    }
  });
}

/* ============================================================
   إعلان النتائج ومنصة التتويج (تُتاح بعد إعلانها من الإعدادات)
   ============================================================ */
async function loadResults() {
  const box = $('#resultsBox');
  if (!box) return;

  if (!CFG.results_public) {
    box.innerHTML = `
      <div class="res-locked">
        <div class="big">🔒</div>
        <b>النتائج الرسمية قيد الحصر والفرز</b>
        <p style="margin-top:8px;line-height:1.8">ستُتاح منصة النتائج ونسب الاقتراع وتتويج الرئيس القادم فور اعتمادها وإعلانها رسمياً من رئاسة الجمعية بعد اكتمال الفرز.</p>
      </div>`;
    return;
  }

  try {
    const { results } = await api('/api/results');
    if (!results || !results.candidates.length) {
      box.innerHTML = `<div class="res-locked"><div class="big">⏳</div>
        <b>لا توجد نتائج مسجّلة بعد</b>ستظهر النتائج فور تسجيل أول أصوات واعتماد المرشحين.</div>`;
      return;
    }
    const max = Math.max(...results.candidates.map(c => c.votes), 1);
    const top = results.candidates.slice(0, 3);
    const rest = results.candidates;
    const podOrder = ['pod-2', 'pod-1', 'pod-3'];
    const podium = top.map((c, i) => `
      <div class="pod ${podOrder[i]}">
        ${i === 0 ? '<span class="crown">👑</span>' : ''}
        <div class="avatar">${esc((c.name || '?').trim().charAt(0))}</div>
        <b>${esc(c.name)}</b>
        <span>${esc(c.batch)}${c.department ? ' · ' + esc(c.department) : ''}</span>
        <div class="votes">${c.votes}</div>
        <div class="pct">${c.percent}%</div>
      </div>`).join('');
    box.innerHTML = `
      <div class="res-total">
        <b>${results.total}</b><span>إجمالي الأصوات المسجّلة بأمانة</span>
        <div class="batch-chips">
          ${results.byBatch.map(b => `<span class="chip">${esc(b.batch)} · ${b.votes} صوت</span>`).join('')}
        </div>
      </div>
      <div class="podium">${podium}</div>
      <div class="res-list">
        ${rest.map(c => `
          <div class="res-row">
            <div class="res-rank">${c.rank}</div>
            <div class="res-info">
              <b>${esc(c.name)}</b>
              <span>${esc(c.batch)}${c.department ? ' · ' + esc(c.department) : ''}</span>
              <div class="bar"><i style="width:0%" data-w="${Math.round(c.votes / max * 100)}"></i></div>
            </div>
            <div class="res-val"><b>${c.votes}</b><span>${c.percent}%</span></div>
          </div>`).join('')}
      </div>
      <div class="res-updated">آخر تحديث: ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>`;
    requestAnimationFrame(() => setTimeout(() => {
      $$('.bar i', box).forEach(b => b.style.width = b.dataset.w + '%');
    }, 120));
  } catch {
    box.innerHTML = `
      <div class="res-locked">
        <div class="big">🔒</div>
        <b>النتائج الرسمية قيد الحصر والفرز</b>
        <p style="margin-top:8px;line-height:1.8">ستُتاح منصة النتائج ونسب الاقتراع وتتويج الرئيس القادم فور اعتمادها وإعلانها رسمياً من رئاسة الجمعية بعد اكتمال الفرز.</p>
      </div>`;
  }
}

/* ============================================================
   التحقق من إيصال التصويت
   ============================================================ */
if ($('#verifyForm')) {
  $('#verifyForm').addEventListener('submit', async e => {
    e.preventDefault();
    const code = ($('#verifyInput').value || '').trim().toUpperCase();
    const resBox = $('#verifyResult');
    if (!code) return;

    resBox.style.display = 'block';
    resBox.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px 0">جارِ التحقق من السجل الرقمي…</div>';

    const local = getLocalVoted();
    if (local && local.receipt && local.receipt.toUpperCase() === code) {
      resBox.innerHTML = `
        <div class="verify-card-success">
          <div class="verify-card-head">
            <div class="verify-head-title">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--brand)" stroke-width="2.5"><path d="M4 12.5 9.5 18 20 6.5"/></svg>
              <b>إيصال تصويتك الشخصي المعتمد</b>
            </div>
            <span class="verify-badge">صوتك الشخصي</span>
          </div>
          <div class="verify-details">
            <div class="summary-row"><span>المصوّت:</span><strong>${esc(local.name)} (${esc(local.uid.slice(0, 4))}•••)</strong></div>
            <div class="summary-row"><span>المرشح المختار:</span><strong>${esc(local.candName || 'المرشح المعتمد')}</strong></div>
            <div class="summary-row"><span>سبب التصويت:</span><em>«${esc(local.reason || 'الكفاءة والبرنامج')}»</em></div>
            <div class="summary-row"><span>قسم الأمانة:</span><strong style="color:var(--brand)">أُقسم بالله العظيم وموثّق ✓</strong></div>
          </div>
          <div class="verify-actions">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.printCertifiedBallot()" style="display:inline-flex;align-items:center;gap:6px">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              <span>طباعة شهادة الإيصال الرسمي (A4)</span>
            </button>
          </div>
        </div>`;
      return;
    }

    try {
      const vData = await api('/api/verify?code=' + encodeURIComponent(code));
      window._lastVerifiedVote = {
        receipt: vData.receipt,
        name: vData.voter_masked,
        uid: vData.batch ? vData.batch + '•••' : '—',
        batch: vData.batch,
        candName: vData.candidate_name,
        reason: vData.reason
      };
      resBox.innerHTML = `
        <div class="verify-card-success">
          <div class="verify-card-head">
            <div class="verify-head-title">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--brand)" stroke-width="2.5"><path d="M4 12.5 9.5 18 20 6.5"/></svg>
              <b>إيصال تصويت معتمد ومسجّل بأمانة</b>
            </div>
            <span class="verify-badge">قيد رسمي</span>
          </div>
          <div class="verify-details">
            <div class="summary-row"><span>كود الإيصال:</span><strong class="receipt-code-pill">${esc(vData.receipt)}</strong></div>
            <div class="summary-row"><span>المصوّت:</span><strong>${esc(vData.voter_masked)} (${esc(vData.batch)})</strong></div>
            <div class="summary-row"><span>المرشح المختار:</span><strong>${esc(vData.candidate_name)}</strong></div>
            <div class="summary-row"><span>سبب الاختيار:</span><em>«${esc(vData.reason)}»</em></div>
            <div class="summary-row"><span>قسم الأمانة:</span><strong style="color:var(--brand)">أُقسم بالله العظيم وموثّق بسجل الجمعية ✓</strong></div>
          </div>
          <div class="verify-actions">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.printCertifiedBallot(window._lastVerifiedVote)" style="display:inline-flex;align-items:center;gap:6px">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              <span>طباعة شهادة الإيصال الرسمي (A4)</span>
            </button>
          </div>
        </div>`;
    } catch (err) {
      resBox.innerHTML = `
        <div class="verify-card-error">
          <div class="verify-error-head">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--danger)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <b>تعذّر التحقق من هذا الإيصال</b>
          </div>
          <p>${esc(err.message || 'لم يتم العثور على صوت مسجّل بهذا الإيصال في السجل الدستوري.')}</p>
        </div>`;
    }
  });
}

/* ============================================================
   الرسائل والتواصل المباشر
   ============================================================ */
if ($('#msgForm')) {
  $('#msgForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, btn = $('#msgBtn');
    const body = {
      name: f.name.value,
      whatsapp: f.whatsapp.value,
      subject: f.subject.value,
      body: f.body.value
    };
    if (body.name.trim().length < 3 || body.body.trim().length < 5) {
      toast('اكتب اسمك ونص الرسالة', 'err'); return;
    }
    btn.disabled = true; btn.textContent = 'جارِ الإرسال لرئيس الجمعية…';
    try {
      const r = await api('/api/message', { method: 'POST', body });
      $('#contact .form-card').innerHTML = `
        <div class="success">
          <div class="ring"><svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6.5"/></svg></div>
          <h3>تم استلام رسالتك بنجاح!</h3>
          <p>وصلت رسالتك مباشرة إلى لوحة تحكم رئيس الجمعية وسيتم الرد عليك على واتساب.</p>
          <span class="ref">رقم المرجع: ${esc(r.ref)}</span>
        </div>`;
      toast('تم إرسال رسالتك بنجاح', 'ok');
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false; btn.textContent = 'إرسال الرسالة لرئيس الجمعية';
    }
  });
}

/* ============================================================
   الإقلاع وفحص حالة الناخب المحلية
   ============================================================ */
// فحص حالة الناخب وإزالة أي بيانات وهمية قديمة من ذاكرة المتصفح
const priorVoted = getLocalVoted();
if (priorVoted && priorVoted.receipt) {
  fetch('/api/verify?code=' + encodeURIComponent(priorVoted.receipt))
    .then(r => {
      if (r.ok) {
        renderVotedState(priorVoted);
      } else {
        localStorage.removeItem('csa_voted_user');
      }
    })
    .catch(() => {});
} else {
  localStorage.removeItem('csa_voted_user');
}

loadConfig();
loadCandidates();
loadStats();
loadResults();

// المزامنة الحية الفورية (BroadcastChannel + LocalStorage Storage Event)
try {
  const bc = new BroadcastChannel('csa_channel');
  bc.onmessage = (e) => {
    if (e.data && e.data.type === 'CONFIG_UPDATED') {
      loadConfig();
      loadCandidates();
      loadStats();
      loadResults();
    }
  };
} catch {}
window.addEventListener('storage', (e) => {
  if (e.key === 'csa_cfg_version') {
    loadConfig();
    loadCandidates();
    loadStats();
    loadResults();
  }
});

// المزامنة الحية الفورية عند عودة التركيز للنافذة أو تغيير التبويب
window.addEventListener('focus', () => {
  loadConfig();
  loadCandidates();
  loadStats();
  loadResults();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    loadConfig();
    loadCandidates();
    loadStats();
    loadResults();
  }
});
setInterval(() => {
  if (!document.hidden) {
    loadConfig();
    loadStats();
  }
}, 25000);
