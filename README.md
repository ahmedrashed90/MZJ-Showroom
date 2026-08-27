# MZJ Showroom Screens v37

نسخة متوافقة مع مصدر سيارات WordPress الجديد.

## مصدر السيارات

- Cars Endpoint: `https://mzjcars.com/wp-json/mzj-platform/v2/cars`
- الداش بورد والشاشات يقرآن السيارات والمواصفات والصور من المصدر الجديد.
- قراءة صفحة السيارة أصبحت fallback لإكمال المواصفات الداخلية والخارجية والأمان والصور عند الحاجة.
- لو صفحة السيارة نفسها لم تستجب، تستمر الشاشة في استخدام بيانات الـ API بدل ما تفضى.
- Cache الشاشات القديمة يُستخدم كـ fallback أثناء إعادة الجلب بدل ربطه بإصدار Parser قديم.

## مصادقة Bridge الاختيارية

إذا كان Cars Endpoint محميًا بهيدر `X-MZJ-Bridge-Key`، أضف السر في Vercel Environment Variables تحت أحد الأسماء التالية (الأول هو المفضل):

- `MZJ_BRIDGE_KEY`
- `MZJ_CARS_API_KEY`
- `WORDPRESS_CARS_API_KEY`

لا يتم وضع أي مفتاح سري داخل السورس.

## الروابط

- `/dashboard`
- `/screen?id=A1`
- `/pdf?id=A1`
- `/export?id=A1`
