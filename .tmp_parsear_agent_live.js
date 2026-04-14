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
const isAudio = Boolean(base.is_audio);
const isPaid = Boolean(base.cobranza_is_paid)
  || (base.cobranza_saldo_actual != null && Number(base.cobranza_saldo_actual) <= 0);
const saldoPendiente = !isPaid && base.cobranza_saldo_actual != null && Number(base.cobranza_saldo_actual) > 0;
const paymentRegex = /(abon|abono|pago|pagado|pague|pagu[e?]|transfer|deposit|comprobante|recibo|spei|folio|adjunt|envi[o?]|mand[o?])/i;
const promiseRegex = /(ahorita|ahora|en un momento|enseguida|lo mando|se lo mando|te lo mando|ya casi|mas tarde|al rato)/i;
const suggestsPayment = paymentRegex.test(text);
const suggestsPromise = promiseRegex.test(text) && !hasAttachment;
const isPlainAcknowledgement = /^(gracias|ok|vale|perfecto|entendido|de acuerdo|listo|ya quedo|si|recibido|confirmado|visto|recib\u00ed|enterado|anotado)\b/i.test(text);
const greetingRegex = /^(hola|buenos?\s*d[i\u00ed]as?|buenas?\s*tardes?|buenas?\s*noches?|buenas|saludos|hi|hey)\b/i;
const isGreeting = greetingRegex.test(text) && text.length < 60;
const cobranzaContextRegex = /(cobranza|cobro|factura|saldo|pendiente|vencim|deuda|abono|abonar|pago|pagado|pagare|pagar|comprobante|recibo|documento|fecha|vence|vencido|cuenta\s*por\s*cobrar|estado\s*de\s*cuenta|referencia)/i;
const outsideCobranzaRegex = /(informe|informacion|cat[a?]logo|catalogo|producto|productos|precio|precios|cotizaci[o?]n|cotizacion|venta|ventas|asesor|asesoria|soporte|garant[i?]a|fabrica|fabricaci[o?]n|tuber[i?]a|tuberias|manguera|mangueras|conexiones|accesorios|distribuidora)/i;
const mentionsCobranzaContext = cobranzaContextRegex.test(text);
const outsideCobranza = outsideCobranzaRegex.test(text) && !hasAttachment && !suggestsPayment;

const isSocialOnly = (isGreeting || isPlainAcknowledgement) && !hasAttachment && !suggestsPayment && !mentionsCobranzaContext;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMXN(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

// Audio: no se puede procesar
if (isAudio) {
  replyText = 'Por el momento no podemos procesar mensajes de voz. Por favor escr\u00edbanos su mensaje y con gusto le atendemos.';
  shouldProcess = false;
  needsManualReview = false;
  shouldReply = true;
}

if (isPaid && !hasAttachment && !isAudio) {
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

if (outsideCobranza && !isAudio) {
  replyText = 'Este canal es solo para cobranzas. Para informes del negocio, por favor comunicate con Alfredo al +58 424-7048245 o con tu asesor de ventas de tu zona.';
  shouldProcess = false;
  shouldReply = true;
  needsManualReview = false;
  reason = reason || 'Consulta fuera de cobranza';
}

if (isSocialOnly && !isPaid && !isAudio) {
  const t = text.toLowerCase();
  let saludo;
  if (/tard(e|es)/i.test(t)) saludo = 'Buenas tardes';
  else if (/noch(e|es)/i.test(t)) saludo = 'Buenas noches';
  else if (/d[\u00ed\x69]a/i.test(t)) saludo = 'Buenos d\u00edas';
  else if (isGreeting) saludo = 'Hola';
  else saludo = null;

  if (isGreeting && saldoPendiente) {
    const saldoFmt = formatMXN(base.cobranza_saldo_actual);
    replyText = (saludo || 'Hola') + ', gracias por comunicarse. Le contactamos del Departamento de Cobranza de AGR Agroriegos.' +
      (saldoFmt ? ' Tiene un saldo pendiente de ' + saldoFmt + '.' : '') +
      ' \u00bfDesea que le compartamos su estado de cuenta o tiene alguna consulta al respecto?';
  } else if (isGreeting) {
    replyText = (saludo || 'Hola') + '. Gracias por comunicarse con el Departamento de Administraci\u00f3n y Cobranza de AGR Agroriegos. \u00bfEn qu\u00e9 le podemos ayudar?';
  } else {
    replyText = 'Gracias por confirmar. Quedamos a su disposici\u00f3n para cualquier consulta sobre pagos, estados de cuenta o facturaci\u00f3n.';
  }
  shouldProcess = false;
  needsManualReview = false;
  shouldReply = true;
}

if (!hasAttachment && needsManualReview && !isAudio) {
  shouldProcess = false;
  replyText = replyText || 'Recibimos tu mensaje. Un asesor revisara el chat para validar el siguiente paso.';
}

// Guard rail: never tell customer they have "saldo pendiente $0"
const saldoActualNum = Number(base.cobranza_saldo_actual);
const noSaldoPendiente = !Number.isFinite(saldoActualNum) || saldoActualNum <= 0;
const zeroSaldoPattern = /saldos+pendiente[^\n]*$s*0(?:[.,]0+)?/i;
if (!isAudio && noSaldoPendiente && zeroSaldoPattern.test(String(replyText || ''))) {
  replyText = 'Gracias por comunicarse con el Departamento de Administracion y Cobranza de AGR Agroriegos. ?En que le podemos ayudar?';
  shouldProcess = false;
  needsManualReview = false;
  shouldReply = true;
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
