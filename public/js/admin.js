/* ============================================================
   جمعية الحاسوب – IUA | لوحة التحكم الكاملة
   ============================================================ */
'use strict';
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let TOKEN = localStorage.getItem('csa_admin_token') || sessionStorage.getItem('iua_token') || '';

function toast(msg, type = 'ok') {
  const wrap = $('#toast-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .35s'; el.style.opacity = '0';
    setTimeout(() => el.remove(), 360);
  }, 3600);
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
};

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
        ...(opts.headers || {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  } catch (netErr) {
    throw Object.assign(new Error('تعذّر الاتصال بخادم النظام. يرجى التأكد من تشغيل الخادم.'), { status: 0 });
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && path !== '/api/admin/login') { logoutLocal(); throw new Error('انتهت الجلسة، سجّل الدخول مجدداً'); }
  if (!res.ok) {
    const err = new Error(data.error || 'حدث خطأ في العملية');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ============================================================
   تسجيل الدخول
   ============================================================ */
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#loginBtn'), err = $('#loginErr');
  err.textContent = '';
  btn.disabled = true; btn.textContent = 'جارِ التحقق…';
  try {
    const r = await api('/api/admin/login', { method: 'POST', body: { password: $('#loginPass').value } });
    TOKEN = r.token;
    localStorage.setItem('csa_admin_token', TOKEN);
    sessionStorage.setItem('iua_token', TOKEN);
    enterApp();
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false; btn.textContent = 'دخول';
    $('#loginPass').value = ''; $('#loginPass').focus();
  }
});
function logoutLocal() {
  TOKEN = '';
  localStorage.removeItem('csa_admin_token');
  sessionStorage.removeItem('iua_token');
  $('#adminApp').classList.remove('on');
  $('#loginVeil').classList.remove('hide');
}
$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST' }); } catch {}
  logoutLocal();
  toast('تم تسجيل الخروج', 'ok');
});

async function enterApp() {
  $('#loginVeil').classList.add('hide');
  $('#adminApp').classList.add('on');
  try {
    const me = await api('/api/admin/me');
    applySettings(me.settings);
    renderKpis(me.stats);
  } catch (ex) { toast(ex.message, 'err'); }
  loadAll();
}
function checkDefaultPw() {
  // التنبيه الحقيقي يأتي من /api/admin/security (defaultPasswordInUse)
  api('/api/admin/security').then(r => {
    const banner = $('#pwBanner');
    if (!banner) return;
    banner.classList.toggle('hidden', !r.security.defaultPasswordInUse);
    const b = $('#bSec');
    if (b && r.security.defaultPasswordInUse) b.classList.remove('hidden');
  }).catch(() => {});
}

/* ============================================================
   التنقل بين الصفحات
   ============================================================ */
const PAGE_META = {
  dash:    ['نظرة عامة', 'ملخص حالة الانتخابات لحظياً'],
  cands:   ['المرشحون', 'مراجعة الترشيحات: قبول، رفض، تعديل، حذف — مع IP ورقم الواتساب'],
  votes:   ['الأصوات والنتائج', 'كل صوت مسجّل مع المصوّت و IP — نتائج متقدمة وتصدير'],
  msgs:    ['الردود والاستفسارات', 'إدارة رسائل الطلاب والرد عليها'],
  audit:   ['سجل الإجراءات و IP', 'كل من قام بإجراء في الموقع: ترشيح، تصويت، تعديل — مع IP'],
  security:['مركز الأمان', 'حالة الحماية، الجلسات النشطة، ومحاولات الدخول الفاشلة'],
  export:  ['تصدير البيانات', 'تنزيل ملفات CSV للتحقق من الأمانة'],
  settings:['الإعدادات', 'تحكم كامل بأبواب الموقع ونصوصه وكلمة المرور']
};
$$('.side .nav-i[data-p]').forEach(a => a.addEventListener('click', () => goPage(a.dataset.p)));
$$('[data-go]').forEach(b => b.addEventListener('click', () => goPage(b.dataset.go)));
function goPage(p) {
  $$('.side .nav-i').forEach(x => x.classList.toggle('on', x.dataset.p === p));
  $$('.pg').forEach(s => s.classList.toggle('hidden', s.id !== 'p-' + p));
  const m = PAGE_META[p];
  $('#pageTitle').textContent = m[0];
  $('#pageSub').textContent = m[1];
  if (p === 'votes') loadVotes();
  if (p === 'msgs') loadMessages();
  if (p === 'audit') loadAudit();
  if (p === 'cands') loadCandidates();
  if (p === 'security') loadSecurity();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   التحديث العام
   ============================================================ */
async function loadAll() {
  try {
    const st = await api('/api/admin/stats');
    renderKpis(st);
    const cfg = await api('/api/admin/me');
    applySettings(cfg.settings);
  } catch {}
  checkDefaultPw();
  loadCandidates();
  loadAudit(); // يملأ أيضاً قسم «آخر النشاطات» في نظرة عامة
}
$('#refreshBtn').addEventListener('click', () => { loadAll(); toast('تم التحديث', 'ok'); });

function renderKpis(s) {
  $('#kpiBox').innerHTML = `
    <div class="kpi"><b>${s.candidatesTotal}</b><span>إجمالي الترشيحات</span></div>
    <div class="kpi ${s.candidatesPending ? 'warn' : ''}"><b>${s.candidatesPending}</b><span>بانتظار المراجعة</span></div>
    <div class="kpi"><b>${s.candidatesApproved}</b><span>مرشح معتمد</span></div>
    <div class="kpi"><b>${s.votesTotal}</b><span>إجمالي الأصوات</span></div>
    <div class="kpi"><b>${s.uniqueIps}</b><span>عناوين IP مختلفة</span></div>
    <div class="kpi ${s.messagesNew ? 'warn' : ''}"><b>${s.messagesNew}</b><span>رسائل جديدة</span></div>`;
  // شارات الشريط الجانبي
  const bc = $('#bCand'), bm = $('#bMsg');
  if (s.candidatesPending > 0) { bc.textContent = s.candidatesPending; bc.classList.remove('hidden'); }
  else bc.classList.add('hidden');
  if (s.messagesNew > 0) { bm.textContent = s.messagesNew; bm.classList.remove('hidden'); }
  else bm.classList.add('hidden');
  // شارات الأصوات
  $('#voteKpi').innerHTML = `
    <div class="kpi"><b>${s.votesTotal}</b><span>إجمالي الأصوات</span></div>
    <div class="kpi"><b>${s.votesST20}</b><span>أصوات ST20</span></div>
    <div class="kpi"><b>${s.votesST21}</b><span>أصوات ST21</span></div>
    <div class="kpi"><b>${s.votesST22}</b><span>أصوات ST22</span></div>
    <div class="kpi"><b>${s.uniqueIps}</b><span>IP مسجّلة</span></div>
    <div class="kpi"><b>${s.auditTotal}</b><span>إجراء مسجّل</span></div>`;
  renderBatchChart(s);
}

/* رسم بسيط لتوزيع الأصوات حسب الدفعة */
function renderBatchChart(s) {
  const box = $('#batchChart');
  if (!box) return;
  const rows = [
    ['ST20', s.votesST20], ['ST21', s.votesST21], ['ST22', s.votesST22]
  ];
  const max = Math.max(...rows.map(r => r[1]), 1);
  box.innerHTML = `
    <div style="display:grid;gap:14px">
      ${rows.map(([b, n]) => `
        <div style="display:grid;grid-template-columns:56px 1fr 64px;gap:12px;align-items:center">
          <span class="tag blue" style="justify-self:start">${b}</span>
          <div class="bar" style="margin:0;height:12px"><i style="width:${Math.round(n / max * 100)}%"></i></div>
          <b style="font-variant-numeric:tabular-nums;text-align:left">${n}</b>
        </div>`).join('')}
    </div>
    <p class="mini" style="margin-top:14px">الإجمالي: ${s.votesTotal} صوت · أعلى مشاركة: ${rows.slice().sort((a, b) => b[1] - a[1])[0][0]}</p>`;
}

/* ============================================================
   المرشحون
   ============================================================ */
let candFilter = 'all';
$('#candTabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#candTabs button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  candFilter = b.dataset.s;
  loadCandidates();
});
async function loadCandidates() {
  try {
    const r = await api('/api/admin/candidates?status=' + candFilter);
    const rows = r.candidates;
    if (!rows.length) {
      $('#candRows').innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--ink-3);padding:28px">لا توجد سجلات في هذا التصنيف</td></tr>`;
      return;
    }
    const tag = s => s === 'approved' ? '<span class="tag ok">معتمد</span>'
      : s === 'rejected' ? '<span class="tag rej">مرفوض</span>'
      : '<span class="tag pend">بانتظار</span>';
    $('#candRows').innerHTML = rows.map(c => `
      <tr>
        <td>${tag(c.status)}</td>
        <td>
          <strong>${esc(c.name)}</strong>
          <span class="tag ok" style="font-size:.66rem;margin-top:3px;display:inline-block">⚖️ أقسم بالله العظيم</span>
          <span class="mini">أُضيف: ${fmtDate(c.created_at)}</span>
        </td>
        <td><span class="mono">${esc(c.university_id)}</span></td>
        <td><span class="tag blue">${esc(c.batch)}</span></td>
        <td><span class="mono">${esc(c.whatsapp)}</span>
            <a class="mini" style="color:var(--brand-700);font-weight:700" target="_blank"
               href="https://wa.me/${esc(String(c.whatsapp).replace(/[^\d]/g, '').replace(/^0/, '249'))}">↗ واتساب</a></td>
        <td style="max-width:280px"><span class="mini">${esc((c.qualifications || '').slice(0, 90))}…</span>
            <span class="mini">${esc((c.experience || '').slice(0, 90))}…</span></td>
        <td>
          <span class="mono">${esc(c.ip)}</span>
          ${c.device ? `<span class="tag ${c.device.isMobile ? 'blue' : 'pend'}" style="margin-top:3px;font-size:.68rem;display:inline-block">${esc(c.device.summary)}</span>` : `<span class="mini">${esc((c.user_agent || '').slice(0, 44))}</span>`}
        </td>
        <td><div class="row-acts">
          ${c.status !== 'approved' ? `<button data-act="approve" data-id="${c.id}">✓ اعتماد</button>` : ''}
          ${c.status !== 'rejected' ? `<button data-act="reject" data-id="${c.id}">✗ رفض</button>` : ''}
          <button data-act="edit" data-id="${c.id}">✎ تعديل</button>
          <button data-act="del" data-id="${c.id}" class="danger">🗑</button>
        </div></td>
      </tr>`).join('');
  } catch (e) {
    $('#candRows').innerHTML = `<tr><td colspan="8" style="color:var(--red)">${esc(e.message)}</td></tr>`;
  }
}
$('#candRows').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id, act = b.dataset.act;
  try {
    if (act === 'approve') { await api(`/api/admin/candidates/${id}`, { method: 'PATCH', body: { status: 'approved' } }); toast('تم اعتماد المرشح', 'ok'); }
    if (act === 'reject')  {
      try {
        await api(`/api/admin/candidates/${id}`, { method: 'PATCH', body: { status: 'rejected' } });
      } catch (ex) {
        if (ex.status === 409 && ex.data && ex.data.code === 'HAS_VOTES') {
          if (!confirm(`⚠️ ${ex.message}\n\nستبقى الأصوات في السجل لكن المرشح سيُخفى من النتائج. هل أنت متأكد؟`)) return;
          await api(`/api/admin/candidates/${id}?force=1`, { method: 'PATCH', body: { status: 'rejected' } });
        } else throw ex;
      }
      toast('تم رفض الترشيح', 'ok');
    }
    if (act === 'del') {
      if (!confirm('حذف هذا المرشح نهائياً؟ لا يمكن التراجع.')) return;
      try {
        await api(`/api/admin/candidates/${id}`, { method: 'DELETE' });
        toast('تم الحذف', 'ok');
      } catch (ex) {
        // حماية سلامة النتائج: المرشح لديه أصوات — حذف قسري فقط بعد تأكيد صريح
        if (ex.status === 409 && ex.data && ex.data.code === 'HAS_VOTES') {
          if (!confirm(`⚠️ ${ex.message}\n\nسيتم حذف ${ex.data.votes} صوت مرتبط به نهائياً وتغيير النتائج. هل أنت متأكد؟`)) return;
          await api(`/api/admin/candidates/${id}?force=1`, { method: 'DELETE' });
          toast('تم الحذف القسري للمرشح وأصواته', 'ok');
        } else throw ex;
      }
    }
    if (act === 'edit') return openEdit(id);
    loadCandidates(); loadAll();
  } catch (ex) { toast(ex.message, 'err'); }
});

/* --- مودال التعديل --- */
let editId = null;
async function openEdit(id) {
  try {
    const r = await api('/api/admin/candidates?status=all');
    const c = r.candidates.find(x => x.id === Number(id));
    if (!c) return toast('غير موجود', 'err');
    editId = c.id;
    $('#editTitle').textContent = 'تعديل: ' + c.name;
    $('#editMeta').textContent = `${c.university_id} · ${c.batch} · أُضيف ${fmtDate(c.created_at)} · IP: ${c.ip}`;
    $('#e-name').value = c.name; $('#e-uid').value = c.university_id;
    $('#e-wa').value = c.whatsapp; $('#e-dep').value = c.department;
    $('#e-qual').value = c.qualifications; $('#e-exp').value = c.experience;
    $('#e-ach').value = c.achievements; $('#e-status').value = c.status;
    $('#editModal').classList.add('open');
  } catch (e) { toast(e.message, 'err'); }
}
function closeEdit() { $('#editModal').classList.remove('open'); editId = null; }
$('#editClose').addEventListener('click', closeEdit);
$('#editCancel').addEventListener('click', closeEdit);
$('#editModal').addEventListener('click', e => { if (e.target.id === 'editModal') closeEdit(); });
$('#editSave').addEventListener('click', async () => {
  if (!editId) return;
  try {
    await api(`/api/admin/candidates/${editId}`, { method: 'PATCH', body: {
      name: $('#e-name').value, whatsapp: $('#e-wa').value, department: $('#e-dep').value,
      qualifications: $('#e-qual').value, experience: $('#e-exp').value,
      achievements: $('#e-ach').value, status: $('#e-status').value
    }});
    toast('تم حفظ التعديلات', 'ok');
    closeEdit(); loadCandidates(); loadAll();
  } catch (e) { toast(e.message, 'err'); }
});

/* ============================================================
   الأصوات والنتائج
   ============================================================ */
async function loadVotes() {
  try {
    const r = await api('/api/admin/votes');
    renderAdminResults(r.results);
    const rows = r.votes;
    if (!rows.length) {
      $('#voteRows').innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--ink-3);padding:28px">لا توجد أصوات مسجّلة بعد</td></tr>`;
      return;
    }
    $('#voteRows').innerHTML = rows.map((v, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>
          <strong>${esc(v.voter_name)}</strong>
          <span class="tag ok" style="font-size:.66rem;margin-top:3px;display:inline-block">⚖️ أقسم بالله العظيم</span>
        </td>
        <td><span class="mono">${esc(v.university_id)}</span></td>
        <td><span class="tag blue">${esc(v.batch)}</span></td>
        <td>${esc(v.candidate_name || '—')} <span class="mini mono">${esc(v.candidate_uid || '')}</span></td>
        <td style="max-width:220px">
          <span class="mini" style="color:var(--ink);font-weight:600;line-height:1.5" title="${esc(v.reason || '')}">
            «${esc(v.reason || 'لم يُذكر')}»
          </span>
        </td>
        <td><span class="mono" style="font-size:.72rem">${esc(v.receipt || '—')}</span></td>
        <td>
          <span class="mono">${esc(v.ip)}</span>
          ${v.device ? `<span class="tag ${v.device.isMobile ? 'blue' : 'pend'}" style="margin-top:2px;font-size:.68rem;display:block">${esc(v.device.summary)}</span>` : `<span class="mini">${esc((v.user_agent || '').slice(0, 36))}</span>`}
          ${Number(v.ip_count) > 1 ? `<span class="tag rej" style="margin-top:3px;display:block">⚠️ ${v.ip_count} أصوات من نفس الـ IP</span>` : ''}
        </td>
        <td><span class="mini">${fmtDate(v.created_at)}</span></td>
        <td><div class="row-acts"><button class="danger" data-delvote="${v.id}">إبطال</button></div></td>
      </tr>`).join('');
  } catch (e) {
    $('#voteRows').innerHTML = `<tr><td colspan="10" style="color:var(--red)">${esc(e.message)}</td></tr>`;
  }
}
$('#voteRows').addEventListener('click', async e => {
  const b = e.target.closest('[data-delvote]'); if (!b) return;
  if (!confirm('إبطال هذا الصوت؟ سيسمح للمصوّت بالتصويت مرة أخرى.')) return;
  try {
    await api('/api/admin/votes/' + b.dataset.delvote, { method: 'DELETE' });
    toast('تم إبطال الصوت', 'ok'); loadVotes(); loadAll();
  } catch (ex) { toast(ex.message, 'err'); }
});
$('#clearVotesBtn').addEventListener('click', async () => {
  if (!confirm('⚠️ هل أنت متأكد من مسح جميع الأصوات نهائياً؟ هذا إجراء خطير لا يمكن التراجع عنه.')) return;
  if (!confirm('تأكيد أخير: مسح كل الأصوات المسجّلة؟')) return;
  try {
    const r = await api('/api/admin/votes', { method: 'DELETE' });
    toast(`تم مسح ${r.cleared} صوت`, 'ok'); loadVotes(); loadAll();
  } catch (e) { toast(e.message, 'err'); }
});

function renderAdminResults(res) {
  if (!res || !res.candidates.length) {
    $('#adminResults').innerHTML = `<p style="color:var(--ink-3);padding:14px 0">لا توجد نتائج بعد — لم يُعتمد أي مرشح أو لم تُسجَّل أصوات.</p>`;
    return;
  }
  const max = Math.max(...res.candidates.map(c => c.votes), 1);
  $('#adminResults').innerHTML = `
    <div class="res-list" style="max-width:100%">
      ${res.candidates.map(c => `
        <div class="res-row" style="grid-template-columns:52px 1fr auto">
          <div class="res-rank">${c.rank}</div>
          <div class="res-info">
            <b>${esc(c.name)}</b><span>${esc(c.batch)} · ${esc(c.department || '')}</span>
            <div class="bar"><i style="width:${Math.round(c.votes / max * 100)}%"></i></div>
          </div>
          <div class="res-val"><b>${c.votes}</b><span>${c.percent}%</span></div>
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
      ${res.byBatch.map(b => `<span class="tag blue" style="font-size:.82rem;padding:7px 14px">${b.batch}: ${b.votes} صوت</span>`).join('')}
      <span class="tag ok" style="font-size:.82rem;padding:7px 14px">الإجمالي: ${res.total}</span>
      <span class="tag pend" style="font-size:.82rem;padding:7px 14px">عناوين IP: ${res.integrity.registeredIps}</span>
    </div>`;
}

/* ============================================================
   الرسائل
   ============================================================ */
async function loadMessages() {
  try {
    const r = await api('/api/admin/messages');
    if (!r.messages.length) {
      $('#msgList').innerHTML = `<p style="color:var(--ink-3);padding:14px 0">لا توجد رسائل بعد.</p>`;
      return;
    }
    $('#msgList').innerHTML = r.messages.map(m => `
      <div style="border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-bottom:12px">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <strong>${esc(m.name)}</strong>
          ${m.status === 'replied' ? '<span class="tag ok">تم الرد</span>'
            : m.status === 'read' ? '<span class="tag blue">مقروءة</span>'
            : '<span class="tag pend">جديدة</span>'}
          <span class="mini">${fmtDate(m.created_at)}</span>
          <span class="ip mini" style="font-family:ui-monospace,monospace;direction:ltr">${esc(m.ip)}</span>
          ${m.whatsapp ? `<a class="tag blue" target="_blank" href="https://wa.me/${esc(String(m.whatsapp).replace(/[^\d]/g, '').replace(/^0/, '249'))}">واتساب ${esc(m.whatsapp)}</a>` : ''}
          <span class="mini" style="margin-inline-start:auto">مرجع: <b>${esc(m.ref)}</b></span>
        </div>
        ${m.subject ? `<div style="font-weight:700;font-size:.9rem">${esc(m.subject)}</div>` : ''}
        <p style="font-size:.92rem;color:var(--ink-2);white-space:pre-wrap;margin:6px 0">${esc(m.body)}</p>
        ${m.reply ? `<div style="background:var(--brand-50);border:1px solid var(--brand-300);border-radius:12px;padding:10px 14px;margin-top:8px;font-size:.88rem">
          <b style="color:var(--brand-700)">ردك:</b> ${esc(m.reply)}<span class="mini">${fmtDate(m.replied_at)}</span></div>` : ''}
        <div class="row-acts" style="margin-top:10px">
          <button data-reply="${m.id}">${m.reply ? 'تعديل الرد' : '↩ رد'}</button>
          ${m.status !== 'read' && m.status !== 'replied' ? `<button data-read="${m.id}">✓ تعليم كمقروءة</button>` : ''}
          <button class="danger" data-delmsg="${m.id}">🗑 حذف</button>
        </div>
      </div>`).join('');
  } catch (e) {
    $('#msgList').innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`;
  }
}
$('#msgList').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  try {
    if (b.dataset.reply) {
      const txt = prompt('اكتب ردك على هذه الرسالة:');
      if (txt === null) return;
      await api('/api/admin/messages/' + b.dataset.reply, { method: 'PATCH', body: { reply: txt } });
      toast('تم حفظ الرد', 'ok'); loadMessages();
    }
    if (b.dataset.read) {
      await api('/api/admin/messages/' + b.dataset.read, { method: 'PATCH', body: { status: 'read' } });
      loadMessages(); loadAll();
    }
    if (b.dataset.delmsg) {
      if (!confirm('حذف هذه الرسالة نهائياً؟')) return;
      await api('/api/admin/messages/' + b.dataset.delmsg, { method: 'DELETE' });
      toast('تم الحذف', 'ok'); loadMessages(); loadAll();
    }
  } catch (ex) { toast(ex.message, 'err'); }
});

/* ============================================================
   سجل الإجراءات
   ============================================================ */
async function loadAudit() {
  try {
    const r = await api('/api/admin/audit?limit=500');
    if (!r.log.length) { $('#auditList').innerHTML = '<p style="color:var(--ink-3)">لا يوجد سجل بعد.</p>'; return; }
    $('#auditList').innerHTML = r.log.map(a => `
      <div class="audit-i">
        <span class="t">${fmtDate(a.created_at)}</span>
        <span class="d"><b>${esc(a.action)}</b> — ${esc(a.actor)}<br>
          <span style="color:var(--ink-2)">${esc(a.detail)}</span></span>
        <span class="ip">${esc(a.ip || '—')}</span>
      </div>`).join('');
    // آخر النشاطات في الرئيسية
    $('#recentAudit').innerHTML = r.log.slice(0, 8).map(a => `
      <div class="audit-i">
        <span class="t">${fmtDate(a.created_at)}</span>
        <span class="d"><b>${esc(a.action)}</b> — ${esc(a.actor)} · ${esc(a.detail.slice(0, 90))}</span>
        <span class="ip">${esc(a.ip || '—')}</span>
      </div>`).join('');
  } catch (e) {
    $('#auditList').innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`;
  }
}

/* ============================================================
   مركز الأمان
   ============================================================ */
async function loadSecurity() {
  try {
    const r = await api('/api/admin/security');
    const s = r.security;
    $('#secKpi').innerHTML = `
      <div class="kpi ${s.defaultPasswordInUse ? 'warn' : ''}"><b>${s.defaultPasswordInUse ? '⚠️' : '✓'}</b><span>كلمة المرور ${s.defaultPasswordInUse ? 'الافتراضية — غيّرها' : 'مخصّصة وآمنة'}</span></div>
      <div class="kpi ${s.failedLogins24h ? 'warn' : ''}"><b>${s.failedLogins24h}</b><span>محاولة دخول فاشلة (24س)</span></div>
      <div class="kpi"><b>${s.sessionsCount}</b><span>جلسة نشطة</span></div>
      <div class="kpi"><b>${s.https ? '✓' : '—'}</b><span>HSTS / HTTPS</span></div>`;

    const checks = [
      ['كلمة مرور مخصّصة (ليست الافتراضية)', !s.defaultPasswordInUse, 'settings'],
      ['جلسات مشفّرة (SHA-256) في قاعدة البيانات', true, null],
      ['رؤوس حماية: CSP · X-Frame-Options · nosniff', true, null],
      ['منع CSRF: طلبات JSON فقط + CORS محدود', true, null],
      ['تحديد معدّل الطلبات لكل IP', true, null],
      ['حماية النتائج: لا حذف صامت لمرشح له أصوات', true, null],
      ['تسجيل كامل: IP + المتصفح + الوقت لكل إجراء', true, null],
      ['HTTPS/HSTS (يتطلب تشغيل الخادم بـ HTTPS=1)', !!s.https, null],
      ['الثقة بـ X-Forwarded-For (TRUST_PROXY)', !!s.trustProxy, null]
    ];
    $('#secChecklist').innerHTML = checks.map(([label, ok, go]) => `
      <div class="audit-i" style="align-items:center">
        <span class="tag ${ok ? 'ok' : 'pend'}" style="min-width:74px;text-align:center">${ok ? '✓ مفعّل' : '⚠ يحتاج'}</span>
        <span class="d">${esc(label)}</span>
        ${go ? `<button class="btn btn-ghost btn-sm" data-go="${go}">معالجة</button>` : ''}
      </div>`).join('');
    $$('#secChecklist [data-go]').forEach(b => b.addEventListener('click', () => goPage(b.dataset.go)));

    const sess = s.sessions || [];
    $('#sessRows').innerHTML = sess.length ? sess.map(x => {
      const cur = s.currentSession && x.created_at === s.currentSession.created_at;
      return `<tr>
        <td>${cur ? '<span class="tag ok">الجلسة الحالية</span>' : '<span class="tag blue">جلسة أخرى</span>'}</td>
        <td><span class="mini">${fmtDate(x.created_at)}</span></td>
        <td><span class="mini">${fmtDate(x.expires_at)}</span></td>
        <td><span class="mono">${esc(x.ip || '—')}</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="4" style="color:var(--ink-3)">لا جلسات نشطة</td></tr>`;

    $('#failedList').innerHTML = s.failedLogins.length ? s.failedLogins.map(f => `
      <div class="audit-i">
        <span class="t">${fmtDate(f.created_at)}</span>
        <span class="d">${esc(f.detail)}</span>
        <span class="ip">${esc(f.ip || '—')}</span>
      </div>`).join('') : '<p style="color:var(--ink-3)">لا محاولات فاشلة — ممتاز ✓</p>';

    const b = $('#bSec');
    if (b) b.classList.toggle('hidden', !s.defaultPasswordInUse);
    const banner = $('#pwBanner');
    if (banner) banner.classList.toggle('hidden', !s.defaultPasswordInUse);
  } catch (e) {
    $('#secChecklist').innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`;
  }
}
$('#secRefresh').addEventListener('click', loadSecurity);
$('#revokeOthers').addEventListener('click', async () => {
  if (!confirm('إنهاء كل الجلسات الأخرى؟ ستبقى جلستك الحالية فقط.')) return;
  try {
    const r = await api('/api/admin/sessions/revoke-others', { method: 'POST' });
    toast(`تم إنهاء ${r.revoked} جلسة أخرى`, 'ok');
    loadSecurity();
  } catch (e) { toast(e.message, 'err'); }
});

/* ============================================================
   التصدير
   ============================================================ */
$$('[data-export]').forEach(b => b.addEventListener('click', () => doExport(b.dataset.export)));
function doExport(type) {
  if (!TOKEN) return toast('سجّل الدخول أولاً', 'err');
  // نافذة مؤقتة لإرسال الترويسة نحتاج fetch ثم blob
  fetch('/api/admin/export?type=' + type, { headers: { Authorization: 'Bearer ' + TOKEN } })
    .then(r => {
      if (!r.ok) throw new Error('فشل التصدير');
      const disp = r.headers.get('Content-Disposition') || '';
      const m = disp.match(/filename="([^"]+)"/);
      return r.blob().then(b => ({ b, name: m ? m[1] : `iua-${type}.csv` }));
    })
    .then(({ b, name }) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('تم تنزيل الملف: ' + name, 'ok');
    })
    .catch(e => toast(e.message, 'err'));
}
$('#backupBtn').addEventListener('click', async () => {
  try {
    const [c, v, m, a, r] = await Promise.all([
      api('/api/admin/candidates?status=all'), api('/api/admin/votes'),
      api('/api/admin/messages'), api('/api/admin/audit?limit=1000'),
      api('/api/admin/results')
    ]);
    const blob = new Blob([JSON.stringify({
      exported_at: new Date().toISOString(),
      candidates: c.candidates, votes: v.votes, messages: m.messages,
      audit: a.log, results: r.results
    }, null, 2)], { type: 'application/json' });
    const el = document.createElement('a');
    el.href = URL.createObjectURL(blob);
    el.download = 'iua-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(el); el.click(); el.remove();
    toast('تم تنزيل النسخة الاحتياطية', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

/* ============================================================
   الإعدادات
   ============================================================ */
/* ============================================================
   الإعدادات المتطورة (Settings Cockpit & Live Sync)
   ============================================================ */
let isSettingsDirty = false;

function markSettingsDirty(dirty = true) {
  isSettingsDirty = dirty;
  const badge = $('#settingsSyncBadge');
  if (!badge) return;
  if (dirty) {
    badge.className = 'sync-badge dirty';
    badge.textContent = '⚠️ يوجد تعديلات غير محفوظة!';
  } else {
    badge.className = 'sync-badge in-sync';
    badge.textContent = '✓ جميع الإعدادات متزامنة ومطبقة';
  }
}

function updateBannerPreview() {
  const box = $('#previewBannerBox');
  const txt = $('#previewBannerText');
  const ico = $('#previewBannerIcon');
  if (!box || !txt) return;

  const isEnabled = $('#sw-banner-enabled') && $('#sw-banner-enabled').checked;
  const textVal = $('#set-banner_text') ? $('#set-banner_text').value.trim() : '';
  const levelVal = $('#set-banner_level') ? $('#set-banner_level').value : 'info';

  box.className = 'preview-banner-mock ' + levelVal;
  if (!isEnabled) {
    box.style.opacity = '0.55';
    txt.textContent = textVal ? `[معطّل] ${textVal}` : '(شريط التنبيه معطّل حالياً ولن يظهر للطلاب)';
    if (ico) ico.textContent = '⏸️';
  } else {
    box.style.opacity = '1';
    txt.textContent = textVal || 'تنبيه رئاسي رسمي: الدورة الانتخابية مفتوحة للاقتراع الدستوري.';
    if (ico) ico.textContent = levelVal === 'danger' ? '🚨' : (levelVal === 'warning' ? '⚠️' : '🔔');
  }
}

function updateHeroPreview() {
  const t = $('#prevHeroTitle');
  const b = $('#prevHeroBadge');
  const s = $('#prevHeroSubBrand');
  const d = $('#prevHeroDesc');
  if (t) t.textContent = $('#set-hero_title') ? ($('#set-hero_title').value || 'انتخاب رئيس جمعية الحاسوب') : 'انتخاب رئيس جمعية الحاسوب';
  if (b) b.textContent = $('#set-election_dates') ? ($('#set-election_dates').value || '• الدورة الانتخابية مفتوحة') : '• الدورة الانتخابية مفتوحة';
  if (s) {
    const col = $('#set-college_name') ? ($('#set-college_name').value || 'كلية دراسات الحاسوب') : 'كلية دراسات الحاسوب';
    const univ = $('#set-university_name') ? ($('#set-university_name').value || 'IUA') : 'IUA';
    s.textContent = `${col} · ${univ}`;
  }
  if (d) d.textContent = $('#set-hero_subtitle') ? ($('#set-hero_subtitle').value || 'المنصة الرسمية المعتمدة للاقتراع الرئاسي المشفّر.') : 'المنصة الرسمية المعتمدة للاقتراع الرئاسي المشفّر.';
}

function applySettings(s) {
  if ($('#sw-voting')) $('#sw-voting').checked = s.voting_open === '1';
  if ($('#sw-nom')) $('#sw-nom').checked = s.nominations_open === '1';
  if ($('#sw-res')) $('#sw-res').checked = s.results_public === '1';
  if ($('#sw-auto')) $('#sw-auto').checked = s.auto_approve === '1';
  if ($('#sw-banner-enabled')) $('#sw-banner-enabled').checked = s.banner_enabled === '1';
  if ($('#set-banner_text')) $('#set-banner_text').value = s.banner_text || '';
  if ($('#set-banner_level')) $('#set-banner_level').value = s.banner_level || 'info';
  if ($('#set-election_title')) $('#set-election_title').value = s.election_title || '';
  if ($('#set-hero_title')) $('#set-hero_title').value = s.hero_title || '';
  if ($('#set-hero_subtitle')) $('#set-hero_subtitle').value = s.hero_subtitle || '';
  if ($('#set-president_statement')) $('#set-president_statement').value = s.president_statement || '';
  if ($('#set-election_dates')) $('#set-election_dates').value = s.election_dates || '';
  if ($('#set-association_name')) $('#set-association_name').value = s.association_name || '';
  if ($('#set-college_name')) $('#set-college_name').value = s.college_name || '';
  if ($('#set-university_name')) $('#set-university_name').value = s.university_name || '';
  if ($('#set-footer_note')) $('#set-footer_note').value = s.footer_note || '';
  if ($('#set-allowed_batches')) $('#set-allowed_batches').value = s.allowed_batches || '';
  if ($('#sw-require-reason')) $('#sw-require-reason').checked = s.require_reason !== '0';
  if ($('#sw-require-oath')) $('#sw-require-oath').checked = s.require_oath !== '0';
  if ($('#set-support_whatsapp')) $('#set-support_whatsapp').value = s.support_whatsapp || '';
  if ($('#set-support_email')) $('#set-support_email').value = s.support_email || '';
  const dl = s.voting_deadline || '';
  if ($('#set-deadline')) $('#set-deadline').value = dl ? toLocalInput(dl) : '';
  renderDeadlineState(dl);

  updateBannerPreview();
  updateHeroPreview();
  markSettingsDirty(false);
}

// تبويبات الإعدادات
$$('#settingsSubnav .settings-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('#settingsSubnav .settings-tab-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    const targetPaneId = btn.dataset.setpane;
    $$('#p-settings .settings-pane').forEach(p => p.classList.remove('active'));
    const pane = $('#' + targetPaneId);
    if (pane) pane.classList.add('active');
  });
});

// مراقبة التغييرات في أي حقل لتحديث المعاينة ووضع الحالة
$$('#p-settings input, #p-settings textarea, #p-settings select').forEach(input => {
  input.addEventListener('input', () => {
    markSettingsDirty(true);
    updateBannerPreview();
    updateHeroPreview();
  });
  input.addEventListener('change', () => {
    markSettingsDirty(true);
    updateBannerPreview();
    updateHeroPreview();
  });
});

async function saveAllSettings() {
  const body = {
    voting_open: $('#sw-voting') && $('#sw-voting').checked ? '1' : '0',
    nominations_open: $('#sw-nom') && $('#sw-nom').checked ? '1' : '0',
    results_public: $('#sw-res') && $('#sw-res').checked ? '1' : '0',
    auto_approve: $('#sw-auto') && $('#sw-auto').checked ? '1' : '0',
    voting_deadline: $('#set-deadline') ? $('#set-deadline').value : '',
    banner_enabled: $('#sw-banner-enabled') && $('#sw-banner-enabled').checked ? '1' : '0',
    banner_text: $('#set-banner_text') ? $('#set-banner_text').value : '',
    banner_level: $('#set-banner_level') ? $('#set-banner_level').value : 'info',
    election_title: $('#set-election_title') ? $('#set-election_title').value : '',
    hero_title: $('#set-hero_title') ? $('#set-hero_title').value : '',
    hero_subtitle: $('#set-hero_subtitle') ? $('#set-hero_subtitle').value : '',
    president_statement: $('#set-president_statement') ? $('#set-president_statement').value : '',
    election_dates: $('#set-election_dates') ? $('#set-election_dates').value : '',
    association_name: $('#set-association_name') ? $('#set-association_name').value : '',
    college_name: $('#set-college_name') ? $('#set-college_name').value : '',
    university_name: $('#set-university_name') ? $('#set-university_name').value : '',
    footer_note: $('#set-footer_note') ? $('#set-footer_note').value : '',
    allowed_batches: $('#set-allowed_batches') ? $('#set-allowed_batches').value : '',
    require_reason: $('#sw-require-reason') && $('#sw-require-reason').checked ? '1' : '0',
    require_oath: $('#sw-require-oath') && $('#sw-require-oath').checked ? '1' : '0',
    support_whatsapp: $('#set-support_whatsapp') ? $('#set-support_whatsapp').value : '',
    support_email: $('#set-support_email') ? $('#set-support_email').value : ''
  };

  const btn = $('#saveAllSettingsBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جارِ الحفظ والتطبيق…'; }

  try {
    await api('/api/admin/settings', { method: 'PUT', body });
    toast('تم حفظ وتطبيق كافة الإعدادات على المنصة بنجاح!', 'ok');
    const me = await api('/api/admin/me');
    applySettings(me.settings);
    markSettingsDirty(false);
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ وتطبيق كافة الإعدادات'; }
  }
}

if ($('#saveAllSettingsBtn')) {
  $('#saveAllSettingsBtn').addEventListener('click', saveAllSettings);
}

function toLocalInput(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function renderDeadlineState(iso) {
  const el = $('#deadlineState');
  if (!el) return;
  if (!iso) { el.textContent = 'لا يوجد موعد محدد — الإغلاق يدوي من مفتاح «فتح التصويت».'; return; }
  const d = new Date(iso);
  const passed = Date.now() > d.getTime();
  el.innerHTML = passed
    ? `<span style="color:var(--red);font-weight:700">⛔ انتهى الموعد (${fmtDate(iso)}) — التصويت مغلق تلقائياً.</span>`
    : `✓ التصويت مفتوح حتى <b>${fmtDate(iso)}</b> ثم يُغلق تلقائياً.`;
}
$('#saveDeadline').addEventListener('click', async () => {
  const v = $('#set-deadline').value;
  try {
    await api('/api/admin/settings', { method: 'PUT', body: { voting_deadline: v } });
    toast(v ? 'تم حفظ موعد إغلاق التصويت' : 'تم مسح الموعد', 'ok');
    const me = await api('/api/admin/me');
    applySettings(me.settings);
  } catch (e) { toast(e.message, 'err'); }
});
$('#clearDeadline').addEventListener('click', async () => {
  try {
    await api('/api/admin/settings', { method: 'PUT', body: { voting_deadline: '' } });
    toast('تم مسح موعد الإغلاق', 'ok');
    $('#set-deadline').value = '';
    renderDeadlineState('');
    markSettingsDirty(false);
  } catch (e) { toast(e.message, 'err'); }
});
const toggleMap = {
  'sw-voting': 'voting_open',
  'sw-nom': 'nominations_open',
  'sw-res': 'results_public',
  'sw-auto': 'auto_approve',
  'sw-banner-enabled': 'banner_enabled',
  'sw-require-reason': 'require_reason',
  'sw-require-oath': 'require_oath'
};
Object.keys(toggleMap).forEach(id => {
  const el = $('#' + id);
  if (el) {
    el.addEventListener('change', async e => {
      try {
        await api('/api/admin/settings', { method: 'PUT', body: { [toggleMap[id]]: e.target.checked ? '1' : '0' } });
        toast('تم تحديث الإعداد بنجاح', 'ok');
        updateBannerPreview();
      } catch (ex) { toast(ex.message, 'err'); e.target.checked = !e.target.checked; }
    });
  }
});
if ($('#saveBanner')) {
  $('#saveBanner').addEventListener('click', async () => {
    try {
      await api('/api/admin/settings', { method: 'PUT', body: {
        banner_enabled: $('#sw-banner-enabled') && $('#sw-banner-enabled').checked ? '1' : '0',
        banner_text: $('#set-banner_text') ? $('#set-banner_text').value : '',
        banner_level: $('#set-banner_level') ? $('#set-banner_level').value : 'info'
      }});
      toast('تم حفظ إعدادات الشريط الإعلاني العاجل بنجاح', 'ok');
      const me = await api('/api/admin/me');
      applySettings(me.settings);
    } catch (e) { toast(e.message, 'err'); }
  });
}
if ($('#saveTexts')) {
  $('#saveTexts').addEventListener('click', async () => {
    try {
      await api('/api/admin/settings', { method: 'PUT', body: {
        election_title: $('#set-election_title') ? $('#set-election_title').value : '',
        hero_title: $('#set-hero_title').value,
        hero_subtitle: $('#set-hero_subtitle').value,
        president_statement: $('#set-president_statement') ? $('#set-president_statement').value : '',
        election_dates: $('#set-election_dates').value,
        association_name: $('#set-association_name') ? $('#set-association_name').value : '',
        college_name: $('#set-college_name') ? $('#set-college_name').value : '',
        university_name: $('#set-university_name') ? $('#set-university_name').value : '',
        footer_note: $('#set-footer_note').value
      }});
      toast('تم حفظ النصوص والهوية المؤسسية بنجاح', 'ok');
      const me = await api('/api/admin/me');
      applySettings(me.settings);
    } catch (e) { toast(e.message, 'err'); }
  });
}
if ($('#saveRules')) {
  $('#saveRules').addEventListener('click', async () => {
    try {
      await api('/api/admin/settings', { method: 'PUT', body: {
        allowed_batches: $('#set-allowed_batches') ? $('#set-allowed_batches').value : '',
        require_reason: $('#sw-require-reason') && $('#sw-require-reason').checked ? '1' : '0',
        require_oath: $('#sw-require-oath') && $('#sw-require-oath').checked ? '1' : '0'
      }});
      toast('تم حفظ ضوابط ومعايير الاقتراع بنجاح', 'ok');
      const me = await api('/api/admin/me');
      applySettings(me.settings);
    } catch (e) { toast(e.message, 'err'); }
  });
}
if ($('#saveContact')) {
  $('#saveContact').addEventListener('click', async () => {
    try {
      await api('/api/admin/settings', { method: 'PUT', body: {
        support_whatsapp: $('#set-support_whatsapp') ? $('#set-support_whatsapp').value : '',
        support_email: $('#set-support_email') ? $('#set-support_email').value : ''
      }});
      toast('تم حفظ بيانات وقنوات التواصل بنجاح', 'ok');
      const me = await api('/api/admin/me');
      applySettings(me.settings);
    } catch (e) { toast(e.message, 'err'); }
  });
}

/* ============================================================
   طباعة محضر الانتخابات الرسمي المعتمد
   ============================================================ */
function printOfficialReport() {
  Promise.all([
    api('/api/admin/results'),
    api('/api/admin/stats'),
    api('/api/admin/me')
  ]).then(([resData, stData, meData]) => {
    const res = resData.results;
    const s = meData.settings;
    const univName = s.university_name || 'جامعة إفريقيا العالمية';
    const facName = s.college_name || 'كلية دراسات الحاسوب';
    const assName = s.association_name || 'جمعية الحاسوب';
    const protocolRef = 'CSA-PROT-2026-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const w = window.open('', '_blank');
    w.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>المحضر الرسمي لاعتماد نتائج الانتخابات الرئاسية 2026 – ${assName}</title>
        <style>
          @page { size: A4 portrait; margin: 14mm 16mm; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Cairo', Tajawal, 'Segoe UI', Tahoma, sans-serif;
            padding: 24px;
            direction: rtl;
            color: #111827;
            background: #FFFFFF;
            line-height: 1.5;
            font-size: 13px;
          }
          .doc-frame {
            border: 2px solid #0E7A5B;
            padding: 22px;
            border-radius: 12px;
            position: relative;
            background: #fff;
          }
          .doc-frame::after {
            content: 'وثيقة رسمية معتمدة';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 4rem;
            font-weight: 900;
            color: rgba(14, 122, 91, 0.04);
            pointer-events: none;
            white-space: nowrap;
          }
          .hdr {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #0E7A5B;
            padding-bottom: 14px;
            margin-bottom: 18px;
          }
          .hdr-logo {
            width: 72px;
            height: 72px;
            object-fit: contain;
          }
          .hdr-center {
            text-align: center;
            flex: 1;
            padding: 0 16px;
          }
          .hdr-center h4 { margin: 0; font-size: 13px; color: #4B5563; font-weight: 600; }
          .hdr-center h2 { margin: 4px 0 2px; font-size: 18px; color: #0E7A5B; font-weight: 800; }
          .hdr-center h3 { margin: 0; font-size: 14px; color: #111827; font-weight: 700; }
          .hdr-center p { margin: 4px 0 0; font-size: 11px; color: #6B7280; }

          .doc-ref-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #F0FDF4;
            border: 1px solid #BBF7D0;
            padding: 8px 14px;
            border-radius: 6px;
            font-size: 11.5px;
            margin-bottom: 16px;
            font-weight: 700;
            color: #166534;
          }

          .meta-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            background: #F9FAFB;
            border: 1px solid #E5E7EB;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 18px;
          }
          .meta-item { display: flex; flex-direction: column; }
          .meta-item span { font-size: 10.5px; color: #6B7280; margin-bottom: 2px; }
          .meta-item b { font-size: 12.5px; color: #111827; }

          .sec-title {
            font-size: 13.5px;
            font-weight: 800;
            color: #0E7A5B;
            margin: 18px 0 8px;
            padding-bottom: 4px;
            border-bottom: 1px solid #E5E7EB;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            font-size: 12px;
          }
          th, td {
            border: 1px solid #D1D5DB;
            padding: 7px 10px;
            text-align: right;
          }
          th {
            background: #F3F4F6;
            color: #111827;
            font-weight: 700;
          }
          tr:nth-child(even) td { background: #FAFAFA; }

          .rank-badge {
            display: inline-block;
            padding: 2px 7px;
            border-radius: 4px;
            font-weight: 800;
            font-size: 11px;
            background: #E5E7EB;
            color: #111;
          }
          .rank-1 { background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; }

          .legal-statement {
            background: #F8FAFC;
            border-right: 3px solid #0E7A5B;
            padding: 10px 14px;
            font-size: 11.5px;
            color: #374151;
            line-height: 1.6;
            margin-top: 16px;
            border-radius: 4px;
          }

          .sig-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-top: 36px;
            padding-top: 10px;
          }
          .sig-card {
            text-align: center;
            border: 1px dashed #D1D5DB;
            padding: 14px 10px;
            border-radius: 8px;
          }
          .sig-card b { display: block; font-size: 12.5px; color: #111827; margin-bottom: 2px; }
          .sig-card small { display: block; font-size: 10.5px; color: #6B7280; }
          .sig-line {
            margin-top: 36px;
            border-top: 1px solid #9CA3AF;
            padding-top: 4px;
            font-size: 10px;
            color: #4B5563;
          }

          .print-action-bar {
            text-align: center;
            margin-top: 24px;
          }
          .print-btn {
            background: #0E7A5B;
            color: #FFFFFF;
            border: none;
            padding: 10px 28px;
            font-size: 13.5px;
            font-weight: 700;
            border-radius: 8px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(14, 122, 91, 0.25);
          }
          @media print {
            .print-action-bar { display: none !important; }
            body { padding: 0; }
            .doc-frame { border: 1.5px solid #0E7A5B; padding: 16px; }
          }
        </style>
      </head>
      <body>
        <div class="doc-frame">
          <div class="hdr">
            <img src="/logo.png" alt="شعار جمعية الحاسوب" class="hdr-logo">
            <div class="hdr-center">
              <h4>جمهورية السودان · ${univName}</h4>
              <h2>${facName} – أمانة الشؤون العلمية والطلابية</h2>
              <h3>محضر اعتماد النتائج النهائية لانتخابات رئيس ${assName}</h3>
              <p>الدورة الانتخابية الرسمية 2026 · وثيقة رسمية صادرة عن المنصة المشفرة</p>
            </div>
            <img src="/logo.png" alt="شعار الجامعة" class="hdr-logo">
          </div>

          <div class="doc-ref-bar">
            <span>رقم القيد الدستوري: ${protocolRef}</span>
            <span>حالة الاقتراع: ${s.voting_open === '1' ? 'مفتوح رسمياً' : 'مغلق ومحسوم دستورياً'}</span>
            <span>تاريخ وساعة الإصدار: ${new Date().toLocaleString('ar-EG')}</span>
          </div>

          <div class="meta-grid">
            <div class="meta-item">
              <span>إجمالي أصوات المقترعين</span>
              <b>${res.total} صوت أمانة</b>
            </div>
            <div class="meta-item">
              <span>عناوين IP الفريدة الموثقة</span>
              <b>${res.integrity.registeredIps} شبكة مؤكدة</b>
            </div>
            <div class="meta-item">
              <span>سلامة التشفير ومؤشر النزاهة</span>
              <b style="color:#0E7A5B">100% مشفر SHA-256</b>
            </div>
            <div class="meta-item">
              <span>الدفعات المصرحة</span>
              <b>${s.allowed_batches || 'ST20, ST21, ST22'}</b>
            </div>
          </div>

          <div class="sec-title">أولاً: النتائج الرسمية المعتمدة للمرشحين الرئاسيين</div>
          <table>
            <thead>
              <tr>
                <th style="width:10%">الترتيب</th>
                <th>اسم المرشح الرئاسي</th>
                <th style="width:20%">الدفعة والتخصص</th>
                <th style="width:18%">الأصوات المعتمدة</th>
                <th style="width:16%">النسبة المئوية</th>
              </tr>
            </thead>
            <tbody>
              ${res.candidates.length ? res.candidates.map((c, i) => `<tr>
                <td style="text-align:center"><span class="rank-badge ${i === 0 ? 'rank-1' : ''}">#${c.rank}</span></td>
                <td><b>${c.name}</b></td>
                <td>${c.batch} · ${c.department || 'علوم الحاسوب'}</td>
                <td><b>${c.votes} صوت</b></td>
                <td><b>${c.percent}%</b></td>
              </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;padding:16px">لا توجد أصوات مسجلة حتى الآن في السجل الدستوري.</td></tr>'}
            </tbody>
          </table>

          <div class="sec-title">ثانياً: نسب ومعدلات المشاركة الطلابية بحسب الدفعات الأكاديمية</div>
          <table>
            <thead>
              <tr>
                <th>الدفعة الأكاديمية المصرحة</th>
                <th>عدد الأصوات المسجلة</th>
                <th>نسبة المساهمة من إجمالي الأصوات</th>
                <th>مؤشر التحقق الأكاديمي</th>
              </tr>
            </thead>
            <tbody>
              ${res.byBatch && res.byBatch.length ? res.byBatch.map(b => `<tr>
                <td><b>${b.batch}</b></td>
                <td>${b.votes} صوت</td>
                <td>${res.total ? Math.round((b.votes / res.total) * 100) : 0}%</td>
                <td style="color:#166534">✓ مدقّق بالرقم الجامعي الرسمي</td>
              </tr>`).join('') : '<tr><td colspan="4" style="text-align:center">لا تتوفر إحصائيات للدفعات بعد.</td></tr>'}
            </tbody>
          </table>

          <div class="legal-statement">
            <b>إقرار النزاهة والاعتماد الرئاسي:</b><br>
            نُقرّ نحن اللجنة المشرفة على انتخابات رئيس ${assName} بأن كافة الأصوات المقيّدة في هذا المحضر قد خضعت للقسم الشرعي بالله العظيم، ومحصورة على الطلاب أصحاب الأرقام الجامعية المعتمدة بالكلية، مع منع أي تكرار أو انتحال برمجي عبر البصمة الرقمية للشبكة وعزل السجلات المشفرة.
          </div>

          <div class="sig-grid">
            <div class="sig-card">
              <b>رئيس جمعية الحاسوب</b>
              <small>المشرف العام على الانتخابات</small>
              <div class="sig-line">الاعتماد والتوقيع الرسمي</div>
            </div>
            <div class="sig-card">
              <b>اللجنة العليا المستقلة للانتخابات</b>
              <small>مقرر لجنة الفرز والنزاهة الرقمية</small>
              <div class="sig-line">خاتم الجمعية واللجنة</div>
            </div>
            <div class="sig-card">
              <b>عمادة ${facName}</b>
              <small>${univName}</small>
              <div class="sig-line">المصادقة الإدارية والأكاديمية</div>
            </div>
          </div>
        </div>

        <div class="print-action-bar">
          <button onclick="window.print()" class="print-btn">🖨️ طباعة المحضر الرسمي الآن (A4)</button>
        </div>
      </body>
      </html>
    `);
    w.document.close();
  }).catch(err => toast('تعذر توليد المحضر الرسمي: ' + err.message, 'err'));
}

const printBtn = $('#printReportBtn');
if (printBtn) printBtn.addEventListener('click', printOfficialReport);
$('#savePw').addEventListener('click', async () => {
  const o = $('#pw-old').value, n = $('#pw-new').value, n2 = $('#pw-new2').value;
  if (n.length < 8) return toast('كلمة المرور الجديدة 8 أحرف على الأقل', 'err');
  if (n !== n2) return toast('كلمتا المرور غير متطابقتين', 'err');
  try {
    const r = await api('/api/admin/change-password', { method: 'POST', body: { old_password: o, new_password: n } });
    toast(r.message, 'ok');
    $('#pw-old').value = $('#pw-new').value = $('#pw-new2').value = '';
  } catch (e) { toast(e.message, 'err'); }
});

/* ============================================================
   اختصارات لوحة المفاتيح
   ============================================================ */
addEventListener('keydown', e => {
  if (e.key === 'Escape') closeEdit();
});

/* ============================================================
   الإقلاع: جرّب الجلسة المحفوظة
   ============================================================ */
(async function boot() {
  if (TOKEN) {
    try {
      await api('/api/admin/me');
      return enterApp();
    } catch { /* سجل الدخول مجدداً */ }
  }
  $('#loginVeil').classList.remove('hide');
  $('#loginPass').focus();
})();
