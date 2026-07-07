# MZJ Showroom Screens v19 - Vercel Fixed

هذه النسخة مخصصة للنشر على GitHub + Vercel.

## المهم
ملفات الواجهة داخل فولدر `public/` حتى يتعرف عليها Vercel كـ static pages.

## الروابط بعد النشر
- `/dashboard`
- `/screen?id=A1`
- `/screen?id=A2`

## هيكل الملفات الصحيح على GitHub
```
api/
public/
package.json
vercel.json
README.md
```

لا ترفع فولدر داخلي يحتوي الملفات. ارفع محتويات النسخة نفسها في جذر الريبو.

## لو ظهر Not found
تأكد من وجود:
- `public/dashboard.html`
- `public/screen.html`
- `vercel.json`

ثم اعمل Redeploy من Vercel.
