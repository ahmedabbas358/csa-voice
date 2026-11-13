# ============================================================
# Dockerfile — منصة انتخابات جمعية الحاسوب IUA (Production v2)
# خفيف جداً، سريع، بدون أي اعتماديات خارجية أو حزم npm
# ============================================================
FROM node:22-alpine

# ضبط بيئة الإنتاج
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

# نسخ ملفات المشروع
COPY package.json ./
COPY server.js db.js ./
COPY public ./public

# إنشاء مجلد البيانات ومنح الصلاحيات
RUN mkdir -p /app/data && chown -R node:node /app

USER node

# مجلد قاعدة بيانات SQLite الدائم
VOLUME ["/app/data"]

EXPOSE 3000

# فحص صحة الحاوية التلقائي
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
