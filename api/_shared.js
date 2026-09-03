const http = require('http');
const https = require('https');
const { URL } = require('url');

const STOCK_URL = process.env.MZJ_CARS_ENDPOINT || 'https://mzjcars.com/wp-json/mzj-platform/v2/cars';
const PARSER_VERSION = 'v43-robust-image-loading';
const STOCK_TTL = 2 * 60 * 1000;
const CAR_TTL = 5 * 60 * 1000;
const cache = { stock: null, stockAt: 0, cars: new Map() };

function fetchText(url, timeout = 20000){
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': 'MZJ-Showroom/41.0',
      'Accept': 'text/html,application/json,*/*',
      'Cache-Control': 'no-cache'
    };
    const bridgeKey = process.env.MZJ_BRIDGE_KEY || process.env.MZJ_CARS_API_KEY || process.env.WORDPRESS_CARS_API_KEY || '';
    if (bridgeKey && /\/wp-json\/mzj-platform\//i.test(u.pathname)) headers['X-MZJ-Bridge-Key'] = bridgeKey;

    const req = lib.get(u, { headers, timeout }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
          const next = new URL(res.headers.location, url).toString();
          fetchText(next, timeout).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error('HTTP ' + res.statusCode + ' from ' + url));
        resolve(body);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Timeout fetching ' + url)));
    req.on('error', reject);
  });
}

function decodeHtmlEntities(value){
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#039;|&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function cleanText(value){
  return decodeHtmlEntities(String(value || ''))
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArabic(value){
  return cleanText(value)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[^\u0600-\u06ff0-9a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(list){
  const seen = new Set();
  const out = [];
  for (const item of list || []){
    const value = cleanText(item);
    const key = normalizeArabic(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function isPlainObject(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function firstNonEmpty(){
  for (const value of arguments){
    if (value === 0 || value === false) return value;
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '')) return value;
  }
  return '';
}
function getPath(obj, path){
  return String(path || '').split('.').reduce((cur, key) => cur == null ? undefined : cur[key], obj);
}
function pick(obj, paths){
  for (const path of paths || []){
    const value = getPath(obj, path);
    if (value === 0 || value === false) return value;
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '')) return value;
  }
  return '';
}
function scalarText(v){
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return cleanText(v);
  if (Array.isArray(v)) return cleanText(v.map(scalarText).filter(Boolean).join('، '));
  if (isPlainObject(v)) return cleanText(firstNonEmpty(v.name, v.label, v.title, v.value, v.text, v.formatted, v.display, v.amount, v.slug));
  return '';
}

function absoluteUrl(value, baseUrl){
  value = decodeHtmlEntities(String(value || '')).replace(/\\\//g, '/').trim();
  if (!value) return '';
  try { return new URL(value, baseUrl || 'https://mzjcars.com').toString(); }
  catch (_) { return ''; }
}
function badImageUrl(url){
  return /default-car|placeholder|no-image|noimage|logo|mzj-logo|favicon|icon|cropped|avatar|loader|spinner|blank/i.test(String(url || ''));
}
function collectUrls(value, out, baseUrl){
  out = out || [];
  if (!value) return out;
  if (typeof value === 'string'){
    const url = absoluteUrl(value, baseUrl);
    if (url && /\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(url) && !badImageUrl(url)) out.push(url);
    return out;
  }
  if (Array.isArray(value)){
    value.forEach(v => collectUrls(v, out, baseUrl));
    return out;
  }
  if (isPlainObject(value)){
    ['url','src','source_url','full','large','medium','image','image_url','featured_image','thumbnail'].forEach(key => collectUrls(value[key], out, baseUrl));
    Object.keys(value).forEach(key => {
      if (/^(?:url|src|source_url|full|large|medium|image|image_url|featured_image|thumbnail)$/i.test(key)) return;
      if (Array.isArray(value[key])) collectUrls(value[key], out, baseUrl);
    });
  }
  return out;
}
function uniqueUrls(list){
  const seen = new Set();
  const out = [];
  for (const item of list || []){
    const value = String(item || '').trim();
    if (!value || badImageUrl(value)) continue;
    const key = value.replace(/\?.*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizeSpecLabel(label){
  const n = normalizeArabic(label);
  const map = [
    [['الفئه','فئه السياره','trim','class'], 'الفئة'],
    [['الموديل','موديل السياره','السنه','year'], 'الموديل'],
    [['نوع الهيكل','هيكل السياره','الهيكل','body','body style'], 'نوع الهيكل'],
    [['سعه المحرك','المحرك','engine'], 'سعة المحرك'],
    [['ناقل الحركه','نوع الناقل','transmission','gearbox'], 'ناقل الحركة'],
    [['الدفع','نظام الدفع','drivetrain'], 'الدفع'],
    [['نوع الوقود','الوقود','fuel'], 'نوع الوقود'],
    [['استهلاك الوقود','استهلاك صرفيه البنزين','fuel economy'], 'استهلاك الوقود'],
    [['عدد المقاعد','seats'], 'عدد المقاعد'],
    [['الضمان','warranty'], 'الضمان'],
    [['عدد السرعات','gears'], 'عدد السرعات'],
    [['الحصان الميكانيكي','horsepower','hp'], 'الحصان الميكانيكي'],
    [['عزم نيوتن','torque'], 'عزم نيوتن'],
    [['السرعه القصوي','max speed'], 'السرعة القصوى'],
    [['عدد السلندرات','cylinders'], 'عدد السلندرات'],
    [['الطول مم','الطول الكلي مم','الطول','length'], 'الطول مم'],
    [['العرض مم','العرض الكلي مم','العرض','width'], 'العرض مم'],
    [['الارتفاع مم','الارتفاع الكلي مم','الارتفاع','height'], 'الارتفاع مم'],
    [['قاعده العجلات مم','قاعده العجلات','wheelbase'], 'قاعدة العجلات مم'],
    [['حجم الشنطه مم','حجم الشنطه','trunk','boot'], 'حجم الشنطة مم']
  ];
  for (const [aliases, canonical] of map){ if (aliases.indexOf(n) >= 0) return canonical; }
  return cleanText(label);
}

function specObjectFromApi(item){
  const out = {};
  const sources = [item.specs, item.specifications, item.vehicle_specs, item.details, item.acf && item.acf.specs, item.acf && item.acf.specifications].filter(isPlainObject);
  for (const source of sources){
    Object.keys(source).forEach(key => {
      const value = scalarText(source[key]);
      if (value) out[normalizeSpecLabel(key)] = value;
    });
  }
  return out;
}

function featureListFromApi(item, keys){
  for (const key of keys){
    const value = getPath(item, key);
    if (!value) continue;
    if (Array.isArray(value)) return uniqueStrings(value.map(v => scalarText(v)));
    if (typeof value === 'string') return uniqueStrings(value.split(/\r?\n|\||;|•|●|▪|✓|✔/));
  }
  return [];
}

function extractApiItems(payload){
  if (Array.isArray(payload)) return payload;
  if (!isPlainObject(payload)) return [];
  for (const key of ['cars','items','data','results','vehicles','posts']){
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (isPlainObject(value)){
      for (const nested of ['cars','items','data','results','vehicles','posts']) if (Array.isArray(value[nested])) return value[nested];
    }
  }
  const arrays = Object.values(payload).filter(Array.isArray);
  return arrays.length === 1 ? arrays[0] : [];
}

function stockItemToCar(item){
  item = item || {};
  const specs = specObjectFromApi(item);
  const put = (label, value) => { value = scalarText(value); if (value && !specs[label]) specs[label] = value; };
  put('الفئة', pick(item, ['trim','class','car_trim','taxonomies.car_trim','acf.trim']));
  put('الموديل', pick(item, ['year','model_year','car_year','taxonomies.car_year','acf.year']));
  put('نوع الهيكل', pick(item, ['body_style','body','body_type','acf.body_style']));
  put('سعة المحرك', pick(item, ['engine_cap','engine_capacity','engine','acf.engine_cap']));
  put('ناقل الحركة', pick(item, ['transmission','gearbox','acf.transmission']));
  put('الدفع', pick(item, ['drivetrain','drive_train','drive','acf.drivetrain']));
  put('نوع الوقود', pick(item, ['fuel_type','fuel','acf.fuel_type']));
  put('عدد المقاعد', pick(item, ['seats','seat_count','acf.seats']));
  put('الضمان', pick(item, ['warranty','guarantee','acf.warranty']));

  const images = uniqueUrls(collectUrls(firstNonEmpty(item.images, item.gallery, item.gallery_images, item.media, item.image, item.image_url, item.featured_image, item.thumbnail, item.acf && item.acf.gallery, item.acf && item.acf.images), [], 'https://mzjcars.com'));
  let carUrl = scalarText(pick(item, ['url','link','permalink','car_url','post_url','acf.url']));
  if (carUrl && carUrl.startsWith('/')) carUrl = 'https://mzjcars.com' + carUrl;
  if (!carUrl){
    const slug = scalarText(pick(item, ['slug','post_name','car_slug']));
    if (slug) carUrl = 'https://mzjcars.com/cars/' + encodeURIComponent(slug) + '/';
  }
  const title = scalarText(pick(item, ['name','title.rendered','title','post_title','car_name','acf.name']));
  const price = scalarText(pick(item, ['price','final_price','sale_price','current_price','pricing.price','pricing.final','acf.price']));

  return {
    parserVersion: PARSER_VERSION,
    source: 'mzj-platform-v2',
    id: scalarText(pick(item, ['id','ID','post_id','car_id','vehicle_id'])),
    vehicleId: scalarText(pick(item, ['vehicle_id','vehicleId','mzj_vehicle_id'])),
    carUrl,
    title,
    price,
    image: images[0] || '',
    images,
    specs,
    featureGroups: {
      interior: featureListFromApi(item, ['featureGroups.interior','feature_groups.interior','interior_features','features_interior','acf.interior_features']),
      exterior: featureListFromApi(item, ['featureGroups.exterior','feature_groups.exterior','exterior_features','features_exterior','acf.exterior_features']),
      safety: featureListFromApi(item, ['featureGroups.safety','feature_groups.safety','safety_features','features_safety','acf.safety_features'])
    }
  };
}

async function getStock(force = false){
  if (!force && cache.stock && Date.now() - cache.stockAt < STOCK_TTL) return cache.stock;
  const text = await fetchText(STOCK_URL);
  const payload = JSON.parse(text);
  const raw = extractApiItems(payload);
  if (!raw.length && !(Array.isArray(payload) && payload.length === 0)) throw new Error('Cars endpoint returned no readable cars array');
  const items = raw.map(stockItemToCar).filter(car => car.id && car.carUrl);
  cache.stock = { ok: true, source: STOCK_URL, count: items.length, fetchedAt: new Date().toISOString(), items };
  cache.stockAt = Date.now();
  return cache.stock;
}

function attrValue(tag, name){
  const re = new RegExp('\\b' + name + '\\s*=\\s*(["\\\'])([\\s\\S]*?)\\1', 'i');
  const m = re.exec(String(tag || ''));
  return m ? decodeHtmlEntities(m[2]) : '';
}
function styleBackground(fragment){
  const m = /<i\b[^>]*style=["']([^"']*)["'][^>]*>/i.exec(fragment || '');
  if (!m) return '';
  const bg = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(m[1]);
  return bg ? cleanText(bg[1]) : '';
}
function sliceBetween(html, startNeedle, endNeedles){
  const start = String(html || '').indexOf(startNeedle);
  if (start < 0) return '';
  let end = html.length;
  for (const needle of endNeedles || []){
    const i = html.indexOf(needle, start + startNeedle.length);
    if (i >= 0 && i < end) end = i;
  }
  return html.slice(start, end);
}

function parsePageTitle(html){
  const fragment = sliceBetween(html, 'class="mzjpan-summary"', ['class="mzjpan-price"','class="mzjpan-quick-grid"']);
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(fragment);
  return m ? cleanText(m[1]) : '';
}
function parsePagePrice(html){
  const fragment = sliceBetween(html, 'class="mzjpan-price"', ['class="mzjpan-quick-grid"']);
  const m = /<strong[^>]*>([\s\S]*?)<\/strong>/i.exec(fragment);
  return m ? cleanText(m[1]) : '';
}
function parseQuickSpecs(html){
  const fragment = sliceBetween(html, 'class="mzjpan-quick-grid"', ['class="mzjpan-unavailable"','class="mzjpan-ctas"','class="mzjpan-actions"']);
  const out = [];
  const re = /<div[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/div>/ig;
  let m;
  const seen = new Set();
  while ((m = re.exec(fragment))){
    const label = normalizeSpecLabel(m[1]);
    const value = cleanText(m[2]);
    const key = normalizeArabic(label);
    if (!label || !value || value === '—' || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, value });
  }
  return out;
}
function parseTechnicalGroups(html){
  const fragment = sliceBetween(html, 'class="mzjpan-spec-groups"', ['class="mzjpan-send-spec"','class="mzjpan-features"']);
  const groups = [];
  const detailsRe = /<details[^>]*class=["'][^"']*mzjpan-spec-group[^"']*["'][^>]*>([\s\S]*?)<\/details>/ig;
  let dm;
  while ((dm = detailsRe.exec(fragment))){
    const body = dm[1];
    const sm = /<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(body);
    const title = sm ? cleanText(sm[1]) : '';
    if (!title) continue;
    const items = [];
    const seen = new Set();
    const rowRe = /<p[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/p>/ig;
    let rm;
    while ((rm = rowRe.exec(body))){
      const label = normalizeSpecLabel(rm[1]);
      const value = cleanText(rm[2]);
      const key = normalizeArabic(label);
      if (!label || !value || value === '—' || seen.has(key)) continue;
      seen.add(key);
      items.push({ label, value });
    }
    if (items.length) groups.push({ title, items });
  }
  return groups;
}
function parseFeatureGroups(html){
  const fragment = sliceBetween(html, 'class="mzjpan-features"', ['class="mzjpan-related"','</main>']);
  const result = { interior: [], exterior: [], safety: [] };
  const groupRe = /<div[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>\s*<\/div>/ig;
  let gm;
  while ((gm = groupRe.exec(fragment))){
    const title = cleanText(gm[1]);
    const items = [];
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/ig;
    let lm;
    while ((lm = liRe.exec(gm[2]))){
      const value = cleanText(lm[1]);
      if (value) items.push(value);
    }
    const unique = uniqueStrings(items);
    if (/الداخلية/.test(title)) result.interior = unique;
    else if (/الخارجية/.test(title)) result.exterior = unique;
    else if (/الأمان|الامان/.test(title)) result.safety = unique;
  }
  return result;
}
function firstImageAttr(tag, names){
  for (const name of names){
    const value = attrValue(tag, name);
    if (value) return value;
  }
  return '';
}
function parseGallery(html, baseUrl){
  const fragment = sliceBetween(html, 'class="mzjpan-gallery"', ['class="mzjpan-available-colors"','class="mzjpan-summary"']);
  const images = [];
  const main = /<img\b[^>]*data-gallery-main[^>]*>/i.exec(fragment);
  if (main){
    const src = absoluteUrl(firstImageAttr(main[0], ['data-full','data-src','data-lazy-src','src']), baseUrl);
    if (src) images.push(src);
  }
  const btnRe = /<button\b[^>]*data-gallery-thumb[^>]*>/ig;
  let bm;
  while ((bm = btnRe.exec(fragment))){
    const full = absoluteUrl(firstImageAttr(bm[0], ['data-full','data-src','data-lazy-src']), baseUrl);
    if (full) images.push(full);
  }
  const imgRe = /<img\b[^>]*>/ig;
  let im;
  while ((im = imgRe.exec(fragment))){
    const src = absoluteUrl(firstImageAttr(im[0], ['data-full','data-src','data-lazy-src','src']), baseUrl);
    if (src) images.push(src);
  }
  return uniqueUrls(images);
}

const NAMED_SWATCHES = [
  ['أبيض سقف أسود','linear-gradient(135deg,#ffffff 0 50%,#111111 50% 100%)'],
  ['ابيض سقف اسود','linear-gradient(135deg,#ffffff 0 50%,#111111 50% 100%)'],
  ['رصاصي فاتح أسود','linear-gradient(135deg,#b7b7b7 0 50%,#111111 50% 100%)'],
  ['رصاصي فاتح+أسود','linear-gradient(135deg,#b7b7b7 0 50%,#111111 50% 100%)'],
  ['زيتي سقف أسود','linear-gradient(135deg,#68704a 0 50%,#111111 50% 100%)'],
  ['بني غامق','#5a3b31'],['رمادي غامق','#555555'],['رصاصي فاتح','#b7b7b7'],['أزرق فاتح','#8aa9c7'],['ازرق فاتح','#8aa9c7'],
  ['أوف وايت','#f3efe4'],['اوف وايت','#f3efe4'],['أسمنتي','#8b8f91'],['اسمنتي','#8b8f91'],
  ['أبيض','#ffffff'],['ابيض','#ffffff'],['أسود','#111111'],['اسود','#111111'],['فضي','#c4c6c8'],['رصاصي','#8b8d8f'],['رمادي','#6f7274'],
  ['أحمر','#b3262d'],['احمر','#b3262d'],['أخضر','#2f6c4f'],['اخضر','#2f6c4f'],['أزرق','#315f8a'],['ازرق','#315f8a'],['كحلي','#1f3554'],
  ['بني','#745347'],['بيج','#d8c4a2'],['جملي','#b8895a'],['برتقالي','#d66f2c'],['ذهبي','#c6a15b'],['زيتي','#68704a'],['موكا','#80645b'],['بنفسجي','#6d4d7d']
];
function fallbackSwatch(name){
  const value = cleanText(name);
  for (const [label, background] of NAMED_SWATCHES) if (value.indexOf(label) >= 0) return background;
  return '#dedede';
}
function parseJsonAttribute(value){
  value = decodeHtmlEntities(value || '').replace(/\\\//g, '/').trim();
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch (_) { return []; }
}
function parseAvailableColors(html, baseUrl){
  const fragment = sliceBetween(html, 'class="mzjpan-available-colors"', ['class="mzjpan-summary"']);
  const matrixMatch = /<script[^>]*data-next-color-matrix[^>]*>([\s\S]*?)<\/script>/i.exec(fragment);
  let matrix = {};
  if (matrixMatch){
    try { const parsed = JSON.parse(decodeHtmlEntities(matrixMatch[1])); if (isPlainObject(parsed)) matrix = parsed; }
    catch (_) {}
  }

  const external = [];
  const extRe = /<button\b([^>]*data-next-external[^>]*)>([\s\S]*?)<\/button>/ig;
  let em;
  while ((em = extRe.exec(fragment))){
    const tag = '<button ' + em[1] + '>';
    const body = em[2];
    const name = cleanText(attrValue(tag, 'data-next-external')) || cleanText((/<b[^>]*>([\s\S]*?)<\/b>/i.exec(body) || [,''])[1]);
    if (!name) continue;
    const rawImages = parseJsonAttribute(attrValue(tag, 'data-color-images'));
    const images = uniqueUrls(rawImages.map(u => absoluteUrl(u, baseUrl)).filter(Boolean));
    external.push({
      name,
      background: styleBackground(body) || fallbackSwatch(name),
      images,
      internals: Array.isArray(matrix[name]) ? uniqueStrings(matrix[name]) : []
    });
  }

  const internal = [];
  const intRe = /<button\b([^>]*data-next-internal[^>]*)>([\s\S]*?)<\/button>/ig;
  let im;
  while ((im = intRe.exec(fragment))){
    const tag = '<button ' + im[1] + '>';
    const body = im[2];
    const name = cleanText(attrValue(tag, 'data-next-internal')) || cleanText((/<b[^>]*>([\s\S]*?)<\/b>/i.exec(body) || [,''])[1]);
    if (!name) continue;
    internal.push({ name, background: styleBackground(body) || fallbackSwatch(name) });
  }

  // Canonical matrix is authoritative. If a color exists in the matrix but the
  // button was not rendered for any reason, keep it visible with a safe swatch.
  Object.keys(matrix).forEach(name => {
    if (!external.some(row => normalizeArabic(row.name) === normalizeArabic(name))){
      external.push({ name, background: fallbackSwatch(name), images: [], internals: uniqueStrings(matrix[name]) });
    }
    (matrix[name] || []).forEach(inner => {
      if (!internal.some(row => normalizeArabic(row.name) === normalizeArabic(inner))) internal.push({ name: inner, background: fallbackSwatch(inner) });
    });
  });

  return { matrix, external, internal };
}

function parseCanonicalCarPage(html, baseUrl){
  const quickSpecs = parseQuickSpecs(html);
  const specGroups = parseTechnicalGroups(html);
  const specs = {};
  quickSpecs.forEach(item => { if (!specs[item.label]) specs[item.label] = item.value; });
  specGroups.forEach(group => group.items.forEach(item => { if (!specs[item.label]) specs[item.label] = item.value; }));
  return {
    title: parsePageTitle(html),
    price: parsePagePrice(html),
    quickSpecs,
    specGroups,
    specs,
    featureGroups: parseFeatureGroups(html),
    images: parseGallery(html, baseUrl),
    availableColors: parseAvailableColors(html, baseUrl)
  };
}

function normUrlKey(value){
  value = String(value || '').trim();
  if (!value) return '';
  try {
    const u = new URL(value);
    u.hash = '';
    let path = u.pathname.replace(/\/{2,}/g, '/');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return (u.origin.toLowerCase() + path + u.search).toLowerCase();
  } catch (_) { return value.replace(/\/+$/, '').toLowerCase(); }
}

function mergeCar(stockCar, page){
  page = page || {};
  const specs = Object.assign({}, stockCar.specs || {}, page.specs || {});
  const images = page.images && page.images.length ? page.images : uniqueUrls([...(stockCar.images || []), stockCar.image].filter(Boolean));
  const featureGroups = page.featureGroups || stockCar.featureGroups || { interior: [], exterior: [], safety: [] };
  const availableColors = page.availableColors || { matrix: {}, external: [], internal: [] };
  const externalColors = availableColors.external || [];
  return Object.assign({}, stockCar, {
    parserVersion: PARSER_VERSION,
    source: 'mzj-platform-v2 + canonical-car-page',
    title: page.title || stockCar.title || '',
    price: page.price || stockCar.price || '',
    image: images[0] || '',
    images,
    specs,
    quickSpecs: page.quickSpecs || [],
    specGroups: page.specGroups || [],
    featureGroups: {
      interior: uniqueStrings(featureGroups.interior || []),
      exterior: uniqueStrings(featureGroups.exterior || []),
      safety: uniqueStrings(featureGroups.safety || [])
    },
    availableColors,
    colors: externalColors.map(row => ({ label: row.name, external: row.name, raw: row.name, background: row.background, images: row.images || [] })),
    availableSliderColors: externalColors.filter(row => Array.isArray(row.images) && row.images.length).map(row => ({ label: row.name, external: row.name, raw: row.name, background: row.background, images: row.images })),
    specsComplete: !!((page.quickSpecs || []).length || (page.specGroups || []).length || Object.values(page.featureGroups || {}).some(v => Array.isArray(v) && v.length)),
    updatedAt: new Date().toISOString()
  });
}

async function readCar(identifier){
  identifier = String(identifier || '').trim();
  if (!identifier) throw new Error('Missing vehicle identifier');

  const cached = cache.cars.get(identifier);
  if (cached && Date.now() - cached.at < CAR_TTL) return cached.data;

  const stock = await getStock(false);
  let car = stock.items.find(item => String(item.id || '') === identifier);
  if (!car){
    const wanted = normUrlKey(identifier);
    car = stock.items.find(item => normUrlKey(item.carUrl) === wanted);
  }
  if (!car) throw new Error('Selected vehicle was not found in the cars endpoint');
  if (!car.id) throw new Error('Selected vehicle has no stable Post ID');
  if (!car.carUrl) throw new Error('Selected vehicle has no canonical car URL');

  const html = await fetchText(car.carUrl);
  const page = parseCanonicalCarPage(html, car.carUrl);
  const data = mergeCar(car, page);

  if (String(data.id || '') !== String(car.id || '')) throw new Error('Vehicle identity changed while reading car data');
  if (normUrlKey(data.carUrl) !== normUrlKey(car.carUrl)) throw new Error('Vehicle URL changed while reading car data');

  const entry = { at: Date.now(), data };
  cache.cars.set(identifier, entry);
  cache.cars.set(String(car.id), entry);
  cache.cars.set(car.carUrl, entry);
  return data;
}

module.exports = { getStock, readCar, parseCanonicalCarPage };
