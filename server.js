const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { getStock, readCar } = require('./api/_shared');

const publicDir = path.join(__dirname, 'public');
const port = process.env.PORT || 3000;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

function sendJson(res, code, data){
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath){
  fs.readFile(filePath, (err, data) => {
    if(err){
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    });
    res.end(data);
  });
}

async function handler(req, res){
  try{
    const u = new URL(req.url, 'http://localhost');

    if(req.method === 'OPTIONS'){
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    if(u.pathname === '/api/stock'){
      const force = u.searchParams.get('force') === '1';
      return sendJson(res, 200, await getStock(force));
    }

    if(u.pathname === '/api/read-car'){
      const carUrl = u.searchParams.get('url') || '';
      if(!carUrl) return sendJson(res, 400, { ok:false, error:'missing url' });
      return sendJson(res, 200, await readCar(carUrl));
    }

    let pathname = decodeURIComponent(u.pathname);
    if(pathname === '/') pathname = '/dashboard.html';
    if(pathname === '/dashboard') pathname = '/dashboard.html';
    if(pathname === '/screen') pathname = '/screen.html';

    const safePath = path.normalize(path.join(publicDir, pathname));
    if(!safePath.startsWith(publicDir)){
      res.writeHead(403, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end('Forbidden');
      return;
    }

    sendFile(res, safePath);
  }catch(e){
    sendJson(res, 500, { ok:false, error: e && e.message ? e.message : String(e) });
  }
}

const server = http.createServer(handler);

if(require.main === module){
  server.listen(port, () => console.log('MZJ showroom running on http://localhost:' + port));
}

module.exports = server;
