const http = require('http');
const https = require('https');
const { URL } = require('url');

function fetchBuffer(url, timeout=25000){
  return new Promise((resolve, reject)=>{
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, {
      headers: {
        'User-Agent': 'MZJ-Showroom-PDF/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Cache-Control': 'no-cache'
      },
      timeout
    }, r=>{
      if(r.statusCode >= 300 && r.statusCode < 400 && r.headers.location){
        const next = new URL(r.headers.location, url).toString();
        fetchBuffer(next, timeout).then(resolve).catch(reject);
        return;
      }
      if(r.statusCode < 200 || r.statusCode >= 300){ reject(new Error('HTTP '+r.statusCode)); return; }
      const chunks=[];
      r.on('data', c=>chunks.push(c));
      r.on('end', ()=>resolve({body:Buffer.concat(chunks), type:r.headers['content-type'] || 'image/jpeg'}));
    });
    req.on('timeout', ()=>req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res){
  try{
    const raw = (req.query && req.query.url) || '';
    if(!raw) return res.status(400).send('missing url');
    const u = new URL(raw);
    if(!/^https?:$/.test(u.protocol)) return res.status(400).send('bad url');
    const out = await fetchBuffer(u.toString());
    res.setHeader('Content-Type', out.type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(out.body);
  }catch(e){
    res.status(500).send(e && e.message ? e.message : String(e));
  }
};
