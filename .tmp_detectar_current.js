const CFG = {"baseUrl": "https://agroriegoscorp.kommo.com", "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjEyNjBhODkxNjZlMWZiNTI1MGVkZTFlNzVhY2ZhYjY3NWUxMjIyYzBmNjhlZjk5YTkxODhlNzRlODJiODVjYmYxMTY1ZTcwMDBiYmQ3NzliIn0.eyJhdWQiOiJkNGZjYmE0MS03NTM1LTQzOWYtOTk5Yy00YjZlNzA3NGUzMzIiLCJqdGkiOiIxMjYwYTg5MTY2ZTFmYjUyNTBlZGUxZTc1YWNmYWI2NzVlMTIyMmMwZjY4ZWY5OWE5MTg4ZTc0ZTgyYjg1Y2JmMTE2NWU3MDAwYmJkNzc5YiIsImlhdCI6MTc3NDM5MDcwOSwibmJmIjoxNzc0MzkwNzA5LCJleHAiOjE5MDY0MTYwMDAsInN1YiI6IjE1MDA0MDE5IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM2MjQ4Nzg3LCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiZTkwNTZiMDUtMjUzNi00NWM4LTkyYjgtNmM1ZjhkNmZhODc0IiwiYXBpX2RvbWFpbiI6ImFwaS1jLmtvbW1vLmNvbSJ9.TRv4MRF9eVCbNJW-zjYzX4BTOUQ7p2AuM7DZx97UQyYdL81itbaILIro2nhS1rxqHXa-k3FUUtL48qK3FnZi3O9uz0jJuDeeqH2RdKNkCviTO7t5ggnVqePntPFxS5BXmlVxDpRTgHHvywJYgWBnxx92D7YJzVsubScTUbT5AY-6qPKr9hMfpQnaK6BeEZUQIFIW_vUeo5TSKN9Ngc9bpCXtWEiA9OjMVapLJXM0aw1IvyrIkr38fod26Ef9dxGrm9hyrVNS3amGNcpG9IrMEyo3d_ZcG5HQAnQ1bw2_avXhEFY0QcD0r5UmL_9uqx_pvHCCxLbVJxwDfnTO3IZDZA", "tag": "cobranza_n8n_excel", "pauseBotTag": "cobranza_bot_pausado", "wrongRecipientTag": "cobranza_numero_incorrecto_lead", "wrongRecipientLegacyTag": "cobranza_no_contactar_titular_incorrecto", "ackSilenceTag": "cobranza_silencio_post_ack", "fieldIds": {"documento": 3272952, "telefono": 3281414, "fecha_venc_text": 3281430, "saldo_pendiente": 3272956, "pago_realizado": 3281416, "razon_social": 3281418, "fecha_venc_date": 3272954, "aviso_3d": 3282254, "aviso_2d": 3282256, "aviso_1d": 3282258, "ultimo_hash": 3281420, "ultimo_abono": 3281422}, "timezone": "America/Mexico_City", "statusIds": {"recordatorio_enviado": 103388971}, "paidStatusId": 103429439};

function normalizePhone(v) {
  const digits = String(v || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return "521" + digits;
  if (digits.length === 12 && digits.startsWith("52")) return "521" + digits.slice(2);
  if (digits.length === 13 && digits.startsWith("521")) return digits;
  return digits;
}

function getFieldValue(lead, fieldId) {
  const arr = Array.isArray(lead.custom_fields_values) ? lead.custom_fields_values : [];
  const hit = arr.find((x) => Number(x.field_id) === Number(fieldId));
  if (!hit || !Array.isArray(hit.values) || hit.values.length === 0) return "";
  const val = hit.values[0].value;
  return val === null || val === undefined ? "" : String(val);
}

function parseAnyDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [mm, dd, yyyy] = raw.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const ms = n < 100000000000 ? n * 1000 : n;
      const dNum = new Date(ms);
      if (!Number.isNaN(dNum.getTime())) return dNum.toISOString().slice(0, 10);
    }
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function todayIso(timezoneName) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneName,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

async function req(path) {
  return await this.helpers.httpRequest({
    method: "GET",
    url: CFG.baseUrl + path,
    headers: {
      Authorization: "Bearer " + CFG.token,
      "Content-Type": "application/json",
    },
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  });
}

const item = $json;
const leadId = Number(item.lead_id || 0);
if (!leadId) return { json: { ...item, is_cobranza_lead: false, should_process_cobranza_receipt: false } };

const leadRes = await req("/api/v4/leads/" + leadId + "?with=custom_fields_values,tags");
if (leadRes.statusCode >= 400) {
  return { json: { ...item, is_cobranza_lead: false, should_process_cobranza_receipt: false, cobranza_detect_error: "lead_fetch_failed" } };
}

const lead = leadRes.body || {};
const tags = ((((lead._embedded || {}).tags) || [])).map((t) => String(t.name || "").toLowerCase().trim());
const hasTag = tags.includes(String(CFG.tag).toLowerCase());
const botPaused = tags.includes(String(CFG.pauseBotTag || "").toLowerCase());
const wrongRecipientBlocked = tags.includes(String(CFG.wrongRecipientTag || "").toLowerCase())
  || tags.includes(String(CFG.wrongRecipientLegacyTag || "").toLowerCase());
const ackSilenced = tags.includes(String(CFG.ackSilenceTag || "").toLowerCase());
const doc = getFieldValue(lead, CFG.fieldIds.documento);
const isCobranza = hasTag || Boolean(String(doc).trim());

const aviso3 = getFieldValue(lead, CFG.fieldIds.aviso_3d);
const vencDate = parseAnyDate(getFieldValue(lead, CFG.fieldIds.fecha_venc_date) || getFieldValue(lead, CFG.fieldIds.fecha_venc_text));
const today = todayIso(CFG.timezone);
const duePassed = Boolean(vencDate && today > vencDate);
const currentStageAllowsAutomation = Number(lead.status_id || 0) === Number(((CFG.statusIds || {}).recordatorio_enviado || 0));
const withinWindow = Boolean(isCobranza && (Boolean(aviso3) || currentStageAllowsAutomation || duePassed || !vencDate));

const attachment = String(item.attachment_type || "").toLowerCase();
const fileName = String(item.media_filename || "").toLowerCase();
const isPdf = attachment === "document" || attachment === "file" || fileName.endsWith(".pdf");
const hasText = Boolean(String(item.message_text || "").trim());
const saldoPendienteRaw = getFieldValue(lead, CFG.fieldIds.saldo_pendiente);
const saldoActual = saldoPendienteRaw !== "" ? Number(Number(saldoPendienteRaw).toFixed(2)) : null;
const pagoActual = Number(getFieldValue(lead, CFG.fieldIds.pago_realizado) || 0);
const ultimoAbono = Number(getFieldValue(lead, CFG.fieldIds.ultimo_abono) || 0);
const statusId = Number(lead.status_id || 0);
const isPaid = statusId === Number(CFG.paidStatusId || 0)
  || (saldoActual !== null && saldoActual <= 0);
const paymentSignalRegex = /(abon|abono|pago|pagado|pague|transfer|deposit|comprobante|recibo|folio|adjunt|envi[o?]|mand[o?])/i;
const hasPaymentSignal = paymentSignalRegex.test(String(item.message_text || ""));
const shouldProcess = Boolean(isCobranza && withinWindow && (item.is_image || isPdf || hasText));

return {
  json: {
    ...item,
    is_cobranza_lead: isCobranza,
    cobranza_has_tag: hasTag,
    cobranza_bot_paused: botPaused,
    cobranza_wrong_recipient_blocked: wrongRecipientBlocked,
    cobranza_ack_silenced: ackSilenced,
    cobranza_documento: doc,
    cobranza_within_window: withinWindow,
    cobranza_due_iso: vencDate || "",
    cobranza_today_iso: today,
    cobranza_due_passed: duePassed,
    cobranza_aviso_3d_sent: Boolean(aviso3 || currentStageAllowsAutomation),
    cobranza_status_id: statusId,
    cobranza_is_paid: isPaid,
    cobranza_saldo_actual: saldoActual,
    cobranza_pago_actual: pagoActual,
    cobranza_original_total: saldoActual !== null ? Number((saldoActual + pagoActual).toFixed(2)) : null,
    cobranza_last_hash: getFieldValue(lead, CFG.fieldIds.ultimo_hash),
    cobranza_last_abono: ultimoAbono,
    cobranza_has_payment_signal: hasPaymentSignal,
    cobranza_responsible_user_id: Number(lead.responsible_user_id || 14811623),
    cobranza_is_pdf: isPdf,
    should_process_cobranza_receipt: shouldProcess,
  },
};

