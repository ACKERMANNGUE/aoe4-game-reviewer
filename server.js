const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const net   = require('net');

const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.json': 'application/json',
  '.md':   'text/markdown; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// External CORS proxies used as fallback when direct access is blocked (Cloudflare 52x)
const CORS_PROXIES = [
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/raw?url=',
  'https://thingproxy.freeboard.io/fetch/',
];

function findFreePort(start) {
  return new Promise(resolve => {
    const probe = port => {
      const s = net.createServer();
      s.once('error', () => probe(port + 1));
      s.once('listening', () => s.close(() => resolve(port)));
      s.listen(port, '127.0.0.1');
    };
    probe(start);
  });
}

/**
 * Fetch a URL via Node https, returning { status, headers, body }.
 * Timeout defaults to 10 s.
 */
function nodeFetch(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers:  {
        'Host':            parsed.hostname,
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer':         'https://aoe4world.com/',
      },
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks),
      }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Proxy a target URL through Node (no CORS restrictions).
 * Falls through public CORS proxies if the direct request is Cloudflare-blocked (5xx).
 */
async function proxyUrl(targetUrl, res) {
  const urls = [targetUrl, ...CORS_PROXIES.map(p => p + encodeURIComponent(targetUrl))];

  for (const url of urls) {
    try {
      const r = await nodeFetch(url);
      if (r.status >= 200 && r.status < 500) {
        res.writeHead(r.status, {
          'Content-Type':                r.headers['content-type'] || 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(r.body);
        return;
      }
    } catch (_) {}
  }

  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'All proxy routes failed' }));
}

const server = http.createServer((req, res) => {
  // /api/*  →  https://aoe4world.com/api/v0/*
  if (req.url.startsWith('/api/')) {
    const apiPath = '/api/v0/' + req.url.slice('/api/'.length);
    proxyUrl('https://aoe4world.com' + apiPath, res).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // /web-proxy/*  →  https://aoe4world.com/*  (for non-API paths, e.g. /players/*/summary)
  if (req.url.startsWith('/web-proxy/')) {
    const webPath = req.url.slice('/web-proxy'.length);
    proxyUrl('https://aoe4world.com' + webPath, res).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Serve static files (strip query string for file lookup)
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file    = path.join(ROOT, urlPath);

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

findFreePort(8080).then(port => {
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(`\nAOE4 Game Reviewer -> ${url}\n`);
    // Open browser
    const { exec } = require('child_process');
    const open = process.platform === 'darwin' ? `open "${url}"`
               : process.platform === 'win32'  ? `start "${url}"`
               :                                 `xdg-open "${url}"`;
    exec(open);
  });
});
