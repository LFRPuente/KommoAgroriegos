const fs = require('fs');
const https = require('https');

const envContent = fs.readFileSync('.env', 'utf8');
const apiKey = envContent.match(/^N8N_API_KEY=(.+)$/m)?.[1]?.trim();

const patch = JSON.parse(fs.readFileSync('.tmp_wf_after_recepcion_patch.json', 'utf8').replace(/^\uFEFF/, ''));

const bodyObj = {
    name: patch.name,
    nodes: patch.nodes,
    connections: patch.connections,
    settings: {}
};

const putBody = JSON.stringify(bodyObj);
console.log('Body size:', putBody.length, 'bytes');

const options = {
    method: 'PUT',
    hostname: 'n8n.srv1388533.hstgr.cloud',
    path: '/api/v1/workflows/gfJm4JUoiUi7zZgaB2ob0',
    headers: {
        'X-N8N-API-KEY': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(putBody)
    },
    timeout: 60000
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        if (res.statusCode < 400) {
            console.log('OK — Workflow deployed successfully');
        } else {
            console.log('Error:', data.substring(0, 500));
        }
    });
});

req.on('timeout', () => {
    console.log('TIMEOUT — request timed out after 60s');
    req.destroy();
});

req.on('error', (e) => {
    console.log('Network Error:', e.code || e.message);
});

req.write(putBody);
req.end();
