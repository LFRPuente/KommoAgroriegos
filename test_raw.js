const xlsx = require('xlsx');
const fs = require('fs');

const fileBuffer = fs.readFileSync('c:/Users/luis_/Desktop/newkommoproject/prueba kommo.xlsx');
const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Simula lo que hace el nodo Spreadsheet de n8n (sin range, como default)
const rawRows = xlsx.utils.sheet_to_json(sheet, { raw: false });

console.log('Total filas crudas:', rawRows.length);
console.log('--- Fila 0 (keys) ---');
console.log(Object.keys(rawRows[0]));
console.log('--- Fila 2 ---');
if (rawRows[2]) console.log(JSON.stringify(rawRows[2], null, 2));
console.log('--- Fila 3 ---');
if (rawRows[3]) console.log(JSON.stringify(rawRows[3], null, 2));
