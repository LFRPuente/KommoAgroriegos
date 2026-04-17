const fs = require('fs');
const https = require('https');

async function deployMinimal() {
    try {
        const envContent = fs.readFileSync('.env', 'utf8');
        const apiKey = envContent.match(/^N8N_API_KEY=(.+)$/m)?.[1]?.trim();
        
        const patchPath = '.tmp_wf_after_recepcion_patch.json';
        const patch = JSON.parse(fs.readFileSync(patchPath, 'utf8').replace(/^\uFEFF/, ''));

        // Absolute minimal update payload
        const bodyObj = {
            nodes: patch.nodes,
            connections: patch.connections
        };

        const putBody = JSON.stringify(bodyObj);
        const url = new URL('https://n8n.srv1388533.hstgr.cloud/api/v1/workflows/gfJm4JUoiUi7zZgaB2ob0');
        const options = {
            method: 'PUT',
            hostname: url.hostname,
            path: url.pathname,
            headers: {
                'X-N8N-API-KEY': apiKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(putBody)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log('Status: ' + res.statusCode);
                if (res.statusCode < 400) console.log('OK');
                else console.log('Error: ' + data);
            });
        });
        req.on('error', (e) => console.log('Network Error: ' + e.message));
        req.write(putBody);
        req.end();
    } catch (e) { console.log('Script Error: ' + e.message); }
}
deployMinimal();
