const xlsx = require('xlsx');
const fs = require('fs');

const fileBuffer = fs.readFileSync('c:/Users/luis_/Desktop/newkommoproject/prueba kommo.xlsx');
const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Use range: 2 means start reading from 3rd row (0-indexed 2)
const data = xlsx.utils.sheet_to_json(sheet, { range: 2, raw: false });
console.log("Total entries:", data.length);
console.log("First entry:", data[0]);
