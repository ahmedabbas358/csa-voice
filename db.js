'use strict';
/* ============================================================
   قاعدة بيانات انتخابات جمعية الحاسوب - IUA  (v2 — أمان مطوّر)
   تعتمد على node:sqlite المدمج في Node.js (بدون أي حزم خارجية)
   ============================================================ */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = process.env.DATA_DIR || (isServerless ? path.join('/tmp', 'csa-data') : path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'app.db');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    university_id  TEXT NOT NULL UNIQUE,
    batch          TEXT NOT NULL,
    whatsapp       TEXT NOT NULL,
    department     TEXT NOT NULL DEFAULT '',
    qualifications TEXT NOT NULL DEFAULT '',
    experience     TEXT NOT NULL DEFAULT '',
    achievements   TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
    ip             TEXT NOT NULL DEFAULT '',
    user_agent     TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS votes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id  INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    voter_name    TEXT NOT NULL,
    university_id TEXT NOT NULL UNIQUE,
    batch         TEXT NOT NULL,
    reason        TEXT NOT NULL DEFAULT '',
    receipt       TEXT NOT NULL DEFAULT '',
    ip            TEXT NOT NULL DEFAULT '',
    user_agent    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_votes_candidate ON votes(candidate_id);
  CREATE INDEX IF NOT EXISTS idx_votes_ip ON votes(ip);

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ref         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    whatsapp    TEXT NOT NULL DEFAULT '',
    subject     TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'new', -- new | read | replied
    reply       TEXT NOT NULL DEFAULT '',
    ip          TEXT NOT NULL DEFAULT '',
    user_agent  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    replied_at  TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    actor      TEXT NOT NULL,
    action     TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '',
    ip         TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip         TEXT NOT NULL DEFAULT ''
  );
`);

/* ------------------------- ترحيلات آمنة ------------------------- */
(function migrate() {
  // جلسات قديمة كانت تخزّن التوكن نفسه — نستبدلها ببصمة مشفّرة (الجلسات مؤقتة)
  const sessCols = db.prepare(`PRAGMA table_info(sessions)`).all().map((c) => c.name);
  if (!sessCols.includes('token_hash')) {
    db.exec(`DROP TABLE sessions;
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        ip         TEXT NOT NULL DEFAULT ''
      );`);
  }
  // عمود إيصال التصويت
  const voteCols = db.prepare(`PRAGMA table_info(votes)`).all().map((c) => c.name);
  if (!voteCols.includes('receipt')) {
    db.exec(`ALTER TABLE votes ADD COLUMN receipt TEXT NOT NULL DEFAULT ''`);
  }
  // عمود سبب التصويت (معيار الكفاءة والأمانة)
  if (!voteCols.includes('reason')) {
    db.exec(`ALTER TABLE votes ADD COLUMN reason TEXT NOT NULL DEFAULT ''`);
  }
})();

/* ------------------------- إعدادات ------------------------- */
const DEFAULT_SETTINGS = {
  election_title: 'انتخابات رئيس جمعية الحاسوب – جامعة إفريقيا العالمية',
  hero_title: 'انتخاب رئيس جمعية الحاسوب',
  hero_subtitle:
    'المنصة الرسمية المعتمدة للاقتراع الرئاسي بكلية دراسات الحاسوب (IUA). نظام إلكتروني مشفّر يعتمد معايير الكفاءة والاستحقاق والقسم الشرعي.',
  president_statement:
    'صُمم هذا النظام لاختيار الرئيس القادم لجمعية الحاسوب بتجرد كامل وفق معايير الكفاءة والبرنامج القيادي؛ فالتصويت أمانة ومسؤولية مقيدة بقسم مغلّظ أمام الله، لا مجال فيها لمجاملة أو صداقة.',
  voting_open: '1',        // 1 = مفتوح, 0 = مغلق
  nominations_open: '1',   // الترشيحات مفتوحة
  results_public: '0',     // إظهار النتائج للجميع
  auto_approve: '0',       // اعتماد الترشيح تلقائياً
  voting_deadline: '',     // ISO date — موعد إغلاق التصويت (اختياري)
  election_dates: 'الدورة الانتخابية الرسمية مفتوحة',
  footer_note: 'جمعية الحاسوب – كلية دراسات الحاسوب، جامعة إفريقيا العالمية (IUA)',
  college_name: 'كلية دراسات الحاسوب',
  university_name: 'جامعة إفريقيا العالمية',
  association_name: 'جمعية الحاسوب',
  banner_enabled: '0',
  banner_text: 'الدورة الانتخابية مفتوحة رسمياً للاقتراع والترشح الرئاسي وفق معايير الكفاءة والأمانة.',
  banner_level: 'info',
  allowed_batches: 'ST20, ST21, ST22, ST23',
  require_reason: '1',
  require_oath: '1',
  support_whatsapp: '+249912345678',
  support_email: 'csa@iua.edu.sd'
};

function seedSettings() {
  const ins = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  if (!getSetting('secret')) setSetting('secret', crypto.randomBytes(32).toString('hex'));
  if (!getSetting('admin_pass_hash')) {
    setSetting('admin_pass_hash', hashPassword(process.env.ADMIN_PASSWORD || 'ChangeMe@2026'));
  }
}
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(key), String(value));
}
function allSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}
/** الإعدادات الآمنة للإرسال للوحة (بدون أسرار) */
function safeSettings() {
  const s = allSettings();
  delete s.secret;
  delete s.admin_pass_hash;
  return s;
}

/* ------------------------- كلمات المرور ------------------------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(String(password), salt, 64);
  const exp = Buffer.from(hash, 'hex');
  return calc.length === exp.length && crypto.timingSafeEqual(calc, exp);
}
function defaultPasswordInUse() {
  return verifyPassword(
    process.env.ADMIN_PASSWORD || 'ChangeMe@2026',
    getSetting('admin_pass_hash')
  );
}

/* ------------------------- جلسات المدير (توقيع رقمي مشفّر + بصمة) ------------------------- */
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 ساعة لجلسة مستقرة

// مفتاح توقيع رقمي ثابت للجلسات لضمان التوافق مع بيئات السيرفرليس (Serverless / Vercel)
const SESSION_SIGN_SECRET = process.env.SESSION_SECRET || 'csa-election-iua-presidential-session-key-2026';

function signSession(payload) {
  const jsonStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', SESSION_SIGN_SECRET).update(jsonStr).digest('base64url');
  return `${jsonStr}.${hmac}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [jsonStr, hmac] = token.split('.');
  if (!jsonStr || !hmac) return null;
  const expected = crypto.createHmac('sha256', SESSION_SIGN_SECRET).update(jsonStr).digest('base64url');
  if (hmac !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(jsonStr, 'base64url').toString('utf8'));
    if (!payload || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function createSession(ip) {
  const nowT = Date.now();
  const expT = nowT + SESSION_TTL_MS;
  const payload = {
    role: 'admin',
    ip: ip || '',
    iat: nowT,
    exp: expT,
    rnd: crypto.randomBytes(8).toString('hex')
  };
  const token = signSession(payload);
  try {
    db.prepare(
      'INSERT INTO sessions (token_hash, created_at, expires_at, ip) VALUES (?, ?, ?, ?)'
    ).run(sha256(token), new Date(nowT).toISOString(), new Date(expT).toISOString(), ip || '');
  } catch (err) {
    // في بيئات السيرفرليس (Vercel Lambda)، التوقيع الرقمي يضمن الصلاحية بدون اعتمادية على القرص
  }
  return token;
}

function getSession(token) {
  if (!token) return null;
  
  // 1. التحقق الرقمي المشفر (Stateless HMAC verification) يمنع انقطاع الجلسة عبر السيرفرليس
  const verified = verifySessionToken(token);
  if (!verified) return null;

  // 2. التحقق من قاعدة البيانات إن وُجدت
  try {
    const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(token));
    if (row) {
      if (new Date(row.expires_at).getTime() < Date.now()) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
        return null;
      }
      return row;
    }
  } catch (err) {}

  // 3. في بيئة Vercel، نقبل التوقيع المشفر السليم لضمان عدم خروج المشرف تلقائياً
  return {
    token_hash: sha256(token),
    created_at: new Date(verified.iat).toISOString(),
    expires_at: new Date(verified.exp).toISOString(),
    ip: verified.ip || ''
  };
}

function deleteSession(token) {
  try {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token || ''));
  } catch (err) {}
}

function purgeSessions() {
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  } catch (err) {}
}

function activeSessions() {
  try {
    return db.prepare(
      `SELECT created_at, expires_at, ip FROM sessions
       WHERE expires_at > ? ORDER BY created_at DESC`
    ).all(new Date().toISOString());
  } catch (err) {
    return [];
  }
}

function revokeOtherSessions(currentToken) {
  try {
    const h = sha256(currentToken || '');
    return Number(db.prepare('DELETE FROM sessions WHERE token_hash <> ?').run(h).changes);
  } catch (err) {
    return 0;
  }
}

/* ------------------------- أدوات ------------------------- */
const ID_RE = /^ST(20|21|22)[A-Z0-9_\-\.]{0,24}$/i;

function normalizeId(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 28);
}
function validId(raw) {
  return ID_RE.test(normalizeId(raw));
}
function batchOf(raw) {
  return normalizeId(raw).slice(0, 4); // ST20 | ST21 | ST22
}
function normalizePhone(raw) {
  return String(raw || '').replace(/[\s\-().]/g, '').slice(0, 20);
}
function validPhone(raw) {
  return /^\+?\d{9,15}$/.test(normalizePhone(raw));
}
function cleanText(raw, max) {
  let s = String(raw == null ? '' : raw)
    .replace(/\r\n/g, '\n')
    // إزالة أحرف التحكم الخطرة مع الإبقاء على الأسطر والتبويب
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}
function now() {
  return new Date().toISOString();
}

/* ------------------------- تحليل بيانات الجهاز والهاتف ------------------------- */
function parseDeviceInfo(ua) {
  const s = String(ua || '');
  let os = 'غير محدد';
  let deviceType = 'كمبيوتر';
  let browser = 'متصفح';
  let isMobile = false;

  if (/iPhone/i.test(s)) {
    isMobile = true;
    deviceType = 'هاتف آيفون (Apple iPhone)';
    const m = s.match(/OS (\d+[_\.]\d+)/i);
    os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS';
  } else if (/iPad/i.test(s)) {
    isMobile = true;
    deviceType = 'جهاز لوحي (Apple iPad)';
    os = 'iPadOS';
  } else if (/Android/i.test(s)) {
    isMobile = true;
    const m = s.match(/Android\s+([0-9.]+)/i);
    os = m ? `Android ${m[1]}` : 'Android';
    const dev = s.match(/;\s*([^;]+?)\s+Build/i);
    deviceType = dev ? `هاتف أندرويد (${dev[1].trim()})` : 'هاتف أندرويد (Android)';
  } else if (/Windows NT 10\.0/i.test(s)) {
    deviceType = 'كمبيوتر شخصي (PC)';
    os = 'Windows 10/11';
  } else if (/Windows/i.test(s)) {
    deviceType = 'كمبيوتر شخصي (PC)';
    os = 'Windows';
  } else if (/Macintosh|Mac OS X/i.test(s)) {
    deviceType = 'كمبيوتر ماك (Mac)';
    os = 'macOS';
  } else if (/Linux/i.test(s)) {
    deviceType = 'كمبيوتر (Linux)';
    os = 'Linux';
  }

  if (/Edg\/([0-9]+)/i.test(s)) {
    browser = 'Edge ' + RegExp.$1;
  } else if (/Chrome\/([0-9]+)/i.test(s)) {
    browser = 'Chrome ' + RegExp.$1;
  } else if (/Safari\/([0-9]+)/i.test(s)) {
    browser = 'Safari';
  } else if (/Firefox\/([0-9]+)/i.test(s)) {
    browser = 'Firefox ' + RegExp.$1;
  }

  return {
    deviceType,
    os,
    browser,
    isMobile,
    summary: `${deviceType} · ${os} · ${browser}`
  };
}

/* ------------------------- سجل التدقيق ------------------------- */
function audit(actor, action, detail, req) {
  db.prepare(
    `INSERT INTO audit_log (actor, action, detail, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    cleanText(actor, 80),
    cleanText(action, 80),
    cleanText(detail, 1000),
    clientIp(req),
    cleanText((req && req.headers['user-agent']) || '', 400),
    now()
  );
}

/* ------------------------- المرشحون ------------------------- */
function addCandidate(data, req) {
  const id = normalizeId(data.university_id);
  const res = db.prepare(
    `INSERT INTO candidates
      (name, university_id, batch, whatsapp, department, qualifications,
       experience, achievements, status, ip, user_agent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    cleanText(data.name, 80),
    id,
    batchOf(id),
    normalizePhone(data.whatsapp),
    cleanText(data.department, 80),
    cleanText(data.qualifications, 4000),
    cleanText(data.experience, 4000),
    cleanText(data.achievements, 4000),
    getSetting('auto_approve') === '1' ? 'approved' : 'pending',
    clientIp(req),
    cleanText((req && req.headers['user-agent']) || '', 400),
    now(),
    now()
  );
  return Number(res.lastInsertRowid);
}
function getCandidate(id) {
  return db.prepare('SELECT * FROM candidates WHERE id = ?').get(Number(id));
}
function getCandidateByIdNumber(uid) {
  return db.prepare('SELECT * FROM candidates WHERE university_id = ?').get(normalizeId(uid));
}
function listCandidates(status) {
  let rows;
  if (status && status !== 'all') {
    rows = db.prepare('SELECT * FROM candidates WHERE status = ? ORDER BY created_at DESC').all(status);
  } else {
    rows = db.prepare('SELECT * FROM candidates ORDER BY created_at DESC').all();
  }
  return rows.map((c) => ({
    ...c,
    device: parseDeviceInfo(c.user_agent)
  }));
}
function updateCandidate(id, fields) {
  const allowed = ['name', 'whatsapp', 'department', 'qualifications', 'experience', 'achievements', 'status'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      let v = cleanText(fields[k], 4000);
      if (k === 'whatsapp') v = normalizePhone(v);
      sets.push(`${k} = ?`);
      vals.push(v);
    }
  }
  if (!sets.length) return false;
  sets.push('updated_at = ?');
  vals.push(now());
  vals.push(Number(id));
  db.prepare(`UPDATE candidates SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return true;
}
function deleteCandidate(id) {
  return db.prepare('DELETE FROM candidates WHERE id = ?').run(Number(id)).changes > 0;
}
function candidateVoteCount(id) {
  return Number(
    db.prepare('SELECT COUNT(*) AS n FROM votes WHERE candidate_id = ?').get(Number(id)).n
  );
}

/* ------------------------- الأصوات ------------------------- */
const RECEIPT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeReceipt() {
  let s = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) s += RECEIPT_ALPHABET[bytes[i] % RECEIPT_ALPHABET.length];
  return `IUA-${s.slice(0, 4)}-${s.slice(4)}`;
}

function addVote(data, req) {
  const uid = normalizeId(data.university_id);
  const receipt = makeReceipt();
  const res = db.prepare(
    `INSERT INTO votes
      (candidate_id, voter_name, university_id, batch, reason, receipt, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    Number(data.candidate_id),
    cleanText(data.voter_name, 80),
    uid,
    batchOf(uid),
    cleanText(data.reason, 1500),
    receipt,
    clientIp(req),
    cleanText((req && req.headers['user-agent']) || '', 400),
    now()
  );
  return { id: Number(res.lastInsertRowid), receipt };
}
function hasVoted(uid) {
  return !!db.prepare('SELECT id FROM votes WHERE university_id = ?').get(normalizeId(uid));
}
function getVoteByReceipt(receipt) {
  const norm = String(receipt || '').trim().toUpperCase();
  return db.prepare(`
    SELECT v.*, c.name AS candidate_name
    FROM votes v
    LEFT JOIN candidates c ON v.candidate_id = c.id
    WHERE UPPER(v.receipt) = ?
  `).get(norm);
}
function getVote(id) {
  return db.prepare('SELECT * FROM votes WHERE id = ?').get(Number(id));
}
function listVotes() {
  const rows = db.prepare(`
    SELECT v.*, c.name AS candidate_name, c.university_id AS candidate_uid,
      (SELECT COUNT(*) FROM votes v2 WHERE v2.ip = v.ip AND v.ip <> '') AS ip_count
    FROM votes v LEFT JOIN candidates c ON c.id = v.candidate_id
    ORDER BY v.created_at DESC
  `).all();
  return rows.map((v) => ({
    ...v,
    device: parseDeviceInfo(v.user_agent)
  }));
}
function deleteVote(id) {
  return db.prepare('DELETE FROM votes WHERE id = ?').run(Number(id)).changes > 0;
}
function clearVotes() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM votes').get().n;
  db.prepare('DELETE FROM votes').run();
  return Number(n);
}
function resultsAggregate() {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.batch, c.department,
           COUNT(v.id) AS votes
    FROM candidates c LEFT JOIN votes v ON v.candidate_id = c.id
    WHERE c.status = 'approved'
    GROUP BY c.id ORDER BY votes DESC, c.created_at ASC
  `).all();
  const total = db.prepare('SELECT COUNT(*) AS n FROM votes').get().n;
  const byBatch = db.prepare(`
    SELECT batch, COUNT(*) AS n FROM votes GROUP BY batch ORDER BY batch
  `).all();
  const out = rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    name: r.name,
    batch: r.batch,
    department: r.department,
    votes: Number(r.votes),
    percent: total ? Math.round((Number(r.votes) / Number(total)) * 1000) / 10 : 0
  }));
  return {
    total: Number(total),
    candidates: out,
    byBatch: byBatch.map((b) => ({ batch: b.batch, votes: Number(b.n) })),
    integrity: {
      uniqueVoters: Number(total),
      registeredIps: db.prepare('SELECT COUNT(DISTINCT ip) AS n FROM votes WHERE ip <> \'\'').get().n,
      pendingCandidates: db.prepare(`SELECT COUNT(*) AS n FROM candidates WHERE status='pending'`).get().n
    }
  };
}

/** إحصاءات عامة (لا تُعرض تفاصيل الأصوات إلا بعد إعلان النتائج من الرئيس) */
function publicStats() {
  const isPub = getSetting('results_public') === '1';
  const q = (sql) => Number(db.prepare(sql).get().n);
  return {
    candidates: q(`SELECT COUNT(*) AS n FROM candidates WHERE status='approved'`),
    votes: isPub ? q('SELECT COUNT(*) AS n FROM votes') : 0,
    byBatch: isPub
      ? db.prepare('SELECT batch, COUNT(*) AS n FROM votes GROUP BY batch ORDER BY batch')
          .all().map((b) => ({ batch: b.batch, votes: Number(b.n) }))
      : [],
    results_public: isPub
  };
}

/* ------------------------- الرسائل ------------------------- */
function addMessage(data, req) {
  const ref = 'MSG-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  db.prepare(
    `INSERT INTO messages (ref, name, whatsapp, subject, body, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ref,
    cleanText(data.name, 80),
    normalizePhone(data.whatsapp),
    cleanText(data.subject, 120),
    cleanText(data.body, 3000),
    clientIp(req),
    cleanText((req && req.headers['user-agent']) || '', 400),
    now()
  );
  return ref;
}
function getMessageByRef(ref) {
  return db.prepare('SELECT * FROM messages WHERE ref = ?').get(String(ref || '').trim().toUpperCase());
}
function listMessages() {
  return db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all();
}
function updateMessage(id, fields) {
  const sets = [];
  const vals = [];
  if (fields.status !== undefined) {
    sets.push('status = ?');
    vals.push(cleanText(fields.status, 20));
  }
  if (fields.reply !== undefined) {
    sets.push('reply = ?');
    vals.push(cleanText(fields.reply, 3000));
    sets.push('replied_at = ?');
    vals.push(fields.reply ? now() : '');
    if (fields.reply) {
      sets.push('status = ?');
      vals.push('replied');
    }
  }
  if (!sets.length) return false;
  vals.push(Number(id));
  db.prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return true;
}
function deleteMessage(id) {
  return db.prepare('DELETE FROM messages WHERE id = ?').run(Number(id)).changes > 0;
}

/* ------------------------- سجل التدقيق استعلام ------------------------- */
function listAudit(limit) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?')
    .all(Math.min(Number(limit) || 200, 1000));
}

/* ------------------------- إحصاءات ------------------------- */
function stats() {
  const q = (sql) => Number(db.prepare(sql).get().n);
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  return {
    candidatesTotal: q('SELECT COUNT(*) AS n FROM candidates'),
    candidatesPending: q(`SELECT COUNT(*) AS n FROM candidates WHERE status='pending'`),
    candidatesApproved: q(`SELECT COUNT(*) AS n FROM candidates WHERE status='approved'`),
    candidatesRejected: q(`SELECT COUNT(*) AS n FROM candidates WHERE status='rejected'`),
    votesTotal: q('SELECT COUNT(*) AS n FROM votes'),
    votesST20: q(`SELECT COUNT(*) AS n FROM votes WHERE batch='ST20'`),
    votesST21: q(`SELECT COUNT(*) AS n FROM votes WHERE batch='ST21'`),
    votesST22: q(`SELECT COUNT(*) AS n FROM votes WHERE batch='ST22'`),
    votesLast24h: Number(
      db.prepare('SELECT COUNT(*) AS n FROM votes WHERE created_at >= ?').get(dayAgo).n
    ),
    messagesNew: q(`SELECT COUNT(*) AS n FROM messages WHERE status='new'`),
    messagesTotal: q('SELECT COUNT(*) AS n FROM messages'),
    auditTotal: q('SELECT COUNT(*) AS n FROM audit_log'),
    uniqueIps: q(`SELECT COUNT(DISTINCT ip) AS n FROM votes WHERE ip <> ''`),
    failedLogins24h: Number(
      db.prepare(
        `SELECT COUNT(*) AS n FROM audit_log
         WHERE action='admin_login_failed' AND created_at >= ?`
      ).get(dayAgo).n
    )
  };
}

/* ------------------------- الأمان ------------------------- */
function securityOverview(currentToken) {
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const failed = db.prepare(
    `SELECT actor, detail, ip, user_agent, created_at FROM audit_log
     WHERE action='admin_login_failed' AND created_at >= ?
     ORDER BY id DESC LIMIT 20`
  ).all(dayAgo);
  const sessions = activeSessions();
  const h = sha256(currentToken || '');
  const current = db.prepare('SELECT created_at, expires_at, ip FROM sessions WHERE token_hash = ?').get(h);
  return {
    defaultPasswordInUse: defaultPasswordInUse(),
    failedLogins24h: failed.length,
    failedLogins: failed,
    sessionsCount: sessions.length,
    sessions,
    currentSession: current || null,
    trustProxy: process.env.TRUST_PROXY === '1',
    https: process.env.HTTPS === '1'
  };
}

/* ------------------------- IP ------------------------- */
function clientIp(req) {
  if (!req) return '';
  // لا نثق بـ X-Forwarded-For إلا عند تشغيل خلف وكيل معكوس موثوق
  if (process.env.TRUST_PROXY === '1') {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || '';
}

seedSettings();
purgeSessions();

module.exports = {
  db, getSetting, setSetting, allSettings, safeSettings, seedSettings,
  hashPassword, verifyPassword, defaultPasswordInUse,
  createSession, getSession, deleteSession, purgeSessions, activeSessions, revokeOtherSessions,
  normalizeId, validId, batchOf, validPhone, normalizePhone, cleanText, now,
  audit, clientIp, parseDeviceInfo,
  addCandidate, getCandidate, getCandidateByIdNumber, listCandidates,
  updateCandidate, deleteCandidate, candidateVoteCount,
  addVote, hasVoted, getVote, getVoteByReceipt, listVotes, deleteVote, clearVotes, resultsAggregate, publicStats,
  addMessage, getMessageByRef, listMessages, updateMessage, deleteMessage,
  listAudit, stats, securityOverview
};
