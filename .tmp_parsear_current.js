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
const attachmentType = String(base.attachment_type || '').toLowerCase();
const isSticker = Boolean((base.is_media && !base.is_image && !base.is_document && !base.is_audio && text.length === 0) || attachmentType.includes('sticker'));
const isPaid = Boolean(base.cobranza_is_paid)
  || (base.cobranza_saldo_actual != null && Number(base.cobranza_saldo_actual) <= 0);
const saldoPendiente = !isPaid && base.cobranza_saldo_actual != null && Number(base.cobranza_saldo_actual) > 0;
const saldoActualNumRaw = Number(base.cobranza_saldo_actual);
const hasSaldoPendiente = Number.isFinite(saldoActualNumRaw) && saldoActualNumRaw > 0;
const wrongRecipientBlocked = Boolean(base.cobranza_wrong_recipient_blocked);
const ackSilenced = Boolean(base.cobranza_ack_silenced);
const wrongRecipientRegex = /(no\s*(es|era)?\s*(mi|nuestro)\s*(saldo|deuda|cuenta|factura)|no\s*soy\s*(el|la)?\s*(titular|cliente|persona)|numero\s*equivocado|numero\s*incorrecto|contact(ar|en)\s*(a|al)\s*otro\s*numero|envi(a|e)n?\s*(el\s*)?mensaje\s*(a|al)\s*otro\s*numero|ese\s*saldo\s*no\s*es\s*mio|no\s*me\s*corresponde\s*(ese|esa)?\s*(saldo|deuda|factura)|esta\s*deuda\s*no\s*es\s*mia)/i;
const isWrongRecipientClaim = !hasAttachment && !isAudio && wrongRecipientRegex.test(text);
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
const isClearlyNonCobranza = !hasAttachment && !isAudio && text.length > 0 && !mentionsCobranzaContext && !suggestsPayment && !suggestsPromise && !isGreeting && !isPlainAcknowledgement;

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
let markWrongRecipientBlock = false;
let markAckSilence = false;

if (isSticker && !isAudio) {
  replyText = 'Gracias por su mensaje.';
  shouldProcess = false;
  needsManualReview = false;
  shouldReply = true;
  reason = reason || 'sticker';
}

if (wrongRecipientBlocked) {
  shouldReply = false;
  shouldProcess = false;
  needsManualReview = false;
  replyText = '';
  reason = reason || 'wrong_recipient_silenced';
}

if (!wrongRecipientBlocked && hasSaldoPendiente && isWrongRecipientClaim) {
  replyText = 'Gracias por avisarnos. Entendido: este numero no corresponde al titular del saldo. Detendremos mensajes automaticos de cobranza para este contacto.';
  shouldProcess = false;
  needsManualReview = false;
  shouldReply = true;
  markWrongRecipientBlock = true;
  reason = 'wrong_recipient_once';
}

if (ackSilenced && !hasAttachment && !isAudio && !suggestsPayment && !suggestsPromise && !mentionsCobranzaContext) {
  shouldReply = false;
  shouldProcess = false;
  needsManualReview = false;
  replyText = '';
  reason = reason || 'ack_silenced';
}

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

if ((outsideCobranza || isClearlyNonCobranza) && !isAudio && !isSticker) {
  replyText = 'Este canal es solo para cobranzas. Para informes del negocio, por favor comuniquese con el Departamento de Ventas al +58 424-7048245 o con su asesor de ventas de su zona.';
  shouldProcess = false;
  shouldReply = true;
  needsManualReview = false;
  reason = reason || 'Consulta fuera de cobranza';
}

// If customer only acknowledges (gracias/ok/listo), close once and then silence future non-payment replies
if (!ackSilenced && isPlainAcknowledgement && !hasAttachment && !isAudio && hasSaldoPendiente) {
  shouldReply = true;
  shouldProcess = false;
  needsManualReview = false;
  replyText = 'Gracias. Seguimos pendientes de su comprobante de pago.';
  markAckSilence = true;
  reason = reason || "ack_close_once";
}

if (isSocialOnly && !isPaid && !isAudio) {
  const t = text.toLowerCase();
  let saludo;
  if (/tard(e|es)/i.test(t)) saludo = 'Buenas tardes';
  else if (/noch(e|es)/i.test(t)) saludo = 'Buenas noches';
  else if (/d[\u00ed\x69]a/i.test(t)) saludo = 'Buenos d\u00edas';
  else if (isGreeting) saludo = 'Hola';
  else saludo = null;

  if (isGreeting) {
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
const zeroSaldoPattern = /saldo\s+pendiente[^\n]*\$\s*0(?:[.,]0+)?/i;
if (!isAudio && noSaldoPendiente && zeroSaldoPattern.test(String(replyText || ''))) {
  replyText = 'Gracias por comunicarse con el Departamento de Administracion y Cobranza de AGR Agroriegos. ?En que le podemos ayudar?';
  shouldProcess = false;
  needsManualReview = false;
  shouldReply = true;
}

// Global gate: do not reply to contacts without pending saldo (empty or <= 0)
if (!hasSaldoPendiente) {
  shouldReply = false;
  shouldProcess = false;
  needsManualReview = false;
  replyText = '';
  reason = reason || "sin_saldo_no_reply";
}

// Final hard gate for contacts already marked as wrong recipient
if (wrongRecipientBlocked) {
  shouldReply = false;
  shouldProcess = false;
  needsManualReview = false;
  replyText = '';
  reason = reason || "wrong_recipient_silenced";
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
    cobranza_mark_wrong_recipient_block: Boolean(markWrongRecipientBlock),
    cobranza_mark_ack_silence: Boolean(markAckSilence),
    cobranza_manual_review_required: Boolean(needsManualReview),
    cobranza_manual_review_reason: reason,
    cobranza_reply: !Boolean(shouldProcess) ? replyText : (base.cobranza_reply || ''),
  }
}];
