const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('c:/Users/eduar/Documents/GitHub/Personal/KommoAgroriegos/.wf_cobros_live.json', 'utf8'));

const SHEET_ID = '1bmC31r3ooeWpw7aHfE9lEy6fpT3c1w49KCyaprviDrw';
const DRIVE_CRED = { id: 'p9Jf1xjKDCPCYy1s', name: 'Google Drive account 2' };

const keepNodes = ['Cron Diario Cobros 08:00', 'Webhook Test Cobros', 'Generar Filas Cobros (Code)'];
wf.nodes = wf.nodes.filter(n => keepNodes.includes(n.name));

// Node: Build payload (Code)
const buildPayloadCode = `
const rows = $input.all().map(i => i.json);

const headers = [
  'Documento / Factura','Razon Social','Telefono','Fecha Vencimiento',
  'Saldo Original','Pago Acumulado','Saldo Pendiente','Fecha Ultimo Abono','Estatus Pago'
];
const keys = [
  'DOCUMENTO','RAZON_SOCIAL','TELEFONO','FECHA_VENCIMIENTO',
  'SALDO_ORIGINAL','PAGO_ACUMULADO','SALDO_PENDIENTE','FECHA_ULTIMO_ABONO','STATUS_PAGO'
];

const values = [headers];
for (const row of rows) {
  values.push(keys.map(k => row[k] === null || row[k] === undefined ? '' : row[k]));
}

const dataRowCount = rows.length;

return [{ json: { values, dataRowCount } }];
`;

wf.nodes.push({
  id: 'code-build-01',
  name: 'Construir Payload',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [720, 300],
  parameters: { jsCode: buildPayloadCode }
});

// Node: Clear sheet (HTTP Request)
wf.nodes.push({
  id: 'http-clear-01',
  name: 'Limpiar Hoja',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4,
  position: [960, 300],
  credentials: { googleDriveOAuth2Api: DRIVE_CRED },
  parameters: {
    method: 'POST',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:Z:clear`,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'googleDriveOAuth2Api',
    options: {}
  }
});

// Node: Write data (HTTP Request)
wf.nodes.push({
  id: 'http-write-01',
  name: 'Escribir Datos',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4,
  position: [1200, 300],
  credentials: { googleDriveOAuth2Api: DRIVE_CRED },
  parameters: {
    method: 'PUT',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A1?valueInputOption=USER_ENTERED`,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'googleDriveOAuth2Api',
    sendBody: true,
    contentType: 'json',
    body: '={{ JSON.stringify({ range: "A1", majorDimension: "ROWS", values: $("Construir Payload").first().json.values }) }}',
    options: {}
  }
});

// Node: Apply format (HTTP Request)
const formatRequests = [
  { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.18, green: 0.25, blue: 0.34 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)' } },
  { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
  { updateDimensionProperties: { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } },
  { updateDimensionProperties: { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 260 }, fields: 'pixelSize' } },
  { updateDimensionProperties: { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 2, endIndex: 4 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } },
  { updateDimensionProperties: { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 4, endIndex: 7 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
  { updateDimensionProperties: { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
  { updateDimensionProperties: { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
];

// Conditional format applied separately so we can use dataRowCount expression
const condFormatCode = `
const dataRowCount = $('Construir Payload').first().json.dataRowCount;
const SHEET_ID = '1bmC31r3ooeWpw7aHfE9lEy6fpT3c1w49KCyaprviDrw';

const requests = [
  {
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 0, startRowIndex: 1, endRowIndex: dataRowCount + 1, startColumnIndex: 0, endColumnIndex: 9 }],
        booleanRule: {
          condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Pagado' }] },
          format: { backgroundColor: { red: 0.84, green: 0.96, blue: 0.84 }, textFormat: { foregroundColor: { red: 0.10, green: 0.42, blue: 0.10 } } }
        }
      },
      index: 0
    }
  },
  {
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 0, startRowIndex: 1, endRowIndex: dataRowCount + 1, startColumnIndex: 0, endColumnIndex: 9 }],
        booleanRule: {
          condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Abonado' }] },
          format: { backgroundColor: { red: 1, green: 0.95, blue: 0.80 }, textFormat: { foregroundColor: { red: 0.52, green: 0.39, blue: 0.02 } } }
        }
      },
      index: 1
    }
  },
];

return [{ json: { requests } }];
`;

wf.nodes.push({
  id: 'code-condformat-01',
  name: 'Preparar Formato Condicional',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1440, 300],
  parameters: { jsCode: condFormatCode }
});

// Node: Apply static format
wf.nodes.push({
  id: 'http-format-01',
  name: 'Aplicar Formato Encabezado',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4,
  position: [1440, 140],
  credentials: { googleDriveOAuth2Api: DRIVE_CRED },
  parameters: {
    method: 'POST',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'googleDriveOAuth2Api',
    sendBody: true,
    contentType: 'json',
    body: JSON.stringify({ requests: formatRequests }),
    options: {}
  }
});

// Node: Apply conditional format
wf.nodes.push({
  id: 'http-condformat-01',
  name: 'Aplicar Formato Condicional',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4,
  position: [1680, 300],
  credentials: { googleDriveOAuth2Api: DRIVE_CRED },
  parameters: {
    method: 'POST',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'googleDriveOAuth2Api',
    sendBody: true,
    contentType: 'json',
    body: '={{ JSON.stringify({ requests: $json.requests }) }}',
    options: {}
  }
});

wf.connections = {
  'Cron Diario Cobros 08:00': { main: [[{ node: 'Generar Filas Cobros (Code)', type: 'main', index: 0 }]] },
  'Webhook Test Cobros': { main: [[{ node: 'Generar Filas Cobros (Code)', type: 'main', index: 0 }]] },
  'Generar Filas Cobros (Code)': { main: [[{ node: 'Construir Payload', type: 'main', index: 0 }]] },
  'Construir Payload': { main: [[{ node: 'Limpiar Hoja', type: 'main', index: 0 }]] },
  'Limpiar Hoja': { main: [[{ node: 'Escribir Datos', type: 'main', index: 0 }]] },
  'Escribir Datos': { main: [
    [{ node: 'Aplicar Formato Encabezado', type: 'main', index: 0 }],
  ]},
  'Aplicar Formato Encabezado': { main: [[{ node: 'Preparar Formato Condicional', type: 'main', index: 0 }]] },
  'Preparar Formato Condicional': { main: [[{ node: 'Aplicar Formato Condicional', type: 'main', index: 0 }]] },
};

const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: {} };
fs.writeFileSync('c:/Users/eduar/Documents/GitHub/Personal/KommoAgroriegos/.wf_cobros_patch.json', JSON.stringify(payload));
console.log('OK - nodes:', wf.nodes.map(n => n.name));
