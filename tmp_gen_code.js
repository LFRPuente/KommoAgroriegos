const CFG = {"baseUrl":"https://agroriegoscorp.kommo.com","token":"REPLACE_TOKEN","pipelineId":13403731,"tag":"cobranza_n8n_excel","fieldIds":{"documento":3272952,"telefono":3281414,"fecha_venc_text":3281430,"saldo_pendiente":3272956,"pago_realizado":3281416,"razon_social":3281418,"fecha_abono":3293960,"fecha_pago":0,"status_pago":3281432},"statusPagoEnums":{"pagado":8030168,"abonado":8030170,"no_pagado":8030172}};

function fieldVal(lead, fieldId) {
  if (!fieldId) return '';
  const arr = Array.isArray(lead.custom_fields_values) ? lead.custom_fields_values : [];
  const hit = arr.find((x) => Number(x.field_id) === Number(fieldId));
  if (!hit || !Array.isArray(hit.values) || hit.values.length === 0) return '';
  const v = hit.values[0].value;
  return v === null || v === undefined ? '' : String(v);
}

function fieldEnumId(lead, fieldId) {
  const arr = Array.isArray(lead.custom_fields_values) ? lead.custom_fields_values : [];
  const hit = arr.find((x) => Number(x.field_id) === Number(fieldId));
  if (!hit || !Array.isArray(hit.values) || hit.values.length === 0) return 0;
  return Number(hit.values[0].enum_id || 0);
}

function readStatusPago(lead) {
  const enumId = fieldEnumId(lead, CFG.fieldIds.status_pago);
  if (enumId === CFG.statusPagoEnums.pagado) return 'Pagado';
  if (enumId === CFG.statusPagoEnums.abonado) return 'Abonado';
  if (enumId === CFG.statusPagoEnums.no_pagado) return 'No Pagado';
  return '';
}

function fmtDate(v){
  if (!v) return '';
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return String(v);
  const d = new Date(n * 1000);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function req(method, path) {
  return await this.helpers.httpRequest({
    method,
    url: CFG.baseUrl + path,
    headers: { Authorization: 'Bearer ' + CFG.token },
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  });
}

const leads = [];
for (let page = 1; page <= 100; page++) {
  const res = await req('GET', '/api/v4/leads?limit=250&page=' + page + '&with=custom_fields_values,tags');
  if (res.statusCode >= 400) break;
  const chunk = res.body?._embedded?.leads || [];
  if (!chunk.length) break;
  leads.push(...chunk);
  if (!res.body?._links?.next?.href) break;
}

const rows = [];
for (const lead of leads) {
  const tags = (lead._embedded?.tags || []).map(t => String(t.name || '').toLowerCase().trim());
  if (!tags.includes(CFG.tag.toLowerCase())) continue;
  if (Number(lead.pipeline_id) !== Number(CFG.pipelineId)) continue;

  const pagoAcumulado = Number(fieldVal(lead, CFG.fieldIds.pago_realizado) || 0);
  if (!(pagoAcumulado > 0)) continue;

  const saldoPendiente = Number(fieldVal(lead, CFG.fieldIds.saldo_pendiente) || 0);
  const saldoOriginal = pagoAcumulado + saldoPendiente;
  const fechaAbonoRaw = fieldVal(lead, CFG.fieldIds.fecha_abono);
  const fechaPagoRaw = fieldVal(lead, CFG.fieldIds.fecha_pago) || fechaAbonoRaw;

  rows.push({
    DOCUMENTO: fieldVal(lead, CFG.fieldIds.documento),
    RAZON_SOCIAL: fieldVal(lead, CFG.fieldIds.razon_social),
    TELEFONO: fieldVal(lead, CFG.fieldIds.telefono),
    FECHA_VENCIMIENTO: fieldVal(lead, CFG.fieldIds.fecha_venc_text),
    SALDO_ORIGINAL: saldoOriginal,
    PAGO_ACUMULADO: pagoAcumulado,
    SALDO_PENDIENTE: saldoPendiente,
    FECHA_ULTIMO_ABONO: fmtDate(fechaAbonoRaw),
    FECHA_PAGO: fmtDate(fechaPagoRaw),
    STATUS_PAGO: readStatusPago(lead),
    LEAD_ID: String(lead.id || ''),
  });
}

rows.sort((a, b) => String(a.DOCUMENTO).localeCompare(String(b.DOCUMENTO)));

return rows.map(r => ({ json: r }));
