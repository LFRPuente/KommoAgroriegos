const CFG = {"baseUrl": "https://agroriegoscorp.kommo.com", "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjEyNjBhODkxNjZlMWZiNTI1MGVkZTFlNzVhY2ZhYjY3NWUxMjIyYzBmNjhlZjk5YTkxODhlNzRlODJiODVjYmYxMTY1ZTcwMDBiYmQ3NzliIn0.eyJhdWQiOiJkNGZjYmE0MS03NTM1LTQzOWYtOTk5Yy00YjZlNzA3NGUzMzIiLCJqdGkiOiIxMjYwYTg5MTY2ZTFmYjUyNTBlZGUxZTc1YWNmYWI2NzVlMTIyMmMwZjY4ZWY5OWE5MTg4ZTc0ZTgyYjg1Y2JmMTE2NWU3MDAwYmJkNzc5YiIsImlhdCI6MTc3NDM5MDcwOSwibmJmIjoxNzc0MzkwNzA5LCJleHAiOjE5MDY0MTYwMDAsInN1YiI6IjE1MDA0MDE5IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM2MjQ4Nzg3LCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiZTkwNTZiMDUtMjUzNi00NWM4LTkyYjgtNmM1ZjhkNmZhODc0IiwiYXBpX2RvbWFpbiI6ImFwaS1jLmtvbW1vLmNvbSJ9.TRv4MRF9eVCbNJW-zjYzX4BTOUQ7p2AuM7DZx97UQyYdL81itbaILIro2nhS1rxqHXa-k3FUUtL48qK3FnZi3O9uz0jJuDeeqH2RdKNkCviTO7t5ggnVqePntPFxS5BXmlVxDpRTgHHvywJYgWBnxx92D7YJzVsubScTUbT5AY-6qPKr9hMfpQnaK6BeEZUQIFIW_vUeo5TSKN9Ngc9bpCXtWEiA9OjMVapLJXM0aw1IvyrIkr38fod26Ef9dxGrm9hyrVNS3amGNcpG9IrMEyo3d_ZcG5HQAnQ1bw2_avXhEFY0QcD0r5UmL_9uqx_pvHCCxLbVJxwDfnTO3IZDZA", "salesbotId": 38308, "wrongRecipientTag": "cobranza_no_contactar_titular_incorrecto", "ackSilenceTag": "cobranza_silencio_post_ack", "fieldIds": {"respuesta_ia": 3281424}};
const row = $json;
if (row.cobranza_agent_should_reply === false) return { json: { ...row, cobranza_send_status: "skipped_no_reply_needed" } };
const leadId = Number(row.lead_id || 0);
if (!leadId) return { json: { ...row, cobranza_send_status: "skipped_no_lead" } };
const content = String(row.cobranza_reply || row.cobranza_agent_reply_text || "Recibimos tu comprobante.").trim() || "Recibimos tu comprobante.";

async function req(method, path, body) {
  return await this.helpers.httpRequest({
    method,
    url: CFG.baseUrl + path,
    headers: {
      Authorization: "Bearer " + CFG.token,
      "Content-Type": "application/json",
    },
    body,
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  });
}

async function createManualReviewArtifacts(leadId, responsibleUserId, reason, row) {
  const noteText = [
    "Cobranza requiere revision manual desde ruta conversacional.",
    "Motivo: " + String(reason || "sin motivo"),
    "Documento: " + String(row.cobranza_documento || ""),
    "Mensaje cliente: " + String(row.message_text || ""),
    "Intent: " + String(row.cobranza_agent_intent || ""),
    "Confidence: " + String(row.cobranza_agent_confidence || ""),
  ].join(" | ");
  await req("POST", "/api/v4/leads/" + leadId + "/notes", [{ note_type: "common", params: { text: noteText } }]);
  await req("POST", "/api/v4/tasks", [{
    text: "Revisar manualmente chat de cobranza en lead " + leadId + ". Motivo: " + String(reason || "sin motivo"),
    complete_till: Math.floor(Date.now() / 1000) + 86400,
    entity_id: Number(leadId),
    entity_type: "leads",
    responsible_user_id: Number(responsibleUserId || 14811623),
  }]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compact(value, limit) {
  try {
    const s = JSON.stringify(value || {});
    return s.length > limit ? s.slice(0, limit) + "...(trunc)" : s;
  } catch (e) {
    const s = String(value || "");
    return s.length > limit ? s.slice(0, limit) + "...(trunc)" : s;
  }
}

async function latestOutgoingMarker(leadId) {
  const evRes = await req(
    "GET",
    "/api/v4/events?limit=20&filter[entity]=leads&filter[entity_id]=" +
      Number(leadId) +
      "&filter[type][]=outgoing_chat_message"
  );
  if (evRes.statusCode >= 400) {
    return { marker: "", http: Number(evRes.statusCode || 0), createdAt: 0 };
  }
  const ev = ((((evRes.body || {})._embedded || {}).events || [])[0] || {});
  return {
    marker: String(ev.id || ""),
    http: Number(evRes.statusCode || 0),
    createdAt: Number(ev.created_at || 0),
  };
}

const before = await latestOutgoingMarker(leadId);

// Anti-duplicacion: si se envio un mensaje en los ultimos 5s, no enviar de nuevo
const nowTs = Math.floor(Date.now() / 1000);
if (before.marker && before.createdAt > 0 && (nowTs - before.createdAt) < 5) {
  return {
    json: {
      ...row,
      cobranza_send_status: 'skipped_dedup',
      cobranza_reply_sent: content,
      cobranza_dedup_seconds_since_last: nowTs - before.createdAt,
    },
  };
}

if (row.cobranza_manual_review_required && !row.cobranza_agent_should_process_payment) {
  await createManualReviewArtifacts(
    leadId,
    row.cobranza_responsible_user_id,
    row.cobranza_manual_review_reason || row.cobranza_agent_reason,
    row
  );
}
const fieldRes = await req("PATCH", "/api/v4/leads", [{
  id: leadId,
  custom_fields_values: [{
    field_id: Number(CFG.fieldIds.respuesta_ia),
    values: [{ value: content }],
  }],
}]);
let sendRes = { statusCode: 0, body: { skipped: true } };
let after = before;
if (fieldRes.statusCode < 400) {
  await sleep(600);
  sendRes = await req("POST", "/api/v2/salesbot/run", [{
    bot_id: Number(CFG.salesbotId),
    entity_id: leadId,
    entity_type: 2,
  }]);
  if (sendRes.statusCode < 400) {
    for (let i = 0; i < 5; i += 1) {
      await sleep(1200);
      after = await latestOutgoingMarker(leadId);
      if (String(after.marker || "") && String(after.marker || "") !== String(before.marker || "")) break;
    }
  }
}
const fieldBody = compact(fieldRes.body, 600);
const bodyTxt = compact(sendRes.body, 600);
const delivered = String(after.marker || "") !== String(before.marker || "") && String(after.marker || "") !== "";
const ok = fieldRes.statusCode < 400 && sendRes.statusCode < 400 && delivered;
const status = ok
  ? "sent"
  : fieldRes.statusCode >= 400
    ? "failed_reply_field_update"
    : sendRes.statusCode >= 400
      ? "failed_salesbot_run"
      : "failed_no_outgoing_chat";

let wrongRecipientTagHttp = 0;
let wrongRecipientTagBody = "";
if (ok && row.cobranza_mark_wrong_recipient_block === true) {
  const tagRes = await req("PATCH", "/api/v4/leads", [{
    id: leadId,
    _embedded: {
      tags: [{ name: String(CFG.wrongRecipientTag) }],
    },
  }]);
  wrongRecipientTagHttp = Number(tagRes.statusCode || 0);
  wrongRecipientTagBody = compact(tagRes.body, 400);
}

let ackSilenceTagHttp = 0;
let ackSilenceTagBody = "";
if (ok && row.cobranza_mark_ack_silence === true) {
  const tagRes = await req("PATCH", "/api/v4/leads", [{
    id: leadId,
    _embedded: {
      tags: [{ name: String(CFG.ackSilenceTag) }],
    },
  }]);
  ackSilenceTagHttp = Number(tagRes.statusCode || 0);
  ackSilenceTagBody = compact(tagRes.body, 400);
}

return {
  json: {
    ...row,
    cobranza_send_status: status,
    cobranza_reply_field_http: Number(fieldRes.statusCode || 0),
    cobranza_reply_field_body: fieldBody,
    cobranza_send_http: Number(sendRes.statusCode || 0),
    cobranza_send_body: bodyTxt,
    cobranza_send_mode: "lead_field_plus_salesbot_run",
    cobranza_reply_field_id: Number(CFG.fieldIds.respuesta_ia),
    cobranza_salesbot_id: Number(CFG.salesbotId),
    cobranza_outgoing_before: before.marker || "",
    cobranza_outgoing_after: after.marker || "",
    cobranza_reply_sent: content,
    cobranza_wrong_recipient_tag_http: wrongRecipientTagHttp,
    cobranza_wrong_recipient_tag_body: wrongRecipientTagBody,
    cobranza_ack_silence_tag_http: ackSilenceTagHttp,
    cobranza_ack_silence_tag_body: ackSilenceTagBody,
  },
};
