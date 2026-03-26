const xlsx = require('xlsx');
const fs = require('fs');

const fileBuffer = fs.readFileSync('C:\\Users\\luis_\\Desktop\\cobranza_tests_pack_2026-03-17\\test_inputs\\excel\\02_recordatorio_5d.xlsx');
const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const data = xlsx.utils.sheet_to_json(sheet, { range: 2, raw: false });
console.log(data[0]);
