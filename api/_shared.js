const http = require('http');
const https = require('https');
const { URL } = require('url');

const STOCK_URL = 'https://mzjcars.com/wp-json/mzsm/v1/stock';
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
    const req = lib.get(u, {
      headers: {
        'User-Agent': 'MZJ-Showroom-Screens/10.0',
        'Accept': 'text/html,application/json,*/*',
        'Cache-Control': 'no-cache'
      },
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
  const out = [];
  // v28: لا نسحب ألوان عامة من CSS أو أزرار الصفحة.
  // المصدر الوحيد الأساسي هو بلوك الألوان الحقيقي ومفاتيح التاكسونومي:
  // car_exterior_color / exterior-color / car_interior_color / interior-color.
  extractWpTaxonomyColorsFromHtml(html || '', stockCar.carUrl || '').forEach(c => addStrictColor(out, c));

  // fallback محدود من endpoint الاستوك فقط لو كان بيرجع لون صريح.
  extractColorsFromStock(stockCar.rawStock || {}, stockCar.specs || {}).forEach(c => addStrictColor(out, {label:c.raw || c.label, source:c.source || 'stock'}));

  return out;
}


function stockItemToCar(item){
  const specs = {};
  const put = (label, value)=>{ value = cleanText(value); if(value) specs[label] = value; };
  put('السعر', item.price || item.final_price);
  put('موديل السيارة', item.year || item.model_year);
  put('ماركة السيارة', item.make);
  put('نوع السيارة', item.model);
  put('هيكل السيارة', item.body_style || item.body);
  put('فئة السيارة', item.trim);
  put('الوقود', item.fuel_type);
  put('نوع الناقل', item.transmission);
  put('نظام الدفع', item.drivetrain);
  put('عدد المقاعد', item.seats);
  put('سعة المحرك', item.engine_cap);
  put('اللون الخارجي', item.exterior_color);
  put('اللون الداخلي', item.interior_color);
  put('الضمان', item.vin_number);
  put('الحصان الميكانيكي', item.stock_number);
  put('استهلاك صرفية البنزين', item.fuel_economy);
  put('عزم نيوتن', item.torque || item.engine);
  put('السرعة القصوى', item.max_speed);
  put('عدد السلندرات', item.n_cylinders);
  put('الطول الكلي (مم)', item.mm_tall);
  put('العرض الكلي (مم)', item.mm_width);
  put('الارتفاع الكلي (مم)', item.mm_height);
  put('قاعدة العجلات (مم)', item.mm_wheel);
  put('حجم الشنطة', item.back_size);
  return {
    parserVersion: 'v28-site-taxonomy-colors',
    source: 'stock',
    id: item.id || '',
    carUrl: item.url || item.link || '',
    title: cleanText(item.name || item.title || 'سيارة المعرض'),
    price: cleanText(item.price || item.final_price || ''),
    model: cleanText(item.year || ''),
    image: item.image || '',
    images: unique([item.image].filter(Boolean)),
    specs,
    featureGroups: { interior: [], exterior: [], safety: [] },
    colors: [],
    rawStock: item
  };
}
async function getStock(force=false){
  if(!force && cache.stock && Date.now()-cache.stockAt < STOCK_TTL) return cache.stock;
  const txt = await fetchText(STOCK_URL);
  const arr = JSON.parse(txt);
  const raw = Array.isArray(arr) ? arr : (arr.items || arr.data || []);
  const items = raw.map(stockItemToCar);
  cache.stock = { ok:true, count: items.length, fetchedAt: new Date().toISOString(), items };
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
function extractSpecsData(html){
  const names = ['MZJ_SPECS_ULTRA_V2_DATA', 'window.MZJ_SPECS_ULTRA_V2_DATA'];
  for(const n of names){
    const obj = extractBalancedObject(html, n);
    if(obj){
      try { return JSON.parse(obj); } catch(e) {}
    }
  }
  const re = /MZJ_SPECS_ULTRA_V2_DATA\s*=\s*(\{[\s\S]*?\});/;
  const m = html.match(re);
  if(m){ try { return JSON.parse(m[1]); } catch(e){} }
  return { interior: [], exterior: [], safety: [] };
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

  return unique(out).slice(0, 18);
}
function mergeCar(stockCar, details, pageHtml){
  const featureGroups = {
    interior: unique(details.interior || []),
    exterior: unique(details.exterior || []),
    safety: unique(details.safety || [])
  };
  const images = extractImages(pageHtml || '', stockCar.carUrl, stockCar.image);
  const ext = stockCar.specs['اللون الخارجي'];
  const inn = stockCar.specs['اللون الداخلي'];
  const availableSliderColors = buildAvailableSliderColors(stockCar, pageHtml || '');
  const colors = availableSliderColors.length
    ? availableSliderColors.map(c => ({ external: c.external || c.label, internal: inn || '', token: c.token, hex: c.hex || '', raw: c.raw || c.external || c.label, source: c.source || 'site', images: unique(c.images || []) }))
    : (ext || inn ? [{ external: ext || 'لون خارجي', internal: inn || '', token: normalizeColorToken(ext), raw: ext || '', source:'stock-spec', images:[] }] : []);
  return Object.assign({}, stockCar, {
    source: 'stock + car-page-js',
    parserVersion: 'v28-site-taxonomy-colors',
    images: images.length ? images : stockCar.images,
    featureGroups,
    colors,
    availableSliderColors,
    specsComplete: !!(featureGroups.interior.length || featureGroups.exterior.length || featureGroups.safety.length),
    updatedAt: new Date().toISOString()
  });
}
async function readCar(url){
  const key = url;
  const cached = cache.cars.get(key);
  if(cached && Date.now()-cached.at < CAR_TTL) return cached.data;
  const stock = await getStock(false);
  let car = stock.items.find(x=> x.carUrl === url) || stock.items.find(x=> String(x.id) === String(url));
  if(!car){
    const pageUrl = /^https?:/.test(url) ? url : decodeURIComponent(url);
    car = stock.items.find(x=> x.carUrl === pageUrl) || { carUrl: pageUrl, title: 'سيارة المعرض', specs:{}, images:[], featureGroups:{interior:[],exterior:[],safety:[]}, colors:[] };
  }
  const html = car.carUrl ? await fetchText(car.carUrl) : '';
  const details = extractSpecsData(html);
  const data = mergeCar(car, details, html);
  cache.cars.set(key, { at: Date.now(), data });
  return data;
}

module.exports = { getStock, readCar };
