firebase.initializeApp(window.MZJ_FIREBASE_CONFIG);
var db=firebase.firestore();
var PAGE_CACHE_BUSTER=window.MZJ_PAGE_CACHE_BUSTER||String(Date.now());

function esc(s){return String(s||'').replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
function cleanText(s){return String(s||'').replace(/\s+/g,' ').trim();}
function normArabic(s){return cleanText(s).toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[^\u0600-\u06ff0-9a-z]+/g,' ').replace(/\s+/g,' ').trim();}
function uniq(arr){var seen={};return(arr||[]).map(cleanText).filter(function(x){var k=normArabic(x);if(!x||seen[k])return false;seen[k]=1;return true;});}
function badImage(url){return /default-car|placeholder|no-image|noimage|logo|mzj-logo|favicon|icon|cropped-site-icon|cropped-logo|avatar|loader|spinner|blank/i.test(String(url||''));}
function normUrl(v){v=String(v||'').trim();if(!v)return'';try{var u=new URL(v,location.origin);u.hash='';var p=u.pathname.replace(/\/{2,}/g,'/');if(p.length>1)p=p.replace(/\/+$/,'');return(u.origin.toLowerCase()+p+u.search).toLowerCase();}catch(e){return v.replace(/\/+$/,'').toLowerCase();}}
function hash(str){var h=2166136261;str=String(str||'');for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);}return'car_'+(h>>>0).toString(16);}
function getScreenId(){var u=new URL(location.href),id=u.searchParams.get('id')||u.searchParams.get('screen')||u.searchParams.get('id/')||'';if(!id){u.searchParams.forEach(function(v,k){if(!id&&String(k).replace(/\/+$/,'').toLowerCase()==='id')id=v;});}id=cleanText(id).replace(/^\/+|\/+$/g,'').toUpperCase();return/^[A-Z]+\d+$/.test(id)?id:'A1';}

var screenId=getScreenId();
var data=null;
var screenOptions={carId:'',carUrl:'',carName:'',carPrice:'',imageFilterColor:'all',imageFilterLabel:'',selectedImages:[],sliderImages:[],sliderMode:'all',themeId:''};
var displaySettings={featureFontSize:18,logoDataUrl:'',logoWidth:120,logoPosition:'right',activeThemeId:'ramadan'};
var THEME_DEFAULTS={
  ramadan:{title:'رمضان',caption:'رمضان يجمعنا',logoDataUrl:'',logoSize:120,captionFontSize:16},
  national:{title:'اليوم الوطني',caption:'اليوم الوطني السعودي',logoDataUrl:'/assets/themes/national-day-default.png',logoSize:120,captionFontSize:16,nationalDayNumber:'96'},
  founding:{title:'يوم التأسيس',caption:'جذورنا تصنع مستقبلنا',logoDataUrl:'',logoSize:120,captionFontSize:16},
  'eid-fitr':{title:'عيد الفطر',caption:'عيدكم أجمل',logoDataUrl:'',logoSize:120,captionFontSize:16},
  'eid-adha':{title:'عيد الأضحى',caption:'عيد أضحى مبارك',logoDataUrl:'',logoSize:120,captionFontSize:16}
};
var themeIdentity=Object.assign({},THEME_DEFAULTS.ramadan);
var themeIdentityUnsub=null;
var imageIndex=0,techIndex=0,featureSection='interior',featurePage=0;
var imageTimer=null,featureTimer=null,badLoaded={},lastVehicleKey='',lastForceRefresh=0;

function stopImageLoop(){if(imageTimer)clearInterval(imageTimer);imageTimer=null;}
function stopFeatureLoop(){if(featureTimer)clearInterval(featureTimer);featureTimer=null;}
function empty(msg){stopImageLoop();stopFeatureLoop();var root=document.getElementById('root');root.className='empty-state';root.innerHTML='<div><h1>الشاشة '+esc(screenId)+'</h1><p>'+esc(msg||'لا توجد سيارة مرتبطة بهذه الشاشة حاليًا')+'</p></div>';}
function activeThemeId(){var id=String(displaySettings.activeThemeId||screenOptions.themeId||'ramadan');return THEME_DEFAULTS[id]?id:'ramadan';}
function themeDefaults(id){return Object.assign({},THEME_DEFAULTS[id]||THEME_DEFAULTS.ramadan);}

function listenThemeIdentity(id){
  if(themeIdentityUnsub){try{themeIdentityUnsub();}catch(e){}themeIdentityUnsub=null;}
  var fallback={};
  if(id==='national'){
    if(displaySettings.nationalDayLogoDataUrl)fallback.logoDataUrl=displaySettings.nationalDayLogoDataUrl;
    if(displaySettings.nationalDayNumber)fallback.nationalDayNumber=displaySettings.nationalDayNumber;
  }
  themeIdentity=Object.assign(themeDefaults(id),fallback);
  themeIdentityUnsub=db.collection('showroom_theme_settings').doc(id).onSnapshot(function(doc){
    themeIdentity=Object.assign(themeDefaults(id),fallback,doc.exists?(doc.data()||{}):{});
    if(data)render();
  },function(){themeIdentity=Object.assign(themeDefaults(id),fallback);if(data)render();});
}

function listenDisplaySettings(){
  db.collection('showroom_settings').doc('display').onSnapshot(function(doc){
    var oldTheme=displaySettings.activeThemeId;
    if(doc.exists){
      var d=doc.data()||{};
      if(d.featureFontSize!==undefined)displaySettings.featureFontSize=d.featureFontSize;
      if(d.logoDataUrl!==undefined)displaySettings.logoDataUrl=d.logoDataUrl;
      if(d.logoWidth!==undefined)displaySettings.logoWidth=d.logoWidth;
      if(d.logoPosition!==undefined)displaySettings.logoPosition=d.logoPosition;else if(d.headerPosition!==undefined)displaySettings.logoPosition=d.headerPosition;
      if(d.activeThemeId!==undefined)displaySettings.activeThemeId=String(d.activeThemeId||'ramadan');
    }
    if(oldTheme!==displaySettings.activeThemeId||!themeIdentityUnsub)listenThemeIdentity(activeThemeId());
    applyDisplaySettings();
    if(data)render();
  },function(){applyDisplaySettings();});
}

function applyDisplaySettings(){
  var fs=Math.max(12,Math.min(26,parseInt(displaySettings.featureFontSize||18,10)));
  var lw=Math.max(60,Math.min(280,parseInt(displaySettings.logoWidth||120,10)));
  document.documentElement.style.setProperty('--spec-font',fs+'px');
  document.documentElement.style.setProperty('--mzj-logo-width',lw+'px');
}

/* ---------- images ---------- */
function colorRows(){var ac=(data&&data.availableColors)||{};return{external:Array.isArray(ac.external)?ac.external:[],internal:Array.isArray(ac.internal)?ac.internal:[]};}
function selectedColorName(){if(!screenOptions.imageFilterColor||screenOptions.imageFilterColor==='all')return'';return cleanText(screenOptions.imageFilterLabel||screenOptions.imageFilterColor).replace(/\s+-\s+\d+\s+صورة.*$/,'');}
function colorImages(name){var key=normArabic(name),rows=colorRows().external,hit=null;rows.some(function(row){if(normArabic(row.name)===key){hit=row;return true;}return false;});return hit&&Array.isArray(hit.images)?uniq(hit.images).filter(function(u){return!badImage(u)&&!badLoaded[u];}):[];}
function imageKey(url){try{var u=new URL(String(url||''),location.origin);return(u.origin.toLowerCase()+u.pathname.replace(/\/{2,}/g,'/')).toLowerCase();}catch(e){return String(url||'').split('?')[0].split('#')[0].replace(/\/+$/,'').toLowerCase();}}
function vehicleImagePool(){if(!data)return[];var out=[].concat(data.images||[],data.image?[data.image]:[]),rows=colorRows().external||[];rows.forEach(function(row){out=out.concat(Array.isArray(row.images)?row.images:[]);});return uniq(out).filter(function(u){return!badImage(u);});}
function validManualImages(){var pool=vehicleImagePool(),allowed={};pool.forEach(function(u){allowed[imageKey(u)]=u;});return uniq([].concat(screenOptions.sliderImages||[],screenOptions.selectedImages||[])).map(function(u){return allowed[imageKey(u)]||'';}).filter(function(u){return u&&!badLoaded[u];});}
function images(){if(!data)return[];var manual=validManualImages();if(manual.length)return manual;var chosen=selectedColorName();if(chosen){var byColor=colorImages(chosen);if(byColor.length)return byColor;}return vehicleImagePool().filter(function(u){return!badLoaded[u];});}
function currentImage(){var arr=images();if(!arr.length)return'';if(imageIndex<0)imageIndex=arr.length-1;if(imageIndex>=arr.length)imageIndex=0;return arr[imageIndex];}
function compatibleImageUrl(url){return url?'/api/image-proxy?url='+encodeURIComponent(url)+'&cb='+encodeURIComponent(PAGE_CACHE_BUSTER):'';}

/* ---------- vehicle data ---------- */
function semanticSpecKey(label){var n=normArabic(label),map={'سعه المحرك':'engine','المحرك':'engine','ناقل الحركه':'transmission','نوع الناقل':'transmission','الدفع':'drive','نظام الدفع':'drive','نوع الوقود':'fuel','الوقود':'fuel','عدد المقاعد':'seats','الموديل':'year','السنه':'year','نوع الهيكل':'body','الهيكل':'body','الفئه':'trim','استهلاك الوقود':'fuel economy','الضمان':'warranty','عدد السرعات':'gears','الحصان الميكانيكي':'hp','عزم نيوتن':'torque','السرعه القصوي':'max speed','عدد السلندرات':'cylinders','الطول مم':'length','العرض مم':'width','الارتفاع مم':'height','قاعده العجلات مم':'wheelbase','حجم الشنطه مم':'trunk'};return map[n]||n;}
function specIcon(key){
  var icons={
    engine:'<path d="M4 8h3l2-2h6l2 2h3v8h-2v2h-3v-2H8v2H5v-2H4z"/><path d="M1 10h3m16 2h3m-12-8v2m4-2v2"/>',
    transmission:'<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8m12-8v8M8 6h8M8 18h8M12 6v12"/>',
    drive:'<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h10M7 18h10M5 8v8m14-8v8M12 6v12"/>',
    fuel:'<path d="M5 3h9v18H5z"/><path d="M8 6h3m3 2h2l3 3v7a2 2 0 0 0 2 2V9l-2-2"/>',
    seats:'<circle cx="8" cy="5" r="2"/><circle cx="16" cy="5" r="2"/><path d="M4 11c0-2 2-3 4-3s4 1 4 3v7H4zm8 0c0-2 2-3 4-3s4 1 4 3v7h-8"/>',
    year:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M7 14h3m4 0h3M7 18h3"/>',
    body:'<path d="M3 15l2-5 4-3h7l4 4 1 4v3H3z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    trim:'<path d="M4 4h12l4 4-10 12L3 13z"/><circle cx="8" cy="9" r="1.5"/>',
    hp:'<path d="M4 14a8 8 0 1 1 16 0"/><path d="M12 14l5-5"/><circle cx="12" cy="14" r="2"/>',
    torque:'<path d="M5 7a8 8 0 1 1-1 9"/><path d="M4 7v5h5"/>',
    gears:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
    'fuel economy':'<path d="M4 18h16"/><path d="M6 16c2-7 5-10 12-12"/><path d="M12 8l3 3"/>',
    warranty:'<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-5"/>',
    cylinders:'<path d="M6 5h12v14H6z"/><path d="M9 2v3m6-3v3M9 9h6m-6 4h6"/>',
    length:'<path d="M3 12h18"/><path d="M6 9l-3 3 3 3m12-6 3 3-3 3"/>',
    width:'<path d="M12 3v18"/><path d="M9 6l3-3 3 3m-6 12 3 3 3-3"/>',
    height:'<path d="M12 2v20"/><path d="M9 5l3-3 3 3m-6 14 3 3 3-3"/>',
    wheelbase:'<path d="M3 15h18M6 12l2-5h8l2 5"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'
  };
  var body=icons[key]||'<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>';
  return'<svg viewBox="0 0 24 24" aria-hidden="true">'+body+'</svg>';
}
function mainSpecs(){var src=(data&&Array.isArray(data.quickSpecs))?data.quickSpecs:[],seen={},out=[];src.forEach(function(x){var label=cleanText(x.label),value=cleanText(x.value),key=semanticSpecKey(label);if(!label||!value||value==='—'||seen[key])return;seen[key]=1;out.push([label,value,key]);});return out;}
function technicalGroups(){var seen={};mainSpecs().forEach(function(x){seen[x[2]]=1;});var src=(data&&Array.isArray(data.specGroups))?data.specGroups:[],out=[];src.forEach(function(group){var items=[];(group.items||[]).forEach(function(x){var label=cleanText(x.label),value=cleanText(x.value),key=semanticSpecKey(label);if(!label||!value||value==='—'||seen[key])return;seen[key]=1;items.push([label,value,key]);});if(items.length)out.push({title:cleanText(group.title),items:items});});return out;}
function featureData(){var fg=(data&&data.featureGroups)||{};return{interior:uniq(fg.interior||[]),exterior:uniq(fg.exterior||[]),safety:uniq(fg.safety||[])};}
function validFeatureSections(){var d=featureData();return['interior','exterior','safety'].filter(function(k){return d[k].length;});}
function featureTitle(key){return key==='interior'?'المواصفات الداخلية':key==='exterior'?'المواصفات الخارجية':'مواصفات الأمان';}
function featurePageSize(){return 14;}
function featurePageCount(section){var items=featureData()[section]||[];return Math.max(1,Math.ceil(items.length/featurePageSize()));}

/* ---------- V61 clean composition ---------- */
function identityHtml(){
  var logo=String(themeIdentity.logoDataUrl||'');
  var size=Math.max(60,Math.min(260,parseInt(themeIdentity.logoSize||120,10)));
  var caption=cleanText(themeIdentity.caption||'');
  var captionSize=Math.max(10,Math.min(32,parseInt(themeIdentity.captionFontSize||16,10)));
  var number=activeThemeId()==='national'?cleanText(themeIdentity.nationalDayNumber||'96'):'';
  if(!logo&&!caption&&!number)return'';
  return'<div class="theme-identity-overlay">'+
    (logo?'<img src="'+esc(logo)+'" alt="" style="width:'+size+'px">':'')+
    (caption?'<div class="identity-caption" style="font-size:'+captionSize+'px">'+esc(caption)+'</div>':'')+
    (number?'<div class="identity-number">'+esc(number)+'</div>':'')+
  '</div>';
}
function mzjLogoHtml(){if(!displaySettings.logoDataUrl)return'';var pos=displaySettings.logoPosition==='left'?'logo-left':'logo-right';return'<div class="brand-row '+pos+'"><img class="mzj-logo" src="'+esc(displaySettings.logoDataUrl)+'" alt="MZJ"></div>';}
function colorChip(row,type){var active=type==='external'&&selectedColorName()&&normArabic(row.name)===normArabic(selectedColorName());return'<span class="color-chip '+(active?'active':'')+'"><i style="background:'+esc(row.background||'#dedede')+'"></i><b>'+esc(row.name)+'</b></span>';}
function colorsHtml(){var rows=colorRows(),parts=[];if(rows.external.length)parts.push('<div class="color-line"><span>الخارجي</span><div class="color-list">'+rows.external.map(function(r){return colorChip(r,'external');}).join('')+'</div></div>');if(rows.internal.length)parts.push('<div class="color-line"><span>الداخلي</span><div class="color-list">'+rows.internal.map(function(r){return colorChip(r,'internal');}).join('')+'</div></div>');return parts.length?'<div class="colors-ribbon"><strong>الألوان المتاحة</strong><div class="color-groups">'+parts.join('')+'</div></div>':'';}
function sectionTitle(text){return'<div class="section-title"><strong>'+esc(text)+'</strong></div>';}
function mainSpecsHtml(){var specs=mainSpecs();if(!specs.length)return'';var count=Math.max(1,Math.min(specs.length,6));return'<section class="primary-specs">'+sectionTitle('المواصفات الرئيسية')+'<div class="spec-runway" style="--spec-count:'+count+'">'+specs.map(function(x){return'<div class="spec-node">'+specIcon(x[2])+'<small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong></div>';}).join('')+'</div></section>';}
function techHtml(){var groups=technicalGroups();if(!groups.length)return'';if(techIndex>=groups.length)techIndex=0;var g=groups[techIndex],count=Math.max(1,Math.min(g.items.length,4));return'<section class="technical-flow"><div class="tech-topline">'+sectionTitle('المواصفات الفنية')+'<div class="tech-tabs">'+groups.map(function(x,i){return'<button type="button" class="tech-tab '+(i===techIndex?'active':'')+'" data-tech="'+i+'">'+esc(x.title)+'</button>';}).join('')+'</div></div><div class="tech-values" style="--tech-count:'+count+'">'+g.items.map(function(x){return'<div class="tech-node">'+specIcon(x[2])+'<small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong></div>';}).join('')+'</div></section>';}
function pagerHtml(total){if(total<=1)return'<div class="feature-pager"><strong>1 / 1</strong></div>';return'<div class="feature-pager"><button type="button" class="feature-page-btn" data-step="-1">‹</button><strong>'+(featurePage+1)+' / '+total+'</strong><button type="button" class="feature-page-btn" data-step="1">›</button></div>';}
function featuresHtml(){
  var groups=featureData(),valid=validFeatureSections();if(!valid.length)return'';
  if(valid.indexOf(featureSection)<0){featureSection=valid[0];featurePage=0;}
  var items=groups[featureSection]||[],pages=Math.max(1,Math.ceil(items.length/14));if(featurePage>=pages)featurePage=0;if(featurePage<0)featurePage=pages-1;
  var visible=items.slice(featurePage*14,(featurePage+1)*14),right=visible.slice(0,7),left=visible.slice(7,14);
  function rows(arr){return arr.map(function(x){return'<div class="feature-row"><i>✓</i><span>'+esc(x)+'</span></div>';}).join('');}
  return'<section class="features-gallery"><div class="feature-head"><strong class="feature-head-title">المواصفات والمميزات</strong><div class="feature-tabs">'+valid.map(function(k){return'<button type="button" class="feature-tab '+(k===featureSection?'active':'')+'" data-section="'+k+'">'+esc(featureTitle(k))+'</button>';}).join('')+'</div></div><div class="feature-columns"><div class="feature-column">'+rows(right)+'</div><div class="feature-column">'+rows(left)+'</div></div>'+pagerHtml(pages)+'</section>';
}
function bottomHtml(){return'<footer class="bottom-composition"><div class="qr-side"><div id="showroomQr" class="qr-box"></div><div class="qr-copy"><strong>تفاصيل السيارة على جوالك</strong><span>امسح الرمز لعرض التفاصيل الكاملة</span></div></div><div class="tagline">رحلة أجمل .. مع MZJ</div></footer>';}

function render(){
  if(!data){empty();return;}
  stopImageLoop();stopFeatureLoop();
  var theme=activeThemeId(),title=cleanText(data.title||screenOptions.carName||''),price=cleanText(data.price||screenOptions.carPrice||'');
  var root=document.getElementById('root');
  root.className='showroom-shell theme-'+theme;
  root.innerHTML=
    '<section class="visual-zone"><div class="gallery-outline" aria-hidden="true"></div>'+
      '<div class="media-stage"><div class="media-backdrop"><img id="showroomCarBackdrop" alt="" aria-hidden="true"></div><div class="media-main"><img id="showroomCarImage" loading="eager" decoding="async" fetchpriority="high" alt="'+esc(title||'صورة السيارة')+'"></div><div class="media-glass"></div>'+identityHtml()+'</div>'+
      '<button id="imgPrev" class="gallery-arrow prev" type="button" aria-label="الصورة السابقة">‹</button><button id="imgNext" class="gallery-arrow next" type="button" aria-label="الصورة التالية">›</button>'+
      '<div id="showroomDots" class="image-dots"></div><div class="visual-signature">MZJ SHOWROOM</div>'+
    '</section>'+
    '<aside class="info-zone"><div class="info-ornament" aria-hidden="true"></div><div class="info-canvas">'+
      '<header class="vehicle-hero"><div class="vehicle-copy">'+mzjLogoHtml()+'<h1 class="vehicle-title">'+esc(title)+'</h1></div>'+
      (price?'<div class="price-emblem"><strong>'+esc(price)+' <span>ر.س</span></strong><small>السعر شامل ضريبة القيمة المضافة</small></div>':'')+'</header>'+
      colorsHtml()+mainSpecsHtml()+'<div id="techSlot">'+techHtml()+'</div><div id="featureSlot">'+featuresHtml()+'</div>'+bottomHtml()+
    '</div></aside>';
  applyDisplaySettings();bindRendered();updateImageOnly();renderQr();startImageLoop();startFeatureLoop();
}

/* ---------- runtime interaction ---------- */
function renderQr(){var el=document.getElementById('showroomQr'),url=screenOptions.carUrl||(data&&data.carUrl)||'';if(!el||!url)return;el.innerHTML='';if(window.QRCode){try{new QRCode(el,{text:url,width:76,height:76,colorDark:'#201915',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}catch(e){}}}
function renderDots(){var el=document.getElementById('showroomDots'),arr=images();if(!el)return;if(arr.length<2){el.innerHTML='';el.classList.add('hidden');return;}el.classList.remove('hidden');var max=Math.min(arr.length,14),active=(imageIndex%max+max)%max;el.innerHTML=Array.from({length:max}).map(function(_,i){return'<span class="image-dot '+(i===active?'active':'')+'"></span>';}).join('');}
function setImageSource(img,url){if(!img)return;if(!url){img.removeAttribute('src');img.classList.add('hidden');return;}img.src=url;img.classList.remove('hidden');}
function updateImageOnly(){
  var img=document.getElementById('showroomCarImage'),backdrop=document.getElementById('showroomCarBackdrop'),src=currentImage();
  if(img){
    if(src){img.dataset.originalSrc=src;img.dataset.directTried='0';var compatible=compatibleImageUrl(src);if(img.getAttribute('src')!==compatible)img.src=compatible;img.classList.remove('hidden');setImageSource(backdrop,compatible);}
    else{img.removeAttribute('src');img.removeAttribute('data-original-src');img.classList.add('hidden');setImageSource(backdrop,'');}
  }
  renderDots();renderDebug();
}
function moveImage(step){var arr=images();if(!arr.length){updateImageOnly();return;}if(arr.length===1){imageIndex=0;updateImageOnly();restartImageLoop();return;}imageIndex=(imageIndex+step+arr.length)%arr.length;updateImageOnly();restartImageLoop();}
function handleImageError(img){var original=img&&img.dataset?String(img.dataset.originalSrc||''):'';if(original&&img.dataset.directTried!=='1'){img.dataset.directTried='1';try{var directUrl=new URL(original,location.href);directUrl.searchParams.set('_mzjcb',PAGE_CACHE_BUSTER);img.src=directUrl.toString();var b=document.getElementById('showroomCarBackdrop');if(b)b.src=directUrl.toString();}catch(e){var direct=original+(original.indexOf('?')>=0?'&':'?')+'_mzjcb='+encodeURIComponent(PAGE_CACHE_BUSTER);img.src=direct;var bb=document.getElementById('showroomCarBackdrop');if(bb)bb.src=direct;}return;}if(original)badLoaded[original]=1;var arr=images();imageIndex=arr.length?Math.min(imageIndex,arr.length-1):0;updateImageOnly();}
function renderDebug(){if(!/[?&]debug=1(?:&|$)/.test(location.search))return;var el=document.getElementById('mzjDebug');if(!el){el=document.createElement('div');el.id='mzjDebug';el.className='debug';document.body.appendChild(el);}el.textContent='Screen '+screenId+' | theme '+activeThemeId()+' | images '+images().length+' | index '+imageIndex+' | viewport '+innerWidth+'x'+innerHeight+' | '+(currentImage()||'NO IMAGE');}
function startImageLoop(){if(images().length>1)imageTimer=setInterval(function(){moveImage(1);},6500);}
function restartImageLoop(){stopImageLoop();startImageLoop();}
function advanceFeatures(){var valid=validFeatureSections();if(!valid.length)return;var pages=featurePageCount(featureSection);if(featurePage+1<pages){featurePage++;}else{var idx=valid.indexOf(featureSection);featureSection=valid[(idx+1+valid.length)%valid.length];featurePage=0;}updateFeatures();}
function startFeatureLoop(){if(validFeatureSections().length)featureTimer=setInterval(advanceFeatures,8000);}
function restartFeatureLoop(){stopFeatureLoop();startFeatureLoop();}
function moveFeaturePage(step){var pages=featurePageCount(featureSection);featurePage=(featurePage+step+pages)%pages;updateFeatures();restartFeatureLoop();}
function updateTech(){var slot=document.getElementById('techSlot');if(slot){slot.innerHTML=techHtml();bindTechTabs();}}
function updateFeatures(){var slot=document.getElementById('featureSlot');if(slot){slot.innerHTML=featuresHtml();bindFeatureTabs();bindFeaturePager();}}
function bindTechTabs(){Array.prototype.slice.call(document.querySelectorAll('.tech-tab')).forEach(function(btn){btn.onclick=function(e){e.stopPropagation();techIndex=parseInt(btn.getAttribute('data-tech')||'0',10)||0;updateTech();};});}
function bindFeatureTabs(){Array.prototype.slice.call(document.querySelectorAll('.feature-tab')).forEach(function(btn){btn.onclick=function(e){e.stopPropagation();featureSection=btn.getAttribute('data-section')||featureSection;featurePage=0;updateFeatures();restartFeatureLoop();};});}
function bindFeaturePager(){Array.prototype.slice.call(document.querySelectorAll('.feature-page-btn')).forEach(function(btn){btn.onclick=function(e){e.stopPropagation();moveFeaturePage(parseInt(btn.getAttribute('data-step')||'0',10)||0);};});}
function bindRendered(){bindTechTabs();bindFeatureTabs();bindFeaturePager();var prev=document.getElementById('imgPrev'),next=document.getElementById('imgNext');if(prev)prev.onclick=function(){moveImage(-1);};if(next)next.onclick=function(){moveImage(1);};var img=document.getElementById('showroomCarImage');if(img)img.onerror=function(){handleImageError(this);};var backdrop=document.getElementById('showroomCarBackdrop');if(backdrop)backdrop.onerror=function(){};}

/* ---------- data loading ---------- */
function cacheKey(){return screenOptions.carId?hash('id:'+screenOptions.carId):hash(screenOptions.carUrl);}
async function fetchFresh(){var identifier=screenOptions.carId||screenOptions.carUrl;if(!identifier)throw new Error('لا يوجد ID للسيارة');var r=await fetch('/api/read-car?id='+encodeURIComponent(identifier)+'&_='+Date.now(),{cache:'no-store'}),d=await r.json().catch(function(){return{};});if(!r.ok)throw new Error(d.error||'تعذر قراءة بيانات السيارة');if(screenOptions.carId&&String(d.id||'')!==String(screenOptions.carId))throw new Error('بيانات السيارة لا تطابق ID الشاشة');if(screenOptions.carUrl&&d.carUrl&&normUrl(d.carUrl)!==normUrl(screenOptions.carUrl))throw new Error('بيانات السيارة لا تطابق رابط الشاشة');data=d;imageIndex=0;techIndex=0;featureSection='interior';featurePage=0;badLoaded={};render();db.collection('showroom_car_cache').doc(cacheKey()).set(d,{merge:true}).catch(function(){});return d;}
async function loadCar(){try{await fetchFresh();return;}catch(freshError){try{var doc=await db.collection('showroom_car_cache').doc(cacheKey()).get(),cached=doc.exists?(doc.data()||{}):null;if(cached&&(!screenOptions.carId||String(cached.id||'')===String(screenOptions.carId))&&(!screenOptions.carUrl||!cached.carUrl||normUrl(cached.carUrl)===normUrl(screenOptions.carUrl))){data=cached;imageIndex=0;techIndex=0;featureSection='interior';featurePage=0;badLoaded={};render();return;}}catch(ignore){}empty('تعذر تحميل بيانات نفس السيارة وسيتم إعادة المحاولة تلقائيًا');}}
function start(){db.collection('showroom_screens').doc(screenId).onSnapshot(function(doc){if(!doc.exists){lastVehicleKey='';data=null;empty();return;}var s=doc.data()||{};if(!s.carId&&!s.carUrl){lastVehicleKey='';data=null;empty();return;}screenOptions.carId=String(s.carId||'');screenOptions.carUrl=String(s.carUrl||'');screenOptions.carName=String(s.carName||'');screenOptions.carPrice=String(s.carPrice||'');screenOptions.themeId=String(s.themeId||'');screenOptions.imageFilterColor=s.imageFilterColor||'all';screenOptions.imageFilterLabel=s.imageFilterLabel||'';screenOptions.selectedImages=Array.isArray(s.selectedImages)?s.selectedImages:[];screenOptions.sliderImages=Array.isArray(s.sliderImages)?s.sliderImages:screenOptions.selectedImages;screenOptions.sliderMode=s.sliderMode||(screenOptions.sliderImages.length?'manual':'all');var refreshToken=Number(s.forceRefresh||0),vehicleKey=screenOptions.carId||normUrl(screenOptions.carUrl),carChanged=vehicleKey!==lastVehicleKey,forced=refreshToken!==lastForceRefresh;lastVehicleKey=vehicleKey;lastForceRefresh=refreshToken;if(carChanged||!data)loadCar();else if(forced)fetchFresh().catch(function(){render();});else{imageIndex=0;render();}},function(){empty('جاري الاتصال وإعادة التحميل تلقائيًا');});}

listenDisplaySettings();
listenThemeIdentity(activeThemeId());
start();
setInterval(function(){if(lastVehicleKey)fetchFresh().catch(function(){});},10*60*1000);
