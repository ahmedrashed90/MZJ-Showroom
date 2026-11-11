# MZJ Showroom Seasonal Design V68 LIGHT CLEAN

نسخة كاملة من مشروع MZJ Showroom مع الحفاظ على منطق البيانات والربط والشاشات، وإعادة بناء طبقة العرض الحالية مباشرة داخل ملفات المصدر بدون Override أو Patch فوق الإصدارات السابقة.

## التعديلات الرئيسية

- الحفاظ على صور السيارة كاملة داخل Safe Gallery باستخدام `object-fit: contain` لجميع الصور الخارجية والداخلية والزوايا المختلفة.
- إعادة بناء الجزء الخاص بالبيانات والمواصفات بتكوين بصري موحد وواضح بدل التوزيع المزدحم السابق.
- عنوان السيارة والسعر والألوان في رأس منظم بمسافات ومحاذاة ثابتة.
- المواصفات الرئيسية داخل إطار تصميم واحد مع أيقونات وفواصل داخلية واضحة، بدون بطاقات منفصلة لكل معلومة.
- المواصفات الفنية في مساحة مستقلة منظمة مع تبويبات في المنتصف.
- المواصفات الداخلية / الخارجية / الأمان أصبحت في شريط تبويبات مركزي واضح فوق منطقة المميزات.
- المميزات تعرض 14 عنصرًا في الصفحة: 7 في العمود الأيمن + 7 في العمود الأيسر، مع Pagination للباقي.
- استبدال التحكم الأفقي/الرأسي لمكان شعار المناسبة بقائمة منسدلة من 9 أماكن جاهزة داخل الصورة.
- استبدال التحكم الأفقي/الرأسي لمكان الكتابة أسفل الشعار بقائمة منسدلة مستقلة من نفس 9 الأماكن.
- الحفاظ على تحكم حجم الشعار، حجم النص، لون النص، لون إطار النص وسمك الإطار.
- رقم اليوم الوطني يبقى قابلًا للتغيير ويتحرك مع مجموعة كتابة المناسبة.
- جميع إعدادات هوية كل مناسبة تحفظ داخل `showroom_theme_settings/{themeId}` وتطبق على كل الشاشات.
- الخط الأساسي: Tajawal.
- الحفاظ على Firestore، استقلال A1/A2/...، جلب بيانات السيارات، الفلاتر، الصور، QR، الكاش، والتحديث التلقائي بدون تغيير في منطق العمل.


## V68 LIGHT DESIGN (2026-11-11)

- Adopted the approved warm-cream and deep-brown, high-contrast layout as the actual dynamic screen UI; not a static screenshot.
- The same light foundation works for Ramadan, National Day, Founding Day, Eid Al-Fitr and Eid Al-Adha; seasonal colors remain subtle accents.
- Preserved image containment, every available photo, both color catalogs, price, quick specs, technical tabs, all feature sections, QR links and Firestore data sources.
- Unified the dark-brown footer across the whole viewport and added a live gallery-image counter.
- On shorter landscape displays features paginate 10 per page (5 per column); on taller displays 14 per page (7 per column). No feature is discarded.
- Caption and logo placement is kept in nine independent positions. Edge placements remain inside the gallery, and pale captions receive an automatic legibility outline in the display only.
- Updated the theme thumbnails and identity previews in the dashboard to use corresponding bright surfaces.
- Changes are made directly in the maintained source components (screen.css, screen.js, dashboard.css, dashboard.html); no layered override file was introduced.
