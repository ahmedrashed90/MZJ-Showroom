const http = require('http');
const https = require('https');
const { URL } = require('url');

const STOCK_URL = process.env.MZJ_CARS_ENDPOINT || 'https://mzjcars.com/wp-json/mzj-platform/v2/cars';
const PARSER_VERSION = 'v39-exact-id-page-data';
const cache = { stock: null, stockAt: 0, cars: new Map() };
const STOCK_TTL = 2 * 60 * 1000;
const CAR_TTL = 10 * 60 * 1000;

function send(res, code, body, type='application/json; charset=utf-8'){
  res.writeHead(code, {'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'});
  res.end(body);
}
function json(res, code, obj){ send(res, code, JSON.stringify(obj, null, 2)); }
function fetchText(url, timeout=20000){
  return new Promise((resolve, reject)=>{
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': 'MZJ-Showroom-Screens/32.0',
      'Accept': 'text/html,application/json,*/*',
      'Cache-Control': 'no-cache'
    };
    const bridgeKey = process.env.MZJ_BRIDGE_KEY || process.env.MZJ_CARS_API_KEY || process.env.WORDPRESS_CARS_API_KEY || '';
    if(bridgeKey && /\/wp-json\/mzj-platform\//i.test(u.pathname)){
      headers['X-MZJ-Bridge-Key'] = bridgeKey;
    }
    const req = lib.get(u, {
      headers,
      timeout
    }, r=>{
      let data='';
      r.setEncoding('utf8');
      r.on('data', c=> data += c);
      r.on('end', ()=>{
        if(r.statusCode >= 300 && r.statusCode < 400 && r.headers.location){
          const next = new URL(r.headers.location, url).toString();
          fetchText(next, timeout).then(resolve).catch(reject);
          return;
        }
        if(r.statusCode < 200 || r.statusCode >= 300) reject(new Error('HTTP '+r.statusCode+' from '+url));
        else resolve(data);
      });
    });
    req.on('timeout', ()=>{ req.destroy(new Error('Timeout fetching '+url)); });
    req.on('error', reject);
  });
}
function cleanText(s){
  return String(s || '')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#039;|&apos;/g,"'")
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function unique(arr){
  const seen = new Set();
  return (arr||[]).filter(x=>{
    x = cleanText(x);
    if(!x || seen.has(x)) return false;
    seen.add(x);
    return true;
  });
}

const COLOR_DEFS = [
  { token:'white',  label:'أبيض',     re: /أبيض|ابيض|white|pearl|snow|polar|wh\b|wht\b/i },
  { token:'black',  label:'أسود',     re: /أسود|اسود|black|obsidian|bk\b|blk\b/i },
  { token:'silver', label:'فضي',      re: /فضي|silver|silv|sl\b/i },
  { token:'gray',   label:'رمادي',    re: /رمادي|رصاصي|gray|grey|graphite|gy\b/i },
  { token:'red',    label:'أحمر',     re: /أحمر|احمر|red|burgundy|maroon|rd\b/i },
  { token:'blue',   label:'أزرق',     re: /أزرق|ازرق|blue|navy|blu\b/i },
  { token:'brown',  label:'بني/موكا', re: /بني|موكا|brown|mocha|bronze|copper/i },
  { token:'beige',  label:'بيج',      re: /بيج|beige|cream|ivory/i },
  { token:'green',  label:'أخضر',     re: /أخضر|اخضر|green/i },
  { token:'gold',   label:'ذهبي',     re: /ذهبي|gold|golden/i },
  { token:'orange', label:'برتقالي',  re: /برتقالي|orange/i }
];
function normalizeColorToken(value){
  value = cleanText(value);
  if(!value) return '';
  for(const c of COLOR_DEFS){ if(c.re.test(value)) return c.token; }
  return value.toLowerCase().replace(/\s+/g,'_').replace(/[^\p{L}\p{N}_-]/gu,'');
}
function colorLabelFromToken(token, fallback){
  token = String(token || '');
  const found = COLOR_DEFS.find(c => c.token === token);
  return found ? found.label : cleanText(fallback || token);
}
function addColorOption(list, value, source){
  const label = cleanText(value);
  if(!label || label === 'null' || label === '-') return;
  const token = normalizeColorToken(label);
  if(!token) return;
  if(list.some(x => x.token === token || x.label === label)) return;
  list.push({ token, label: colorLabelFromToken(token, label), raw: label, source: source || 'site' });
}
function extractKnownColors(text){
  const list = [];
  text = cleanText(text);
  if(!text) return list;
  COLOR_DEFS.forEach(c => { if(c.re.test(text)) list.push({ token:c.token, label:c.label, raw:c.label, source:'html' }); });
  return list;
}

function decodeMaybe(s){
  s = String(s || '').replace(/\\u0026/g,'&').replace(/\\\//g,'/');
  for(let i=0;i<3;i++){
    try{
      const d = decodeURIComponent(s);
      if(d === s) break;
      s = d;
    }catch(e){ break; }
  }
  return cleanText(s);
}
const COLOR_HEX_MAP = {
  '#fff':'أبيض', '#ffffff':'أبيض', '#f7f7f7':'أبيض', '#f8f8f8':'أبيض', '#fafafa':'أبيض', '#f5f5f5':'أبيض',
  '#000':'أسود', '#000000':'أسود', '#111':'أسود', '#111111':'أسود', '#1a1a1a':'أسود', '#222222':'أسود',
  '#dbdbdb':'فضي', '#dcdcdc':'فضي', '#dddddd':'فضي', '#c0c0c0':'فضي', '#bfbfbf':'فضي', '#cccccc':'فضي', '#silver':'فضي',
  '#808080':'رمادي', '#888888':'رمادي', '#999999':'رمادي', '#a0a0a0':'رمادي', '#9b9b9b':'رمادي', '#777777':'رمادي',
  '#ff0000':'أحمر', '#f00':'أحمر', '#d00000':'أحمر', '#cc0000':'أحمر',
  '#0000ff':'أزرق', '#00f':'أزرق', '#0047ab':'أزرق', '#003399':'أزرق',
  '#8b4513':'بني', '#964b00':'بني', '#a0522d':'بني', '#d2b48c':'بيج', '#f5f5dc':'بيج',
  '#ffd700':'ذهبي', '#daa520':'ذهبي', '#008000':'أخضر', '#00ff00':'أخضر'
};
function colorFromHex(hex){
  hex = cleanText(hex || '').toLowerCase();
  if(hex && hex[0] !== '#') hex = '#'+hex;
  return COLOR_HEX_MAP[hex] || '';
}
function validColorName(label){
  label = decodeMaybe(label);
  if(!label) return '';
  if(/%[0-9a-f]{2}/i.test(label)) return '';
  if(/close|woocommerce|product|variation|gallery|image|صورة|صور|select|option|button|undefined|null|محفوظ|كل الألوان|اللون المحفوظ/i.test(label)) return '';
  if(label.length > 45) return '';
  for(const c of COLOR_DEFS){ if(c.re.test(label)) return c.label; }
  return '';
}
function addKnownColorFromText(list, text, source, imgs){
  text = decodeMaybe(text);
  if(!text) return;
  COLOR_DEFS.forEach(c=>{
    if(c.re.test(text)) addVariationOption(list, {label:c.label, external:c.label, raw:c.label, source:source || 'taxonomy', images:imgs || []});
  });
}
function normalizeHex(hex){
  hex = cleanText(hex || '').toLowerCase();
  if(!hex) return '';
  if(hex[0] !== '#') hex = '#'+hex;
  if(/^#[0-9a-f]{3}$/i.test(hex)){
    hex = '#' + hex.slice(1).split('').map(ch => ch+ch).join('');
  }
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : '';
}
function labelFromHexStrict(hex){
  hex = normalizeHex(hex);
  const named = COLOR_HEX_MAP[hex] || '';
  if(named) return named;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  if(max - min < 18){
    if(max < 38) return 'أسود';
    if(min > 232) return 'أبيض';
    if(max > 190) return 'فضي';
    return 'رمادي';
  }
  // لا نخمن ألوان مش موجودة كاسم صريح؛ نعرضها ككود لون فقط بدل ما نطلع أزرق/برتقالي غلط.
  return hex;
}
function makeColorOptionFromHex(hex, source, images, label){
  hex = normalizeHex(hex);
  if(!hex) return null;
  const cleanLabel = validColorName(label || '') || labelFromHexStrict(hex);
  return { token: hex, label: cleanLabel, external: cleanLabel, raw: cleanLabel, hex, source: source || 'site-swatch', images: images || [] };
}
function addStrictColor(list, opt){
  if(!opt) return;
  let hex = normalizeHex(opt.hex || '');
  let label = validColorName(opt.label || opt.external || opt.raw || '') || '';
  if(!hex && !label) return;
  if(hex && !label) label = labelFromHexStrict(hex);
  if(!hex && label){
    const token = normalizeColorToken(label);
    if(!token) return;
    if(list.some(x => x.token === token || x.label === label)) return;
    list.push({ token, label, external: label, raw: label, hex:'', source: opt.source || 'site-taxonomy', images: unique(opt.images || []) });
    return;
  }
  if(list.some(x => x.hex === hex || x.token === hex)){
    const found = list.find(x => x.hex === hex || x.token === hex);
    found.images = unique([...(found.images || []), ...(opt.images || [])]);
    return;
  }
  list.push({ token: hex, label, external: label, raw: label, hex, source: opt.source || 'site-swatch', images: unique(opt.images || []) });
}
function extractWpTaxonomyColorsFromHtml(html, baseUrl){
  const out=[];
  if(!html) return out;
  const decoded = decodeMaybe(html);

  // المصدر المعتمد فقط: بلوك ألوان السيارة الحقيقي أو مفاتيح التاكسونومي المطلوبة من الموقع.
  const keys = [
    'الألوان المتاحة','الالوان المتاحة','الألوان الخارجية','الالوان الخارجية','اللون الخارجي',
    'car_exterior_color','exterior-color','exterior_color',
    'الألوان الداخلية','الالوان الداخلية','اللون الداخلي','car_interior_color','interior-color','interior_color',
    'Color Variations','color variations'
  ];

  const sections=[];
  keys.forEach(key=>{
    const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'ig');
    let m;
    while((m = re.exec(decoded))){
      sections.push(decoded.slice(Math.max(0, m.index - 900), Math.min(decoded.length, m.index + 4500)));
    }
  });
  if(!sections.length) return out;

  sections.forEach(frag=>{
    const imgs = extractImagesFromFragment(frag, baseUrl || 'https://mzjcars.com');

    // Swatches: style="background-color:#dbdbdb" / data-color="#fff" / data-value="#000"
    const hexAttrRe = /(?:background(?:-color)?\s*:\s*|data-(?:color|bg|hex|value)=['\"]|value=['\"]|title=['\"][^'\"]{0,40}|aria-label=['\"][^'\"]{0,40})(#[0-9a-fA-F]{3,6})/ig;
    let hm;
    while((hm = hexAttrRe.exec(frag))){
      const around = frag.slice(Math.max(0, hm.index - 160), Math.min(frag.length, hm.index + 220));
      const label = extractLabelNear(around, hm[1]);
      addStrictColor(out, makeColorOptionFromHex(hm[1], 'site-swatch', imgs, label));
    }

    // بعض القوالب تكتب اللون كـ "فضي (#dbdbdb)" أو "أبيض (#ffffff)".
    const namedHexRe = /(أبيض|ابيض|أسود|اسود|فضي|رمادي|رصاصي|بني|موكا|بيج|ذهبي)\s*\(?\s*(#[0-9a-fA-F]{3,6})?\s*\)?/ig;
    let nm;
    while((nm = namedHexRe.exec(frag))){
      const label = validColorName(nm[1]);
      if(label) addStrictColor(out, { label, hex:nm[2] || '', source:'site-taxonomy', images: imgs });
    }

    // مفاتيح التاكسونومي نفسها لما تكون مخزنة كنص.
    const valueRe = /(?:car_exterior_color|exterior-color|exterior_color|car_interior_color|interior-color|interior_color|اللون الخارجي|الألوان الخارجية|اللون الداخلي|الألوان الداخلية)[^\n<>]{0,220}/ig;
    let vm;
    while((vm = valueRe.exec(frag))){
      const txt = decodeMaybe(vm[0]);
      ['أبيض','ابيض','أسود','اسود','فضي','رمادي','رصاصي','بني','موكا','بيج','ذهبي'].forEach(word=>{
        if(new RegExp(word,'i').test(txt)) addStrictColor(out, { label: word, source:'site-taxonomy', images: imgs });
      });
    }
  });

  return out;
}

function htmlAttrDecode(s){ return cleanText(String(s||'').replace(/\\u0026/g,'&').replace(/\\\//g,'/')); }
function extractImagesFromFragment(fragment, baseUrl){
  const imgs=[]; const add=v=>{
    if(!v) return; v=String(v).replace(/\\\//g,'/').replace(/&amp;/g,'&').trim();
    if(v.startsWith('//')) v='https:'+v;
    try{ v=new URL(v, baseUrl).toString(); }catch(e){ return; }
    if(!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(v)) return;
    if(looksLikeBadUiImage(v)) return;
    if(!/wp-content\/uploads/i.test(v) && !/mzjcars\.com/i.test(v)) return;
    imgs.push(v);
  };
  let m; const imgAttrs=[/data-large_image=["']([^"']+)["']/ig,/data-full=["']([^"']+)["']/ig,/data-src=["']([^"']+)["']/ig,/src=["']([^"']+)["']/ig];
  imgAttrs.forEach(re=>{ while((m=re.exec(fragment))) add(m[1]); });
  const urlRe=/https?:\\?\/\\?\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/ig;
  while((m=urlRe.exec(fragment))) add(m[0].replace(/\\\//g,'/'));
  return unique(imgs);
}
function extractLabelNear(fragment, hex){
  const byHex = colorFromHex(hex);
  if(byHex) return byHex;
  const attrs = ['aria-label','title','data-title','data-name','data-color','data-color-name','data-value','alt','value'];
  for(const a of attrs){
    const re = new RegExp(a + `=([\"'])([^\"']{1,120})\\1`, 'i');
    const m = fragment.match(re);
    if(m){ const v = validColorName(m[2]); if(v) return v; }
  }
  const v = validColorName(fragment);
  return v || '';
}
function addVariationOption(list, opt){
  if(!opt) return;
  let label = decodeMaybe(opt.label || opt.external || opt.raw || '');
  let hex = cleanText(opt.hex || '');
  if(hex && hex[0] !== '#') hex = '#'+hex;
  if(hex && !/^#[0-9a-f]{3,6}$/i.test(hex)) hex='';
  const hexLabel = colorFromHex(hex);
  const valid = validColorName(label) || hexLabel;
  if(!valid) return;
  label = valid;
  const token = normalizeColorToken(label) || (hex ? hex.toLowerCase() : '');
  if(!token) return;
  const images = unique(opt.images || []);
  const found = list.find(x => x.token === token || (hex && x.hex === hex.toLowerCase()) || x.external === label || x.raw === label);
  if(found){
    found.images = unique([...(found.images||[]), ...images]);
    if(!found.hex && hex) found.hex = hex.toLowerCase();
    if(!found.raw) found.raw = label;
    if(!found.external) found.external = label;
    return;
  }
  list.push({ token, label, external: label, raw: label, hex: hex ? hex.toLowerCase() : '', source: opt.source || 'site', images });
}
function extractColorVariationsFromHtml(html, baseUrl){
  const out=[];
  if(!html) return out;
  const needles=['Color Variations','color variations','الألوان المتاحة','الالوان المتاحة','اللون','available colors','available_colors','product variations'];
  const hexRe=/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  let m;
  while((m=hexRe.exec(html))){
    const hex=m[0].toLowerCase();
    const start=Math.max(0,m.index-3500), end=Math.min(html.length,m.index+3500);
    const frag=html.slice(start,end);
    const low=frag.toLowerCase();
    const relevant = needles.some(n=>low.indexOf(n.toLowerCase())>=0) || /data-color|swatch|variation|gallery|صور|اللون/i.test(frag);
    if(!relevant) continue;
    const imgs=extractImagesFromFragment(frag, baseUrl);
    const label=extractLabelNear(frag, hex);
    addVariationOption(out,{hex,label,images:imgs,source:'site-variation'});
  }
  // Look for objects/arrays that explicitly mention color + images without depending only on hex proximity.
  const blockRe=/(?:color|colour|لون|variation|swatch)[\s\S]{0,2500}?(?:jpg|jpeg|png|webp)[\s\S]{0,1200}?/ig;
  while((m=blockRe.exec(html))){
    const frag=m[0];
    let hex=(frag.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/)||[])[0]||'';
    const imgs=extractImagesFromFragment(frag, baseUrl);
    if(!imgs.length && !hex) continue;
    const label=extractLabelNear(frag, hex);
    addVariationOption(out,{hex,label,images:imgs,source:'site-variation'});
  }
  return out.filter(c => c.hex || (c.images && c.images.length) || c.raw);
}

function extractColorsFromHtml(html){
  const out = [];
  const text = cleanText(html);
  const labelRe = /(الألوان المتاحة|الالوان المتاحة|اللون الخارجي|الألوان الخارجية|الالوان الخارجية|Exterior Color|Exterior Colors|Available Colors)(.{0,500})/ig;
  let m;
  while((m = labelRe.exec(text))){
    extractKnownColors(m[2]).forEach(c => { if(!out.some(x=>x.token===c.token)) out.push(c); });
  }
  // لو الصفحة فيها سكربتات/خصائص ألوان واضحة، التقطها كاحتياطي بدون ما نملأ ألوان عشوائية كتير.
  const metaRe = /(car_exterior_color|exterior_color|available_colors|colors)["'\s:=]+([^"'<>\n]{1,160})/ig;
  while((m = metaRe.exec(html))){
    extractKnownColors(m[2]).forEach(c => { if(!out.some(x=>x.token===c.token)) out.push(c); });
  }
  return out;
}
function extractColorsFromStock(raw, specs){
  const out = [];
  const keys = ['exterior_color','car_exterior_color','external_color','custom_external_color','color','colour','available_colors','availableColors','colors'];
  keys.forEach(k => {
    const v = raw && raw[k];
    if(Array.isArray(v)) v.forEach(x => addColorOption(out, x, 'stock'));
    else if(typeof v === 'string') v.split(/[|,،\/]+/).forEach(x => addColorOption(out, x, 'stock'));
  });
  addColorOption(out, specs && specs['اللون الخارجي'], 'stock-spec');
  return out;
}
function buildAvailableSliderColors(stockCar, html){
  const slider = [];
  const fallback = [];

  // v29: ألوان السلايدر لازم تكون ألوان مرتبطة بصور فعلية من Color Variations.
  // أي لون بدون صور لا يتم استخدامه كسلايدر حتى لا يختار المستخدم لون ولا تتغير الصور.
  extractColorVariationsFromHtml(html || '', stockCar.carUrl || '').forEach(c => {
    const imgs = unique(c.images || []).filter(Boolean);
    if(!imgs.length) return;
    addStrictColor(slider, Object.assign({}, c, { images: imgs, source: 'site-color-variation' }));
  });

  // fallback للعرض فقط: ألوان التاكسونومي الحقيقية، لكن بدون صور لا يعتمد عليها السلايدر.
  extractWpTaxonomyColorsFromHtml(html || '', stockCar.carUrl || '').forEach(c => addStrictColor(fallback, c));
  extractColorsFromStock(stockCar.rawStock || {}, stockCar.specs || {}).forEach(c => addStrictColor(fallback, {label:c.raw || c.label, source:c.source || 'stock'}));

  return slider.length ? slider : fallback;
}


function isPlainObject(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function firstNonEmpty(){
  for(let i=0;i<arguments.length;i++){
    const v = arguments[i];
    if(v === 0 || v === false) return v;
    if(v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}
function getPath(obj, path){
  if(!obj || !path) return undefined;
  return String(path).split('.').reduce((cur, key)=> cur == null ? undefined : cur[key], obj);
}
function pick(obj, paths){
  for(const path of paths || []){
    const v = getPath(obj, path);
    if(v === 0 || v === false) return v;
    if(v !== undefined && v !== null && (typeof v !== 'string' || v.trim() !== '')) return v;
  }
  return '';
}
function scalarText(v){
  if(v === undefined || v === null) return '';
  if(typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return cleanText(v);
  if(Array.isArray(v)) return cleanText(v.map(scalarText).filter(Boolean).join('، '));
  if(isPlainObject(v)){
    return cleanText(firstNonEmpty(v.name, v.label, v.title, v.value, v.text, v.formatted, v.display, v.amount, v.slug));
  }
  return '';
}
function collectUrls(value, out){
  out = out || [];
  if(!value) return out;
  if(typeof value === 'string'){
    const raw = value.replace(/\\\//g,'/').trim();
    if(/^https?:\/\//i.test(raw)) out.push(raw);
    else if(raw.startsWith('//')) out.push('https:'+raw);
    else if(raw.startsWith('/')) out.push('https://mzjcars.com'+raw);
    return out;
  }
  if(Array.isArray(value)){
    value.forEach(v=> collectUrls(v, out));
    return out;
  }
  if(isPlainObject(value)){
    ['url','src','source_url','full','large','medium','image','image_url','featured_image','thumbnail'].forEach(k=>{
      if(value[k]) collectUrls(value[k], out);
    });
    if(value.sizes) collectUrls(value.sizes, out);
  }
  return out;
}
function apiImages(item){
  const values = [
    pick(item,['images']), pick(item,['gallery']), pick(item,['gallery_images']), pick(item,['media']),
    pick(item,['image']), pick(item,['image_url']), pick(item,['featured_image']), pick(item,['featuredImage']),
    pick(item,['thumbnail']), pick(item,['thumbnail_url']), pick(item,['acf.gallery']), pick(item,['acf.images'])
  ];
  const urls=[];
  values.forEach(v=> collectUrls(v, urls));
  return unique(urls).filter(u=>!looksLikeBadUiImage(u));
}
function toStringList(value){
  const out=[];
  const add = v=>{
    if(v === undefined || v === null) return;
    if(typeof v === 'string' || typeof v === 'number'){
      String(v).split(/\r?\n|\||؛|;/).forEach(x=>{ x=cleanText(x); if(x) out.push(x); });
      return;
    }
    if(Array.isArray(v)){ v.forEach(add); return; }
    if(isPlainObject(v)){
      if(v.name || v.label || v.title || v.value || v.text) add(firstNonEmpty(v.name,v.label,v.title,v.value,v.text));
      else Object.values(v).forEach(add);
    }
  };
  add(value);
  return unique(out);
}
function featureGroupsFromApi(item){
  const root = pick(item,['featureGroups','feature_groups','features','spec_features','equipment','acf.features']) || {};
  const sources = [root, item.featureGroups || {}, item.feature_groups || {}, item.features || {}, item.specifications || {}, item.specs || {}, item, item.acf || {}];
  const find = aliases => {
    for(const src of sources){
      if(!src) continue;
      for(const key of aliases){
        const v = src[key];
        if(v !== undefined && v !== null){
          const arr = toStringList(v);
          if(arr.length) return arr;
        }
      }
    }
    return [];
  };
  return {
    interior: find(['interior','inside','interior_features','features_interior','المواصفات الداخلية','مواصفات داخلية']),
    exterior: find(['exterior','outside','exterior_features','features_exterior','المواصفات الخارجية','مواصفات خارجية']),
    safety: find(['safety','security','safety_features','features_safety','مواصفات الأمان','مواصفات الامان','الأمان'])
  };
}
function specObjectFromApi(item){
  const roots = [
    pick(item,['specs']), pick(item,['specifications']), pick(item,['specification']), pick(item,['details']),
    pick(item,['vehicle_specs']), pick(item,['car_specs']), pick(item,['attributes']), pick(item,['acf.specs']), pick(item,['acf.specifications'])
  ].filter(Boolean);
  const out={};
  const addPair=(k,v)=>{
    const key=cleanText(k), val=scalarText(v);
    if(!key || !val || key.length > 70) return;
    if(['interior','exterior','safety','features','images','gallery'].includes(key.toLowerCase())) return;
    out[key]=val;
  };
  roots.forEach(root=>{
    if(Array.isArray(root)){
      root.forEach(row=>{
        if(isPlainObject(row)) addPair(firstNonEmpty(row.label,row.name,row.key,row.title), firstNonEmpty(row.value,row.val,row.text,row.content));
      });
    }else if(isPlainObject(root)){
      Object.keys(root).forEach(k=> addPair(k, root[k]));
    }
  });
  return out;
}
function normalizeApiSpecLabel(label){
  label=cleanText(label).toLowerCase();
  const map = [
    [/^(السعر|price|final price|final_price)$/i,'السعر'],
    [/^(الموديل|موديل السيارة|year|model year|model_year)$/i,'موديل السيارة'],
    [/^(الماركة|ماركة السيارة|make|brand)$/i,'ماركة السيارة'],
    [/^(النوع|نوع السيارة|model|car model)$/i,'نوع السيارة'],
    [/^(الفئة|فئة السيارة|trim|class)$/i,'فئة السيارة'],
    [/^(نوع الهيكل|هيكل السيارة|body|body style|body_style)$/i,'هيكل السيارة'],
    [/^(المحرك|سعة المحرك|engine|engine cap|engine_cap|engine capacity)$/i,'سعة المحرك'],
    [/^(نوع الناقل|ناقل الحركة|transmission|gearbox)$/i,'نوع الناقل'],
    [/^(الدفع|نظام الدفع|drivetrain|drive train)$/i,'نظام الدفع'],
    [/^(الوقود|نوع الوقود|fuel|fuel type|fuel_type)$/i,'الوقود'],
    [/^(استهلاك الوقود|استهلاك صرفية البنزين|fuel economy|fuel_economy)$/i,'استهلاك صرفية البنزين'],
    [/^(الحصان الميكانيكي|horsepower|horse power|hp)$/i,'الحصان الميكانيكي'],
    [/^(عزم نيوتن|torque)$/i,'عزم نيوتن'],
    [/^(السرعة القصوى|max speed|max_speed)$/i,'السرعة القصوى'],
    [/^(عدد السلندرات|cylinders|n_cylinders)$/i,'عدد السلندرات'],
    [/^(عدد المقاعد|seats)$/i,'عدد المقاعد'],
    [/^(حجم الشنطة|حجم الشنطة مم|trunk|boot|back_size)$/i,'حجم الشنطة'],
    [/^(اللون الخارجي|exterior color|exterior_color|car_exterior_color)$/i,'اللون الخارجي'],
    [/^(اللون الداخلي|interior color|interior_color|car_interior_color)$/i,'اللون الداخلي'],
    [/^(الطول|الطول مم|الطول الكلي \(مم\)|mm_tall|length)$/i,'الطول الكلي (مم)'],
    [/^(العرض|العرض مم|العرض الكلي \(مم\)|mm_width|width)$/i,'العرض الكلي (مم)'],
    [/^(الارتفاع|الارتفاع مم|الارتفاع الكلي \(مم\)|mm_height|height)$/i,'الارتفاع الكلي (مم)'],
    [/^(قاعدة العجلات|قاعدة العجلات مم|wheelbase|mm_wheel)$/i,'قاعدة العجلات (مم)'],
    [/^(الضمان|warranty)$/i,'الضمان']
  ];
  for(const [re, canonical] of map){ if(re.test(label)) return canonical; }
  return '';
}
function mergeApiSpecs(specs, rawSpecs){
  Object.keys(rawSpecs || {}).forEach(k=>{
    const val=scalarText(rawSpecs[k]);
    if(!val) return;
    const canonical=normalizeApiSpecLabel(k);
    if(canonical){ if(!specs[canonical]) specs[canonical]=val; }
    else if(/^[\u0600-\u06ff0-9 ()\-_/]+$/u.test(cleanText(k)) && cleanText(k).length <= 45 && !specs[cleanText(k)]) specs[cleanText(k)]=val;
  });
}
function apiColors(item, specs){
  const out=[];
  const addVal=(v,source)=>{
    if(!v) return;
    if(Array.isArray(v)){ v.forEach(x=>addVal(x,source)); return; }
    if(isPlainObject(v)){
      const label=scalarText(firstNonEmpty(v.label,v.name,v.title,v.external,v.exterior,v.color,v.value));
      const imgs=[]; collectUrls(firstNonEmpty(v.images,v.gallery,v.image,v.image_url),imgs);
      const hex=normalizeHex(firstNonEmpty(v.hex,v.color_hex,v.code));
      if(hex || label) addStrictColor(out,{label,external:label,hex,source,images:imgs});
      return;
    }
    String(v).split(/[|,،\/]+/).forEach(x=> addStrictColor(out,{label:cleanText(x),source,images:[]}));
  };
  ['colors','available_colors','exterior_colors','car_exterior_color','exterior_color','color_variations'].forEach(k=>addVal(item && item[k], 'api'));
  addVal(getPath(item,'taxonomies.car_exterior_color'), 'api-taxonomy');
  if(item && item.acf){ ['colors','available_colors','exterior_colors','car_exterior_color','exterior_color','color_variations'].forEach(k=>addVal(item.acf[k], 'api-acf')); }
  addVal(specs && specs['اللون الخارجي'], 'api-spec');
  return out;
}
function extractApiItems(payload){
  if(Array.isArray(payload)) return payload;
  if(!isPlainObject(payload)) return [];
  const directKeys=['cars','items','data','results','vehicles','posts'];
  for(const k of directKeys){
    const v=payload[k];
    if(Array.isArray(v)) return v;
    if(isPlainObject(v)){
      for(const kk of directKeys){ if(Array.isArray(v[kk])) return v[kk]; }
    }
  }
  const arrays = Object.values(payload).filter(Array.isArray);
  if(arrays.length === 1) return arrays[0];
  return [];
}
function stockItemToCar(item){
  item = item || {};
  const specs = {};
  const put = (label, value)=>{ value = scalarText(value); if(value) specs[label] = value; };
  put('السعر', pick(item,['price','final_price','sale_price','current_price','pricing.price','pricing.final','acf.price']));
  put('موديل السيارة', pick(item,['year','model_year','car_year','taxonomies.car_year','acf.year']));
  put('ماركة السيارة', pick(item,['make','brand','car_make','taxonomies.car_make','acf.make']));
  put('نوع السيارة', pick(item,['model','car_model','taxonomies.car_model','acf.model']));
  put('هيكل السيارة', pick(item,['body_style','body','body_type','acf.body_style']));
  put('فئة السيارة', pick(item,['trim','class','car_trim','taxonomies.car_trim','acf.trim']));
  put('الوقود', pick(item,['fuel_type','fuel','acf.fuel_type']));
  put('نوع الناقل', pick(item,['transmission','gearbox','acf.transmission']));
  put('نظام الدفع', pick(item,['drivetrain','drive_train','drive','acf.drivetrain']));
  put('عدد المقاعد', pick(item,['seats','seat_count','acf.seats']));
  put('سعة المحرك', pick(item,['engine_cap','engine_capacity','engine','acf.engine_cap']));
  put('اللون الخارجي', pick(item,['exterior_color','car_exterior_color','external_color','acf.exterior_color']));
  put('اللون الداخلي', pick(item,['interior_color','car_interior_color','internal_color','acf.interior_color']));
  put('الضمان', pick(item,['warranty','guarantee','acf.warranty']));
  put('استهلاك صرفية البنزين', pick(item,['fuel_economy','fuel_consumption','acf.fuel_economy']));
  put('الحصان الميكانيكي', pick(item,['horsepower','horse_power','hp','acf.horsepower']));
  put('عزم نيوتن', pick(item,['torque','acf.torque']));
  put('السرعة القصوى', pick(item,['max_speed','acf.max_speed']));
  put('عدد السلندرات', pick(item,['n_cylinders','cylinders','acf.cylinders']));
  put('الطول الكلي (مم)', pick(item,['mm_tall','length_mm','length','acf.length']));
  put('العرض الكلي (مم)', pick(item,['mm_width','width_mm','width','acf.width']));
  put('الارتفاع الكلي (مم)', pick(item,['mm_height','height_mm','height','acf.height']));
  put('قاعدة العجلات (مم)', pick(item,['mm_wheel','wheelbase_mm','wheelbase','acf.wheelbase']));
  put('حجم الشنطة', pick(item,['back_size','trunk_size','boot_size','acf.back_size']));
  mergeApiSpecs(specs, specObjectFromApi(item));

  const images = apiImages(item);
  const featureGroups = featureGroupsFromApi(item);
  const colors = apiColors(item, specs);
  let carUrl = scalarText(pick(item,['url','link','permalink','car_url','post_url','acf.url']));
  if(carUrl && carUrl.startsWith('/')) carUrl = 'https://mzjcars.com' + carUrl;
  if(!carUrl){
    const slug = scalarText(pick(item,['slug','post_name','car_slug']));
    if(slug) carUrl = 'https://mzjcars.com/cars/' + encodeURIComponent(slug) + '/';
  }
  const title = scalarText(pick(item,['name','title.rendered','title','post_title','car_name','acf.name'])) || [specs['ماركة السيارة'],specs['نوع السيارة'],specs['فئة السيارة'],specs['موديل السيارة']].filter(Boolean).join(' - ');
  const price = scalarText(firstNonEmpty(specs['السعر'], pick(item,['price','final_price','sale_price','current_price'])));
  return {
    parserVersion: PARSER_VERSION,
    source: 'mzj-platform-v2',
    id: scalarText(pick(item,['id','ID','post_id','car_id','vehicle_id'])),
    carUrl,
    title,
    price,
    model: scalarText(firstNonEmpty(specs['موديل السيارة'], pick(item,['year','model_year','car_year']))),
    image: images[0] || '',
    images,
    specs,
    featureGroups,
    colors,
    availableSliderColors: colors.filter(c=>Array.isArray(c.images) && c.images.length),
    rawStock: item
  };
}
async function getStock(force=false){
  if(!force && cache.stock && Date.now()-cache.stockAt < STOCK_TTL) return cache.stock;
  const txt = await fetchText(STOCK_URL);
  const payload = JSON.parse(txt);
  const raw = extractApiItems(payload);
  if(!raw.length && !(Array.isArray(payload) && payload.length === 0)){
    throw new Error('Cars endpoint returned no readable cars array');
  }
  const items = raw.map(stockItemToCar).filter(x=>x.id || x.carUrl || x.title);
  cache.stock = { ok:true, source:STOCK_URL, count: items.length, fetchedAt: new Date().toISOString(), items };
  cache.stockAt = Date.now();
  return cache.stock;
}
function extractBalancedObject(scriptText, varName){
  const i = scriptText.indexOf(varName);
  if(i < 0) return null;
  const eq = scriptText.indexOf('=', i);
  if(eq < 0) return null;
  let start = scriptText.indexOf('{', eq);
  if(start < 0) return null;
  let depth = 0, inStr = false, quote = '', esc = false;
  for(let p=start; p<scriptText.length; p++){
    const ch = scriptText[p];
    if(inStr){
      if(esc) esc = false;
      else if(ch === '\\') esc = true;
      else if(ch === quote) inStr = false;
      continue;
    }
    if(ch === '"' || ch === "'"){ inStr = true; quote = ch; continue; }
    if(ch === '{') depth++;
    if(ch === '}'){
      depth--;
      if(depth === 0) return scriptText.slice(start, p+1);
    }
  }
  return null;
}
function decodeHtmlEntities(s){
  return String(s || '')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#039;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#8211;|&#8212;/gi,'-')
    .replace(/&#x([0-9a-f]+);/gi,(_,h)=>{ try{return String.fromCodePoint(parseInt(h,16));}catch(e){return '';} })
    .replace(/&#([0-9]+);/g,(_,n)=>{ try{return String.fromCodePoint(parseInt(n,10));}catch(e){return '';} });
}
function htmlLines(html){
  const marked = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/<\/(?:p|div|li|h1|h2|h3|h4|h5|h6|section|article|tr|td|dt|dd)>/gi,'\n')
    .replace(/<[^>]+>/g,' ');
  return decodeHtmlEntities(marked).split(/\r?\n/).map(x=>cleanText(x)).filter(Boolean);
}
function extractFeatureListFromHtml(html, heading){
  if(!html) return [];
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const h = new RegExp('<h[1-6][^>]*>\\s*'+escaped+'\\s*<\\/h[1-6]>', 'i');
  const m = h.exec(html);
  if(!m) return [];
  const tail = html.slice(m.index + m[0].length);
  const nextHeading = tail.search(/<h[1-6][^>]*>/i);
  const frag = nextHeading >= 0 ? tail.slice(0,nextHeading) : tail.slice(0,7000);
  const out=[];
  let lm;
  const liRe=/<li[^>]*>([\s\S]*?)<\/li>/ig;
  while((lm=liRe.exec(frag))){
    const t=cleanText(decodeHtmlEntities(lm[1]));
    if(t && t.length <= 180) out.push(t);
  }
  if(out.length) return unique(out);
  return unique(htmlLines(frag).filter(x=>x.length <= 180 && !/^(المواصفات|مواصفات)/.test(x))).slice(0,40);
}
function extractMainSpecsFromHtml(html){
  const lines=htmlLines(html);
  const specs={};
  const aliases={
    'الفئة':'فئة السيارة','فئة السيارة':'فئة السيارة','الموديل':'موديل السيارة','موديل السيارة':'موديل السيارة',
    'نوع الهيكل':'هيكل السيارة','هيكل السيارة':'هيكل السيارة','نوع الناقل':'نوع الناقل','ناقل الحركة':'نوع الناقل',
    'الدفع':'نظام الدفع','نظام الدفع':'نظام الدفع','نوع الوقود':'الوقود','الوقود':'الوقود',
    'استهلاك الوقود':'استهلاك صرفية البنزين','استهلاك صرفية البنزين':'استهلاك صرفية البنزين',
    'المحرك':'سعة المحرك','سعة المحرك':'سعة المحرك','الحصان الميكانيكي':'الحصان الميكانيكي','عزم نيوتن':'عزم نيوتن',
    'السرعة القصوى':'السرعة القصوى','عدد السلندرات':'عدد السلندرات','عدد المقاعد':'عدد المقاعد','الضمان':'الضمان',
    'الطول مم':'الطول الكلي (مم)','العرض مم':'العرض الكلي (مم)','الارتفاع مم':'الارتفاع الكلي (مم)',
    'قاعدة العجلات مم':'قاعدة العجلات (مم)','حجم الشنطة مم':'حجم الشنطة','حجم الشنطة':'حجم الشنطة',
    'اللون الخارجي':'اللون الخارجي','اللون الداخلي':'اللون الداخلي'
  };
  for(let i=0;i<lines.length-1;i++){
    const key=aliases[lines[i]];
    if(!key || specs[key]) continue;
    const val=lines[i+1];
    if(!val || aliases[val] || val.length > 140) continue;
    specs[key]=val;
  }
  return specs;
}
function extractSpecsData(html){
  const fallback = {
    specs: extractMainSpecsFromHtml(html),
    interior: extractFeatureListFromHtml(html,'المواصفات الداخلية'),
    exterior: extractFeatureListFromHtml(html,'المواصفات الخارجية'),
    safety: extractFeatureListFromHtml(html,'مواصفات الأمان')
  };
  const names = ['MZJ_SPECS_ULTRA_V2_DATA', 'window.MZJ_SPECS_ULTRA_V2_DATA'];
  for(const n of names){
    const obj = extractBalancedObject(html, n);
    if(obj){
      try {
        const parsed=JSON.parse(obj) || {};
        return {
          specs: Object.assign({}, fallback.specs, parsed.specs || parsed.specifications || {}),
          interior: unique([...(parsed.interior || []), ...fallback.interior]),
          exterior: unique([...(parsed.exterior || []), ...fallback.exterior]),
          safety: unique([...(parsed.safety || []), ...fallback.safety])
        };
      } catch(e) {}
    }
  }
  const re = /MZJ_SPECS_ULTRA_V2_DATA\s*=\s*(\{[\s\S]*?\});/;
  const m = html.match(re);
  if(m){
    try {
      const parsed=JSON.parse(m[1]) || {};
      return {
        specs: Object.assign({}, fallback.specs, parsed.specs || parsed.specifications || {}),
        interior: unique([...(parsed.interior || []), ...fallback.interior]),
        exterior: unique([...(parsed.exterior || []), ...fallback.exterior]),
        safety: unique([...(parsed.safety || []), ...fallback.safety])
      };
    } catch(e){}
  }
  return fallback;
}
function looksLikeBadUiImage(url){
  const u = String(url || '').toLowerCase();
  return /default-car|placeholder|no-image|noimage|logo|mzj-logo|favicon|icon|cropped|avatar|watermark|loader|spinner|blank/.test(u);
}
function extractImages(html, baseUrl, fallback){
  const out = [];
  const add = v=>{
    if(!v) return;
    v = String(v).replace(/\\\//g,'/').trim();
    if(v.startsWith('//')) v = 'https:' + v;
    try { v = new URL(v, baseUrl).toString(); } catch(e){ return; }
    if(!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(v)) return;
    if(!/wp-content\/uploads/i.test(v) && !/mzjcars\.com/i.test(v)) return;
    if(looksLikeBadUiImage(v)) return;
    out.push(v);
  };

  // Prefer actual car image sources first. Do not include default placeholders/logos.
  add(fallback);

  (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/ig)||[]).forEach(tag=>{
    const m=tag.match(/content=["']([^"']+)/i); if(m) add(m[1]);
  });

  let m;
  const preferred = [
    /data-large_image=["']([^"']+)["']/ig,
    /data-full=["']([^"']+)["']/ig,
    /data-src=["']([^"']+)["']/ig,
    /<img[^>]+src=["']([^"']+)["'][^>]*>/ig
  ];
  preferred.forEach(re=>{ while((m = re.exec(html))) add(m[1]); });

  const urlRe = /https?:\\?\/\\?\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/ig;
  while((m = urlRe.exec(html))) add(m[0].replace(/\\\//g,'/'));

  return unique(out).slice(0, 80);
}
function attrValue(tag, name){
  const re = new RegExp("\\b"+name+"\\s*=\\s*([\"'])([\\s\\S]*?)\\1",'i');
  const m = re.exec(String(tag || ''));
  return m ? cleanText(decodeHtmlEntities(m[2])) : '';
}
function rawAttrValue(tag, name){
  const re = new RegExp("\\b"+name+"\\s*=\\s*([\"'])([\\s\\S]*?)\\1",'i');
  const m = re.exec(String(tag || ''));
  return m ? decodeHtmlEntities(m[2]) : '';
}
function normUrlKey(value){
  value=String(value||'').trim();
  if(!value) return '';
  try{
    const u=new URL(value);
    u.hash='';
    let path=u.pathname.replace(/\/{2,}/g,'/');
    if(path.length>1) path=path.replace(/\/+$/,'');
    return (u.origin.toLowerCase()+path+u.search).toLowerCase();
  }catch(e){
    return value.replace(/\/+$/,'').toLowerCase();
  }
}
function sliceBetween(html, startNeedle, endNeedles){
  html=String(html||'');
  const start=html.indexOf(startNeedle);
  if(start<0) return '';
  let end=html.length;
  (endNeedles||[]).forEach(n=>{
    const i=html.indexOf(n,start+startNeedle.length);
    if(i>=0 && i<end) end=i;
  });
  return html.slice(start,end);
}
function pageTitleFromHtml(html){
  const frag=sliceBetween(html,'class="mzjpan-summary"',['class="mzjpan-price"','class="mzjpan-quick-grid"']);
  const m=/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(frag);
  return m?cleanText(decodeHtmlEntities(m[1])):'';
}
function pagePriceFromHtml(html){
  const frag=sliceBetween(html,'class="mzjpan-price"',['class="mzjpan-quick-grid"']);
  const m=/<strong[^>]*>([\s\S]*?)<\/strong>/i.exec(frag);
  return m?cleanText(decodeHtmlEntities(m[1])):'';
}
function pageQuickSpecs(html){
  const frag=sliceBetween(html,'class="mzjpan-quick-grid"',['class="mzjpan-unavailable"','class="mzjpan-ctas"','class="mzjpan-actions"']);
  const out=[];
  const re=/<div[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/div>/ig;
  let m;
  while((m=re.exec(frag))){
    const label=cleanText(decodeHtmlEntities(m[1]));
    const value=cleanText(decodeHtmlEntities(m[2]));
    if(label && value && value!=='—') out.push({label,value});
  }
  return out;
}
function pageSpecGroups(html){
  const frag=sliceBetween(html,'class="mzjpan-spec-groups"',['class="mzjpan-send-spec"','class="mzjpan-features"']);
  const groups=[];
  const dre=/<details[^>]*class=["'][^"']*mzjpan-spec-group[^"']*["'][^>]*>([\s\S]*?)<\/details>/ig;
  let dm;
  while((dm=dre.exec(frag))){
    const body=dm[1];
    const sm=/<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(body);
    const title=sm?cleanText(decodeHtmlEntities(sm[1])):'';
    if(!title) continue;
    const items=[];
    const pre=/<p[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/p>/ig;
    let pm;
    while((pm=pre.exec(body))){
      const label=cleanText(decodeHtmlEntities(pm[1]));
      const value=cleanText(decodeHtmlEntities(pm[2]));
      if(label && value && value!=='—') items.push({label,value});
    }
    if(items.length) groups.push({title,items});
  }
  return groups;
}
function pageFeatureGroups(html){
  const frag=sliceBetween(html,'class="mzjpan-features"',['class="mzjpan-related"','</main>']);
  const result={interior:[],exterior:[],safety:[]};
  const re=/<div[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>\s*<\/div>/ig;
  let m;
  while((m=re.exec(frag))){
    const title=cleanText(decodeHtmlEntities(m[1]));
    const items=[];
    const lire=/<li[^>]*>([\s\S]*?)<\/li>/ig;
    let lm;
    while((lm=lire.exec(m[2]))){
      const t=cleanText(decodeHtmlEntities(lm[1]));
      if(t) items.push(t);
    }
    if(/الداخلية/.test(title)) result.interior=unique(items);
    else if(/الخارجية/.test(title)) result.exterior=unique(items);
    else if(/الأمان|الامان/.test(title)) result.safety=unique(items);
  }
  return result;
}
function pageGalleryImages(html){
  const frag=sliceBetween(html,'class="mzjpan-gallery"',['class="mzjpan-available-colors"','class="mzjpan-summary"']);
  const images=[];
  const mainTag=/<img\b[^>]*data-gallery-main[^>]*>/i.exec(frag);
  if(mainTag){ const src=attrValue(mainTag[0],'src'); if(src) images.push(src); }
  const bre=/<button\b[^>]*data-gallery-thumb[^>]*>/ig;
  let bm;
  while((bm=bre.exec(frag))){ const u=attrValue(bm[0],'data-full'); if(u) images.push(u); }
  return unique(images).filter(u=>!badImageUrl(u));
}
function badImageUrl(u){
  return /default-car|placeholder|no-image|noimage|logo|favicon|icon|cropped|avatar|loader|spinner|blank/i.test(String(u||''));
}
function pageColorImages(html){
  const frag=sliceBetween(html,'class="mzjpan-available-colors"',['class="mzjpan-summary"']);
  const out=[];
  const re=/<button\b[^>]*data-next-external[^>]*>/ig;
  let m;
  while((m=re.exec(frag))){
    const label=attrValue(m[0],'data-next-external');
    const raw=rawAttrValue(m[0],'data-color-images');
    let imgs=[];
    if(raw){
      try{ const parsed=JSON.parse(raw); if(Array.isArray(parsed)) imgs=parsed; }catch(e){}
    }
    imgs=unique(imgs).filter(u=>!badImageUrl(u));
    if(label) addStrictColor(out,{label,external:label,token:normalizeColorToken(label),raw:label,source:'car-page',images:imgs});
  }
  return out;
}
function canonicalSpecLabel(label){
  label=cleanText(label);
  const map={
    'الفئة':'فئة السيارة','سعة المحرك':'سعة المحرك','المحرك':'سعة المحرك','نوع الهيكل':'هيكل السيارة','الموديل':'موديل السيارة',
    'الدفع':'نظام الدفع','ناقل الحركة':'نوع الناقل','نوع الناقل':'نوع الناقل','عدد السرعات':'عدد السرعات','عدد المقاعد':'عدد المقاعد',
    'نوع الوقود':'الوقود','استهلاك الوقود':'استهلاك صرفية البنزين','الضمان':'الضمان','الحصان الميكانيكي':'الحصان الميكانيكي',
    'عزم نيوتن':'عزم نيوتن','السرعة القصوى':'السرعة القصوى','عدد السلندرات':'عدد السلندرات','الطول مم':'الطول الكلي (مم)',
    'العرض مم':'العرض الكلي (مم)','الارتفاع مم':'الارتفاع الكلي (مم)','قاعدة العجلات مم':'قاعدة العجلات (مم)','حجم الشنطة مم':'حجم الشنطة'
  };
  return map[label]||label;
}
function extractCanonicalCarPageData(html){
  const quickSpecs=pageQuickSpecs(html);
  const specGroups=pageSpecGroups(html);
  const featureGroups=pageFeatureGroups(html);
  const specs={};
  quickSpecs.forEach(x=>{const k=canonicalSpecLabel(x.label);if(k&&!specs[k])specs[k]=x.value;});
  specGroups.forEach(g=>g.items.forEach(x=>{const k=canonicalSpecLabel(x.label);if(k&&!specs[k])specs[k]=x.value;}));
  return {
    title:pageTitleFromHtml(html),
    price:pagePriceFromHtml(html),
    quickSpecs,
    specGroups,
    specs,
    featureGroups,
    images:pageGalleryImages(html),
    colors:pageColorImages(html)
  };
}
function mergeCar(stockCar, pageData){
  pageData=pageData||{specs:{},quickSpecs:[],specGroups:[],featureGroups:{interior:[],exterior:[],safety:[]},images:[],colors:[]};
  const specs=Object.assign({},stockCar.specs||{});
  Object.keys(pageData.specs||{}).forEach(k=>{ if(pageData.specs[k]) specs[k]=pageData.specs[k]; });
  const strictImages=unique(pageData.images||[]);
  const images=strictImages.length?strictImages:unique([...(stockCar.images||[]),...(stockCar.image?[stockCar.image]:[])]).filter(u=>!badImageUrl(u));
  const strictColors=uniqueColorObjects(pageData.colors||[]);
  const colors=strictColors.length?strictColors:uniqueColorObjects(stockCar.colors||[]);
  const fg=pageData.featureGroups||{};
  const stockFg=stockCar.featureGroups||{};
  const featureGroups={
    interior:unique((fg.interior&&fg.interior.length)?fg.interior:(stockFg.interior||[])),
    exterior:unique((fg.exterior&&fg.exterior.length)?fg.exterior:(stockFg.exterior||[])),
    safety:unique((fg.safety&&fg.safety.length)?fg.safety:(stockFg.safety||[]))
  };
  const quickSpecs=(pageData.quickSpecs&&pageData.quickSpecs.length)?pageData.quickSpecs:[];
  const specGroups=(pageData.specGroups&&pageData.specGroups.length)?pageData.specGroups:[];
  const availableSliderColors=colors.filter(c=>Array.isArray(c.images)&&c.images.length);
  return Object.assign({},stockCar,{
    source:'mzj-platform-v2 + exact-car-page',
    parserVersion:'v39-exact-id-page-data',
    title:pageData.title||stockCar.title||'',
    price:pageData.price||stockCar.price||'',
    image:images[0]||stockCar.image||'',
    images,
    specs,
    quickSpecs,
    specGroups,
    featureGroups,
    colors,
    availableSliderColors,
    specsComplete:!!(quickSpecs.length||specGroups.length||featureGroups.interior.length||featureGroups.exterior.length||featureGroups.safety.length||Object.keys(specs).length),
    updatedAt:new Date().toISOString()
  });
}
function uniqueColorObjects(list){
  const out=[];
  (list || []).forEach(c=>{
    if(!c) return;
    const key=String(firstNonEmpty(c.hex,c.token,c.external,c.label,c.raw)).toLowerCase();
    if(!key) return;
    const found=out.find(x=>String(firstNonEmpty(x.hex,x.token,x.external,x.label,x.raw)).toLowerCase()===key);
    if(found){ found.images=unique([...(found.images||[]),...(c.images||[])]); }
    else out.push(Object.assign({},c,{images:unique(c.images||[])}));
  });
  return out;
}
async function readCar(identifier){
  identifier=String(identifier||'').trim();
  if(!identifier) throw new Error('Missing vehicle identifier');
  const key=identifier;
  const cached=cache.cars.get(key);
  if(cached && Date.now()-cached.at<CAR_TTL) return cached.data;
  const stock=await getStock(false);
  let car=stock.items.find(x=>String(x.id||'')===identifier);
  if(!car){
    const wanted=normUrlKey(identifier);
    car=stock.items.find(x=>normUrlKey(x.carUrl)===wanted);
  }
  if(!car) throw new Error('Selected vehicle was not found in the stock endpoint');
  if(!car.id) throw new Error('Selected vehicle has no stable vehicle ID');
  if(!car.carUrl) throw new Error('Selected vehicle has no canonical car URL');
  let html='';
  try{ html=await fetchText(car.carUrl); }catch(e){ html=''; }
  const pageData=html?extractCanonicalCarPageData(html):{specs:{},quickSpecs:[],specGroups:[],featureGroups:{interior:[],exterior:[],safety:[]},images:[],colors:[]};
  const data=mergeCar(car,pageData);
  if(String(data.id||'')!==String(car.id||'')) throw new Error('Vehicle identity changed while reading car data');
  if(normUrlKey(data.carUrl)!==normUrlKey(car.carUrl)) throw new Error('Vehicle URL changed while reading car data');
  cache.cars.set(key,{at:Date.now(),data});
  cache.cars.set(String(car.id),{at:Date.now(),data});
  cache.cars.set(car.carUrl,{at:Date.now(),data});
  return data;
}

module.exports = { getStock, readCar };
