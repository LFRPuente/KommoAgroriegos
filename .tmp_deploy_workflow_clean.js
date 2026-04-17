const fs = require('fs');
const https = require('https');

async function deploy() {
    try {
        const envContent = fs.readFileSync('.env', 'utf8');
        const apiKey = envContent.match(/^N8N_API_KEY=(.+)$/m)?.[1]?.trim();
        if (!apiKey) throw new Error('N8N_API_KEY not found in .env');

        const patchPath = '.tmp_wf_after_recepcion_patch.json';
        if (!fs.existsSync(patchPath)) throw new Error('No se encontró ' + patchPath);
        let patchRaw = fs.readFileSync(patchPath, 'utf8');
        if (patchRaw.charCodeAt(0) === 0xFEFF) patchRaw = patchRaw.slice(1);
        const patch = JSON.parse(patchRaw);

        // Picking ONLY the fields n8n API documentation mentions or are usually required
        const bodyObj = {
            name: patch.name,
            nodes: patch.nodes,
            connections: patch.connections,
            settings: {}
        };

        const putBody = JSON.stringify(bodyObj);

        const url = new URL('https://n8n.srv1388533.hstgr.cloud/api/v1/workflows/gfJm4JUoiUi7zZgaB2ob0');
        const options = {
            method: 'PUT',
            hostname: url.hostname,
            path: url.pathname + url.search,
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
                if (res.statusCode >= 400) {
                    console.log('Error Data: ' + data);
                } else {
                    console.log('OK');
                }
            });
        });

        req.on('error', (e) => {
            console.error('Network Error: ' + e.message);
        });

        req.write(putBody);
        req.end();
    } catch (e) {
        console.error('Script Error: ' + e.message);
    }
}

deploy();
