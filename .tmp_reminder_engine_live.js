const CFG = {"baseUrl": "https://agroriegoscorp.kommo.com", "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjEyNjBhODkxNjZlMWZiNTI1MGVkZTFlNzVhY2ZhYjY3NWUxMjIyYzBmNjhlZjk5YTkxODhlNzRlODJiODVjYmYxMTY1ZTcwMDBiYmQ3NzliIn0.eyJhdWQiOiJkNGZjYmE0MS03NTM1LTQzOWYtOTk5Yy00YjZlNzA3NGUzMzIiLCJqdGkiOiIxMjYwYTg5MTY2ZTFmYjUyNTBlZGUxZTc1YWNmYWI2NzVlMTIyMmMwZjY4ZWY5OWE5MTg4ZTc0ZTgyYjg1Y2JmMTE2NWU3MDAwYmJkNzc5YiIsImlhdCI6MTc3NDM5MDcwOSwibmJmIjoxNzc0MzkwNzA5LCJleHAiOjE5MDY0MTYwMDAsInN1YiI6IjE1MDA0MDE5IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM2MjQ4Nzg3LCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiZTkwNTZiMDUtMjUzNi00NWM4LTkyYjgtNmM1ZjhkNmZhODc0IiwiYXBpX2RvbWFpbiI6ImFwaS1jLmtvbW1vLmNvbSJ9.TRv4MRF9eVCbNJW-zjYzX4BTOUQ7p2AuM7DZx97UQyYdL81itbaILIro2nhS1rxqHXa-k3FUUtL48qK3FnZi3O9uz0jJuDeeqH2RdKNkCviTO7t5ggnVqePntPFxS5BXmlVxDpRTgHHvywJYgWBnxx92D7YJzVsubScTUbT5AY-6qPKr9hMfpQnaK6BeEZUQIFIW_vUeo5TSKN9Ngc9bpCXtWEiA9OjMVapLJXM0aw1IvyrIkr38fod26Ef9dxGrm9hyrVNS3amGNcpG9IrMEyo3d_ZcG5HQAnQ1bw2_avXhEFY0QcD0r5UmL_9uqx_pvHCCxLbVJxwDfnTO3IZDZA", "pipelineId": 13403731, "paidStatusId": 103429439, "statusIds": {"leads_entrantes": 103388963, "leads_importados": 103388967, "entrada_inicial": 103388967, "recordatorio_enviado": 103388971, "pagado": 103429439, "abono": 103610175, "no_pagado": 103611443, "fecha_limite": 103388975, "deadline_abono": 103610171, "atrasado": 103388979, "atrasado_10": 104161951, "atrasado_15": 104161955, "revisar_pago": 103429435, "revision_urgente": 103429431}, "tag": "cobranza_n8n_excel", "timezone": "America/Mexico_City", "fieldIds": {"documento": 3272952, "telefono": 3281414, "fecha_venc_text": 3281430, "saldo_pendiente": 3272956, "pago_realizado": 3281416, "razon_social": 3281418, "fecha_venc_date": 3272954, "aviso_3d": 3282254, "aviso_2d": 3282256, "aviso_1d": 3282258, "ultimo_hash": 3281420, "ultimo_abono": 3281422, "status_pago": 3281432}, "statusPagoEnums": {"pagado": 8030168, "abonado": 8030170, "no_pagado": 8030172}};

function fieldVal(lead, fieldId) {
  const arr = Array.isArray(lead.custom_fields_values) ? lead.custom_fields_values : [];
  const hit = arr.find((x) => Number(x.field_id) === Number(fieldId));
  if (!hit || !Array.isArray(hit.values) || hit.values.length === 0) return "";
  const v = hit.values[0].value;
  return v === null || v === undefined ? "" : String(v);
}

function fieldEnumId(lead, fieldId) {
  const arr = Array.isArray(lead.custom_fields_values) ? lead.custom_fields_values : [];
  const hit = arr.find((x) => Number(x.field_id) === Number(fieldId));
  if (!hit || !Array.isArray(hit.values) || hit.values.length === 0) return 0;
  return Number(hit.values[0].enum_id || 0);
}

function normalizePhone(v) {
  const digits = String(v || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return "521" + digits;
  if (digits.length === 12 && digits.startsWith("52")) return "521" + digits.slice(2);
  if (digits.length === 13 && digits.startsWith("521")) return digits;
  return digits;
}

function normalizeText(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseDateAny(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [mm, dd, yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const ms = n < 100000000000 ? n * 1000 : n;
      const dNum = new Date(ms);
      if (!Number.isNaN(dNum.getTime())) return dNum.toISOString().slice(0, 10);
    }
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function todayIso(tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function kommoNowIso() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}:${s}+00:00`;
}

function daysBetween(aIso, bIso) {
  const a = new Date(aIso + "T00:00:00Z");
  const b = new Date(bIso + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

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

async function note(leadId, text) {
  await req("POST", "/api/v4/leads/" + leadId + "/notes", [{ note_type: "common", params: { text } }]);
}

async function task(leadId, responsibleId, text) {
  const complete = Math.floor(Date.now() / 1000) + 86400;
  await req("POST", "/api/v4/tasks", [{
    text,
    complete_till: complete,
    entity_id: Number(leadId),
    entity_type: "leads",
    responsible_user_id: Number(responsibleId || 14811623),
  }]);
}

const logs = [];
const today = todayIso(CFG.timezone);
const deadlineStatusId = Number((CFG.statusIds || {}).fecha_limite || 0);
const deadlineAbonoStatusId = Number((CFG.statusIds || {}).deadline_abono || 0);
const overdueStatusId = Number((CFG.statusIds || {}).atrasado || 0);
const late10StatusId = Number((CFG.statusIds || {}).atrasado_10 || 0);
const late15StatusId = Number((CFG.statusIds || {}).atrasado_15 || 0);
const urgentStatusId = Number((CFG.statusIds || {}).revision_urgente || 0);
const reminderSentStatusId = Number((CFG.statusIds || {}).recordatorio_enviado || 0);
const reviewStatusId = Number((CFG.statusIds || {}).revisar_pago || 0);
const abonoStatusId = Number((CFG.statusIds || {}).abono || 0);
const noPagadoStatusId = Number((CFG.statusIds || {}).no_pagado || 0);
const leadsImportadosStatusId = Number((CFG.statusIds || {}).leads_importados || 0);
const baseStatusId = Number((CFG.statusIds || {}).entrada_inicial || leadsImportadosStatusId || 0);
const statusPagoFieldId = Number((CFG.fieldIds || {}).status_pago || 0);
const inputRows = $input.all().map((x) => x.json || {});
const uploadDocs = new Set(
  inputRows
    .map((r) => String(r.DOCUMENTO || "").trim())
    .filter((v) => v.length > 0)
);
const uploadMode = uploadDocs.size > 0;

async function moveStatus(leadId, statusId) {
  if (!(Number(statusId) > 0)) return { ok: true, skipped: true, statusCode: 0 };
  const mv = await req("PATCH", "/api/v4/leads", [{ id: Number(leadId), status_id: Number(statusId) }]);
  return { ok: mv.statusCode < 400, skipped: false, statusCode: Number(mv.statusCode || 0), body: mv.body || {} };
}

async function markReminder(leadId, fieldId) {
  const nowIso = kommoNowIso();
  const res = await req("PATCH", "/api/v4/leads", [{
    id: Number(leadId),
    custom_fields_values: [{ field_id: fieldId, values: [{ value: nowIso }] }],
  }]);
  return { ok: res.statusCode < 400, statusCode: Number(res.statusCode || 0), body: res.body || {} };
}


function resolveLateStage(daysToDue, currentStatusId) {
  if (daysToDue <= -15 && late15StatusId > 0) return { stage: late15StatusId, label: "15D" };
  if (daysToDue <= -10 && late10StatusId > 0) return { stage: late10StatusId, label: "10D" };
  if (daysToDue <= -5 && overdueStatusId > 0) return { stage: overdueStatusId, label: "5D" };
  if (daysToDue <= -6 && urgentStatusId > 0) return { stage: urgentStatusId, label: "URGENT" };
  return { stage: currentStatusId, label: "" };
}

const leads = [];
for (let page = 1; page <= 100; page += 1) {
  const listRes = await req("GET", "/api/v4/leads?limit=250&page=" + page + "&with=custom_fields_values,tags");
  if (listRes.statusCode >= 400) {
    throw new Error("Lead list failed: " + listRes.statusCode + " " + JSON.stringify(listRes.body || {}));
  }
  const chunk = ((((listRes.body || {})._embedded || {}).leads) || []);
  if (!chunk.length) break;
  leads.push(...chunk);
  const hasNext = Boolean((((listRes.body || {})._links || {}).next || {}).href);
  if (!hasNext) break;
}

function readStatusPago(lead) {
  if (!(statusPagoFieldId > 0)) return "";
  const enumId = fieldEnumId(lead, statusPagoFieldId);
  if (enumId && enumId === Number((CFG.statusPagoEnums || {}).pagado || 0)) return "pagado";
  if (enumId && enumId === Number((CFG.statusPagoEnums || {}).abonado || 0)) return "abonado";
  if (enumId && enumId === Number((CFG.statusPagoEnums || {}).no_pagado || 0)) return "no_pagado";
  const raw = normalizeText(fieldVal(lead, statusPagoFieldId));
  if (!raw) return "";
  if (raw.includes("no pagado")) return "no_pagado";
  if (raw.includes("abonado")) return "abonado";
  if (raw.includes("pagado")) return "pagado";
  return "";
}

const canonicalLeads = new Map();
for (const lead of leads) {
  const tags = ((((lead._embedded || {}).tags) || [])).map((t) => String(t.name || "").toLowerCase().trim());
  if (!tags.includes(String(CFG.tag).toLowerCase())) continue;
  if (Number(lead.pipeline_id) !== Number(CFG.pipelineId)) continue;
  if (Number(lead.status_id) === Number(CFG.paidStatusId)) continue;

  const keyDocumento = String(fieldVal(lead, CFG.fieldIds.documento) || "").trim();
  const keyTelefono = normalizePhone(fieldVal(lead, CFG.fieldIds.telefono));
  const dedupeKey = keyDocumento && keyTelefono ? keyDocumento + "|" + keyTelefono : "lead:" + String(lead.id || "");
  const prev = canonicalLeads.get(dedupeKey);
  const rank = Number(lead.updated_at || lead.created_at || lead.id || 0);
  const prevRank = prev ? Number(prev.updated_at || prev.created_at || prev.id || 0) : -1;
  if (!prev || rank >= prevRank) {
    canonicalLeads.set(dedupeKey, lead);
  }
}

for (const lead of canonicalLeads.values()) {
  const documento = fieldVal(lead, CFG.fieldIds.documento);
  if (uploadMode && !uploadDocs.has(String(documento || "").trim())) continue;
  const saldo = Number(fieldVal(lead, CFG.fieldIds.saldo_pendiente) || 0);
  if (!(saldo > 0)) continue;

  const dueIso = parseDateAny(fieldVal(lead, CFG.fieldIds.fecha_venc_date) || fieldVal(lead, CFG.fieldIds.fecha_venc_text));
  if (!dueIso) continue;
  const d = daysBetween(today, dueIso);

  const firstSent = fieldVal(lead, CFG.fieldIds.aviso_3d);
  const dueSent = fieldVal(lead, CFG.fieldIds.aviso_2d);
  const finalSent = fieldVal(lead, CFG.fieldIds.aviso_1d);
  const currentStatusId = Number(lead.status_id || 0);
  const isInBaseStage = Number(baseStatusId) > 0 && currentStatusId === Number(baseStatusId);
  const isInReviewStatus = Number(reviewStatusId) > 0 && currentStatusId === Number(reviewStatusId);
  const isInAbonoStage = abonoStatusId > 0 && currentStatusId === abonoStatusId;
  const isInNoPagadoStage = noPagadoStatusId > 0 && currentStatusId === noPagadoStatusId;
  const statusPagoDecision = isInReviewStatus ? readStatusPago(lead) : "";

  let reminderType = "";
  let stageTarget = currentStatusId;
  let reminderFieldId = 0;

  if (statusPagoDecision === "pagado") {
    reminderType = "REVIEW_PAID";
    stageTarget = Number(CFG.paidStatusId || currentStatusId);
  } else if (statusPagoDecision === "abonado") {
    // Lead en revisar_pago con estatus abonado ? mover a etapa abono
    reminderType = "REVIEW_TO_ABONO";
    stageTarget = abonoStatusId > 0 ? abonoStatusId : currentStatusId;
  } else if (statusPagoDecision === "no_pagado") {
    // Lead en revisar_pago con estatus no pagado ? mover a etapa no pagado
    reminderType = "REVIEW_TO_NOPAGADO";
    stageTarget = noPagadoStatusId > 0 ? noPagadoStatusId : currentStatusId;
  } else if (isInReviewStatus) {
    // En revisar_pago pero sin decision ? esperar
    continue;
  } else if (isInAbonoStage) {
    // Lead en ABONO ? mover a deadline-abono o 5 dias atrasado segun fecha
    if (d <= 0 && d > -5) {
      reminderType = "ABONO_DEADLINE";
      stageTarget = deadlineAbonoStatusId > 0 ? deadlineAbonoStatusId : currentStatusId;
      reminderFieldId = !dueSent ? Number(CFG.fieldIds.aviso_2d || 0) : 0;
    } else if (d <= -5) {
      const late = resolveLateStage(d, currentStatusId);
      reminderType = late.label === "15D" ? "ABONO_LATE_15D" : (late.label === "10D" ? "ABONO_LATE_10D" : (late.label === "5D" ? "ABONO_LATE_5D" : "ABONO_URGENT"));
      stageTarget = late.stage;
      reminderFieldId = (!finalSent && late.label === "5D") ? Number(CFG.fieldIds.aviso_1d || 0) : 0;
    } else {
      continue; // Aun tiene tiempo, no hacer nada
    }
  } else if (isInNoPagadoStage) {
    // Lead en NO PAGADO ? mover a deadline o 5 dias atrasado segun fecha
    if (d <= 0 && d > -5) {
      reminderType = "NOPAGADO_DEADLINE";
      stageTarget = deadlineStatusId > 0 ? deadlineStatusId : currentStatusId;
      reminderFieldId = !dueSent ? Number(CFG.fieldIds.aviso_2d || 0) : 0;
    } else if (d <= -5) {
      const late = resolveLateStage(d, currentStatusId);
      reminderType = late.label === "15D" ? "NOPAGADO_LATE_15D" : (late.label === "10D" ? "NOPAGADO_LATE_10D" : (late.label === "5D" ? "NOPAGADO_LATE_5D" : "NOPAGADO_URGENT"));
      stageTarget = late.stage;
      reminderFieldId = (!finalSent && late.label === "5D") ? Number(CFG.fieldIds.aviso_1d || 0) : 0;
    } else {
      continue;
    }
  } else if (d === 5 && (!firstSent || isInBaseStage)) {
    reminderType = "5D";
    stageTarget = reminderSentStatusId > 0 ? reminderSentStatusId : currentStatusId;
    reminderFieldId = firstSent ? 0 : Number(CFG.fieldIds.aviso_3d || 0);
  } else if (d <= 0 && d > -5 && (!dueSent || isInBaseStage)) {
    reminderType = "DUE";
    stageTarget = deadlineStatusId > 0 ? deadlineStatusId : currentStatusId;
    reminderFieldId = d === 0 && !dueSent ? Number(CFG.fieldIds.aviso_2d || 0) : 0;
  } else if (d <= -5 && (!finalSent || isInBaseStage)) {
    const late = resolveLateStage(d, currentStatusId);
    reminderType = late.label === "15D" ? "LATE_15D" : (late.label === "10D" ? "LATE_10D" : (late.label === "5D" ? "LATE_5D" : "URGENT"));
    stageTarget = late.stage;
    reminderFieldId = (!finalSent && late.label === "5D") ? Number(CFG.fieldIds.aviso_1d || 0) : 0;
  } else {
    continue;
  }

  const moveRes =
    Number(stageTarget) > 0 && Number(stageTarget) !== currentStatusId
      ? await moveStatus(lead.id, stageTarget)
      : { ok: true, skipped: true, statusCode: 0 };
  const markRes = reminderFieldId > 0 ? await markReminder(lead.id, reminderFieldId) : { ok: true, statusCode: 0 };

  if (!moveRes.ok || !markRes.ok) {
    await note(
      lead.id,
      "No se pudo preparar el recordatorio automatico en n8n. move_http=" +
        String(moveRes.statusCode || 0) +
        " mark_http=" +
        String(markRes.statusCode || 0)
    );
    await task(lead.id, lead.responsible_user_id, "Cobranza manual: error preparando recordatorio " + reminderType);
  }

  logs.push({
    lead_id: Number(lead.id),
    documento: documento,
    days_to_due: d,
    reminder_type: reminderType,
    send_result: moveRes.ok && markRes.ok ? "stage_prepared" : "failed",
    stage_target: Number(stageTarget || 0),
    move_http: Number(moveRes.statusCode || 0),
    mark_http: Number(markRes.statusCode || 0),
    saldo_nuevo: saldo,
  });
}

return [{ json: { run_at: new Date().toISOString(), upload_mode: uploadMode, upload_docs_count: uploadDocs.size, count: logs.length, logs } }];
