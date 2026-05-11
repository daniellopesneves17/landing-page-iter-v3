const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const filePath = path.join(root, 'index.html');
const port = Number(process.env.PORT || 5178);
const clients = new Set();

const liveReloadScript = `
<script>
(() => {
  const events = new EventSource('/__live-reload');
  events.addEventListener('reload', () => window.location.reload());
})();
</script>`;

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.url === '/__live-reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.url === '/' || req.url.startsWith('/index.html')) {
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) {
        send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Erro ao ler index.html');
        return;
      }
      send(
        res,
        200,
        { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        html.replace('</body>', `${liveReloadScript}</body>`)
      );
    });
    return;
  }

  send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found');
});

fs.watch(filePath, { persistent: true }, () => {
  for (const client of clients) client.write('event: reload\ndata: now\n\n');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ITER live server: http://127.0.0.1:${port}/`);
});
