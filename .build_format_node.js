const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('c:/Users/eduar/Documents/GitHub/Personal/KommoAgroriegos/.wf_cobros_live.json', 'utf8'));
const formatNode = wf.nodes.find(n => n.name === 'Formatear Excel (Code)');

const code = `
const rows = $input.all().map(i => i.json);

if (!rows.length) {
  return [{ json: { skipped: true } }];
}

const headers = [
  { key: 'DOCUMENTO',          label: 'Documento / Factura' },
  { key: 'RAZON_SOCIAL',       label: 'Razon Social' },
  { key: 'TELEFONO',           label: 'Telefono' },
  { key: 'FECHA_VENCIMIENTO',  label: 'Fecha Vencimiento' },
  { key: 'SALDO_ORIGINAL',     label: 'Saldo Original' },
  { key: 'PAGO_ACUMULADO',     label: 'Pago Acumulado' },
  { key: 'SALDO_PENDIENTE',    label: 'Saldo Pendiente' },
  { key: 'FECHA_ULTIMO_ABONO', label: 'Fecha Ultimo Abono' },
  { key: 'STATUS_PAGO',        label: 'Estatus Pago' },
];

const moneyKeys = new Set(['SALDO_ORIGINAL','PAGO_ACUMULADO','SALDO_PENDIENTE']);

function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function colLetter(n) {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); }
  return s;
}

const styleXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
'<fonts count="4">' +
'<font><sz val="10"/><color rgb="FF000000"/><name val="Calibri"/></font>' +
'<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
'<font><sz val="10"/><color rgb="FF1A6B1A"/><name val="Calibri"/></font>' +
'<font><sz val="10"/><color rgb="FF856404"/><name val="Calibri"/></font>' +
'</fonts>' +
'<fills count="5">' +
'<fill><patternFill patternType="none"/></fill>' +
'<fill><patternFill patternType="gray125"/></fill>' +
'<fill><patternFill patternType="solid"><fgColor rgb="FF2E4057"/></patternFill></fill>' +
'<fill><patternFill patternType="solid"><fgColor rgb="FFD6F5D6"/></patternFill></fill>' +
'<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3CD"/></patternFill></fill>' +
'</fills>' +
'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
'<cellXfs count="6">' +
'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
'<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
'<xf numFmtId="4" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>' +
'<xf numFmtId="4" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>' +
'<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>' +
'<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>' +
'</cellXfs>' +
'</styleSheet>';

let sheetRows = '';
sheetRows += '<row r="1" ht="28" customHeight="1">';
headers.forEach((h, i) => {
  const col = colLetter(i + 1);
  sheetRows += '<c r="' + col + '1" t="inlineStr" s="1"><is><t>' + esc(h.label) + '</t></is></c>';
});
sheetRows += '</row>';

rows.forEach((row, ri) => {
  const r = ri + 2;
  const isPagado = String(row.STATUS_PAGO || '') === 'Pagado';
  sheetRows += '<row r="' + r + '" ht="20" customHeight="1">';
  headers.forEach((h, i) => {
    const col = colLetter(i + 1);
    const isMoney = moneyKeys.has(h.key);
    const val = row[h.key];
    if (isMoney) {
      const num = Number(val) || 0;
      const s = isPagado ? '2' : '3';
      sheetRows += '<c r="' + col + r + '" t="n" s="' + s + '"><v>' + num + '</v></c>';
    } else {
      const s = isPagado ? '4' : '5';
      sheetRows += '<c r="' + col + r + '" t="inlineStr" s="' + s + '"><is><t>' + esc(val) + '</t></is></c>';
    }
  });
  sheetRows += '</row>';
});

const lastCol = colLetter(headers.length);

const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
'<sheetFormatPr defaultRowHeight="15"/>' +
'<cols>' +
'<col min="1" max="1" width="22" customWidth="1"/>' +
'<col min="2" max="2" width="36" customWidth="1"/>' +
'<col min="3" max="3" width="18" customWidth="1"/>' +
'<col min="4" max="4" width="18" customWidth="1"/>' +
'<col min="5" max="5" width="16" customWidth="1"/>' +
'<col min="6" max="6" width="16" customWidth="1"/>' +
'<col min="7" max="7" width="16" customWidth="1"/>' +
'<col min="8" max="8" width="20" customWidth="1"/>' +
'<col min="9" max="9" width="14" customWidth="1"/>' +
'</cols>' +
'<sheetData>' + sheetRows + '</sheetData>' +
'<autoFilter ref="A1:' + lastCol + '1"/>' +
'</worksheet>';

const wbXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
'<sheets><sheet name="Cobros" sheetId="1" r:id="rId1"/></sheets>' +
'</workbook>';

const wbRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
'</Relationships>';

const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
'</Relationships>';

const contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
'<Default Extension="xml" ContentType="application/xml"/>' +
'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
'</Types>';

const JSZip = require('jszip');
const zip = new JSZip();
zip.file('[Content_Types].xml', contentTypesXml);
zip.file('_rels/.rels', relsXml);
zip.file('xl/workbook.xml', wbXml);
zip.file('xl/_rels/workbook.xml.rels', wbRelsXml);
zip.file('xl/worksheets/sheet1.xml', sheetXml);
zip.file('xl/styles.xml', styleXml);

const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const base64 = buffer.toString('base64');
const today = new Date().toISOString().slice(0, 10);
const fileName = 'cobros_' + today + '.xlsx';

return [{
  json: { fileName, rows: rows.length },
  binary: {
    data: {
      data: base64,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName,
    }
  }
}];
`;

formatNode.parameters = { jsCode: code };
const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: {} };
fs.writeFileSync('c:/Users/eduar/Documents/GitHub/Personal/KommoAgroriegos/.wf_cobros_patch.json', JSON.stringify(payload));
console.log('OK - code length:', code.length);
