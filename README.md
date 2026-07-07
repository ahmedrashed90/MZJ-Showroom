# MZJ Showroom Screens v18 - Vercel Ready

نسخة جاهزة للنشر على GitHub + Vercel، بدون روابط `.html` في الاستخدام اليومي.

## الروابط بعد النشر

لو رابط Vercel مثلًا:

```text
https://mzj-showroom-screens.vercel.app
```

استخدم:

```text
/dashboard
```

للإدارة:

```text
https://mzj-showroom-screens.vercel.app/dashboard
```

وللشاشات:

```text
https://mzj-showroom-screens.vercel.app/screen?id=A1
https://mzj-showroom-screens.vercel.app/screen?id=A2
https://mzj-showroom-screens.vercel.app/screen?id=A3
```

حتى A10.

## ما الذي تغير في v18؟

- تجهيز المشروع للنشر على Vercel.
- إضافة `vercel.json` لعمل روابط نظيفة:
  - `/dashboard`
  - `/screen?id=A1`
- إضافة Serverless APIs بدل الاعتماد على تشغيل `server.js` دائمًا:
  - `/api/stock`
  - `/api/read-car?url=...`
- الإبقاء على `server.js` للتجربة المحلية فقط.
- فتح الشاشة من الداش بورد أصبح على `/screen?id=A1` بدون `.html`.
- نفس إعدادات v17 محفوظة:
  - تكبير/تصغير خط المواصفات من لوحة الإدارة.
  - اختيار مكان اللوجو واسم المجموعة يمين/شمال.
  - الحفظ في Firestore داخل `showroom_settings/display`.

## التشغيل المحلي للتجربة فقط

```bash
node server.js
```

ثم افتح:

```text
http://localhost:3000/dashboard
http://localhost:3000/screen?id=A1
```

## النشر على Vercel

1. ارفع ملفات المشروع على GitHub.
2. افتح Vercel واعمل Import للـ repository.
3. لا تحتاج إعداد Build خاص.
4. بعد النشر استخدم روابط `/dashboard` و`/screen?id=A1`.

## مصادر البيانات

- `/wp-json/mzsm/v1/stock` لجلب الاستوك الأساسي.
- صفحة السيارة نفسها لاستخراج `MZJ_SPECS_ULTRA_V2_DATA`.
- Firestore لتخزين ربط كل شاشة بالسيارة وإعدادات العرض.
