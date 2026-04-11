const fs = require('fs');
const https = require('https');

const base = 'https://n8n.srv1388533.hstgr.cloud';
const workflowId = 'gfJm4JUoiUi7zZgaB2ob0';
const env = fs.readFileSync('.env', 'utf8');
const keyLine = env.split(/\r?\n/).find((l) => l.startsWith('N8N_API_KEY='));
if (!keyLine) throw new Error('N8N_API_KEY not found in .env');
const apiKey = keyLine.slice('N8N_API_KEY='.length).trim();

const parseCode = fs.readFileSync('.tmp_parsear_code.js', 'utf8');
const systemMessage = fs.readFileSync('.tmp_agent_system_utf8.txt', 'utf8');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const req = https.request(
      base + path,
      {
        method,
        headers: {
          'X-N8N-API-KEY': apiKey,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': String(payload.length) } : {}),
        },
        timeout: 180000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = {};
          try { json = raw ? JSON.parse(raw) : {}; } catch {}
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode} ${method} ${path} ${raw.slice(0, 500)}`));
          }
          resolve(json);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Timeout ${method} ${path}`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const wf = await request('GET', `/api/v1/workflows/${workflowId}`);
  for (const n of wf.nodes || []) {
    if (n.name === 'Parsear Cobranza Agent (Code)') {
      n.parameters.jsCode = parseCode;
    }
    if (n.name === 'AI Agent Cobranza') {
      n.parameters.options = n.parameters.options || {};
      n.parameters.options.systemMessage = systemMessage;
    }
  }

  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: {},
  };
  if (wf.settings && wf.settings.timezone) payload.settings.timezone = wf.settings.timezone;
  await request('PUT', `/api/v1/workflows/${workflowId}`, payload);

  const wf2 = await request('GET', `/api/v1/workflows/${workflowId}`);
  const parser = (wf2.nodes || []).find((n) => n.name === 'Parsear Cobranza Agent (Code)');
  const agent = (wf2.nodes || []).find((n) => n.name === 'AI Agent Cobranza');
  const okParser = /outsideCobranzaRegex/.test((parser?.parameters?.jsCode || ''));
  const okPrompt = /solo saluda/.test((agent?.parameters?.options?.systemMessage || ''));
  console.log(JSON.stringify({ updated: wf2.id, active: wf2.active, parserPatched: okParser, promptPatched: okPrompt }));
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});

