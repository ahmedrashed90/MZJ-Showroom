# MZJ Showroom Screens v20 - Vercel Fix

نسخة مخصصة للنشر على Vercel بعد خطأ: No entrypoint found.

## روابط التشغيل بعد النشر

- `/dashboard`
- `/screen?id=A1`
- `/screen?id=A2`

## ملاحظات مهمة

- ارفع محتويات هذا الفولدر مباشرة في جذر GitHub repo، لا ترفع الفولدر نفسه كفولدر داخلي.
- الملفات الأساسية في الجذر:
  - `server.js`
  - `index.js`
  - `package.json`
  - `vercel.json`
  - `api/`
  - `public/`

## تشغيل محلي

```bash
npm start
```

ثم افتح:

```text
http://localhost:3000/dashboard
http://localhost:3000/screen?id=A1
```
