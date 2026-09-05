# MZJ Showroom v45 — Cache Reset On Open — Clean

مبنية على v44 بدون تغيير منطق السيارات أو الشاشات أو المواصفات.

## التعديل في v45
- كل فتح لصفحة العرض ينشئ Cache-Buster جديد.
- حذف Cache Storage الموجود للـ origin عند الفتح، إن كان المتصفح يدعمه.
- إلغاء أي Service Worker قديم عند الفتح.
- `styles.css` و `firebase-config.js` يتم تحميلهما بعنوان جديد في كل فتح.
- صور السيارة عبر `image-proxy` تحمل Cache-Buster خاص بجلسة الصفحة.
- الـ direct image fallback يحمل Cache-Buster أيضًا.
- `/api/image-proxy` أصبح `no-store` بدل التخزين لمدة يوم.
- Vercel يرسل `Cache-Control: no-store` + `Pragma: no-cache` + `Expires: 0`.
- `/screen` و `/screen.html` يرسلان `Clear-Site-Data: "cache"` للمتصفحات التي تدعمها.
- لا يتم مسح localStorage أو Firebase Auth، لذلك لا يتم تسجيل خروج الداش بورد.

## الهدف
تقليل/إلغاء اعتماد شاشات الـ Kiosk على نسخة قديمة من HTML/CSS أو صور السيارة، بدون زيارة الشاشة لمسح الكاش يدويًا.


## V54 National Day settings
- National Day defaults to 96.
- Default logo: `public/assets/themes/national-day-default.png`.
- Dashboard can change the National Day number and logo without editing source code.
- Saved globally in `showroom_settings/display` as `nationalDayNumber` and `nationalDayLogoDataUrl`.
- Global theme selection still applies to all showroom screens.
