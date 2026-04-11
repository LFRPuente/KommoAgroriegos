let rawOutput = String($json.output || '').trim();
rawOutput = rawOutput
  .replace(/```json\s*/gi, '')
  .replace(/```\s*/gi, '')
  .replace(/^\s*`+|`+\s*$/g, '')
  .trim();

let parsed = null;
try { parsed = JSON.parse(rawOutput); } catch {}
if (!parsed) {
  const start = rawOutput.indexOf('{');
  const end = rawOutput.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { parsed = JSON.parse(rawOutput.slice(start, end + 1)); } catch {}
  }
}

const base = $('Detectar Cobranza Lead').item.json;
const text = String(base.message_text || '').trim();
const hasAttachment = Boolean(base.is_image || base.cobranza_is_pdf || base.is_document || base.is_media);
const isPaid = Boolean(base.cobranza_is_paid)
  || (base.cobranza_saldo_actual != null && Number(base.cobranza_saldo_actual) <= 0);
const paymentRegex = /(abon|abono|pago|pagado|pague|pagu[e?]|transfer|deposit|comprobante|recibo|spei|folio|adjunt|envi[o?]|mand[o?])/i;
const promiseRegex = /(ahorita|ahora|en un momento|enseguida|lo mando|se lo mando|te lo mando|ya casi|mas tarde|al rato)/i;
const suggestsPayment = paymentRegex.test(text);
const suggestsPromise = promiseRegex.test(text) && !hasAttachment;
const isPlainAcknowledgement = /^(gracias|ok|vale|perfecto|entendido|de acuerdo|listo|ya quedo|si)\b/i.test(text);
const cobranzaContextRegex = /(cobranza|cobro|factura|saldo|pendiente|vencim|deuda|abono|abonar|pago|pagado|pagare|pagar|comprobante|recibo|documento|fecha|vence|vencido|cuenta\s*por\s*cobrar|estado\s*de\s*cuenta|referencia)/i;
const outsideCobranzaRegex = /(informe|informacion|cat[a?]logo|catalogo|producto|productos|precio|precios|cotizaci[o?]n|cotizacion|venta|ventas|asesor|asesoria|soporte|garant[i?]a|fabrica|fabricaci[o?]n|tuber[i?]a|tuberias|manguera|mangueras|conexiones|accesorios|distribuidora)/i;
const mentionsCobranzaContext = cobranzaContextRegex.test(text);
const outsideCobranza = outsideCobranzaRegex.test(text) && !hasAttachment && !suggestsPayment;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

if (!parsed || typeof parsed !== 'object') parsed = {};

const allowedIntents = new Set(['payment_evidence', 'payment_promise', 'question', 'conversation', 'manual_review']);
const intent = allowedIntents.has(String(parsed.intent || '').trim())
  ? String(parsed.intent).trim()
  : (hasAttachment ? 'payment_evidence' : suggestsPromise ? 'payment_promise' : suggestsPayment ? 'manual_review' : 'conversation');

let shouldProcess = hasAttachment;
if (typeof parsed.should_process_payment === 'boolean') {
  shouldProcess = Boolean(parsed.should_process_payment) || hasAttachment;
} else {
  shouldProcess = hasAttachment || (suggestsPayment && !suggestsPromise) || intent === 'payment_evidence';
}

const fallbackReply = hasAttachment
  ? 'Recibimos tu comprobante. Lo estamos validando.'
  : suggestsPromise
    ? 'Gracias. Quedamos atentos a tu comprobante para validar el abono.'
    : 'Recibimos tu mensaje. Si gustas, comparte tu comprobante para validar el pago.';

let shouldReply = typeof parsed.should_reply === 'boolean' ? parsed.should_reply : true;
let replyText = String(parsed.reply_text || fallbackReply).trim() || fallbackReply;
const amountHint = toNumber(parsed.amount_hint ?? parsed.monto);
const confidence = Number.isFinite(Number(parsed.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0;
let needsManualReview = typeof parsed.needs_manual_review === 'boolean'
  ? parsed.needs_manual_review
  : intent === 'manual_review';
let reason = String(parsed.reason || '').trim();

if (isPaid && !hasAttachment) {
  replyText = isPlainAcknowledgement
    ? 'Gracias. Tu pago ya fue registrado y tu saldo se encuentra liquidado.'
    : 'Tu pago ya fue registrado y tu saldo se encuentra liquidado. Si necesitas ayuda adicional, un asesor puede apoyarte.';
  shouldProcess = false;
  needsManualReview = false;
}

if (isPaid && hasAttachment) {
  replyText = 'Recibimos tu comprobante. Tu factura ya aparece liquidada, asi que un asesor revisara el chat manualmente.';
  shouldProcess = true;
  needsManualReview = true;
  reason = reason || 'Lead liquidado con nueva evidencia de pago';
}

if (outsideCobranza) {
  replyText = 'Este canal es solo para cobranzas. Para informes del negocio, por favor comunicate con Alfredo al +58 424-7048245 o con tu asesor de ventas de tu zona.';
  shouldProcess = false;
  shouldReply = true;
  needsManualReview = false;
  reason = reason || 'Consulta fuera de cobranza';
}

if (!hasAttachment && needsManualReview) {
  shouldProcess = false;
  replyText = replyText || 'Recibimos tu mensaje. Un asesor revisara el chat para validar el siguiente paso.';
}

return [{
  json: {
    ...base,
    cobranza_agent_raw_output: rawOutput,
    cobranza_agent_intent: intent,
    cobranza_agent_should_process_payment: Boolean(shouldProcess),
    cobranza_agent_should_reply: Boolean(shouldReply),
    cobranza_agent_reply: replyText,
    cobranza_agent_reply_text: replyText,
    cobranza_agent_amount_hint: amountHint,
    cobranza_agent_confidence: confidence,
    cobranza_agent_needs_manual_review: Boolean(needsManualReview),
    cobranza_agent_reason: reason,
    cobranza_manual_review_required: Boolean(needsManualReview),
    cobranza_manual_review_reason: reason,
    cobranza_reply: !Boolean(shouldProcess) ? replyText : (base.cobranza_reply || ''),
  }
}];
