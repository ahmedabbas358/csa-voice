'use strict';
/* ============================================================
   خادم منصة انتخابات جمعية الحاسوب – IUA  (v2 — أمان مطوّر)
   بدون أي حزم خارجية: node:http + node:sqlite فقط
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const D = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ------------------------- أدوات ------------------------- */
function sendJSON(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('BAD_JSON'));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------- رؤوس الحماية ------------------------- */
function applySecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
      "img-src 'self' data: blob:; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "script-src 'self' 'unsafe-inline'; " +
      "connect-src 'self'; " +
      "manifest-src 'self'; " +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  if (process.env.HTTPS === '1') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
}

/* ------------------------- CORS (نفس الأصل أو قائمة موثوقة) ------------------------- */
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  let sameOrigin = false;
  try {
    sameOrigin = new URL(origin).host === req.headers.host;
  } catch { /* origin غير صالح */ }
  if (sameOrigin || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  }
}

/* ------------------------- حماية من الفيضان ------------------------- */
const rateMap = new Map();
function rateLimit(key, max, windowMs) {
  const nowT = Date.now();
  const cur = rateMap.get(key);
  if (!cur || nowT > cur.reset) {
    rateMap.set(key, { count: 1, reset: nowT + windowMs });
    return false;
  }
  cur.count++;
  return cur.count > max;
}
setInterval(() => {
  const nowT = Date.now();
  for (const [k, v] of rateMap) if (nowT > v.reset) rateMap.delete(k);
}, 60 * 1000).unref();

// تنظيف دوري للجلسات المنتهية
setInterval(() => { try { D.purgeSessions(); } catch { /* ignore */ } }, 60 * 60 * 1000).unref();

function isAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return D.getSession(token) ? token : null;
}

/* ------------------------- أدوات المسارات ------------------------- */
function maskUniversityId(id) {
  const s = String(id || '');
  if (s.length <= 6) return s.slice(0, 4) + '••';
  return s.slice(0, 4) + '•••' + s.slice(-2);
}
function votingClosedReason() {
  if (D.getSetting('voting_open') !== '1') return 'التصويت مغلق حالياً';
  const dl = D.getSetting('voting_deadline');
  if (dl && Date.now() > new Date(dl).getTime()) return 'انتهى موعد التصويت المعلن';
  return null;
}

/* ============================================================
   المسارات العامة
   ============================================================ */
const routes = {
  'GET /api/health': (req, res) => {
    sendJSON(res, 200, {
      status: 'ok',
      version: '2.0.0',
      uptime: Math.round(process.uptime()),
      db: 'healthy',
      timestamp: new Date().toISOString()
    });
  },

  'GET /api/config': (req, res) => {
    const s = D.allSettings();
    const dl = s.voting_deadline || '';
    const deadlinePassed = dl ? Date.now() > new Date(dl).getTime() : false;
    sendJSON(res, 200, {
      election_title: s.election_title,
      hero_title: s.hero_title,
      hero_subtitle: s.hero_subtitle,
      president_statement: s.president_statement || '',
      voting_open: s.voting_open === '1' && !deadlinePassed,
      nominations_open: s.nominations_open === '1',
      results_public: s.results_public === '1',
      voting_deadline: dl,
      election_dates: s.election_dates,
      footer_note: s.footer_note,
      college_name: s.college_name || 'كلية دراسات الحاسوب',
      university_name: s.university_name || 'جامعة إفريقيا العالمية',
      association_name: s.association_name || 'جمعية الحاسوب',
      banner_enabled: s.banner_enabled === '1',
      banner_text: s.banner_text || '',
      banner_level: s.banner_level || 'info',
      allowed_batches: s.allowed_batches || 'ST20, ST21, ST22, ST23',
      require_reason: s.require_reason !== '0',
      require_oath: s.require_oath !== '0',
      support_whatsapp: s.support_whatsapp || '',
      support_email: s.support_email || ''
    });
  },

  'GET /api/public-stats': (req, res) => sendJSON(res, 200, D.publicStats()),

  'GET /api/candidates': (req, res) => {
    const list = D.listCandidates('approved').map((c) => ({
      id: c.id,
      name: c.name,
      university_id: maskUniversityId(c.university_id), // إخفاء جزئي للخصوصية
      batch: c.batch,
      department: c.department,
      qualifications: c.qualifications,
      experience: c.experience,
      achievements: c.achievements
    }));
    sendJSON(res, 200, { candidates: list });
  },

  'GET /api/results': (req, res) => {
    if (D.getSetting('results_public') !== '1' && !isAdmin(req)) {
      return sendJSON(res, 403, { error: 'النتائج لم تُعلن بعد' });
    }
    sendJSON(res, 200, { results: D.resultsAggregate() });
  },

  'GET /api/verify': (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const code = String(u.searchParams.get('code') || '').trim();
    if (!code) return sendJSON(res, 400, { error: 'كود الإيصال مطلوب' });
    const vote = D.getVoteByReceipt(code);
    if (!vote) return sendJSON(res, 404, { error: 'لم يُعثر على صوت مسجّل بهذا الإيصال' });
    sendJSON(res, 200, {
      ok: true,
      receipt: vote.receipt,
      batch: vote.batch,
      voter_masked: vote.voter_name.charAt(0) + '••• ' + (vote.voter_name.trim().split(' ').slice(-1)[0] || ''),
      uid_masked: vote.university_id.slice(0, 4) + '••••',
      candidate_name: vote.candidate_name || 'المرشح المعتمد',
      reason: vote.reason,
      oath: true,
      created_at: vote.created_at
    });
  },

  /* ---------- الترشيح ---------- */
  'POST /api/nominate': async (req, res) => {
    if (D.getSetting('nominations_open') !== '1')
      return sendJSON(res, 403, { error: 'الترشيح مغلق حالياً' });
    const ip = D.clientIp(req);
    if (rateLimit('nom:' + ip, 10, 10 * 60 * 1000))
      return sendJSON(res, 429, { error: 'محاولات كثيرة، حاول بعد دقائق' });

    let b;
    try { b = await readBody(req, 48 * 1024); } catch (e) {
      return sendJSON(res, e.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: 'طلب غير صالح' });
    }

    const name = D.cleanText(b.name, 80);
    const uid = D.normalizeId(b.university_id);
    const phone = D.normalizePhone(b.whatsapp);
    const department = D.cleanText(b.department, 80);
    const qualifications = D.cleanText(b.qualifications, 4000);
    const experience = D.cleanText(b.experience, 4000);
    const achievements = D.cleanText(b.achievements, 4000);
    const oath = b.oath === true || b.oath === 'true';

    if (name.length < 3) return sendJSON(res, 400, { error: 'اكتب اسمك الثلاثي كاملاً' });
    if (!D.validId(uid))
      return sendJSON(res, 400, { error: 'الرقم الجامعي غير صالح أو غير معتمد للترشيح' });
    if (!D.validPhone(phone))
      return sendJSON(res, 400, { error: 'رقم الواتساب غير صحيح (مثال: 0912345678 أو +249912345678)' });
    if (qualifications.length < 10)
      return sendJSON(res, 400, { error: 'اذكر مؤهلاتك بتفصيل (10 أحرف على الأقل)' });
    if (experience.length < 10)
      return sendJSON(res, 400, { error: 'اذكر خبراتك وتجاربك بتفصيل (10 أحرف على الأقل)' });
    if (!oath)
      return sendJSON(res, 400, { error: 'يجب أداء القسم بالله بأنك ترشّح نفسك بأمانة وصدق' });

    if (D.getCandidateByIdNumber(uid))
      return sendJSON(res, 409, { error: 'هذا الرقم الجامعي مسجّل ترشيح مسبقاً' });

    let id;
    try {
      id = D.addCandidate({ name, university_id: uid, whatsapp: phone, department,
        qualifications, experience, achievements }, req);
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE'))
        return sendJSON(res, 409, { error: 'هذا الرقم الجامعي مسجّل ترشيح مسبقاً' });
      throw e;
    }
    D.audit(uid, 'nominate', `ترشيح: ${name} | واتساب: ${phone} | قسم: ${department}`, req);

    const auto = D.getSetting('auto_approve') === '1';
    sendJSON(res, 201, {
      ok: true,
      status: auto ? 'approved' : 'pending',
      message: auto
        ? 'تم تسجيل ترشيحك واعتماده، ستظهر قائمتك بين المرشحين الآن.'
        : 'تم استلام ترشيحك بنجاح! ستتم مراجعته من إدارة الجمعية ثم يظهر بين المرشحين.'
    });
  },

  /* ---------- التصويت ---------- */
  'POST /api/vote': async (req, res) => {
    const closed = votingClosedReason();
    if (closed) return sendJSON(res, 403, { error: closed });

    const ip = D.clientIp(req);
    if (rateLimit('vote:' + ip, 15, 10 * 60 * 1000))
      return sendJSON(res, 429, { error: 'محاولات كثيرة، حاول بعد دقائق' });

    let b;
    try { b = await readBody(req, 8 * 1024); } catch (e) {
      return sendJSON(res, e.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: 'طلب غير صالح' });
    }

    const voterName = D.cleanText(b.voter_name, 80);
    const uid = D.normalizeId(b.university_id);
    const candidateId = Number(b.candidate_id);
    const reason = D.cleanText(b.reason, 1500);
    const oath = b.oath === true || b.oath === 'true';

    if (voterName.length < 3) return sendJSON(res, 400, { error: 'اكتب اسمك كاملاً' });
    if (!D.validId(uid))
      return sendJSON(res, 400, { error: 'الرقم الجامعي غير صالح أو غير معتمد للاقتراع' });
    if (reason.length < 5)
      return sendJSON(res, 400, { error: 'يرجى كتابة سبب اختيارك للمرشح بناءً على الكفاءة والبرنامج (5 أحرف على الأقل)' });
    if (!oath) return sendJSON(res, 400, { error: 'يجب أداء القسم قبل التصويت' });

    if (D.hasVoted(uid)) {
      // يُسجَّل كمحاولة مشبوهة في سجل التدقيق لمراجعتها يدوياً
      D.audit(uid, 'vote_duplicate_attempt',
        `محاولة تصويت مكررة | المصوّت: ${voterName}`, req);
      return sendJSON(res, 409, { error: 'لقد قمت بالتصويت مسبقاً ولا يمكنك التصويت مرة أخرى' });
    }

    const cand = D.getCandidate(candidateId);
    if (!cand || cand.status !== 'approved')
      return sendJSON(res, 404, { error: 'المرشح غير موجود أو غير معتمد' });

    let vote;
    try {
      vote = D.addVote({
        candidate_id: cand.id, voter_name: voterName,
        university_id: uid, batch: D.batchOf(uid),
        reason
      }, req);
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE'))
        return sendJSON(res, 409, { error: 'لقد قمت بالتصويت مسبقاً ولا يمكنك التصويت مرة أخرى' });
      throw e;
    }
    D.audit(uid, 'vote',
      `صوت لـ: ${cand.name} (رقم ${cand.id}) | المصوّت: ${voterName} | السبب: ${reason.slice(0, 100)} | إيصال: ${vote.receipt}`, req);

    sendJSON(res, 201, {
      ok: true,
      vote_id: vote.id,
      receipt: vote.receipt,
      message: 'شكراً لك! تم تسجيل صوتك بنجاح بأمانة وشفافية.'
    });
  },

  /* ---------- الرسائل ---------- */
  'POST /api/message': async (req, res) => {
    const ip = D.clientIp(req);
    if (rateLimit('msg:' + ip, 8, 15 * 60 * 1000))
      return sendJSON(res, 429, { error: 'محاولات كثيرة، حاول بعد دقائق' });
    let b;
    try { b = await readBody(req, 16 * 1024); } catch {
      return sendJSON(res, 400, { error: 'طلب غير صالح' });
    }
    const name = D.cleanText(b.name, 80);
    const body = D.cleanText(b.body, 3000);
    if (name.length < 3 || body.length < 5)
      return sendJSON(res, 400, { error: 'اكتب اسمك ونص الرسالة' });
    const ref = D.addMessage({ name, whatsapp: b.whatsapp, subject: b.subject, body }, req);
    D.audit(name, 'message', `رسالة ${ref}: ${body.slice(0, 120)}`, req);
    sendJSON(res, 210, { ok: true, ref, message: 'تم إرسال رسالتك، احتفظ برقم المرجع لمتابعة الرد' });
  },

  /* ---------- دخول/خروج المدير ---------- */
  'POST /api/admin/login': async (req, res) => {
    const ip = D.clientIp(req);
    if (rateLimit('login:' + ip, 6, 10 * 60 * 1000))
      return sendJSON(res, 429, { error: 'محاولات دخول كثيرة، حاول بعد 10 دقائق' });
    let b;
    try { b = await readBody(req, 4 * 1024); } catch {
      return sendJSON(res, 400, { error: 'طلب غير صالح' });
    }
    const stored = D.getSetting('admin_pass_hash');
    if (!D.verifyPassword(b.password || '', stored)) {
      D.audit('غير معروف', 'admin_login_failed', 'محاولة دخول فاشلة', req);
      return sendJSON(res, 401, { error: 'كلمة المرور غير صحيحة' });
    }
    const token = D.createSession(ip);
    D.audit('المدير', 'admin_login', 'دخول ناجح للوحة التحكم', req);
    sendJSON(res, 200, { ok: true, token });
  },

  'POST /api/admin/logout': (req, res) => {
    const auth = req.headers['authorization'] || '';
    D.deleteSession(auth.startsWith('Bearer ') ? auth.slice(7) : '');
    sendJSON(res, 200, { ok: true });
  }
};

/* ============================================================
   مسارات لوحة التحكم (توثيق إلزامي)
   ============================================================ */
const adminRoutes = {
  'GET /api/admin/me': (req, res) =>
    sendJSON(res, 200, { ok: true, settings: D.safeSettings(), stats: D.stats() }),

  /* ---------- الأمان ---------- */
  'GET /api/admin/security': (req, res) => {
    const token = isAdmin(req);
    sendJSON(res, 200, { ok: true, security: D.securityOverview(token) });
  },
  'POST /api/admin/sessions/revoke-others': (req, res) => {
    const token = isAdmin(req);
    const n = D.revokeOtherSessions(token);
    D.audit('المدير', 'sessions_revoke_others', `إنهاء ${n} جلسة أخرى`, req);
    sendJSON(res, 200, { ok: true, revoked: n });
  },

  /* ---------- المرشحون ---------- */
  'GET /api/admin/candidates': (req, res, url) => {
    const status = url.searchParams.get('status') || 'all';
    sendJSON(res, 200, { candidates: D.listCandidates(status) });
  },
  'PATCH /api/admin/candidates/:id': async (req, res, url, params) => {
    const c = D.getCandidate(params.id);
    if (!c) return sendJSON(res, 404, { error: 'غير موجود' });
    let b;
    try { b = await readBody(req, 48 * 1024); } catch {
      return sendJSON(res, 400, { error: 'طلب غير صالح' });
    }
    if (b.status && !['pending', 'approved', 'rejected'].includes(b.status))
      return sendJSON(res, 400, { error: 'حالة غير صالحة' });
    // حماية سلامة النتائج: رفض مرشح له أصوات يخفي أصواتاً حقيقية — تأكيد قسري فقط
    if (b.status === 'rejected' && c.status !== 'rejected') {
      const votes = D.candidateVoteCount(c.id);
      if (votes > 0 && url.searchParams.get('force') !== '1') {
        return sendJSON(res, 409, {
          error: `لدى هذا المرشح ${votes} صوت مسجّل. رفضه سيخفي هذه الأصوات من النتائج — أكّد الرفض القسري.`,
          code: 'HAS_VOTES',
          votes
        });
      }
    }
    D.updateCandidate(params.id, b);
    D.audit('المدير', 'candidate_update',
      `تعديل المرشح ${c.name} (${c.university_id}) → ${b.status || 'بيانات'}`, req);
    sendJSON(res, 200, { ok: true, candidate: D.getCandidate(params.id) });
  },
  'DELETE /api/admin/candidates/:id': (req, res, url, params) => {
    const c = D.getCandidate(params.id);
    if (!c) return sendJSON(res, 404, { error: 'غير موجود' });
    const votes = D.candidateVoteCount(c.id);
    const force = url.searchParams.get('force') === '1';
    // حماية سلامة النتائج: لا حذف صامت لمرشح له أصوات
    if (votes > 0 && !force) {
      return sendJSON(res, 409, {
        error: `لدى هذا المرشح ${votes} صوت مسجّل. الحذف سيغيّر النتائج — أكّد الحذف القسري.`,
        code: 'HAS_VOTES',
        votes
      });
    }
    D.deleteCandidate(c.id);
    D.audit('المدير', 'candidate_delete',
      `حذف المرشح ${c.name} (${c.university_id})${votes ? ` — قسري مع ${votes} صوت` : ''}`, req);
    sendJSON(res, 200, { ok: true, forced: votes > 0 });
  },

  /* ---------- الأصوات ---------- */
  'GET /api/admin/votes': (req, res) =>
    sendJSON(res, 200, { votes: D.listVotes(), results: D.resultsAggregate() }),
  'DELETE /api/admin/votes/:id': (req, res, url, params) => {
    const v = D.getVote(params.id);
    if (!v) return sendJSON(res, 404, { error: 'غير موجود' });
    D.deleteVote(params.id);
    D.audit('المدير', 'vote_delete',
      `إبطال صوت ${v.university_id} (المصوّت: ${v.voter_name})`, req);
    sendJSON(res, 200, { ok: true });
  },
  'DELETE /api/admin/votes': (req, res) => {
    const n = D.clearVotes();
    D.audit('المدير', 'votes_clear', `مسح جميع الأصوات (${n} صوت)`, req);
    sendJSON(res, 200, { ok: true, cleared: n });
  },

  /* ---------- الرسائل ---------- */
  'GET /api/admin/messages': (req, res) =>
    sendJSON(res, 200, { messages: D.listMessages() }),
  'PATCH /api/admin/messages/:id': async (req, res, url, params) => {
    let b;
    try { b = await readBody(req, 16 * 1024); } catch {
      return sendJSON(res, 400, { error: 'طلب غير صالح' });
    }
    if (!D.updateMessage(params.id, b)) return sendJSON(res, 404, { error: 'غير موجود' });
    D.audit('المدير', 'message_update', `تحديث الرسالة #${params.id} → ${b.status || 'رد'}`, req);
    sendJSON(res, 200, { ok: true });
  },
  'DELETE /api/admin/messages/:id': (req, res, url, params) => {
    if (!D.deleteMessage(params.id)) return sendJSON(res, 404, { error: 'غير موجود' });
    D.audit('المدير', 'message_delete', `حذف الرسالة #${params.id}`, req);
    sendJSON(res, 200, { ok: true });
  },

  /* ---------- سجل / إحصاءات ---------- */
  'GET /api/admin/audit': (req, res, url) => {
    const limit = url.searchParams.get('limit') || 300;
    sendJSON(res, 200, { log: D.listAudit(limit) });
  },
  'GET /api/admin/stats': (req, res) => sendJSON(res, 200, D.stats()),
  'GET /api/admin/results': (req, res) => sendJSON(res, 200, { results: D.resultsAggregate() }),

  /* ---------- الإعدادات ---------- */
  'PUT /api/admin/settings': async (req, res) => {
    let b;
    try { b = await readBody(req, 32 * 1024); } catch {
      return sendJSON(res, 400, { error: 'طلب غير صالح' });
    }
    const allowed = [
      'election_title', 'hero_title', 'hero_subtitle', 'president_statement', 'voting_open',
      'nominations_open', 'results_public', 'auto_approve',
      'voting_deadline', 'election_dates', 'footer_note',
      'college_name', 'university_name', 'association_name',
      'banner_enabled', 'banner_text', 'banner_level',
      'allowed_batches', 'require_reason', 'require_oath',
      'support_whatsapp', 'support_email'
    ];
    const changed = [];
    for (const k of allowed) {
      if (b[k] === undefined) continue;
      if (k === 'voting_deadline') {
        const raw = String(b[k] || '').trim();
        if (raw && isNaN(new Date(raw).getTime()))
          return sendJSON(res, 400, { error: 'موعد إغلاق التصويت غير صالح' });
        D.setSetting(k, raw ? new Date(raw).toISOString() : '');
      } else {
        D.setSetting(k, b[k]);
      }
      changed.push(k);
    }
    if (changed.length)
      D.audit('المدير', 'settings_update', `تعديل الإعدادات: ${changed.join(', ')}`, req);
    sendJSON(res, 200, { ok: true, settings: D.safeSettings() });
  },
  'POST /api/admin/change-password': async (req, res) => {
    let b;
    try { b = await readBody(req, 4 * 1024); } catch {
      return sendJSON(res, 400, { error: 'طلب غير صالح' });
    }
    const stored = D.getSetting('admin_pass_hash');
    if (!D.verifyPassword(b.old_password || '', stored))
      return sendJSON(res, 401, { error: 'كلمة المرور الحالية غير صحيحة' });
    const np = String(b.new_password || '');
    if (np.length < 8) return sendJSON(res, 400, { error: 'كلمة المرور الجديدة 8 أحرف على الأقل' });
    if (D.verifyPassword(np, stored))
      return sendJSON(res, 400, { error: 'كلمة المرور الجديدة مطابقة للحالية' });
    D.setSetting('admin_pass_hash', D.hashPassword(np));
    // إنهاء كل الجلسات الأخرى بعد تغيير كلمة المرور (حماية إضافية)
    const token = isAdmin(req);
    const revoked = D.revokeOtherSessions(token);
    D.audit('المدير', 'password_change', `تغيير كلمة مرور اللوحة — إنهاء ${revoked} جلسة أخرى`, req);
    sendJSON(res, 200, { ok: true, revoked, message: 'تم تغيير كلمة المرور وإنهاء الجلسات الأخرى' });
  },

  /* ---------- تصدير CSV ---------- */
  'GET /api/admin/export': (req, res, url) => {
    const type = url.searchParams.get('type');
    // حماية من CSV Injection: تعقيم أي خلية تبدأ بمحارف خطرة في Excel
    const esc = (v) => {
      let s = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    let rows = [];
    let name = 'export';

    if (type === 'candidates') {
      rows.push([
        'المعرف الرقمي',
        'الاسم الكامل للمرشح',
        'الرقم الجامعي',
        'الدفعة الأكاديمية',
        'رقم الواتساب',
        'القسم والتخصص الأكاديمي',
        'المؤهلات والكفاءة',
        'الخبرات السابقة',
        'الإنجازات والرؤية',
        'القسم الشرعي بالأمانة',
        'حالة الاعتماد الرسمية',
        'بيانات الجهاز والمتصفح',
        'عنوان IP الموثق',
        'تاريخ وساعة تقديم الترشح'
      ]);
      for (const c of D.listCandidates('all'))
        rows.push([
          c.id,
          c.name,
          c.university_id,
          c.batch,
          c.whatsapp,
          c.department,
          c.qualifications,
          c.experience,
          c.achievements,
          'أقسم بالله العظيم (مؤدّى)',
          c.status === 'approved' ? 'معتمد رسمياً' : (c.status === 'rejected' ? 'مرفوض' : 'بانتظار المراجعة'),
          c.device ? c.device.summary : c.user_agent,
          c.ip,
          c.created_at
        ]);
      name = 'candidates';
      D.audit('المدير', 'export_candidates', `تصدير بيانات المرشحين (${rows.length - 1} سجل)`, req);
    } else if (type === 'votes') {
      rows.push([
        'رقم السجل',
        'رمز الإيصال المشفر',
        'اسم الناخب',
        'الرقم الجامعي للناخب',
        'الدفعة الأكاديمية',
        'المرشح الرئاسي المختار',
        'الرقم الجامعي للمرشح',
        'سبب ومعيار الاختيار',
        'القسم الشرعي بالأمانة',
        'بيانات الجهاز والمتصفح',
        'عنوان IP الموثق',
        'عدد الأصوات من عنوان IP',
        'تاريخ وساعة الاقتراع'
      ]);
      for (const v of D.listVotes())
        rows.push([
          v.id,
          v.receipt,
          v.voter_name,
          v.university_id,
          v.batch,
          v.candidate_name,
          v.candidate_uid,
          v.reason || '',
          'أقسم بالله العظيم (مؤدّى)',
          v.device ? v.device.summary : v.user_agent,
          v.ip,
          v.ip_count,
          v.created_at
        ]);
      name = 'votes';
      D.audit('المدير', 'export_votes', `تصدير بيانات المصوتين (${rows.length - 1} سجل)`, req);
    } else if (type === 'results') {
      const r = D.resultsAggregate();
      rows.push(['الترتيب', 'اسم المرشح الرئاسي', 'الدفعة', 'التخصص الأكاديمي', 'عدد الأصوات المعتمدة', 'النسبة المئوية']);
      for (const c of r.candidates)
        rows.push([c.rank, c.name, c.batch, c.department, c.votes, c.percent + '%']);
      rows.push([]);
      rows.push(['إجمالي أصوات المقترعين المسجلة', r.total]);
      rows.push(['عدد عناوين IP الفريدة الموثقة', r.integrity ? r.integrity.registeredIps : '-']);
      rows.push(['مؤشر سلامة التشفير والنزاهة', '100% مشفر SHA-256']);
      rows.push([]);
      rows.push(['توزيع الأصوات بحسب الدفعات الأكاديمية']);
      rows.push(['الدفعة', 'عدد الأصوات']);
      for (const b of r.byBatch) rows.push([b.batch, b.votes]);
      name = 'results';
      D.audit('المدير', 'export_results', 'تصدير النتائج الرسمية', req);
    } else if (type === 'messages') {
      rows.push(['المعرف', 'كود المرجع', 'الاسم', 'رقم الواتساب', 'الموضوع', 'نص الرسالة', 'الحالة', 'الرد الرئاسي', 'عنوان IP', 'تاريخ الإرسال', 'تاريخ الرد']);
      for (const m of D.listMessages())
        rows.push([m.id, m.ref, m.name, m.whatsapp, m.subject, m.body, m.status === 'replied' ? 'تم الرد' : 'جديدة', m.reply || '', m.ip, m.created_at, m.replied_at || '']);
      name = 'messages';
    } else if (type === 'audit') {
      rows.push(['المعرف', 'المنفذ', 'نوع الإجراء', 'التفاصيل', 'عنوان IP', 'المتصفح والنظام', 'التاريخ والوقت']);
      for (const a of D.listAudit(1000))
        rows.push([a.id, a.actor, a.action, a.detail, a.ip, a.user_agent, a.created_at]);
      name = 'audit';
    } else {
      return sendJSON(res, 400, { error: 'نوع تصدير غير معروف' });
    }

    const csv = '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition':
        `attachment; filename="iua-${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store'
    });
    res.end(csv);
  }
};

/* ============================================================
   مطابقة المسارات
   ============================================================ */
function matchRoute(table, method, pathname) {
  const exact = table[`${method} ${pathname}`];
  if (exact) return { handler: exact, params: {} };
  for (const key of Object.keys(table)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const pParts = pattern.split('/');
    const uParts = pathname.split('/');
    if (pParts.length !== uParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i].startsWith(':')) params[pParts[i].slice(1)] = decodeURIComponent(uParts[i]);
      else if (pParts[i] !== uParts[i]) { ok = false; break; }
    }
    if (ok) return { handler: table[key], params };
  }
  return null;
}

/* ------------------------- تقديم الملفات الثابتة ------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

/* المسار الرئاسي السري المعزول (صعب التخمين والتتبع) */
const PRESIDENT_SECRET_PATH = process.env.ADMIN_PATH || '/csa-admin-panel';

function serveStatic(req, res, pathname) {
  // حجب وإلغاء مسار /admin أو /admin.html تماماً وإعادتهما كـ 404
  if (pathname === '/admin' || pathname === '/admin.html') {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 – الصفحة غير موجودة</h1>');
    return;
  }
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === PRESIDENT_SECRET_PATH) rel = '/admin.html';
  if (rel === '/manifest.json') rel = '/manifest.webmanifest';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 – الصفحة غير موجودة</h1>');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    // HTML/JS/CSS: منع التخزين المؤقت لضمان تحميل أحدث نسخة وتطبيق المتغيرات فوراً
    const fresh = ['.html', '.js', '.css', '.webmanifest', '.json'].includes(ext);
    const cache = fresh ? 'no-store, no-cache, must-revalidate, max-age=0' : 'public, max-age=86400';
    if (rel === '/admin.html') res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ============================================================
   الخادم
   ============================================================ */
const MUTATING = new Set(['POST', 'PUT', 'PATCH']);

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(req, res);
  applyCors(req, res);

  let url, pathname;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendJSON(res, 400, { error: 'رابط غير صالح' });
  }

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    if (pathname.startsWith('/api/')) {
      // ---------- منع CSRF: الطلبات المعدِّلة JSON فقط ----------
      if (MUTATING.has(req.method)) {
        const ct = String(req.headers['content-type'] || '').toLowerCase();
        if (!ct.includes('application/json'))
          return sendJSON(res, 415, { error: 'نوع المحتوى يجب أن يكون application/json' });
        // حد عام لكل IP ضد إغراق الواجهات
        if (rateLimit('api:' + D.clientIp(req), 150, 10 * 60 * 1000))
          return sendJSON(res, 429, { error: 'طلبات كثيرة جداً، حاول لاحقاً' });
      }

      // ---------- توثيق مسارات المدير ----------
      if (pathname.startsWith('/api/admin/') && pathname !== '/api/admin/login') {
        if (!isAdmin(req)) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول' });
      }

      // login/logout في routes العامة، والباقي في adminRoutes
      const isAuthRoute = pathname === '/api/admin/login' || pathname === '/api/admin/logout';
      const table = pathname.startsWith('/api/admin/') && !isAuthRoute ? adminRoutes : routes;
      const m = matchRoute(table, req.method, pathname);
      if (!m) return sendJSON(res, 404, { error: 'المسار غير موجود' });
      await m.handler(req, res, url, m.params);
      return;
    }

    serveStatic(req, res, pathname);
  } catch (e) {
    console.error('ERROR:', req.method, pathname, e);
    sendJSON(res, 500, { error: 'خطأ داخلي في الخادم' });
  }
});

server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) return;
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

function gracefulShutdown(signal) {
  console.log(`\n[${signal}] جارِ إغلاق خادم الانتخابات بأمان...`);
  server.close(() => {
    console.log('✔ تم إيقاف استقبال الطلبات وحفظ حالة قاعدة البيانات بنجاح.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('إغلاق قسري بعد مهلة 5 ثوان.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ┌────────────────────────────────────────────────┐');
  console.log('  │  جمعية الحاسوب – IUA | منصة الانتخابات v2       │');
  console.log('  └────────────────────────────────────────────────┘');
  console.log(`  ✔ الموقع       : http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  ✔ الرابط السري : http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}${PRESIDENT_SECRET_PATH}`);
  console.log(`  ✔ كلمة المرور  : ${process.env.ADMIN_PASSWORD ? 'محددة عبر متغيرات البيئة' : 'راجع ملف .env لتحديد كلمة المرور'}`);
  console.log('  🔒 جلسات مشفّرة · رؤوس حماية CSP · منع CSRF · تدقيق كامل');
  console.log('  (غيّر كلمة المرور بعد أول دخول من الإعدادات)');
  console.log('');
});
