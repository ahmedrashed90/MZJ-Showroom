firebase.initializeApp(window.MZJ_FIREBASE_CONFIG);
    var db = firebase.firestore();
    var PAGE_CACHE_BUSTER=window.MZJ_PAGE_CACHE_BUSTER||String(Date.now());

    function esc(s){ return String(s||'').replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];}); }
    function cleanText(s){ return String(s||'').replace(/\s+/g,' ').trim(); }
    function normArabic(s){ return cleanText(s).toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[^\u0600-\u06ff0-9a-z]+/g,' ').replace(/\s+/g,' ').trim(); }
    function uniq(arr){ var seen={}; return (arr||[]).map(cleanText).filter(function(x){ var k=normArabic(x); if(!x||seen[k])return false; seen[k]=1; return true; }); }
    function badImage(url){ return /default-car|placeholder|no-image|noimage|logo|mzj-logo|favicon|icon|cropped-site-icon|cropped-logo|avatar|loader|spinner|blank/i.test(String(url||'')); }
    function normUrl(v){ v=String(v||'').trim(); if(!v)return''; try{var u=new URL(v,location.origin);u.hash='';var p=u.pathname.replace(/\/{2,}/g,'/');if(p.length>1)p=p.replace(/\/+$/,'');return (u.origin.toLowerCase()+p+u.search).toLowerCase();}catch(e){return v.replace(/\/+$/,'').toLowerCase();} }
    function hash(str){ var h=2166136261;str=String(str||'');for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);}return 'car_'+(h>>>0).toString(16); }

    function getScreenId(){
      var u=new URL(location.href), id=u.searchParams.get('id')||u.searchParams.get('screen')||u.searchParams.get('id/')||'';
      if(!id){ u.searchParams.forEach(function(v,k){ if(!id && String(k).replace(/\/+$/,'').toLowerCase()==='id') id=v; }); }
      id=cleanText(id).replace(/^\/+|\/+$/g,'').toUpperCase();
      return /^[A-Z]+\d+$/.test(id)?id:'A1';
    }

    var screenId=getScreenId();
    var data=null;
    var screenOptions={carId:'',carUrl:'',carName:'',carPrice:'',imageFilterColor:'all',imageFilterLabel:'',selectedImages:[],sliderImages:[],sliderMode:'all',themeId:''};
    var displaySettings={featureFontSize:18,logoDataUrl:'',logoWidth:120,logoPosition:'right',activeThemeId:'ramadan',nationalDayNumber:'96',nationalDayLogoDataUrl:'/assets/themes/national-day-default.png'};
    var THEME_META={
      'ramadan':{title:'رمضان كريم',sub:'شهر الخير'},
      'national':{title:'عزنا بطبعنا',sub:'اليوم الوطني السعودي'},
      'founding':{title:'يوم بدينا',sub:'يوم التأسيس'},
      'eid-fitr':{title:'عيد فطر مبارك',sub:'كل عام وأنتم بخير'},
      'eid-adha':{title:'عيد أضحى مبارك',sub:'كل عام وأنتم بخير'}
    };
    var imageIndex=0;
    var techIndex=0;
    var featureSection='interior';
    var featurePage=0;
    var imageTimer=null;
    var featureTimer=null;
    var badLoaded={};
    var lastVehicleKey='';
    var lastForceRefresh=0;
    var lastGlobalThemeId='';

    function empty(msg){
      stopImageLoop();stopFeatureLoop();
      var root=document.getElementById('root');
      root.className='empty-state';
      root.innerHTML='<div><h1>الشاشة '+esc(screenId)+'</h1><p>'+esc(msg||'لا توجد سيارة مرتبطة بهذه الشاشة حاليًا')+'</p></div>';
    }
    function stopImageLoop(){ if(imageTimer)clearInterval(imageTimer); imageTimer=null; }
    function stopFeatureLoop(){ if(featureTimer)clearInterval(featureTimer); featureTimer=null; }

    function listenDisplaySettings(){
      db.collection('showroom_settings').doc('display').onSnapshot(function(doc){
        var rerenderTheme=false;
        if(doc.exists){
          var d=doc.data()||{};
          if(d.featureFontSize!==undefined) displaySettings.featureFontSize=d.featureFontSize;
          if(d.logoDataUrl!==undefined) displaySettings.logoDataUrl=d.logoDataUrl;
          if(d.logoWidth!==undefined) displaySettings.logoWidth=d.logoWidth;
          if(d.logoPosition!==undefined) displaySettings.logoPosition=d.logoPosition;
          else if(d.headerPosition!==undefined) displaySettings.logoPosition=d.headerPosition;
          if(d.activeThemeId!==undefined){
            var nextTheme=String(d.activeThemeId||'').trim();
            if(nextTheme && nextTheme!==displaySettings.activeThemeId){ rerenderTheme=true; }
            displaySettings.activeThemeId=nextTheme||displaySettings.activeThemeId||'ramadan';
            lastGlobalThemeId=displaySettings.activeThemeId;
          }
          if(d.nationalDayNumber!==undefined){var nn=cleanText(d.nationalDayNumber||'96');if(nn!==displaySettings.nationalDayNumber)rerenderTheme=true;displaySettings.nationalDayNumber=nn||'96';}
          if(d.nationalDayLogoDataUrl!==undefined){var nl=String(d.nationalDayLogoDataUrl||'/assets/themes/national-day-default.png');if(nl!==displaySettings.nationalDayLogoDataUrl)rerenderTheme=true;displaySettings.nationalDayLogoDataUrl=nl;}
        }
        applyDisplaySettings();
        if(rerenderTheme && data) render();
      },function(){applyDisplaySettings();});
    }

    function applyDisplaySettings(){
      var fs=Math.max(12,Math.min(26,parseInt(displaySettings.featureFontSize||18,10)));
      var lw=Math.max(60,Math.min(280,parseInt(displaySettings.logoWidth||120,10)));
      document.documentElement.style.setProperty('--showroom-spec-font',fs+'px');
      document.documentElement.style.setProperty('--showroom-logo-width',lw+'px');
      var logo=document.getElementById('showroomLogo');
      if(logo){
        if(displaySettings.logoDataUrl){logo.src=displaySettings.logoDataUrl;logo.classList.remove('hidden');}
        else{logo.removeAttribute('src');logo.classList.add('hidden');}
      }
      var head=document.getElementById('detailsHead');
      if(head){head.classList.toggle('logo-left',displaySettings.logoPosition==='left');head.classList.toggle('logo-right',displaySettings.logoPosition!=='left');}
    }

    function colorRows(){
      var ac=(data&&data.availableColors)||{};
      return {external:Array.isArray(ac.external)?ac.external:[],internal:Array.isArray(ac.internal)?ac.internal:[]};
    }
    function selectedColorName(){
      if(!screenOptions.imageFilterColor||screenOptions.imageFilterColor==='all')return'';
      return cleanText(screenOptions.imageFilterLabel||screenOptions.imageFilterColor).replace(/\s+-\s+\d+\s+صورة.*$/,'');
    }
    function colorImages(name){
      var key=normArabic(name),rows=colorRows().external,hit=null;
      rows.some(function(row){ if(normArabic(row.name)===key){hit=row;return true;} return false; });
      return hit&&Array.isArray(hit.images)?uniq(hit.images).filter(function(u){return !badImage(u)&&!badLoaded[u];}):[];
    }
    function imageKey(url){
      try{var u=new URL(String(url||''),location.origin);return (u.origin.toLowerCase()+u.pathname.replace(/\/{2,}/g,'/')).toLowerCase();}
      catch(e){return String(url||'').split('?')[0].split('#')[0].replace(/\/+$/,'').toLowerCase();}
    }
    function vehicleImagePool(){
      if(!data)return[];
      var out=[].concat(data.images||[],data.image?[data.image]:[]),rows=colorRows().external||[];
      rows.forEach(function(row){out=out.concat(Array.isArray(row.images)?row.images:[]);});
      return uniq(out).filter(function(u){return !badImage(u);});
    }
    function validManualImages(){
      var pool=vehicleImagePool(),allowed={};pool.forEach(function(u){allowed[imageKey(u)]=u;});
      return uniq([].concat(screenOptions.sliderImages||[],screenOptions.selectedImages||[])).map(function(u){return allowed[imageKey(u)]||'';}).filter(function(u){return u&&!badLoaded[u];});
    }
    function images(){
      if(!data)return[];
      var manual=validManualImages();
      if(manual.length)return manual;
      var chosen=selectedColorName();
      if(chosen){var byColor=colorImages(chosen);if(byColor.length)return byColor;}
      return vehicleImagePool().filter(function(u){return !badLoaded[u];});
    }
    function currentImage(){var arr=images();if(!arr.length)return'';if(imageIndex<0)imageIndex=arr.length-1;if(imageIndex>=arr.length)imageIndex=0;return arr[imageIndex];}
    function compatibleImageUrl(url){return url?'/api/image-proxy?url='+encodeURIComponent(url)+'&cb='+encodeURIComponent(PAGE_CACHE_BUSTER):'';}

    function semanticSpecKey(label){
      var n=normArabic(label),map={
        'سعه المحرك':'engine','المحرك':'engine','ناقل الحركه':'transmission','نوع الناقل':'transmission','الدفع':'drive','نظام الدفع':'drive',
        'نوع الوقود':'fuel','الوقود':'fuel','عدد المقاعد':'seats','الموديل':'year','السنه':'year','نوع الهيكل':'body','الهيكل':'body',
        'الفئه':'trim','استهلاك الوقود':'fuel economy','الضمان':'warranty','عدد السرعات':'gears','الحصان الميكانيكي':'hp','عزم نيوتن':'torque',
        'السرعه القصوي':'max speed','عدد السلندرات':'cylinders','الطول مم':'length','العرض مم':'width','الارتفاع مم':'height','قاعده العجلات مم':'wheelbase','حجم الشنطه مم':'trunk'
      };
      return map[n]||n;
    }


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
      return '<svg class="showroom-spec-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>';
    }

    function mainSpecs(){
      var src=(data&&Array.isArray(data.quickSpecs))?data.quickSpecs:[],seen={},out=[];
      src.forEach(function(x){var label=cleanText(x.label),value=cleanText(x.value),key=semanticSpecKey(label);if(!label||!value||value==='—'||seen[key])return;seen[key]=1;out.push([label,value,key]);});
      return out;
    }
    function technicalGroups(){
      var seen={};mainSpecs().forEach(function(x){seen[x[2]]=1;});
      var src=(data&&Array.isArray(data.specGroups))?data.specGroups:[],out=[];
      src.forEach(function(group){
        var items=[];
        (group.items||[]).forEach(function(x){var label=cleanText(x.label),value=cleanText(x.value),key=semanticSpecKey(label);if(!label||!value||value==='—'||seen[key])return;seen[key]=1;items.push([label,value,key]);});
        if(items.length)out.push({title:cleanText(group.title),items:items});
      });
      return out;
    }
    function featureData(){
      var fg=(data&&data.featureGroups)||{};
      return {interior:uniq(fg.interior||[]),exterior:uniq(fg.exterior||[]),safety:uniq(fg.safety||[])};
    }
    function validFeatureSections(){var d=featureData();return ['interior','exterior','safety'].filter(function(k){return d[k].length;});}
    function featureTitle(key){return key==='interior'?'المواصفات الداخلية':key==='exterior'?'المواصفات الخارجية':'مواصفات الأمان';}

    function effectiveThemeId(){ return String(displaySettings.activeThemeId||screenOptions.themeId||'ramadan'); }
    function currentTheme(){return THEME_META[effectiveThemeId()]||null;}
    function nationalIdentityHtml(){
      if(effectiveThemeId()!=='national')return'';
      var logo=displaySettings.nationalDayLogoDataUrl||'/assets/themes/national-day-default.png';
      var number=cleanText(displaySettings.nationalDayNumber||'96');
      return '<div class="showroom-national-identity"><img src="'+esc(logo)+'" alt="شعار اليوم الوطني"><span>اليوم الوطني السعودي <b>'+esc(number)+'</b></span></div>';
    }
    function featurePageSize(){return 14;}
    function featurePageCount(section){var items=featureData()[section]||[];return Math.max(1,Math.ceil(items.length/featurePageSize()));}
    function featurePagerHtml(total){if(total<=1)return'';return '<div class="showroom-feature-pager"><button type="button" class="showroom-feature-page-btn" data-step="-1" aria-label="الصفحة السابقة">‹</button><strong>'+(featurePage+1)+' / '+total+'</strong><button type="button" class="showroom-feature-page-btn" data-step="1" aria-label="الصفحة التالية">›</button></div>';}

    function logoHtml(){
      return '<div id="detailsHead" class="showroom-details-head '+(displaySettings.logoPosition==='left'?'logo-left':'logo-right')+'"><img id="showroomLogo" class="showroom-logo '+(displaySettings.logoDataUrl?'':'hidden')+'" '+(displaySettings.logoDataUrl?'src="'+esc(displaySettings.logoDataUrl)+'"':'')+' alt="الشعار"></div>';
    }
    function colorChip(row,type){
      var active=type==='external'&&selectedColorName()&&normArabic(row.name)===normArabic(selectedColorName());
      return '<span class="showroom-color-chip '+(active?'active':'')+'"><i style="background:'+esc(row.background||'#dedede')+'"></i><b>'+esc(row.name)+'</b></span>';
    }
    function colorsHtml(){
      var rows=colorRows(),parts=[];
      if(rows.external.length)parts.push('<div class="showroom-color-line"><span>الخارجي</span><div>'+rows.external.map(function(r){return colorChip(r,'external');}).join('')+'</div></div>');
      if(rows.internal.length)parts.push('<div class="showroom-color-line"><span>الداخلي</span><div>'+rows.internal.map(function(r){return colorChip(r,'internal');}).join('')+'</div></div>');
      if(!parts.length)return'';
      return '<section class="showroom-colors-card"><strong>الألوان المتاحة</strong>'+parts.join('')+'</section>';
    }
    function techHtml(){
      var groups=technicalGroups();if(!groups.length)return'';if(techIndex>=groups.length)techIndex=0;
      var g=groups[techIndex];
      return '<section class="showroom-tech-card"><div class="showroom-section-head"><strong>المواصفات الفنية</strong></div><div class="showroom-tech-tabs">'+groups.map(function(x,i){return '<button type="button" class="showroom-tech-tab '+(i===techIndex?'active':'')+'" data-tech="'+i+'">'+esc(x.title)+'</button>';}).join('')+'</div><div class="showroom-tech-grid">'+g.items.map(function(x){return '<div class="showroom-tech-spec">'+specIcon(x[2])+'<small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong></div>';}).join('')+'</div></section>';
    }
    function featuresHtml(){
      var groups=featureData(),valid=validFeatureSections();
      if(!valid.length)return'';
      if(valid.indexOf(featureSection)<0){featureSection=valid[0];featurePage=0;}
      var items=groups[featureSection]||[],size=featurePageSize(),pages=Math.max(1,Math.ceil(items.length/size));
      if(featurePage>=pages)featurePage=0;if(featurePage<0)featurePage=pages-1;
      var visible=items.slice(featurePage*size,(featurePage+1)*size);
      var rightCol=visible.slice(0,7),leftCol=visible.slice(7,14);
      function featureItemsHtml(arr){return arr.map(function(x){return '<div class="showroom-feature"><i>✓</i><span>'+esc(x)+'</span></div>';}).join('');}
      return '<section class="showroom-feature-card"><div class="showroom-feature-tabs">'+valid.map(function(k){return '<button type="button" class="showroom-feature-tab '+(k===featureSection?'active':'')+'" data-section="'+k+'">'+esc(featureTitle(k))+'</button>';}).join('')+'</div><div id="featureScroll" class="showroom-feature-scroll"><div class="showroom-feature-columns"><div class="showroom-feature-column">'+featureItemsHtml(rightCol)+'</div><div class="showroom-feature-column">'+featureItemsHtml(leftCol)+'</div></div></div>'+featurePagerHtml(pages)+'</section>';
    }
    function qrHtml(){return '<footer class="showroom-bottom"><div class="showroom-bottom-copy"><strong>تفاصيل السيارة على جوالك</strong><span>امسح الكود لفتح نفس السيارة</span></div><div class="showroom-scan"><div><b>MZJ CARS</b><span>عرض التفاصيل الكاملة</span></div><div id="showroomQr" class="showroom-qr"></div></div></footer>';}

    function render(){
      if(!data){empty();return;}
      stopImageLoop();stopFeatureLoop();
      var title=cleanText(data.title||screenOptions.carName||''),price=cleanText(data.price||screenOptions.carPrice||''),specs=mainSpecs(),themeId=effectiveThemeId(),theme=currentTheme();
      var root=document.getElementById('root');
      root.className='showroom-screen '+(theme?'theme-'+themeId:'theme-ramadan');
      var mainSpecsHtml=specs.length?'<section class="showroom-flow-section showroom-main-specs"><div class="showroom-section-head"><strong>المواصفات الرئيسية</strong></div><div class="showroom-spec-grid">'+specs.map(function(x){return '<div class="showroom-spec">'+specIcon(x[2])+'<small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong></div>';}).join('')+'</div></section>':'';
      root.innerHTML=''
        +'<section class="showroom-visual">'
          +'<div class="showroom-stage"><img id="showroomCarImage" loading="eager" decoding="async" fetchpriority="high" alt="'+esc(title||'صورة السيارة')+'"></div>'
          +'<div class="showroom-visual-shade"></div><div class="showroom-arc"></div><div class="showroom-corner-motif"></div>'
          +nationalIdentityHtml()
          +'<div class="showroom-image-controls"><button id="imgPrev" type="button" aria-label="الصورة السابقة">‹</button><button id="imgNext" type="button" aria-label="الصورة التالية">›</button></div>'
          +'<div id="showroomDots" class="showroom-dots"></div>'
        +'</section>'
        +'<aside class="showroom-details"><div class="showroom-details-shell">'
          +'<header class="showroom-hero">'+logoHtml()+'<div class="showroom-title-row"><h1>'+esc(title)+'</h1>'+(price?'<div class="showroom-price-card"><div class="showroom-price">'+esc(price)+' <span>ر.س</span></div><small>السعر شامل ضريبة القيمة المضافة</small></div>':'')+'</div>'+colorsHtml()+'</header>'
          +mainSpecsHtml
          +'<div id="techSlot">'+techHtml()+'</div>'
          +'<div id="featureSlot" class="showroom-feature-slot">'+featuresHtml()+'</div>'
          +qrHtml()
        +'</div></aside>';
      applyDisplaySettings();bindRendered();updateImageOnly();renderQr();startImageLoop();startFeatureLoop();
    }

    function renderQr(){
      var el=document.getElementById('showroomQr'),url=screenOptions.carUrl||(data&&data.carUrl)||'';
      if(!el||!url)return;el.innerHTML='';
      if(window.QRCode){try{new QRCode(el,{text:url,width:70,height:70,colorDark:'#201915',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}catch(e){}}
    }
    function renderDots(){
      var el=document.getElementById('showroomDots'),arr=images();if(!el)return;
      if(arr.length<2){el.innerHTML='';el.classList.add('hidden');return;}el.classList.remove('hidden');
      var current=imageIndex%arr.length,max=Math.min(arr.length,14);
      el.innerHTML=Array.from({length:max}).map(function(_,i){return '<span class="showroom-dot '+(i===Math.min(current,max-1)?'active':'')+'"></span>';}).join('');
    }
    function updateImageOnly(){
      var img=document.getElementById('showroomCarImage'),src=currentImage();
      if(img){
        if(src){
          img.dataset.originalSrc=src;
          img.dataset.directTried='0';
          var compatible=compatibleImageUrl(src);
          if(img.getAttribute('src')!==compatible)img.src=compatible;
          img.classList.remove('hidden');
        }else{
          img.removeAttribute('src');
          img.removeAttribute('data-original-src');
          img.classList.add('hidden');
        }
      }
      renderDots();
      renderDebug();
    }
    function moveImage(step){
      var arr=images();
      if(!arr.length){updateImageOnly();return;}
      if(arr.length===1){imageIndex=0;updateImageOnly();restartImageLoop();return;}
      imageIndex=(imageIndex+step+arr.length)%arr.length;updateImageOnly();restartImageLoop();
    }
    function handleImageError(img){
      var original=img&&img.dataset?String(img.dataset.originalSrc||''):'';
      // Proxy-first. If conversion/proxy failed, make one direct attempt for modern browsers.
      if(original&&img.dataset.directTried!=='1'){
        img.dataset.directTried='1';
        try{var directUrl=new URL(original,location.href);directUrl.searchParams.set('_mzjcb',PAGE_CACHE_BUSTER);img.src=directUrl.toString();}catch(e){img.src=original+(original.indexOf('?')>=0?'&':'?')+'_mzjcb='+encodeURIComponent(PAGE_CACHE_BUSTER);}
        return;
      }
      if(original)badLoaded[original]=1;
      var arr=images();
      imageIndex=arr.length?Math.min(imageIndex,arr.length-1):0;
      updateImageOnly();
    }
    function renderDebug(){
      if(!/[?&]debug=1(?:&|$)/.test(location.search))return;
      var el=document.getElementById('mzjDebug');
      if(!el){el=document.createElement('div');el.id='mzjDebug';el.className='showroom-debug';document.body.appendChild(el);}
      var arr=images(),vv=window.visualViewport;
      el.textContent='Screen '+screenId+' | images '+arr.length+' | index '+imageIndex+' | viewport '+innerWidth+'x'+innerHeight+' | DPR '+(window.devicePixelRatio||1)+' | scale '+(vv&&vv.scale?vv.scale:1)+' | '+(currentImage()||'NO IMAGE');
    }
    function startImageLoop(){var arr=images();if(arr.length>1)imageTimer=setInterval(function(){moveImage(1);},6500);}
    function restartImageLoop(){stopImageLoop();startImageLoop();}
    function advanceFeatures(){
      var valid=validFeatureSections();if(!valid.length)return;var pages=featurePageCount(featureSection);
      if(featurePage+1<pages){featurePage++;}
      else{var idx=valid.indexOf(featureSection);featureSection=valid[(idx+1+valid.length)%valid.length];featurePage=0;}
      updateFeatures();
    }
    function startFeatureLoop(){var valid=validFeatureSections();if(valid.length)featureTimer=setInterval(advanceFeatures,8000);}
    function restartFeatureLoop(){stopFeatureLoop();startFeatureLoop();}
    function moveFeaturePage(step){var pages=featurePageCount(featureSection);featurePage=(featurePage+step+pages)%pages;updateFeatures();restartFeatureLoop();}

    function updateTech(){var slot=document.getElementById('techSlot');if(slot){slot.innerHTML=techHtml();bindTechTabs();}}
    function updateFeatures(){var slot=document.getElementById('featureSlot');if(slot){slot.innerHTML=featuresHtml();bindFeatureTabs();bindFeaturePager();}}
    function bindTechTabs(){Array.prototype.slice.call(document.querySelectorAll('.showroom-tech-tab')).forEach(function(btn){btn.onclick=function(e){e.stopPropagation();techIndex=parseInt(btn.getAttribute('data-tech')||'0',10)||0;updateTech();};});}
    function bindFeatureTabs(){Array.prototype.slice.call(document.querySelectorAll('.showroom-feature-tab')).forEach(function(btn){btn.onclick=function(e){e.stopPropagation();featureSection=btn.getAttribute('data-section')||featureSection;featurePage=0;updateFeatures();restartFeatureLoop();};});}
    function bindFeaturePager(){Array.prototype.slice.call(document.querySelectorAll('.showroom-feature-page-btn')).forEach(function(btn){btn.onclick=function(e){e.stopPropagation();moveFeaturePage(parseInt(btn.getAttribute('data-step')||'0',10)||0);};});}
    function bindRendered(){
      bindTechTabs();bindFeatureTabs();bindFeaturePager();
      var prev=document.getElementById('imgPrev'),next=document.getElementById('imgNext');if(prev)prev.onclick=function(){moveImage(-1);};if(next)next.onclick=function(){moveImage(1);};
      var img=document.getElementById('showroomCarImage');if(img)img.onerror=function(){handleImageError(this);};
    }

    function cacheKey(){return screenOptions.carId?hash('id:'+screenOptions.carId):hash(screenOptions.carUrl);}
    async function fetchFresh(){
      var identifier=screenOptions.carId||screenOptions.carUrl;if(!identifier)throw new Error('لا يوجد ID للسيارة');
      var r=await fetch('/api/read-car?id='+encodeURIComponent(identifier)+'&_='+Date.now(),{cache:'no-store'}),d=await r.json().catch(function(){return{};});
      if(!r.ok)throw new Error(d.error||'تعذر قراءة بيانات السيارة');
      if(screenOptions.carId&&String(d.id||'')!==String(screenOptions.carId))throw new Error('بيانات السيارة لا تطابق ID الشاشة');
      if(screenOptions.carUrl&&d.carUrl&&normUrl(d.carUrl)!==normUrl(screenOptions.carUrl))throw new Error('بيانات السيارة لا تطابق رابط الشاشة');
      data=d;imageIndex=0;techIndex=0;featureSection='interior';featurePage=0;badLoaded={};render();
      db.collection('showroom_car_cache').doc(cacheKey()).set(d,{merge:true}).catch(function(){});return d;
    }
    async function loadCar(){
      try{await fetchFresh();return;}catch(freshError){
        try{var doc=await db.collection('showroom_car_cache').doc(cacheKey()).get(),cached=doc.exists?(doc.data()||{}):null;if(cached&&(!screenOptions.carId||String(cached.id||'')===String(screenOptions.carId))&&(!screenOptions.carUrl||!cached.carUrl||normUrl(cached.carUrl)===normUrl(screenOptions.carUrl))){data=cached;imageIndex=0;techIndex=0;featureSection='interior';featurePage=0;badLoaded={};render();return;}}catch(ignore){}
        empty('تعذر تحميل بيانات نفس السيارة وسيتم إعادة المحاولة تلقائيًا');
      }
    }

    function start(){
      db.collection('showroom_screens').doc(screenId).onSnapshot(function(doc){
        if(!doc.exists){lastVehicleKey='';data=null;empty();return;}
        var s=doc.data()||{};if(!s.carId&&!s.carUrl){lastVehicleKey='';data=null;empty();return;}
        var previousTheme=screenOptions.themeId||'';
        screenOptions.carId=String(s.carId||'');screenOptions.carUrl=String(s.carUrl||'');screenOptions.carName=String(s.carName||'');screenOptions.carPrice=String(s.carPrice||'');screenOptions.themeId=String(s.themeId||'');
        screenOptions.imageFilterColor=s.imageFilterColor||'all';screenOptions.imageFilterLabel=s.imageFilterLabel||'';
        screenOptions.selectedImages=Array.isArray(s.selectedImages)?s.selectedImages:[];screenOptions.sliderImages=Array.isArray(s.sliderImages)?s.sliderImages:screenOptions.selectedImages;screenOptions.sliderMode=s.sliderMode||(screenOptions.sliderImages.length?'manual':'all');
        var refreshToken=Number(s.forceRefresh||0),vehicleKey=screenOptions.carId||normUrl(screenOptions.carUrl),carChanged=vehicleKey!==lastVehicleKey,forced=refreshToken!==lastForceRefresh,themeChanged=previousTheme!==screenOptions.themeId;
        lastVehicleKey=vehicleKey;lastForceRefresh=refreshToken;
        if(carChanged||!data)loadCar();else if(forced)fetchFresh().catch(function(){render();});else if(themeChanged)render();else{imageIndex=0;updateImageOnly();renderQr();}
      },function(){empty('جاري الاتصال وإعادة التحميل تلقائيًا');});
    }

    listenDisplaySettings();start();
    setInterval(function(){if(lastVehicleKey)fetchFresh().catch(function(){});},10*60*1000);
  