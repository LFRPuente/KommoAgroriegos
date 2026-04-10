const inputRows = $items('Renombrar Columnas', 0, 0).map(i => i.json || {});
const historicoSheetValues = Array.isArray($json.values) ? $json.values : [];

function toNum(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function to2(v){ return Number(toNum(v).toFixed(2)); }
function nowIso(){ return new Date().toISOString(); }
function pick(r, keys){ for (const k of keys){ if (r[k] !== undefined && r[k] !== null) return r[k]; } return ''; }

const headerEstado = ['DOCUMENTO','RAZON_SOCIAL','TELEFONO','FECHA_VENCIMIENTO','SALDO_ORIGINAL','PAGO_ACUMULADO','SALDO_PENDIENTE','FECHA_ULTIMO_ABONO','FECHA_PAGO','STATUS_PAGO','FUENTE','LEAD_ID'];
const headerHistorico = ['TIMESTAMP','DOCUMENTO','RAZON_SOCIAL','TELEFONO','SALDO_ORIGINAL','PAGO_ACUMULADO','SALDO_PENDIENTE','FECHA_ULTIMO_ABONO','FECHA_PAGO','STATUS_PAGO','FUENTE','LEAD_ID'];

const prevSigByDoc = {};
if (historicoSheetValues.length > 0) {
  const start = (String(historicoSheetValues[0][0] || '').toUpperCase() === 'TIMESTAMP') ? 1 : 0;
  for (let i = start; i < historicoSheetValues.length; i++) {
    const row = historicoSheetValues[i] || [];
    const doc = String(row[1] || '').trim();
    if (!doc) continue;
    const sig = [to2(row[5]), to2(row[6]), String(row[7] || '').trim(), String(row[8] || '').trim(), String(row[9] || '').trim()].join('|');
    prevSigByDoc[doc] = sig;
  }
}

const estadoRows = [];
const historicoRows = [];
for (const r of inputRows) {
  const documento = String(pick(r, ['DOCUMENTO', 'Documento / Factura'])).trim();
  if (!documento) continue;

  const razon = String(pick(r, ['RAZON_SOCIAL', 'Razon Social'])).trim();
  const telefono = String(pick(r, ['TELEFONO', 'Telefono'])).trim();
  const fechaV = String(pick(r, ['FECHA_VENCIMIENTO', 'Fecha Vencimiento'])).trim();
  const saldoOriginal = to2(pick(r, ['SALDO_ORIGINAL', 'Saldo Original']));
  const pagoAc = to2(pick(r, ['PAGO_ACUMULADO', 'Pago Acumulado']));
  const saldoPend = to2(pick(r, ['SALDO_PENDIENTE', 'Saldo Pendiente']));
  const fechaAb = String(pick(r, ['FECHA_ULTIMO_ABONO', 'Fecha Ultimo Abono'])).trim();
  const fechaPago = String(pick(r, ['FECHA_PAGO', 'Fecha Pago', 'FECHA_ULTIMO_ABONO', 'Fecha Ultimo Abono'])).trim();
  const statusPago = String(pick(r, ['STATUS_PAGO', 'Estatus Pago']) || (saldoPend <= 0 ? 'Pagado' : (pagoAc > 0 ? 'Abonado' : 'No Pagado'))).trim();
  const fuente = 'reporte_cobros';
  const leadId = String(pick(r, ['LEAD_ID', 'Lead ID'])).trim();

  estadoRows.push([documento, razon, telefono, fechaV, saldoOriginal, pagoAc, saldoPend, fechaAb, fechaPago, statusPago, fuente, leadId]);

  const newSig = [pagoAc, saldoPend, fechaAb, fechaPago, statusPago].join('|');
  const prevSig = String(prevSigByDoc[documento] || '');
  if (newSig !== prevSig) {
    historicoRows.push([nowIso(), documento, razon, telefono, saldoOriginal, pagoAc, saldoPend, fechaAb, fechaPago, statusPago, fuente, leadId]);
  }
}

estadoRows.sort((a,b) => String(a[0]).localeCompare(String(b[0])));
const estadoValues = [headerEstado, ...estadoRows];

if (historicoSheetValues.length === 0) {
  historicoRows.unshift(headerHistorico);
}

return [{ json: {
  estadoValues,
  estadoCount: estadoRows.length,
  historicoValues: historicoRows,
  historicoCount: historicoRows.length,
} }];
