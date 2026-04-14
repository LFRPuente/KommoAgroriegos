const CFG = {"baseUrl": "https://agroriegoscorp.kommo.com", "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjEyNjBhODkxNjZlMWZiNTI1MGVkZTFlNzVhY2ZhYjY3NWUxMjIyYzBmNjhlZjk5YTkxODhlNzRlODJiODVjYmYxMTY1ZTcwMDBiYmQ3NzliIn0.eyJhdWQiOiJkNGZjYmE0MS03NTM1LTQzOWYtOTk5Yy00YjZlNzA3NGUzMzIiLCJqdGkiOiIxMjYwYTg5MTY2ZTFmYjUyNTBlZGUxZTc1YWNmYWI2NzVlMTIyMmMwZjY4ZWY5OWE5MTg4ZTc0ZTgyYjg1Y2JmMTE2NWU3MDAwYmJkNzc5YiIsImlhdCI6MTc3NDM5MDcwOSwibmJmIjoxNzc0MzkwNzA5LCJleHAiOjE5MDY0MTYwMDAsInN1YiI6IjE1MDA0MDE5IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM2MjQ4Nzg3LCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiZTkwNTZiMDUtMjUzNi00NWM4LTkyYjgtNmM1ZjhkNmZhODc0IiwiYXBpX2RvbWFpbiI6ImFwaS1jLmtvbW1vLmNvbSJ9.TRv4MRF9eVCbNJW-zjYzX4BTOUQ7p2AuM7DZx97UQyYdL81itbaILIro2nhS1rxqHXa-k3FUUtL48qK3FnZi3O9uz0jJuDeeqH2RdKNkCviTO7t5ggnVqePntPFxS5BXmlVxDpRTgHHvywJYgWBnxx92D7YJzVsubScTUbT5AY-6qPKr9hMfpQnaK6BeEZUQIFIW_vUeo5TSKN9Ngc9bpCXtWEiA9OjMVapLJXM0aw1IvyrIkr38fod26Ef9dxGrm9hyrVNS3amGNcpG9IrMEyo3d_ZcG5HQAnQ1bw2_avXhEFY0QcD0r5UmL_9uqx_pvHCCxLbVJxwDfnTO3IZDZA", "pipelineId": 13403731, "initialStatusId": 103388967, "tag": "cobranza_n8n_excel", "fieldIds": {"documento": 3272952, "telefono": 3281414, "fecha_venc_text": 3281430, "saldo_pendiente": 3272956, "pago_realizado": 3281416, "razon_social": 3281418, "fecha_venc_date": 3272954, "aviso_3d": 3282254, "aviso_2d": 3282256, "aviso_1d": 3282258, "ultimo_hash": 3281420, "ultimo_abono": 3281422}};

function normalizePhone(v) {
  const digits = String(v || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return "521" + digits;
  if (digits.length === 12 && digits.startsWith("52")) return "521" + digits.slice(2);
  if (digits.length === 13 && digits.startsWith("521")) return digits;
  return digits;
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getFieldValue(entity, fieldId) {
  const arr = Array.isArray(entity.custom_fields_values) ? entity.custom_fields_values : [];
  const hit = arr.find((f) => Number(f.field_id) === Number(fieldId));
  if (!hit || !Array.isArray(hit.values) || hit.values.length === 0) return "";
  const val = hit.values[0].value;
  return val === null || val === undefined ? "" : String(val);
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

function toKommoDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + "T06:00:00+00:00";
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return "";
}

function cfPayload(row) {
  const fields = [];
  const saldoPendiente = Math.max(0, toNumber(row.SALDO_DOC) - toNumber(row.PAGO));
  fields.push({ field_id: CFG.fieldIds.documento, values: [{ value: String(row.DOCUMENTO || "") }] });
  fields.push({ field_id: CFG.fieldIds.telefono, values: [{ value: String(row.TELEFONO || "") }] });
  fields.push({ field_id: CFG.fieldIds.fecha_venc_text, values: [{ value: String(row.FECHA_VENC || "") }] });
  fields.push({ field_id: CFG.fieldIds.saldo_pendiente, values: [{ value: String(saldoPendiente) }] });
  fields.push({ field_id: CFG.fieldIds.pago_realizado, values: [{ value: String(Number(row.PAGO || 0)) }] });
  fields.push({ field_id: CFG.fieldIds.razon_social, values: [{ value: String(row.RAZON_SOCIAL || "") }] });
  const dueDateTime = toKommoDateTime(row.FECHA_VENC_ISO || row.FECHA_VENC);
  if (dueDateTime) {
    fields.push({ field_id: CFG.fieldIds.fecha_venc_date, values: [{ value: dueDateTime }] });
  }
  return fields;
}

function leadMatchScore(lead) {
  return Number(lead.updated_at || lead.created_at || lead.id || 0);
}

function exactLeadMatch(lead, documento, telefono) {
  const doc = getFieldValue(lead, CFG.fieldIds.documento);
  const ph = normalizePhone(getFieldValue(lead, CFG.fieldIds.telefono));
  return String(doc).trim() === documento && ph === telefono;
}

async function findExistingLead(documento, telefono) {
  const found = new Map();

  async function collect(path) {
    const res = await req("GET", path);
    if (res.statusCode >= 400) {
      throw new Error("Lead search failed: " + res.statusCode + " " + JSON.stringify(res.body || {}));
    }
    const chunk = ((((res.body || {})._embedded || {}).leads) || []);
    for (const lead of chunk) {
      if (!lead || !lead.id || lead.is_deleted) continue;
      found.set(String(lead.id), lead);
    }
    return { chunk, hasNext: Boolean((((res.body || {})._links || {}).next || {}).href) };
  }

  await collect("/api/v4/leads?query=" + encodeURIComponent(documento) + "&limit=250&with=custom_fields_values,tags");
  await collect("/api/v4/leads?query=" + encodeURIComponent(telefono) + "&limit=250&with=custom_fields_values,tags");

  let matches = Array.from(found.values()).filter((lead) => exactLeadMatch(lead, documento, telefono));
  if (!matches.length) {
    for (let page = 1; page <= 100; page += 1) {
      const { chunk, hasNext } = await collect("/api/v4/leads?limit=250&page=" + page + "&with=custom_fields_values,tags");
      matches = chunk.filter((lead) => exactLeadMatch(lead, documento, telefono));
      if (matches.length) break;
      if (!hasNext || !chunk.length) break;
    }
    matches = Array.from(found.values()).filter((lead) => exactLeadMatch(lead, documento, telefono));
  }

  if (!matches.length) {
    return { existing: null, duplicates: [] };
  }

  matches.sort((a, b) => leadMatchScore(b) - leadMatchScore(a));
  return { existing: matches[0], duplicates: matches.slice(1) };
}

const row = $json;
const documento = String(row.DOCUMENTO || "").trim();
const telefono = normalizePhone(row.TELEFONO);
if (!documento || !telefono) {
  return {
    json: {
      ...row,
      upsert_status: "skipped",
      upsert_reason: "missing_documento_o_telefono",
    },
  };
}

const codVen = String(row.COD_VEN || "").trim();
const rutaTag = codVen ? ("Ruta " + codVen) : "";
const tagsPayload = rutaTag ? [{ name: CFG.tag }, { name: rutaTag }] : [{ name: CFG.tag }];

const leadBody = {
  name: row.TITULO_TRATO || ("Factura " + documento + " - " + (row.RAZON_SOCIAL || "Cliente")),
  price: Math.round(toNumber(row.SALDO_DOC)),
  custom_fields_values: cfPayload(row),
  _embedded: {
    tags: tagsPayload,
  },
};

const existingSearch = await findExistingLead(documento, telefono);
const existing = existingSearch.existing;
const duplicateMatches = existingSearch.duplicates || [];

let leadId;
let action;
if (existing) {
  leadId = Number(existing.id);
  action = "updated";
  const patchLead = {
    id: leadId,
    ...leadBody,
  };
  if (Number(existing.pipeline_id) !== Number(CFG.pipelineId)) {
    patchLead.pipeline_id = CFG.pipelineId;
    if (Number(CFG.initialStatusId) > 0) {
      patchLead.status_id = Number(CFG.initialStatusId);
    }
  }
  const patchBody = [patchLead];
  const patchRes = await req("PATCH", "/api/v4/leads", patchBody);
  if (patchRes.statusCode >= 400) {
    throw new Error("Lead patch failed: " + patchRes.statusCode + " " + JSON.stringify(patchRes.body || {}));
  }
} else {
  action = "created";
  const createLead = {
    ...leadBody,
    pipeline_id: CFG.pipelineId,
  };
  if (Number(CFG.initialStatusId) > 0) {
    createLead.status_id = Number(CFG.initialStatusId);
  }
  let createRes = await req("POST", "/api/v4/leads", [createLead]);
  if (createRes.statusCode >= 400) {
    const payload = JSON.stringify(createRes.body || {});
    const statusChoiceErr = payload.includes("NotSupportedChoice") && payload.includes("status_id");
    if (statusChoiceErr && Object.prototype.hasOwnProperty.call(createLead, "status_id")) {
      delete createLead.status_id;
      createRes = await req("POST", "/api/v4/leads", [createLead]);
    }
  }
  if (createRes.statusCode >= 400) {
    throw new Error("Lead create failed: " + createRes.statusCode + " " + JSON.stringify(createRes.body || {}));
  }
  const created = ((((createRes.body || {})._embedded || {}).leads || [])[0] || {});
  leadId = Number(created.id);
}

if (!leadId) {
  throw new Error("Lead ID not resolved for documento " + documento);
}

const contactSearch = await req("GET", "/api/v4/contacts?query=" + encodeURIComponent(telefono) + "&limit=250&with=custom_fields_values");
if (contactSearch.statusCode >= 400) {
  throw new Error("Contact search failed: " + contactSearch.statusCode + " " + JSON.stringify(contactSearch.body || {}));
}

const contactCandidates = (((contactSearch.body || {})._embedded || {}).contacts || []);
let contact = contactCandidates.find((c) => {
  const phoneField = (Array.isArray(c.custom_fields_values) ? c.custom_fields_values : []).find((f) => String(f.field_name || "").toLowerCase() === "phone" || Number(f.field_id) === 3270024);
  if (!phoneField || !Array.isArray(phoneField.values)) return false;
  const all = phoneField.values.map((x) => normalizePhone(x.value));
  return all.includes(telefono);
});

if (!contact) {
  const contactBody = [{
    name: String(row.RAZON_SOCIAL || ("Cliente " + telefono)),
    custom_fields_values: [
      { field_id: 3270024, values: [{ value: "+" + telefono }] },
    ],
    _embedded: {
      tags: [{ name: CFG.tag }],
    },
  }];
  const cRes = await req("POST", "/api/v4/contacts", contactBody);
  if (cRes.statusCode >= 400) {
    throw new Error("Contact create failed: " + cRes.statusCode + " " + JSON.stringify(cRes.body || {}));
  }
  contact = ((((cRes.body || {})._embedded || {}).contacts || [])[0] || {});
}

let linkStatus = "linked_or_already";
if (contact && contact.id) {
  const linkRes = await req("POST", "/api/v4/leads/" + leadId + "/link", [
    { to_entity_id: Number(contact.id), to_entity_type: "contacts" },
  ]);
  if (linkRes.statusCode >= 400) {
    linkStatus = "link_failed";
  }
}

return {
  json: {
    ...row,
    lead_id: leadId,
    contact_id: contact ? Number(contact.id) : null,
    upsert_status: action,
    link_status: linkStatus,
    tag_applied: CFG.tag,
    ruta_tag_applied: rutaTag,
    duplicate_match_count: Number(duplicateMatches.length || 0),
    duplicate_match_ids: duplicateMatches.map((lead) => Number(lead.id || 0)).filter((v) => v > 0),
  },
};

