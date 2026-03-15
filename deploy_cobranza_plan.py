
import copy
import json
import os
import re
import urllib.parse
import urllib.request
import urllib.error
import unicodedata
import uuid
from datetime import datetime, timezone


def require_env(name):
    value = os.environ.get(name)
    if value:
        return value
    raise RuntimeError(f"Missing required environment variable: {name}")


N8N_API_BASE = os.environ.get("N8N_API_BASE", "https://n8n.srv1388533.hstgr.cloud/api/v1")
N8N_API_KEY = require_env("N8N_API_KEY")

KOMMO_BASE = os.environ.get("KOMMO_BASE", "https://eduardonolasco18.kommo.com")
KOMMO_TOKEN = require_env("KOMMO_TOKEN")

INGEST_WORKFLOW_ID = "gfJm4JUoiUi7zZgaB2ob0"
CHAT_WORKFLOW_ID = "TDiINdgzi1YIiIZlwX0zG"
REMINDER_WORKFLOW_ID = "PRCdA1axuyZ9SMyf"
REMINDER_WORKFLOW_NAME = "Kommo Cobranzas - Recordatorios Diario"

TARGET_PIPELINE_NAMES = [
    "Alfredo - Agroriegos",
    "ALDREDO - AGRORIEGOS",
]
DEFAULT_PIPELINE_ID = 13256923
DEFAULT_PAID_STATUS_ID = 102225739
TAG_NAME = "cobranza_n8n_excel"
KOMMO_CHAT_TEMPLATE_ID = int(os.environ.get("KOMMO_CHAT_TEMPLATE_ID", "41510"))
KOMMO_SALESBOT_ID = int(os.environ.get("KOMMO_SALESBOT_ID", "71916"))
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5-nano")
OPENAI_API_KEY = require_env("OPENAI_API_KEY")


def http_json(url, method="GET", headers=None, data=None):
    h = headers or {}
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        if "Content-Type" not in h:
            h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, headers=h, data=body, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode("utf-8")
            if not raw:
                return {}
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} {method} {url}\n{detail}") from e


def n8n_headers():
    return {"X-N8N-API-KEY": N8N_API_KEY}


def kommo_headers():
    return {"Authorization": f"Bearer {KOMMO_TOKEN}", "Content-Type": "application/json"}


def get_workflow(workflow_id):
    return http_json(f"{N8N_API_BASE}/workflows/{workflow_id}", headers=n8n_headers())


def list_workflows():
    return http_json(f"{N8N_API_BASE}/workflows?limit=100", headers=n8n_headers()).get("data", [])


def put_workflow(workflow_id, payload):
    return http_json(f"{N8N_API_BASE}/workflows/{workflow_id}", method="PUT", headers=n8n_headers(), data=payload)


def post_workflow(payload):
    return http_json(f"{N8N_API_BASE}/workflows", method="POST", headers=n8n_headers(), data=payload)


def sanitize_workflow_for_update(wf):
    settings = {}
    raw_settings = wf.get("settings") or {}
    if isinstance(raw_settings, dict) and raw_settings.get("timezone"):
        settings["timezone"] = raw_settings["timezone"]
    return {
        "name": wf["name"],
        "nodes": wf["nodes"],
        "connections": wf["connections"],
        "settings": settings,
    }


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_or_create_control_fields():
    existing = http_json(f"{KOMMO_BASE}/api/v4/leads/custom_fields", headers=kommo_headers())
    by_name = {f.get("name", "").strip().lower(): f for f in existing.get("_embedded", {}).get("custom_fields", [])}

    wanted = [
        ("Cobranza Aviso 3D Enviado", "date_time"),
        ("Cobranza Aviso 2D Enviado", "date_time"),
        ("Cobranza Aviso 1D Enviado", "date_time"),
        ("Cobranza Ultimo Recibo Hash", "text"),
        ("Cobranza Ultimo Abono", "numeric"),
    ]

    to_create = []
    for name, field_type in wanted:
        if name.strip().lower() not in by_name:
            to_create.append({"name": name, "type": field_type})

    if to_create:
        try:
            http_json(f"{KOMMO_BASE}/api/v4/leads/custom_fields", method="POST", headers=kommo_headers(), data=to_create)
        except RuntimeError as e:
            if "date_time" in str(e):
                fallback = []
                for fld in to_create:
                    if fld["type"] == "date_time":
                        fallback.append({"name": fld["name"], "type": "text"})
                    else:
                        fallback.append(fld)
                http_json(
                    f"{KOMMO_BASE}/api/v4/leads/custom_fields",
                    method="POST",
                    headers=kommo_headers(),
                    data=fallback,
                )
            else:
                raise

    latest = http_json(f"{KOMMO_BASE}/api/v4/leads/custom_fields", headers=kommo_headers())
    by_name = {f.get("name", "").strip().lower(): f for f in latest.get("_embedded", {}).get("custom_fields", [])}

    field_ids = {
        "documento": 1858660,
        "telefono": 1858664,
        "fecha_venc_text": 1858666,
        "saldo_pendiente": 1858672,
        "pago_realizado": 1858674,
        "razon_social": 1858676,
        "fecha_venc_date": 1859896,
        "aviso_3d": by_name["cobranza aviso 3d enviado"]["id"],
        "aviso_2d": by_name["cobranza aviso 2d enviado"]["id"],
        "aviso_1d": by_name["cobranza aviso 1d enviado"]["id"],
        "ultimo_hash": by_name["cobranza ultimo recibo hash"]["id"],
        "ultimo_abono": by_name["cobranza ultimo abono"]["id"],
    }
    return field_ids


def _norm_text(value):
    s = str(value or "").strip().lower()
    s = "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def resolve_pipeline():
    data = http_json(f"{KOMMO_BASE}/api/v4/leads/pipelines?limit=250", headers=kommo_headers())
    pipelines = ((data.get("_embedded") or {}).get("pipelines") or [])
    by_norm = {_norm_text(p.get("name")): p for p in pipelines if p.get("name")}

    for wanted in TARGET_PIPELINE_NAMES:
        hit = by_norm.get(_norm_text(wanted))
        if hit:
            return {"id": int(hit["id"]), "name": hit["name"]}

    wanted_norm = [_norm_text(x) for x in TARGET_PIPELINE_NAMES]
    for p in pipelines:
        pname = _norm_text(p.get("name"))
        if any(w in pname or pname in w for w in wanted_norm):
            return {"id": int(p["id"]), "name": p["name"]}

    by_id = {int(p["id"]): p for p in pipelines if p.get("id")}
    fallback = by_id.get(int(DEFAULT_PIPELINE_ID))
    if fallback:
        return {"id": int(fallback["id"]), "name": fallback.get("name", "")}

    names = [str(p.get("name", "")) for p in pipelines]
    raise RuntimeError(f"Target pipeline not found. Available pipelines: {names}")


def get_pipeline_stage_ids(pipeline_id):
    data = http_json(f"{KOMMO_BASE}/api/v4/leads/pipelines/{pipeline_id}?with=statuses", headers=kommo_headers())
    statuses = ((data.get("_embedded") or {}).get("statuses") or [])
    by_name = {_norm_text(s.get("name")): int(s.get("id")) for s in statuses if s.get("id")}
    sorted_statuses = sorted(
        [s for s in statuses if s.get("id")],
        key=lambda s: int(s.get("sort") or 0),
    )
    first_status_id = int(sorted_statuses[0]["id"]) if sorted_statuses else None

    def find_contains(*candidates):
        for cand in candidates:
            c = _norm_text(cand)
            for name, sid in by_name.items():
                if c and c in name:
                    return sid
        return None

    stage_ids = {
        "leads_entrantes": find_contains("leads entrantes") or first_status_id,
        "entrada_inicial": find_contains("entrada inicial"),
        "recordatorio_enviado": find_contains("recordatorio 1") or find_contains("recordatorio enviado") or find_contains("recordatorio"),
        "pagado": find_contains("pagado") or DEFAULT_PAID_STATUS_ID,
        "pago_parcial": find_contains("pago parcial") or find_contains("cotizacion enviada"),
        "fecha_limite": find_contains("fecha limite") or find_contains("sin respuesta"),
        "atrasado": find_contains("atrasado") or find_contains("sin respuesta"),
    }

    missing = [k for k in ("leads_entrantes", "pagado", "pago_parcial", "fecha_limite", "atrasado") if not stage_ids.get(k)]
    if missing:
        raw = [{"id": s.get("id"), "name": s.get("name")} for s in statuses]
        raise RuntimeError(f"Missing stage IDs {missing} in pipeline {pipeline_id}. statuses={raw}")
    return stage_ids


def build_limpiar_datos_code():
    return """const items = $input.all();
const output = [];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function excelSerialToIso(serial) {
  const num = Number(serial);
  if (!Number.isFinite(num) || num < 1000) return "";
  const utcDays = Math.floor(num - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  return `${y}-${m}-${d}`;
}

function dateTextToIso(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (!str) return "";
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(str)) return str;
  if (/^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(str)) {
    const [mm, dd, yyyy] = str.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  const asNum = Number(str);
  if (Number.isFinite(asNum)) return excelSerialToIso(asNum);
  return "";
}

function dateTextToUS(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (!str) return "";
  if (/^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(str)) return str;
  const iso = dateTextToIso(str);
  if (!iso) return str;
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function normalizeMxPhone(value) {
  const digits = String(value || "").replace(/[^0-9]/g, "").trim();
  if (!digits) return "";
  if (digits.length === 10) return "521" + digits;
  if (digits.length === 12 && digits.startsWith("52")) return "521" + digits.slice(2);
  if (digits.length === 13 && digits.startsWith("521")) return digits;
  return digits;
}

for (const item of items) {
  const row = item.json;
  const documento = row["__EMPTY_5"];
  if (!documento) continue;
  if (String(documento).trim().toUpperCase() === "DOCUMENTO") continue;

  const docNum = parseInt(documento, 10);
  if (Number.isNaN(docNum)) continue;

  const telefono = normalizeMxPhone(row["__EMPTY_4"]);
  const razonSocial = String(row["__EMPTY_3"] || "Desconocido").trim();
  const vendedor = String(row["__EMPTY"] || "").trim();

  const saldoDoc = parseFloat(String(row["__EMPTY_17"] || "0").replace(/,/g, "")) || 0;
  const montoUsd = parseFloat(String(row["__EMPTY_16"] || "0").replace(/,/g, "")) || 0;
  const pago = parseFloat(String(row["__EMPTY_18"] || "0").replace(/,/g, "")) || 0;
  const diasVenc = parseInt(row["__EMPTY_13"], 10) || 0;

  const fechaVencUS = dateTextToUS(row["__EMPTY_12"]);
  const fechaVencISO = dateTextToIso(row["__EMPTY_12"]);

  output.push({
    json: {
      VENDEDOR: vendedor,
      DOCUMENTO: String(docNum),
      RAZON_SOCIAL: razonSocial,
      TELEFONO: telefono,
      SALDO_DOC: saldoDoc,
      FECHA_VENC: fechaVencUS,
      FECHA_VENC_ISO: fechaVencISO,
      DIAS_VENCIDOS: diasVenc,
      MONTO_USD: montoUsd,
      PAGO: pago,
      TITULO_TRATO: "Factura " + String(docNum) + " - " + razonSocial,
    },
  });
}

return output;
"""


def build_upsert_code(field_ids, pipeline_id, initial_status_id):
    cfg = {
        "baseUrl": KOMMO_BASE,
        "token": KOMMO_TOKEN,
        "pipelineId": pipeline_id,
        "initialStatusId": initial_status_id,
        "tag": TAG_NAME,
        "fieldIds": field_ids,
    }
    return (
        "const CFG = "
        + json.dumps(cfg, ensure_ascii=True)
        + r""";

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
  fields.push({ field_id: CFG.fieldIds.documento, values: [{ value: String(row.DOCUMENTO || "") }] });
  fields.push({ field_id: CFG.fieldIds.telefono, values: [{ value: String(row.TELEFONO || "") }] });
  fields.push({ field_id: CFG.fieldIds.fecha_venc_text, values: [{ value: String(row.FECHA_VENC || "") }] });
  fields.push({ field_id: CFG.fieldIds.saldo_pendiente, values: [{ value: Number(row.SALDO_DOC || 0) }] });
  fields.push({ field_id: CFG.fieldIds.pago_realizado, values: [{ value: Number(row.PAGO || 0) }] });
  fields.push({ field_id: CFG.fieldIds.razon_social, values: [{ value: String(row.RAZON_SOCIAL || "") }] });
  const dueDateTime = toKommoDateTime(row.FECHA_VENC_ISO || row.FECHA_VENC);
  if (dueDateTime) {
    fields.push({ field_id: CFG.fieldIds.fecha_venc_date, values: [{ value: dueDateTime }] });
  }
  return fields;
}

const row = $json;
const documento = String(row.DOCUMENTO || "").trim();
const telefono = normalizePhone(row.TELEFONO);
if (!documento || !telefono) {
  return {
    json: {
      ...row,
      upsert_status: "skipped",
      upsert_reason: "missing_documento_or_telefono",
    },
  };
}

const leadBody = {
  name: row.TITULO_TRATO || ("Factura " + documento + " - " + (row.RAZON_SOCIAL || "Cliente")),
  price: Math.round(toNumber(row.SALDO_DOC)),
  custom_fields_values: cfPayload(row),
  _embedded: {
    tags: [{ name: CFG.tag }],
  },
};

const leadSearch = await req("GET", "/api/v4/leads?query=" + encodeURIComponent(documento) + "&limit=250&with=custom_fields_values,tags");
if (leadSearch.statusCode >= 400) {
  throw new Error("Lead search failed: " + leadSearch.statusCode + " " + JSON.stringify(leadSearch.body || {}));
}

const candidates = (((leadSearch.body || {})._embedded || {}).leads || []);
const existing = candidates.find((lead) => {
  const doc = getFieldValue(lead, CFG.fieldIds.documento);
  const ph = normalizePhone(getFieldValue(lead, CFG.fieldIds.telefono));
  return String(doc).trim() === documento && ph === telefono;
});

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
  const phoneField = (Array.isArray(c.custom_fields_values) ? c.custom_fields_values : []).find((f) => String(f.field_name || "").toLowerCase() === "phone" || Number(f.field_id) === 1792418);
  if (!phoneField || !Array.isArray(phoneField.values)) return false;
  const all = phoneField.values.map((x) => normalizePhone(x.value));
  return all.includes(telefono);
});

if (!contact) {
  const contactBody = [{
    name: String(row.RAZON_SOCIAL || ("Cliente " + telefono)),
    custom_fields_values: [
      { field_id: 1792418, values: [{ value: "+" + telefono }] },
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
  },
};
"""
    )


def build_detect_cobranza_code(field_ids):
    cfg = {
        "baseUrl": KOMMO_BASE,
        "token": KOMMO_TOKEN,
        "tag": TAG_NAME,
        "fieldIds": field_ids,
        "timezone": "America/Mexico_City",
    }
    return (
        "const CFG = "
        + json.dumps(cfg, ensure_ascii=True)
        + r""";

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
const doc = getFieldValue(lead, CFG.fieldIds.documento);
const isCobranza = hasTag || Boolean(String(doc).trim());

const aviso3 = getFieldValue(lead, CFG.fieldIds.aviso_3d);
const vencDate = parseAnyDate(getFieldValue(lead, CFG.fieldIds.fecha_venc_date) || getFieldValue(lead, CFG.fieldIds.fecha_venc_text));
const today = todayIso(CFG.timezone);
const duePassed = Boolean(vencDate && today > vencDate);
const withinWindow = Boolean(isCobranza && (Boolean(aviso3) || duePassed || !vencDate));

const attachment = String(item.attachment_type || "").toLowerCase();
const fileName = String(item.media_filename || "").toLowerCase();
const isPdf = attachment === "document" || attachment === "file" || fileName.endsWith(".pdf");
const hasText = Boolean(String(item.message_text || "").trim());
const shouldProcess = Boolean(isCobranza && withinWindow && (item.is_image || isPdf || hasText));

return {
  json: {
    ...item,
    is_cobranza_lead: isCobranza,
    cobranza_has_tag: hasTag,
    cobranza_documento: doc,
    cobranza_within_window: withinWindow,
    cobranza_due_iso: vencDate || "",
    cobranza_today_iso: today,
    cobranza_due_passed: duePassed,
    cobranza_aviso_3d_sent: Boolean(aviso3),
    cobranza_saldo_actual: Number(getFieldValue(lead, CFG.fieldIds.saldo_pendiente) || 0),
    cobranza_pago_actual: Number(getFieldValue(lead, CFG.fieldIds.pago_realizado) || 0),
    cobranza_last_hash: getFieldValue(lead, CFG.fieldIds.ultimo_hash),
    cobranza_is_pdf: isPdf,
    should_process_cobranza_receipt: shouldProcess,
  },
};
"""
    )


def build_chat_parse_code():
    return r"""const p = $json.body ?? $json;
let data = p;
if (typeof data === "string") {
  data = Object.fromEntries(new URLSearchParams(data));
}
const message_text = data["message[add][0][text]"] || "";
const contact_name = data["message[add][0][author][name]"] || "";
const lead_id = data["message[add][0][element_id]"] || data["message[add][0][entity_id]"] || "";
const talk_id = data["message[add][0][talk_id]"] || "";
const chat_id = data["message[add][0][chat_id]"] || "";
const origin = data["message[add][0][origin]"] || "";
const attachment_type = data["message[add][0][attachment][type]"] || "";
const media_url = data["message[add][0][attachment][link]"] || "";
const media_filename = data["message[add][0][attachment][file_name]"] || "file";
const is_audio = attachment_type === "voice";
const is_image = attachment_type === "picture";
const is_document = attachment_type === "document" || attachment_type === "file" || String(media_filename).toLowerCase().endsWith(".pdf");
const is_media = is_audio || is_image || is_document;

if (!lead_id) throw new Error("No llego lead_id");
if (!message_text && !is_media) throw new Error("No llego mensaje de texto ni media");

return {
  json: {
    message_text, contact_name, lead_id, talk_id, chat_id, origin,
    sessionId: talk_id, is_audio, is_image, is_document, is_media,
    media_url, media_filename, attachment_type
  }
};
"""


def build_cobranza_ocr_code(field_ids, stage_ids):
    cfg = {
        "baseUrl": KOMMO_BASE,
        "token": KOMMO_TOKEN,
        "openAiApiKey": OPENAI_API_KEY,
        "openAiModel": OPENAI_MODEL,
        "paidStatusId": stage_ids["pagado"],
        "partialStatusId": stage_ids["pago_parcial"],
        "fieldIds": field_ids,
    }
    return (
        "const CFG = "
        + json.dumps(cfg, ensure_ascii=True)
        + r""";

const https = require("https");
const http = require("http");

function nowUnixPlusDay() {
  return Math.floor(Date.now() / 1000) + 86400;
}

function simpleHash(input) {
  const str = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function toNumberFlexible(value) {
  const raw = String(value === null || value === undefined ? "" : value).trim();
  if (!raw) return NaN;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  let t = raw.replace(/\s+/g, "");
  const hasDot = t.includes(".");
  const hasComma = t.includes(",");
  if (hasDot && hasComma) {
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) {
      t = t.replace(/\./g, "").replace(",", ".");
    } else {
      t = t.replace(/,/g, "");
    }
    return Number(t);
  }
  if (hasComma) {
    const commaCount = (t.match(/,/g) || []).length;
    if (commaCount === 1 && t.split(",")[1].length <= 2) return Number(t.replace(",", "."));
    return Number(t.replace(/,/g, ""));
  }
  if (hasDot) {
    const dotCount = (t.match(/\./g) || []).length;
    if (dotCount === 1 && t.split(".")[1].length <= 2) return Number(t);
    return Number(t.replace(/\./g, ""));
  }
  return Number(t);
}

function detectMime(fileName, fallback) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return String(fallback || "").split(";")[0] || "application/octet-stream";
}

function compact(value, limit) {
  const txt = typeof value === "string" ? value : JSON.stringify(value || {});
  return txt.length > limit ? txt.slice(0, limit) + "...(trunc)" : txt;
}

function extractOpenAiText(body) {
  const chunks = [];
  for (const item of body.output || []) {
    for (const part of item.content || []) {
      if (part.type === "output_text" && part.text) chunks.push(String(part.text));
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonLoose(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (e2) {}
    }
  }
  return null;
}

function extractAmountFromMessage(text) {
  const src = String(text || "");
  const candidates = src.match(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})|\d+(?:[.,]\d{1,2})?/g) || [];
  let best = 0;
  for (const token of candidates) {
    const n = toNumberFlexible(token);
    if (Number.isFinite(n) && n > best) best = n;
  }
  return best;
}

async function request(method, path, body) {
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

async function createNote(leadId, text) {
  await request("POST", "/api/v4/leads/" + leadId + "/notes", [{ note_type: "common", params: { text } }]);
}

async function createTask(leadId, responsibleUserId, text) {
  await request("POST", "/api/v4/tasks", [{
    text,
    complete_till: nowUnixPlusDay(),
    entity_id: Number(leadId),
    entity_type: "leads",
    responsible_user_id: Number(responsibleUserId || 14811623),
  }]);
}

async function downloadBinary(url, redirects) {
  const maxRedirects = 5;
  const seen = Number(redirects || 0);
  if (seen > maxRedirects) throw new Error("Too many redirects downloading media");
  const target = String(url || "");
  if (!target) throw new Error("Missing media URL");
  const lib = target.startsWith("https") ? https : http;
  return await new Promise((resolve, reject) => {
    const req = lib.get(target, (res) => {
      const code = Number(res.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
        res.resume();
        resolve(downloadBinary(res.headers.location, seen + 1));
        return;
      }
      if (code >= 400) {
        reject(new Error("Download failed " + code));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: String(res.headers["content-type"] || ""),
        });
      });
    });
    req.on("error", reject);
  });
}

async function analyzeWithOpenAI(row) {
  const content = [];
  const prompt = [
    "Analiza evidencia de pago de una cobranza.",
    "Responde SOLO JSON valido con esta forma exacta:",
    '{"es_pago":true|false,"es_recibo":true|false,"tipo":"abono|pago_total|no_pago|desconocido","monto":number|null,"moneda":"MXN|USD|UNKNOWN","referencia":"texto corto","confidence":number,"requiere_revision_manual":true|false,"motivo":"texto corto"}',
    "Reglas:",
    "- Marca es_pago=true solo si hay intencion clara de pago o abono.",
    "- Si el cliente solo promete pagar o pregunta algo, es_pago=false.",
    "- Si no hay monto claro, monto=null y requiere_revision_manual=true.",
    "- confidence debe ser un numero entre 0 y 1.",
    "- Usa el texto del chat y el adjunto juntos si ambos existen.",
    "- NUNCA uses Saldo actual ni Pago actual como monto detectado; solo sirven como contexto.",
    "- No inventes montos ni referencias.",
    "",
    "Contexto del lead:",
    "Documento: " + String(row.cobranza_documento || ""),
    "Saldo actual: " + String(row.cobranza_saldo_actual || 0),
    "Pago actual: " + String(row.cobranza_pago_actual || 0),
    "Mensaje del cliente: " + String(row.message_text || ""),
  ].join("\n");
  content.push({ type: "input_text", text: prompt });

  if (row.is_image || row.cobranza_is_pdf) {
    const downloaded = await downloadBinary.call(this, row.media_url, 0);
    const mime = detectMime(row.media_filename, downloaded.contentType);
    const base64 = downloaded.buffer.toString("base64");
    if (row.is_image) {
      content.push({ type: "input_image", image_url: "data:" + mime + ";base64," + base64 });
    } else if (row.cobranza_is_pdf) {
      content.push({
        type: "input_file",
        filename: String(row.media_filename || "comprobante.pdf"),
        file_data: "data:application/pdf;base64," + base64,
      });
    }
  }

  const payload = {
    model: CFG.openAiModel,
    reasoning: { effort: "minimal" },
    max_output_tokens: 420,
    input: [{ role: "user", content }],
  };

  const response = await this.helpers.httpRequest({
    method: "POST",
    url: "https://api.openai.com/v1/responses",
    headers: {
      Authorization: "Bearer " + CFG.openAiApiKey,
      "Content-Type": "application/json",
    },
    body: payload,
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  });

  if (response.statusCode >= 400) {
    throw new Error("OpenAI HTTP " + response.statusCode + " " + compact(response.body, 600));
  }

  const rawText = extractOpenAiText(response.body || {});
  const parsed = parseJsonLoose(rawText);
  if (!parsed) {
    throw new Error("OpenAI invalid JSON " + compact(rawText, 600));
  }
  return {
    rawText,
    parsed,
    responseId: String((response.body || {}).id || ""),
  };
}

const row = $json;
const leadId = Number(row.lead_id || 0);
if (!leadId) {
  return { json: { ...row, cobranza_reply: "No pude identificar tu cuenta para registrar el pago." } };
}

if (!row.cobranza_within_window) {
  return { json: { ...row, cobranza_reply: "Recibimos tu comprobante, pero esta fuera de la ventana automatica de validacion. Te atendera un asesor." } };
}

const evidenceKey = row.media_url || row.media_filename
  ? String(row.media_url || row.media_filename || "")
  : "text:" + String(row.message_text || "").trim().toLowerCase();
const dedupeKey = String(leadId) + "|" + evidenceKey;
const hash = simpleHash(dedupeKey);
if (String(row.cobranza_last_hash || "") === hash) {
  return { json: { ...row, cobranza_reply: "Este comprobante ya estaba registrado previamente. Gracias." } };
}

let amount = 0;
let source = "";
let analysis = null;
let rawAiText = "";
try {
  const ai = await analyzeWithOpenAI.call(this, row);
  analysis = ai.parsed || {};
  rawAiText = String(ai.rawText || "");
  amount = toNumberFlexible((analysis || {}).monto);
  source =
    row.is_image ? "openai_image" :
    row.cobranza_is_pdf ? "openai_pdf" :
    "openai_text";
} catch (e) {
  await createNote(leadId, "Cobranza IA error: " + String(e.message || e));
  await createTask(leadId, 14811623, "Validar comprobante manualmente (error IA) en lead " + leadId);
  return {
    json: {
      ...row,
      cobranza_reply: "Recibimos tu comprobante, pero hubo un error tecnico al analizarlo. Un asesor lo revisara.",
      cobranza_detected_amount: null,
    },
  };
}

const confidence = Number(toNumberFlexible((analysis || {}).confidence) || 0);
const isPayment = Boolean((analysis || {}).es_pago);
const requiresManual = Boolean((analysis || {}).requiere_revision_manual);
const textAmount = extractAmountFromMessage(row.message_text || "");
const textSuggestsPayment = /(abon|pago|pagu|deposit|transfer|liquid|comprobante|recibo)/i.test(String(row.message_text || ""));
const explicitTextAmount = textSuggestsPayment && Number.isFinite(textAmount) && textAmount > 0;
if (explicitTextAmount) {
  amount = textAmount;
  source = source ? source + "+message_text" : "message_text_support";
}
const minConfidence = 0.6;
const effectiveIsPayment = isPayment || explicitTextAmount;
const canTrustExplicitText = explicitTextAmount && Number.isFinite(amount) && amount > 0;

if (!effectiveIsPayment) {
  return {
    json: {
      ...row,
      cobranza_reply: "Recibimos tu mensaje. Un asesor revisara tu respuesta.",
      cobranza_detected_amount: null,
      cobranza_ai_result: analysis,
    },
  };
}

if (!(Number.isFinite(amount) && amount > 0) || (!canTrustExplicitText && confidence < minConfidence) || (requiresManual && !canTrustExplicitText)) {
  await createNote(
    leadId,
    "Evidencia de pago requiere revision manual. confidence=" +
      String(confidence) +
      " | AI=" +
      compact(rawAiText || analysis, 900) +
      " | URL: " +
      String(row.media_url || "")
  );
  await createTask(leadId, 14811623, "Validar pago manualmente (analisis IA no concluyente) en lead " + leadId);
  return {
    json: {
      ...row,
      cobranza_reply: "Recibimos tu comprobante. Un asesor validara el monto antes de aplicarlo.",
      cobranza_detected_amount: null,
      cobranza_ai_result: analysis,
    },
  };
}

const saldoActual = Number(row.cobranza_saldo_actual || 0);
const pagoActual = Number(row.cobranza_pago_actual || 0);
const pagoNuevo = Math.max(0, pagoActual + amount);
const saldoNuevo = Math.max(0, saldoActual - amount);
const partialStatusId = Number(CFG.partialStatusId || 0);

const customFields = [
  { field_id: CFG.fieldIds.pago_realizado, values: [{ value: Number(pagoNuevo.toFixed(2)) }] },
  { field_id: CFG.fieldIds.saldo_pendiente, values: [{ value: Number(saldoNuevo.toFixed(2)) }] },
  { field_id: CFG.fieldIds.ultimo_abono, values: [{ value: Number(amount.toFixed(2)) }] },
  { field_id: CFG.fieldIds.ultimo_hash, values: [{ value: hash }] },
];

const patchLead = [{ id: leadId, custom_fields_values: customFields }];
if (saldoNuevo <= 0) {
  patchLead[0].status_id = CFG.paidStatusId;
} else if (partialStatusId > 0) {
  patchLead[0].status_id = partialStatusId;
}

const patchRes = await request("PATCH", "/api/v4/leads", patchLead);
if (patchRes.statusCode >= 400) {
  await createNote(leadId, "Error al actualizar pago automatico: " + JSON.stringify(patchRes.body || {}));
  await createTask(leadId, 14811623, "Error tecnico actualizando pago automatico en lead " + leadId);
  return { json: { ...row, cobranza_reply: "Recibimos tu comprobante, pero hubo un error tecnico al registrar el pago. Te contactaremos." } };
}

await createNote(
  leadId,
  "Pago detectado automaticamente. Monto: " +
    Number(amount.toFixed(2)) +
    " | Saldo nuevo: " +
    Number(saldoNuevo.toFixed(2)) +
    " | Fuente: " +
    source +
    " | Confidence: " +
    String(confidence) +
    " | AI: " +
    compact(rawAiText || analysis, 600) +
    " | URL: " +
    String(row.media_url || "")
);

const msg =
  saldoNuevo <= 0
    ? "Gracias. Tu pago fue registrado y tu saldo quedo en 0. Factura liquidada."
    : "Gracias. Registramos tu abono de $" +
      Number(amount.toFixed(2)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
      ". Tu saldo pendiente es $" +
      Number(saldoNuevo.toFixed(2)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
      ".";

return {
  json: {
    ...row,
    cobranza_detected_amount: Number(amount.toFixed(2)),
    cobranza_saldo_nuevo: Number(saldoNuevo.toFixed(2)),
    cobranza_ai_result: analysis,
    cobranza_reply: msg,
  },
};
"""
    )


def build_send_cobranza_reply_code():
    cfg = {
        "baseUrl": KOMMO_BASE,
        "token": KOMMO_TOKEN,
        "salesbotId": KOMMO_SALESBOT_ID,
    }
    return (
        "const CFG = "
        + json.dumps(cfg, ensure_ascii=True)
        + r""";
const row = $json;
const leadId = Number(row.lead_id || 0);
if (!leadId) return { json: { ...row, cobranza_send_status: "skipped_no_lead" } };

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
const sendRes = await req("POST", "/api/v2/salesbot/run", [{
  bot_id: Number(CFG.salesbotId),
  entity_id: leadId,
  entity_type: 2,
}]);
let after = before;
if (sendRes.statusCode < 400) {
  for (let i = 0; i < 5; i += 1) {
    await sleep(1200);
    after = await latestOutgoingMarker(leadId);
    if (String(after.marker || "") && String(after.marker || "") !== String(before.marker || "")) break;
  }
}
const bodyTxt = (() => {
  try {
    const s = JSON.stringify(sendRes.body || {});
    return s.length > 600 ? s.slice(0, 600) + "...(trunc)" : s;
  } catch (e) {
    return String(sendRes.body || "");
  }
})();
const delivered = String(after.marker || "") !== String(before.marker || "") && String(after.marker || "") !== "";
const ok = sendRes.statusCode < 400 && delivered;

return {
  json: {
    ...row,
    cobranza_send_status: ok ? "sent" : "failed_no_outgoing_chat",
    cobranza_send_http: sendRes.statusCode,
    cobranza_send_body: bodyTxt,
    cobranza_send_mode: "salesbot_run",
    cobranza_outgoing_before: before.marker || "",
    cobranza_outgoing_after: after.marker || "",
  },
};
"""
    )


def build_reminder_engine_code(field_ids, stage_ids, pipeline_id):
    cfg = {
        "baseUrl": KOMMO_BASE,
        "token": KOMMO_TOKEN,
        "pipelineId": pipeline_id,
        "paidStatusId": stage_ids["pagado"],
        "statusIds": stage_ids,
        "tag": TAG_NAME,
        "timezone": "America/Mexico_City",
        "fieldIds": field_ids,
    }
    return (
        "const CFG = "
        + json.dumps(cfg, ensure_ascii=True)
        + r""";

function fieldVal(lead, fieldId) {
  const arr = Array.isArray(lead.custom_fields_values) ? lead.custom_fields_values : [];
  const hit = arr.find((x) => Number(x.field_id) === Number(fieldId));
  if (!hit || !Array.isArray(hit.values) || hit.values.length === 0) return "";
  const v = hit.values[0].value;
  return v === null || v === undefined ? "" : String(v);
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
const partialStatusId = Number((CFG.statusIds || {}).pago_parcial || 0);
const deadlineStatusId = Number((CFG.statusIds || {}).fecha_limite || 0);
const overdueStatusId = Number((CFG.statusIds || {}).atrasado || 0);
const reminderSentStatusId = Number((CFG.statusIds || {}).recordatorio_enviado || 0);
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
for (const lead of leads) {
  const tags = ((((lead._embedded || {}).tags) || [])).map((t) => String(t.name || "").toLowerCase().trim());
  if (!tags.includes(String(CFG.tag).toLowerCase())) continue;
  if (Number(lead.pipeline_id) !== Number(CFG.pipelineId)) continue;
  if (Number(lead.status_id) === Number(CFG.paidStatusId)) continue;

  const documento = fieldVal(lead, CFG.fieldIds.documento);
  if (uploadMode && !uploadDocs.has(String(documento || "").trim())) continue;
  const saldo = Number(fieldVal(lead, CFG.fieldIds.saldo_pendiente) || 0);
  const pagoRealizado = Number(fieldVal(lead, CFG.fieldIds.pago_realizado) || 0);
  if (!(saldo > 0)) continue;

  const dueIso = parseDateAny(fieldVal(lead, CFG.fieldIds.fecha_venc_date) || fieldVal(lead, CFG.fieldIds.fecha_venc_text));
  if (!dueIso) continue;
  const d = daysBetween(today, dueIso);

  const firstSent = fieldVal(lead, CFG.fieldIds.aviso_3d);
  const dueSent = fieldVal(lead, CFG.fieldIds.aviso_2d);
  const finalSent = fieldVal(lead, CFG.fieldIds.aviso_1d);

  let reminderType = "";
  let stageTarget = Number(lead.status_id || 0);
  let reminderFieldId = 0;

  if (d === 5 && !firstSent) {
    reminderType = "5D";
    stageTarget = reminderSentStatusId > 0 ? reminderSentStatusId : Number(lead.status_id || 0);
    reminderFieldId = Number(CFG.fieldIds.aviso_3d || 0);
  } else if (!uploadMode && d === 0 && !dueSent) {
    reminderType = "DUE";
    if (pagoRealizado > 0 && partialStatusId > 0) {
      stageTarget = partialStatusId;
    } else if (deadlineStatusId > 0) {
      stageTarget = deadlineStatusId;
    }
    reminderFieldId = Number(CFG.fieldIds.aviso_2d || 0);
  } else if (!uploadMode && d <= -5 && !finalSent) {
    reminderType = "LATE_5D";
    if (overdueStatusId > 0) {
      stageTarget = overdueStatusId;
    }
    reminderFieldId = Number(CFG.fieldIds.aviso_1d || 0);
  } else if (!uploadMode && d < 0 && overdueStatusId > 0 && Number(lead.status_id) !== overdueStatusId) {
    await moveStatus(lead.id, overdueStatusId);
    continue;
  } else {
    continue;
  }

  const moveRes =
    Number(stageTarget) > 0 && Number(stageTarget) !== Number(lead.status_id || 0)
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
    abono_detectado: null,
    saldo_nuevo: saldo,
  });
}

return [{ json: { run_at: new Date().toISOString(), upload_mode: uploadMode, upload_docs_count: uploadDocs.size, count: logs.length, logs } }];
"""
    )



def patch_ingest_workflow(wf, field_ids, stage_ids, pipeline_id):
    wf = copy.deepcopy(wf)
    nodes = wf["nodes"]
    by_name = {n["name"]: n for n in nodes}

    if "Limpiar Datos" not in by_name:
        raise RuntimeError("Node 'Limpiar Datos' not found in ingest workflow")
    by_name["Limpiar Datos"]["parameters"]["jsCode"] = build_limpiar_datos_code()

    upsert_name = "Upsert Lead+Contacto (Code)"
    upsert_node = by_name.get(upsert_name)
    if not upsert_node:
        upsert_node = {
            "id": str(uuid.uuid4()),
            "name": upsert_name,
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1500, 300],
            "parameters": {
                "mode": "runOnceForEachItem",
                "jsCode": build_upsert_code(
                    field_ids,
                    pipeline_id,
                    stage_ids.get("entrada_inicial") or stage_ids.get("recordatorio_enviado") or stage_ids["leads_entrantes"],
                ),
            },
        }
        nodes.append(upsert_node)
    else:
        upsert_node["parameters"] = {
            "mode": "runOnceForEachItem",
            "jsCode": build_upsert_code(
                field_ids,
                pipeline_id,
                stage_ids.get("entrada_inicial") or stage_ids.get("recordatorio_enviado") or stage_ids["leads_entrantes"],
            ),
        }

    cron_name = "Cron Cobranza 09:00"
    reminder_name = "Reminder Engine (Code)"
    webhook_name = "Webhook Cobranza"
    parse_name = "Parsear Chat Cobranza (Code)"
    detect_name = "Detectar Cobranza Lead"
    route_name = "Ruta Cobranza Recibo?"
    ocr_name = "Cobranza OCR + Abono"
    send_name = "Enviar Mensaje Cobranza (Code)"

    if cron_name not in by_name:
        nodes.append(
            {
                "id": str(uuid.uuid4()),
                "name": cron_name,
                "type": "n8n-nodes-base.cron",
                "typeVersion": 1,
                "position": [260, 560],
                "parameters": {
                    "triggerTimes": {
                        "item": [{"mode": "everyDay", "hour": 9, "minute": 0}]
                    }
                },
            }
        )

    if reminder_name not in by_name:
        nodes.append(
            {
                "id": str(uuid.uuid4()),
                "name": reminder_name,
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [560, 560],
                "parameters": {"jsCode": build_reminder_engine_code(field_ids, stage_ids, pipeline_id)},
            }
        )
    else:
        by_name[reminder_name]["parameters"] = {"jsCode": build_reminder_engine_code(field_ids, stage_ids, pipeline_id)}

    if webhook_name not in by_name:
        nodes.append(
            {
                "id": str(uuid.uuid4()),
                "name": webhook_name,
                "type": "n8n-nodes-base.webhook",
                "typeVersion": 2,
                "position": [260, 820],
                "webhookId": str(uuid.uuid4()),
                "parameters": {
                    "httpMethod": "POST",
                    "path": "kommo-cobranza",
                    "responseMode": "onReceived",
                    "options": {},
                },
            }
        )

    if parse_name not in by_name:
        nodes.append(
            {
                "id": str(uuid.uuid4()),
                "name": parse_name,
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [520, 820],
                "parameters": {"mode": "runOnceForEachItem", "jsCode": build_chat_parse_code()},
            }
        )
    else:
        by_name[parse_name]["parameters"] = {"mode": "runOnceForEachItem", "jsCode": build_chat_parse_code()}

    if detect_name not in by_name:
        nodes.append(
            {
                "id": str(uuid.uuid4()),
                "name": detect_name,
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [760, 820],
                "parameters": {"mode": "runOnceForEachItem", "jsCode": build_detect_cobranza_code(field_ids)},
            }
        )
    else:
        by_name[detect_name]["parameters"] = {"mode": "runOnceForEachItem", "jsCode": build_detect_cobranza_code(field_ids)}

    if route_name not in by_name:
        nodes.append(
            {
                "id": str(uuid.uuid4()),
                "name": route_name,
                "type": "n8n-nodes-base.if",
                "typeVersion": 2.2,
                "position": [980, 820],
                "parameters": {
                    "conditions": {
                        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                        "conditions": [
                            {
                                "id": "cobranza-switch",
                                "leftValue": "={{ $json.should_process_cobranza_receipt }}",
                                "rightValue": True,
                                "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                            }
                        ],
                        "combinator": "and",
                    }
                },
            }
        )

    if ocr_name not in by_name:
        nodes.append(
            {
                "id": str(uuid.uuid4()),
                "name": ocr_name,
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [1220, 760],
                "parameters": {"mode": "runOnceForEachItem", "jsCode": build_cobranza_ocr_code(field_ids, stage_ids)},
            }
        )
    else:
        by_name[ocr_name]["parameters"] = {"mode": "runOnceForEachItem", "jsCode": build_cobranza_ocr_code(field_ids, stage_ids)}

    if send_name not in by_name:
        nodes.append(
            {
                "id": str(uuid.uuid4()),
                "name": send_name,
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [1460, 760],
                "parameters": {"mode": "runOnceForEachItem", "jsCode": build_send_cobranza_reply_code()},
            }
        )
    else:
        by_name[send_name]["parameters"] = {"mode": "runOnceForEachItem", "jsCode": build_send_cobranza_reply_code()}

    wf["nodes"] = [
        n
        for n in nodes
        if n["name"] not in {"Crear Lead en Kommo", "Crear Trato (HTTP)", "Split In Batches"} or n["name"] == upsert_name
    ]

    wf["connections"] = {
        "Google Drive Trigger": {"main": [[{"node": "Descargar Excel", "type": "main", "index": 0}]]},
        "Descargar Excel": {"main": [[{"node": "Leer Excel", "type": "main", "index": 0}]]},
        "Leer Excel": {"main": [[{"node": "Limpiar Datos", "type": "main", "index": 0}]]},
        "Limpiar Datos": {"main": [[{"node": upsert_name, "type": "main", "index": 0}]]},
        upsert_name: {"main": [[{"node": reminder_name, "type": "main", "index": 0}]]},
        cron_name: {"main": [[{"node": reminder_name, "type": "main", "index": 0}]]},
        webhook_name: {"main": [[{"node": parse_name, "type": "main", "index": 0}]]},
        parse_name: {"main": [[{"node": detect_name, "type": "main", "index": 0}]]},
        detect_name: {"main": [[{"node": route_name, "type": "main", "index": 0}]]},
        route_name: {"main": [[{"node": ocr_name, "type": "main", "index": 0}], []]},
        ocr_name: {"main": [[{"node": send_name, "type": "main", "index": 0}]]},
    }

    settings = wf.get("settings") or {}
    settings["timezone"] = "America/Mexico_City"
    wf["settings"] = settings
    return wf


def patch_chat_workflow(wf, field_ids):
    wf = copy.deepcopy(wf)
    nodes = wf["nodes"]
    by_name = {n["name"]: n for n in nodes}

    if "Code" in by_name:
        by_name["Code"]["parameters"]["jsCode"] = build_chat_parse_code()

    if "HTTP Request" not in by_name:
        raise RuntimeError("Expected node 'HTTP Request' not found in chat workflow")
    http_creds = copy.deepcopy(by_name["HTTP Request"].get("credentials", {}))

    detect_name = "Detectar Cobranza Lead"
    route_name = "Ruta Cobranza Recibo?"
    ocr_name = "Cobranza OCR + Abono"
    send_name = "Enviar Mensaje Cobranza"

    detect_node = by_name.get(detect_name)
    if not detect_node:
        detect_node = {
            "id": str(uuid.uuid4()),
            "name": detect_name,
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [580, 380],
            "parameters": {"mode": "runOnceForEachItem", "jsCode": build_detect_cobranza_code(field_ids)},
        }
        nodes.append(detect_node)
    else:
        detect_node["parameters"] = {"mode": "runOnceForEachItem", "jsCode": build_detect_cobranza_code(field_ids)}

    route_node = by_name.get(route_name)
    if not route_node:
        route_node = {
            "id": str(uuid.uuid4()),
            "name": route_name,
            "type": "n8n-nodes-base.if",
            "typeVersion": 2.2,
            "position": [780, 380],
            "parameters": {
                "conditions": {
                    "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                    "conditions": [
                        {
                            "id": "cobranza-switch",
                            "leftValue": "={{ $json.should_process_cobranza_receipt }}",
                            "rightValue": True,
                            "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                        }
                    ],
                    "combinator": "and",
                }
            },
        }
        nodes.append(route_node)

    ocr_node = by_name.get(ocr_name)
    if not ocr_node:
        ocr_node = {
            "id": str(uuid.uuid4()),
            "name": ocr_name,
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [980, 260],
            "parameters": {
                "mode": "runOnceForEachItem",
                "jsCode": build_cobranza_ocr_code(
                    field_ids,
                    {
                        "pagado": DEFAULT_PAID_STATUS_ID,
                        "pago_parcial": 101465371,
                        "fecha_limite": 101765771,
                        "atrasado": 101765771,
                    },
                ),
            },
        }
        nodes.append(ocr_node)
    else:
        ocr_node["parameters"] = {
            "mode": "runOnceForEachItem",
            "jsCode": build_cobranza_ocr_code(
                field_ids,
                {
                    "pagado": DEFAULT_PAID_STATUS_ID,
                    "pago_parcial": 101465371,
                    "fecha_limite": 101765771,
                    "atrasado": 101765771,
                },
            ),
        }

    send_node = by_name.get(send_name)
    if not send_node:
        send_node = {
            "id": str(uuid.uuid4()),
            "name": send_name,
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [1200, 260],
            "parameters": {
                "method": "PATCH",
                "url": f"{KOMMO_BASE}/api/v4/chats/templates",
                "authentication": "predefinedCredentialType",
                "nodeCredentialType": "httpBearerAuth",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": f"={{{{[{{ id: {KOMMO_CHAT_TEMPLATE_ID}, content: $json.cobranza_reply || 'Recibimos tu comprobante.', entity_id: Number($json.lead_id), entity_type: 2 }}]}}}}",
                "options": {},
            },
            "credentials": http_creds,
        }
        nodes.append(send_node)
    else:
        send_node["parameters"] = {
            "method": "PATCH",
            "url": f"{KOMMO_BASE}/api/v4/chats/templates",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "httpBearerAuth",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": f"={{{{[{{ id: {KOMMO_CHAT_TEMPLATE_ID}, content: $json.cobranza_reply || 'Recibimos tu comprobante.', entity_id: Number($json.lead_id), entity_type: 2 }}]}}}}",
            "options": {},
        }
        send_node["credentials"] = http_creds

    wf["nodes"] = nodes
    con = wf.get("connections", {})

    con["Code"] = {"main": [[{"node": detect_name, "type": "main", "index": 0}]]}
    con[detect_name] = {"main": [[{"node": route_name, "type": "main", "index": 0}]]}
    con[route_name] = {
        "main": [
            [{"node": ocr_name, "type": "main", "index": 0}, {"node": "Reset Timeout Timer", "type": "main", "index": 0}],
            [{"node": "Reset Timeout Timer", "type": "main", "index": 0}, {"node": "Es media?", "type": "main", "index": 0}],
        ]
    }
    con[ocr_name] = {"main": [[{"node": send_name, "type": "main", "index": 0}]]}
    con[send_name] = {"main": [[{"node": "Wait", "type": "main", "index": 0}]]}

    wf["connections"] = con
    return wf


def build_reminder_workflow(field_ids, stage_ids, pipeline_id):
    return {
        "name": REMINDER_WORKFLOW_NAME,
        "settings": {"timezone": "America/Mexico_City"},
        "nodes": [
            {
                "id": str(uuid.uuid4()),
                "name": "Cron Diario 09:00",
                "type": "n8n-nodes-base.cron",
                "typeVersion": 1,
                "position": [260, 300],
                "parameters": {
                    "triggerTimes": {
                        "item": [
                            {
                                "mode": "everyDay",
                                "hour": 9,
                                "minute": 0,
                            }
                        ]
                    }
                },
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Reminder Engine (Code)",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [560, 300],
                "parameters": {"jsCode": build_reminder_engine_code(field_ids, stage_ids, pipeline_id)},
            },
        ],
        "connections": {
            "Cron Diario 09:00": {
                "main": [[{"node": "Reminder Engine (Code)", "type": "main", "index": 0}]]
            }
        },
    }


def upsert_or_create_reminder_workflow(payload):
    all_wf = list_workflows()
    existing = next((w for w in all_wf if w.get("name") == REMINDER_WORKFLOW_NAME), None)
    if existing:
        wf_live = get_workflow(existing["id"])
        wf_live["nodes"] = payload["nodes"]
        wf_live["connections"] = payload["connections"]
        wf_live["settings"] = payload.get("settings", {})
        updated = put_workflow(existing["id"], sanitize_workflow_for_update(wf_live))
        return {"id": existing["id"], "name": payload["name"], "action": "updated", "workflow": updated}
    created = post_workflow(payload)
    return {"id": created.get("id"), "name": payload["name"], "action": "created", "workflow": created}


def main():
    print("1) Ensuring Kommo control fields...")
    field_ids = get_or_create_control_fields()
    print("Field IDs:", json.dumps(field_ids, indent=2, ensure_ascii=False))
    pipeline = resolve_pipeline()
    print("Pipeline:", json.dumps(pipeline, indent=2, ensure_ascii=False))
    stage_ids = get_pipeline_stage_ids(pipeline["id"])
    print("Stage IDs:", json.dumps(stage_ids, indent=2, ensure_ascii=False))

    print("2) Patching ingest workflow...")
    ingest = get_workflow(INGEST_WORKFLOW_ID)
    ingest_patched = patch_ingest_workflow(ingest, field_ids, stage_ids, pipeline["id"])
    put_workflow(INGEST_WORKFLOW_ID, sanitize_workflow_for_update(ingest_patched))
    ingest_live = get_workflow(INGEST_WORKFLOW_ID)
    save_json("workflow_n8n_kommo_actualizado.json", ingest_live)

    print("3) Saving current chat/reminder snapshots (no patch)...")
    chat_live = get_workflow(CHAT_WORKFLOW_ID)
    save_json("workflow_kommo_chat_cobranza.json", chat_live)
    reminder_live = get_workflow(REMINDER_WORKFLOW_ID)
    save_json("workflow_cobranza_recordatorios.json", reminder_live)

    summary = {
        "deployed_at_utc": datetime.now(timezone.utc).isoformat(),
        "ingest_workflow_id": INGEST_WORKFLOW_ID,
        "chat_workflow_id": CHAT_WORKFLOW_ID,
        "reminder_workflow_id": REMINDER_WORKFLOW_ID,
        "reminder_action": "unchanged",
        "pipeline_id": pipeline["id"],
        "pipeline_name": pipeline["name"],
        "field_ids": field_ids,
        "stage_ids": stage_ids,
    }
    save_json("deploy_cobranza_summary.json", summary)
    print("Done.")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
