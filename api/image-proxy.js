const http = require('http');
const https = require('https');
const { URL } = require('url');

function fetchBuffer(url, timeout=25000, redirects=0){
  return new Promise((resolve, reject)=>{
    if(redirects > 5) return reject(new Error('Too many redirects'));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, {
      headers: {
        'User-Agent': 'Mozilla/5.0 MZJ-Showroom/45.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Referer': u.origin + '/'
      },
      timeout
    }, r=>{
      if(r.statusCode >= 300 && r.statusCode < 400 && r.headers.location){
        const next = new URL(r.headers.location, url).toString();
        r.resume();
        fetchBuffer(next, timeout, redirects+1).then(resolve).catch(reject);
        return;
      }
      if(r.statusCode < 200 || r.statusCode >= 300){
        r.resume();
        reject(new Error('HTTP '+r.statusCode));
        return;
      }
      const chunks=[];
      let size=0;
      const max=25*1024*1024;
      r.on('data', c=>{
        size+=c.length;
        if(size>max){ req.destroy(new Error('Image too large')); return; }
        chunks.push(c);
      });
      r.on('end', ()=>resolve({body:Buffer.concat(chunks), type:r.headers['content-type'] || 'application/octet-stream'}));
    });
    req.on('timeout', ()=>req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

async function toCompatibleJpeg(buffer){
  const sharp = require('sharp');
  return sharp(buffer, {failOn:'none', animated:false})
    .rotate()
    .resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true})
    .flatten({background:'#f3f1ee'})
    .jpeg({quality:92,mozjpeg:true,chromaSubsampling:'4:4:4'})
    .toBuffer();
}

module.exports = async function handler(req, res){
  try{
    const raw = (req.query && req.query.url) || '';
    if(!raw) return res.status(400).send('missing url');
    const u = new URL(raw);
    if(!/^https?:$/.test(u.protocol)) return res.status(400).send('bad url');

    const source = await fetchBuffer(u.toString());
    let body, type;
    try{
      body = await toCompatibleJpeg(source.body);
      type = 'image/jpeg';
    }catch(convertError){
      // Fallback preserves availability if conversion is unavailable for an unusual source.
      body = source.body;
      type = source.type || 'image/jpeg';
    }

    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-MZJ-Image-Proxy', type === 'image/jpeg' ? 'jpeg-compatible' : 'passthrough');
    res.status(200).send(body);
  }catch(e){
    res.status(500).send(e && e.message ? e.message : String(e));
  }
};
