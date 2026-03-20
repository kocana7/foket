const http    = require('http');
const crypto  = require('crypto');
const { exec } = require('child_process');

const PORT          = 4001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'foket-webhook-secret';
const PROJECT_DIR   = 'C:\\foket';

function verify(secret, payload, sig) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expected = 'sha256=' + hmac.digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig)); } catch { return false; }
}

function deploy(res) {
  console.log('[Deploy] git pull 시작...');
  exec(`git -C "${PROJECT_DIR}" pull origin main`, (err, stdout, stderr) => {
    if (err) {
      console.error('[Deploy] 오류:', stderr);
      res.writeHead(500); res.end('Deploy failed: ' + stderr);
      return;
    }
    console.log('[Deploy] 완료:\n' + stdout);

    // API 서버 재시작 (node 프로세스 재시작)
    exec('taskkill /F /IM node.exe /FI "WINDOWTITLE eq foket-api" 2>NUL & start "" cmd /c "cd C:\\foket\\api && node server.js"', () => {});

    res.writeHead(200); res.end('OK');
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404); res.end('Not found'); return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const sig = req.headers['x-hub-signature-256'] || '';

    if (!verify(WEBHOOK_SECRET, body, sig)) {
      console.warn('[Webhook] 서명 불일치 - 무시');
      res.writeHead(401); res.end('Unauthorized'); return;
    }

    let payload;
    try { payload = JSON.parse(body); } catch { res.writeHead(400); res.end('Bad JSON'); return; }

    // main 브랜치 push 이벤트만 처리
    if (payload.ref === 'refs/heads/main') {
      const pusher  = payload.pusher?.name || '알 수 없음';
      const commits = payload.commits?.length || 0;
      console.log(`[Webhook] ${pusher}가 ${commits}개 커밋 push → 배포 시작`);
      deploy(res);
    } else {
      res.writeHead(200); res.end('Skipped (not main branch)');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Foket Webhook 서버 실행 중: http://localhost:${PORT}/webhook`);
});
