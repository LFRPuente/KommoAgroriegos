Reconst xlsx = require('xlsx');
const fs = require('fs');

const fileBuffer = fs.readFileSync('c:/Users/luis_/Desktop/newkommoproject/prueba kommo.xlsx');
const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const records = xlsx.utils.sheet_to_json(sheet, { range: 2, raw: false });

const normalizedRecords = records.map(record => {
    let telefono = (record['TELEFONO1'] || '').toString().replace(/\D/g, '');
    let saldoDoc = parseFloat((record['SALDO DOC'] || '').toString().replace(',', '')) || 0;
    let documento = record['DOCUMENTO'] || 'S/N';
    let razonSocial = record['RAZON SOCIAL'] || 'Desconocido';

    return {
        json: {
            DOCUMENTO: documento,
            RAZON_SOCIAL: razonSocial,
            TELEFONO_ORIGINAL: record['TELEFONO1'],
            TELEFONO_LIMPIO: telefono,
            SALDO_DOC: saldoDoc,
            FECHA_VENC: record['FECHA VENC'],
            titulo_trato: `Factura ${documento} - ${razonSocial}`
        }
    };
});

console.log(JSON.stringify(normalizedRecords.slice(0, 3), null, 2));
