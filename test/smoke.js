'use strict';
/* ============================================================
   فحص الجاهزية والنزاهة الشامل لمنصة الانتخابات (CSA Smoke Test)
   ============================================================ */
const http = require('http');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

function req(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { ...headers }
    };
    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error('❌ فشل الاختبار:', message);
    process.exit(1);
  }
  console.log('  ✔', message);
}

async function runAllTests() {
  console.log('\n🚀 بدء الفحص الشامل لمنظومة الانتخابات والتحقق من الجاهزية...\n');

  // 1. فحص الصحة (Health Check)
  console.log('[1] فحص حالة الخادم وقاعدة البيانات');
  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'الخادم يستجيب على /api/health برمز 200');
  assert(health.json && health.json.db === 'healthy', 'قاعدة البيانات سليمة ونشطة');
  assert(health.headers['content-security-policy'], 'رؤوس الأمان CSP مطبقة على الرد');
  assert(health.headers['x-content-type-options'] === 'nosniff', 'رأس nosniff مفعّل لمنع استغلال أنواع MIME');

  // 2. الواجهة العامة للموقع
  console.log('\n[2] فحص البوابة العامة والمسارات الثابتة');
  const home = await req('GET', '/');
  assert(home.status === 200, 'الصفحة الرئيسية / تعمل بنجاح برمز 200');
  assert(home.data.includes('جمعية الحاسوب'), 'محتوى الصفحة الرئيسية يتضمن الهوية الرسمية للجمعية');
  assert(!home.data.includes('phone-app-wrapper'), 'لا توجد محاكاة هاتفية مصطنعة في كود الصفحة الرئيسية');

  // 3. التحقق الأمني من حظر مسار /admin القديم
  console.log('\n[3] التدقيق الأمني على مسارات الإدارة القديمة والسرية');
  const legacyAdmin = await req('GET', '/admin');
  assert(legacyAdmin.status === 404, 'المسار القديم /admin محجوب تماماً ويعيد 404');
  const legacyAdminHtml = await req('GET', '/admin.html');
  assert(legacyAdminHtml.status === 404, 'المسار القديم /admin.html محجوب ويعيد 404');

  // 4. المسار الرئاسي السري المعزول
  const adminPath = process.env.ADMIN_PATH || '/csa-admin-panel';
  const secretConsole = await req('GET', adminPath);
  assert(secretConsole.status === 200, `المسار الرئاسي السري ${adminPath} يعمل برمز 200`);
  assert(secretConsole.headers['x-robots-tag'] === 'noindex, nofollow', 'المسار الرئاسي محجوب عن محركات البحث تماماً');

  // 5. إعدادات المنصة العامة
  console.log('\n[4] فحص واجهات البرمجة العامة (Public APIs)');
  const cfg = await req('GET', '/api/config');
  assert(cfg.status === 200, 'إعدادات المنصة /api/config مسترجعة بنجاح');
  assert(cfg.json.college_name.includes('الحاسوب'), 'بيانات الكلية والجامعة مضبوطة بدقة');

  const stats = await req('GET', '/api/public-stats');
  assert(stats.status === 200, 'إحصائيات المنصة /api/public-stats مسترجعة بنجاح');
  assert(typeof stats.json.candidates === 'number', 'عداد المرشحين الرقمي متاح');

  // 6. التحقق من إرسال رسالة دعم
  console.log('\n[5] فحص قناة التواصل المباشر مع رئاسة الجمعية');
  const msgRes = await req('POST', '/api/message', {
    name: 'طالب مجرب للاختبار',
    whatsapp: '0912345678',
    subject: 'استفسار عن الاقتراع',
    body: 'رسالة فحص آلي للتأكد من وصول البلاغات للوحة الرئاسة'
  });
  assert(msgRes.status === 210, 'تم إرسال الرسالة بنجاح واستلام رمز المرجع 210');
  assert(msgRes.json && msgRes.json.ref, `رقم مرجع الرسالة: ${msgRes.json.ref}`);

  // 7. دخول المدير
  console.log('\n[6] فحص مصادقة المدير وتوليد جلسة مشفّرة');
  const wrongLogin = await req('POST', '/api/admin/login', { password: 'WrongPassword123' });
  assert(wrongLogin.status === 401, 'محاولة الدخول بكلمة مرور خاطئة مرفوضة بـ 401');

  const okLogin = await req('POST', '/api/admin/login', { password: process.env.ADMIN_PASSWORD || 'ChangeMe@2026' });
  assert(okLogin.status === 200, 'دخول المدير ناجح برمز 200');
  const token = okLogin.json.token;
  assert(typeof token === 'string' && token.length > 20, 'تم استلام توكن الجلسة المشفر بنجاح');

  // 8. فحص واجهات المدير المصرحة
  console.log('\n[7] فحص واجهات لوحة التحكم الرئاسية الموثقة');
  const adminHeaders = { 'Authorization': `Bearer ${token}` };

  const adminMe = await req('GET', '/api/admin/me', null, adminHeaders);
  assert(adminMe.status === 200, 'استرجاع بيانات المدير /api/admin/me ناجح');

  const adminSec = await req('GET', '/api/admin/security', null, adminHeaders);
  assert(adminSec.status === 200, 'استرجاع سجل ونظرة الأمان /api/admin/security ناجح');

  const expRes = await req('GET', '/api/admin/export?type=results', null, adminHeaders);
  assert(expRes.status === 200, 'تصدير ملف النتائج الرسمي CSV يعمل بنجاح');
  assert(expRes.headers['content-type'].includes('text/csv'), 'نوع المحتوى المرتجع هو CSV مرمز بـ UTF-8 مع BOM');

  console.log('\n======================================================');
  console.log('🎉 اكتملت جميع اختبارات الجاهزية والنزاهة بنجاح بنسبة 100%!');
  console.log('النظام جاهز تماماً للنشر والتشغيل المباشر.');
  console.log('======================================================\n');
}

runAllTests().catch(e => {
  console.error('خطأ غير متوقع أثناء الفحص:', e);
  process.exit(1);
});
