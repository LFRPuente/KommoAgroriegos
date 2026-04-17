const fs = require('fs');
const https = require('https');

try {
    const envContent = fs.readFileSync('.env', 'utf8');
    const apiKey = envContent.match(/^N8N_API_KEY=(.+)$/m)?.[1]?.trim();
    if (!apiKey) throw new Error('N8N_API_KEY not found in .env');

    const wfPath = '.tmp_wf_after_recepcion_patch.json';
    if (!fs.existsSync(wfPath)) throw new Error('No se encontró el workflow patchado ' + wfPath);
    const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

    // Preparar body para PUT
    const putBody = JSON.stringify({
        name: wf.name,
        nodes: wf.nodes,
        connections: wf.connections,
        settings: {},
    });

    const url = new URL('https://n8n.srv1388533.hstgr.cloud/api/v1/workflows/gfJm4JUoiUi7zZgaB2ob0');
    const options = {
        method: 'PUT',
        hostname: url.hostname,
        path: url.pathname,
        headers: {
            'X-N8N-API-KEY': apiKey,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(putBody),
        },
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log('Status: ' + res.statusCode);
            if (res.statusCode >= 400) {
                console.log('Error: ' + data);
            } else {
                console.log('OK');
            }
        });
    });

    req.on('error', (e) => {
        console.error('ERROR: ' + e.message);
    });

    req.write(putBody);
    req.end();
} catch (e) {
    console.error('ERROR: ' + e.message);
}
