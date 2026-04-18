#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const CFG = {
  pipelineId: 13403731,
  paidStatusId: 103429439,
  initialStatusId: 103388967,
  tag: "cobranza_n8n_excel",
  timezone: "America/Mexico_City",
  statusIds: {
    leads_entrantes: 103388963,
    leads_importados: 103388967,
    entrada_inicial: 103388967,
    recordatorio_enviado: 103388971,
    pagado: 103429439,
    abono: 103610175,
    no_pagado: 103611443,
    fecha_limite: 103388975,
    deadline_abono: 103610171,
    atrasado: 103388979,
    atrasado_10: 104161951,
    atrasado_15: 104161955,
    revisar_pago: 103429435,
    revision_urgente: 103429431,
  },
  fieldIds: {
    documento: 3272952,
    telefono: 3281414,
    fecha_venc_text: 3281430,
    saldo_pendiente: 3272956,
    pago_realizado: 3281416,
    razon_social: 3281418,
    fecha_venc_date: 3272954,
    aviso_3d: 3282254,
    aviso_2d: 3282256,
    aviso_1d: 3282258,
    ultimo_hash: 3281420,
    ultimo_abono: 3281422,
    status_pago: 3281432,
  },
  statusPagoEnums: {
    pagado: 8030168,
    abonado: 8030170,
    no_pagado: 8030172,
  },
};

const STAGE_NAMES = {
  [CFG.statusIds.leads_entrantes]: "leads_entrantes",
  [CFG.statusIds.leads_importados]: "leads_importados",
  [CFG.statusIds.recordatorio_enviado]: "recordatorio_enviado",
  [CFG.statusIds.pagado]: "pagado",
  [CFG.statusIds.abono]: "abono",
  [CFG.statusIds.no_pagado]: "no_pagado",
  [CFG.statusIds.fecha_limite]: "fecha_limite",
  [CFG.statusIds.deadline_abono]: "deadline_abono",
  [CFG.statusIds.atrasado]: "atrasado_5d",
  [CFG.statusIds.atrasado_10]: "atrasado_10d",
  [CFG.statusIds.atrasado_15]: "atrasado_15d",
  [CFG.statusIds.revisar_pago]: "revisar_pago",
  [CFG.statusIds.revision_urgente]: "revision_urgente",
};

function parseArgs(argv) {
  const options = {
    excelPath: "",
    existingPath: "",
    date: "",
    jsonOut: "",
    csvOut: "",
    includeUnchanged: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--") && !options.excelPath) {
      options.excelPath = arg;
      continue;
    }
    if (arg === "--excel") {
      options.excelPath = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--existing") {
      options.existingPath = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--date") {
      options.date = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--json-out") {
      options.jsonOut = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--csv-out") {
      options.csvOut = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--include-unchanged") {
      options.includeUnchanged = true;
      continue;
    }
  }

  if (!options.excelPath) {
    throw new Error(
      "Uso: npm run sim:drive-upload -- --excel \"C:\\\\ruta\\\\archivo.xlsx\" [--date YYYY-MM-DD] [--existing leads.json]"
    );
  }

  return options;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function excelSerialToIso(serial) {
  const num = Number(serial);
  if (!Number.isFinite(num) || num < 1000) return "";
  const utcDays = Math.floor(num - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function isoFromYMD(y, m, d) {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return "";
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== (mm - 1) || dt.getUTCDate() !== dd) return "";
  return `${yy}-${pad2(mm)}-${pad2(dd)}`;
}

function parseAnyDateToIso(raw) {
  const s = String(raw || "").trim();
  if (!s || s === "00-00-00") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    let p1 = Number(match[1]);
    let p2 = Number(match[2]);
    let yy = Number(match[3]);
    if (yy < 100) yy = yy >= 70 ? 1900 + yy : 2000 + yy;
    if (p1 > 12) return isoFromYMD(yy, p2, p1);
    if (p2 > 12) return isoFromYMD(yy, p1, p2);
    return isoFromYMD(yy, p2, p1);
  }

  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 1000) {
    return excelSerialToIso(asNum);
  }

  return "";
}

function calcularDesdeBase(rawK, rawJ, plazo) {
  const sK = String(rawK || "").trim();
  const kValida = sK !== "" && sK !== "00-00-00" && sK !== "0";
  const baseRaw = kValida ? rawK : rawJ;
  const baseIso = parseAnyDateToIso(baseRaw);
  if (!baseIso) return "";

  const days = parseInt(String(plazo || "0"), 10) || 0;
  const d = new Date(baseIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function resolveVencimientoIso(rawM, rawK, rawJ, plazo) {
  const sM = String(rawM || "").trim();
  const slash = sM.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const p1 = Number(slash[1]);
    const p2 = Number(slash[2]);
    if (p1 > 12 || p2 > 12) {
      let yy = Number(slash[3]);
      if (yy < 100) yy = yy >= 70 ? 1900 + yy : 2000 + yy;
      if (p1 > 12) return isoFromYMD(yy, p2, p1);
      return isoFromYMD(yy, p1, p2);
    }
    return calcularDesdeBase(rawK, rawJ, plazo);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(sM)) return sM;
  return calcularDesdeBase(rawK, rawJ, plazo);
}

function isoToDMY(iso) {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function parseDateAny(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
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

function todayIso(timezone, override) {
  if (override) return override;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function daysBetween(aIso, bIso) {
  const a = new Date(aIso + "T00:00:00Z");
  const b = new Date(bIso + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/[^0-9]/g, "").trim();
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

function pick(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return "";
}

function toNumber(v) {
  const cleaned = String(v ?? "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toKommoDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + "T06:00:00+00:00";
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) {
    let dd = Number(us[1]);
    let mm = Number(us[2]);
    let yy = Number(us[3]);
    if (yy < 100) yy = yy >= 70 ? 1900 + yy : 2000 + yy;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yy}-${pad2(mm)}-${pad2(dd)}T06:00:00+00:00`;
    }
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}+00:00`;
  }
  return "";
}

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

function setField(lead, fieldId, value, enumId) {
  if (!Array.isArray(lead.custom_fields_values)) {
    lead.custom_fields_values = [];
  }
  const values = [{ value: value === undefined || value === null ? "" : value }];
  if (enumId) values[0].enum_id = enumId;
  const idx = lead.custom_fields_values.findIndex((f) => Number(f.field_id) === Number(fieldId));
  const entry = { field_id: Number(fieldId), values };
  if (idx === -1) {
    lead.custom_fields_values.push(entry);
  } else {
    lead.custom_fields_values[idx] = entry;
  }
}

function stageName(statusId) {
  return STAGE_NAMES[Number(statusId)] || `status_${statusId}`;
}

function readWorkbookRows(excelPath) {
  const workbook = xlsx.readFile(excelPath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`No se encontró la hoja 1 en ${excelPath}`);
  }
  return xlsx.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
    blankrows: false,
  });
}

function limpiarDatos(rows) {
  const output = [];

  for (const row of rows) {
    const documento = pick(row, ["DOCUMENTO", "Documento"]);
    if (!documento) continue;

    const docNum = parseInt(documento, 10);
    if (Number.isNaN(docNum)) continue;

    const telefono = normalizePhone(pick(row, ["TELEFONO1", "TELEFONO", "Telefono"]));
    const razonSocial = String(
      pick(row, ["RAZON SOCIAL", "RAZON_SOCIAL", "Razon Social"]) || "Desconocido"
    ).trim();
    const vendedor = String(pick(row, ["VENDEDOR"]) || "").trim();
    const codVen = String(pick(row, ["COD VEN", "COD_VEN", "Cod Ven"]) || "")
      .trim()
      .replace(/[^0-9]/g, "");

    const saldoDoc = Math.round(toNumber(pick(row, ["SALDO", "Saldo", "saldo"])) * 100) / 100;
    const montoUsd = Math.round(toNumber(pick(row, ["MONTO USD", "MONTO_USD", "Monto USD"])) * 100) / 100;
    const pago = Math.round(toNumber(pick(row, ["PAGO", "PAGO_1", "Pago"])) * 100) / 100;
    const diasVenc = parseInt(String(pick(row, ["DIAS VENCIDOS", "DIAS_VENCIDOS", "Dias Vencidos"]) || "0"), 10) || 0;

    const rawFechaVenc = pick(row, ["FECHA VENC", "FECHA_VENC", "Fecha Venc"]);
    const rawFechaRecepcion = pick(row, ["FECHA RECEPCION", "FECHA_RECEPCION", "Fecha Recepcion"]);
    const rawFecha = pick(row, ["FECHA", "Fecha"]);
    const plazo = pick(row, ["PLAZO", "Plazo"]);
    const fechaVencISO = resolveVencimientoIso(rawFechaVenc, rawFechaRecepcion, rawFecha, plazo);
    const fechaVencDMY = isoToDMY(fechaVencISO) || String(rawFechaVenc || "").trim();

    output.push({
      VENDEDOR: vendedor,
      COD_VEN: codVen,
      DOCUMENTO: String(docNum),
      RAZON_SOCIAL: razonSocial,
      TELEFONO: telefono,
      SALDO_DOC: saldoDoc,
      FECHA_VENC: fechaVencDMY,
      FECHA_VENC_ISO: fechaVencISO,
      DIAS_VENCIDOS: diasVenc,
      MONTO_USD: montoUsd,
      PAGO: pago,
      TITULO_TRATO: `Factura ${docNum} - ${razonSocial}`,
    });
  }

  return output;
}

function loadExistingLeads(existingPath) {
  if (!existingPath) return [];
  const raw = fs.readFileSync(existingPath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.leads)) return parsed.leads;
  if (Array.isArray(parsed?._embedded?.leads)) return parsed._embedded.leads;
  throw new Error(`Formato no soportado para existing leads: ${existingPath}`);
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
  const doc = fieldVal(lead, CFG.fieldIds.documento);
  const ph = normalizePhone(fieldVal(lead, CFG.fieldIds.telefono));
  return String(doc).trim() === documento && ph === telefono;
}

function simulateUpsert(cleanRows, existingLeadsInput) {
  const allLeads = existingLeadsInput.map((lead) => JSON.parse(JSON.stringify(lead)));
  const results = [];
  let nextSyntheticId = 90000000000;
  if (allLeads.length) {
    nextSyntheticId = Math.max(
      nextSyntheticId,
      ...allLeads.map((lead) => Number(lead.id || 0)).filter((v) => Number.isFinite(v) && v > 0)
    ) + 1;
  }

  for (const row of cleanRows) {
    const documento = String(row.DOCUMENTO || "").trim();
    const telefono = normalizePhone(row.TELEFONO);
    if (!documento || !telefono) {
      results.push({
        ...row,
        upsert_status: "skipped",
        upsert_reason: "missing_documento_o_telefono",
      });
      continue;
    }

    const saldoDoc = toNumber(row.SALDO_DOC);
    if (saldoDoc <= 0) {
      results.push({
        ...row,
        upsert_status: "skipped",
        upsert_reason: "saldo_no_positivo",
        upsert_saldo_doc: saldoDoc,
      });
      continue;
    }

    const matches = allLeads.filter((lead) => exactLeadMatch(lead, documento, telefono));
    matches.sort((a, b) => leadMatchScore(b) - leadMatchScore(a));
    const existing = matches[0] || null;
    const duplicateMatches = matches.slice(1);
    const codVen = String(row.COD_VEN || "").trim();
    const rutaTag = codVen ? `Ruta ${codVen}` : "";
    const tagNames = rutaTag ? [CFG.tag, rutaTag] : [CFG.tag];

    let lead;
    let action;

    if (existing) {
      lead = existing;
      action = "updated";
      lead.name = row.TITULO_TRATO || `Factura ${documento} - ${row.RAZON_SOCIAL || "Cliente"}`;
      lead.price = Math.round(toNumber(row.SALDO_DOC));
      lead.updated_at = Math.floor(Date.now() / 1000);
      if (Number(lead.pipeline_id) !== Number(CFG.pipelineId)) {
        lead.pipeline_id = CFG.pipelineId;
        if (Number(CFG.initialStatusId) > 0) {
          lead.status_id = Number(CFG.initialStatusId);
        }
      }
      lead._embedded = lead._embedded || {};
      lead._embedded.tags = tagNames.map((name) => ({ name }));
      for (const field of cfPayload(row)) {
        const value = field.values?.[0]?.value ?? "";
        setField(lead, field.field_id, value);
      }
    } else {
      lead = {
        id: nextSyntheticId,
        name: row.TITULO_TRATO || `Factura ${documento} - ${row.RAZON_SOCIAL || "Cliente"}`,
        pipeline_id: CFG.pipelineId,
        status_id: Number(CFG.initialStatusId),
        responsible_user_id: 14811623,
        price: Math.round(toNumber(row.SALDO_DOC)),
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        custom_fields_values: [],
        _embedded: {
          tags: tagNames.map((name) => ({ name })),
        },
      };
      nextSyntheticId += 1;
      for (const field of cfPayload(row)) {
        const value = field.values?.[0]?.value ?? "";
        setField(lead, field.field_id, value);
      }
      allLeads.push(lead);
      action = "created";
    }

    results.push({
      ...row,
      lead_id: Number(lead.id),
      upsert_status: action,
      tag_applied: CFG.tag,
      ruta_tag_applied: rutaTag,
      duplicate_match_count: Number(duplicateMatches.length || 0),
      duplicate_match_ids: duplicateMatches.map((x) => Number(x.id || 0)).filter((v) => v > 0),
    });
  }

  return { allLeads, results };
}

function resolveLateStage(daysToDue, currentStatusId) {
  const late15StatusId = Number(CFG.statusIds.atrasado_15 || 0);
  const late10StatusId = Number(CFG.statusIds.atrasado_10 || 0);
  const overdueStatusId = Number(CFG.statusIds.atrasado || 0);
  const urgentStatusId = Number(CFG.statusIds.revision_urgente || 0);
  if (daysToDue <= -15 && late15StatusId > 0) return { stage: late15StatusId, label: "15D" };
  if (daysToDue <= -10 && late10StatusId > 0) return { stage: late10StatusId, label: "10D" };
  if (daysToDue <= -5 && overdueStatusId > 0) return { stage: overdueStatusId, label: "5D" };
  if (daysToDue <= -6 && urgentStatusId > 0) return { stage: urgentStatusId, label: "URGENT" };
  return { stage: currentStatusId, label: "" };
}

function readStatusPago(lead) {
  const enumId = fieldEnumId(lead, CFG.fieldIds.status_pago);
  if (enumId && enumId === Number(CFG.statusPagoEnums.pagado || 0)) return "pagado";
  if (enumId && enumId === Number(CFG.statusPagoEnums.abonado || 0)) return "abonado";
  if (enumId && enumId === Number(CFG.statusPagoEnums.no_pagado || 0)) return "no_pagado";
  const raw = normalizeText(fieldVal(lead, CFG.fieldIds.status_pago));
  if (!raw) return "";
  if (raw.includes("no pagado")) return "no_pagado";
  if (raw.includes("abonado")) return "abonado";
  if (raw.includes("pagado")) return "pagado";
  return "";
}

function simulateReminder(allLeads, inputRows, runDateIso, includeUnchanged) {
  const logs = [];
  const uploadDocs = new Set(inputRows.map((r) => String(r.DOCUMENTO || "").trim()).filter(Boolean));
  const uploadMode = uploadDocs.size > 0;

  const canonicalLeads = new Map();
  for (const lead of allLeads) {
    const tags = ((lead._embedded || {}).tags || []).map((t) => String(t.name || "").toLowerCase().trim());
    if (!tags.includes(String(CFG.tag).toLowerCase())) continue;
    if (Number(lead.pipeline_id) !== Number(CFG.pipelineId)) continue;
    if (Number(lead.status_id) === Number(CFG.paidStatusId)) continue;

    const keyDocumento = String(fieldVal(lead, CFG.fieldIds.documento) || "").trim();
    const keyTelefono = normalizePhone(fieldVal(lead, CFG.fieldIds.telefono));
    const dedupeKey = keyDocumento && keyTelefono ? `${keyDocumento}|${keyTelefono}` : `lead:${lead.id || ""}`;
    const prev = canonicalLeads.get(dedupeKey);
    const rank = Number(lead.updated_at || lead.created_at || lead.id || 0);
    const prevRank = prev ? Number(prev.updated_at || prev.created_at || prev.id || 0) : -1;
    if (!prev || rank >= prevRank) {
      canonicalLeads.set(dedupeKey, lead);
    }
  }

  for (const lead of canonicalLeads.values()) {
    const documento = String(fieldVal(lead, CFG.fieldIds.documento) || "").trim();
    if (uploadMode && !uploadDocs.has(documento)) continue;

    const saldo = Number(fieldVal(lead, CFG.fieldIds.saldo_pendiente) || 0);
    if (!(saldo > 0)) continue;

    const dueIso = parseDateAny(fieldVal(lead, CFG.fieldIds.fecha_venc_date) || fieldVal(lead, CFG.fieldIds.fecha_venc_text));
    if (!dueIso) continue;

    const currentStatusId = Number(lead.status_id || 0);
    const d = daysBetween(runDateIso, dueIso);
    const firstSent = fieldVal(lead, CFG.fieldIds.aviso_3d);
    const dueSent = fieldVal(lead, CFG.fieldIds.aviso_2d);
    const finalSent = fieldVal(lead, CFG.fieldIds.aviso_1d);
    const baseStatusId = Number(CFG.statusIds.entrada_inicial || CFG.statusIds.leads_importados || 0);
    const reviewStatusId = Number(CFG.statusIds.revisar_pago || 0);
    const abonoStatusId = Number(CFG.statusIds.abono || 0);
    const noPagadoStatusId = Number(CFG.statusIds.no_pagado || 0);
    const isInBaseStage = baseStatusId > 0 && currentStatusId === baseStatusId;
    const isInReviewStatus = reviewStatusId > 0 && currentStatusId === reviewStatusId;
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
      reminderType = "REVIEW_TO_ABONO";
      stageTarget = abonoStatusId > 0 ? abonoStatusId : currentStatusId;
    } else if (statusPagoDecision === "no_pagado") {
      reminderType = "REVIEW_TO_NOPAGADO";
      stageTarget = noPagadoStatusId > 0 ? noPagadoStatusId : currentStatusId;
    } else if (isInReviewStatus) {
      if (!includeUnchanged) continue;
    } else if (isInAbonoStage) {
      if (d <= 0 && d > -5) {
        reminderType = "ABONO_DEADLINE";
        stageTarget = Number(CFG.statusIds.deadline_abono || currentStatusId);
        reminderFieldId = !dueSent ? Number(CFG.fieldIds.aviso_2d || 0) : 0;
      } else if (d <= -5) {
        const late = resolveLateStage(d, currentStatusId);
        reminderType =
          late.label === "15D"
            ? "ABONO_LATE_15D"
            : late.label === "10D"
              ? "ABONO_LATE_10D"
              : late.label === "5D"
                ? "ABONO_LATE_5D"
                : "ABONO_URGENT";
        stageTarget = late.stage;
        reminderFieldId = !finalSent && late.label === "5D" ? Number(CFG.fieldIds.aviso_1d || 0) : 0;
      } else if (!includeUnchanged) {
        continue;
      }
    } else if (isInNoPagadoStage) {
      if (d <= 0 && d > -5) {
        reminderType = "NOPAGADO_DEADLINE";
        stageTarget = Number(CFG.statusIds.fecha_limite || currentStatusId);
        reminderFieldId = !dueSent ? Number(CFG.fieldIds.aviso_2d || 0) : 0;
      } else if (d <= -5) {
        const late = resolveLateStage(d, currentStatusId);
        reminderType =
          late.label === "15D"
            ? "NOPAGADO_LATE_15D"
            : late.label === "10D"
              ? "NOPAGADO_LATE_10D"
              : late.label === "5D"
                ? "NOPAGADO_LATE_5D"
                : "NOPAGADO_URGENT";
        stageTarget = late.stage;
        reminderFieldId = !finalSent && late.label === "5D" ? Number(CFG.fieldIds.aviso_1d || 0) : 0;
      } else if (!includeUnchanged) {
        continue;
      }
    } else if (d === 5 && (!firstSent || isInBaseStage)) {
      reminderType = "5D";
      stageTarget = Number(CFG.statusIds.recordatorio_enviado || currentStatusId);
      reminderFieldId = firstSent ? 0 : Number(CFG.fieldIds.aviso_3d || 0);
    } else if (d <= 0 && d > -5 && (!dueSent || isInBaseStage)) {
      reminderType = "DUE";
      stageTarget = Number(CFG.statusIds.fecha_limite || currentStatusId);
      reminderFieldId = d === 0 && !dueSent ? Number(CFG.fieldIds.aviso_2d || 0) : 0;
    } else if (d <= -5 && (!finalSent || isInBaseStage)) {
      const late = resolveLateStage(d, currentStatusId);
      reminderType =
        late.label === "15D"
          ? "LATE_15D"
          : late.label === "10D"
            ? "LATE_10D"
            : late.label === "5D"
              ? "LATE_5D"
              : "URGENT";
      stageTarget = late.stage;
      reminderFieldId = !finalSent && late.label === "5D" ? Number(CFG.fieldIds.aviso_1d || 0) : 0;
    } else if (!includeUnchanged) {
      continue;
    }

    const markFieldName =
      reminderFieldId === Number(CFG.fieldIds.aviso_3d)
        ? "aviso_3d"
        : reminderFieldId === Number(CFG.fieldIds.aviso_2d)
          ? "aviso_2d"
          : reminderFieldId === Number(CFG.fieldIds.aviso_1d)
            ? "aviso_1d"
            : "";

    logs.push({
      lead_id: Number(lead.id),
      documento,
      razon_social: fieldVal(lead, CFG.fieldIds.razon_social),
      telefono: fieldVal(lead, CFG.fieldIds.telefono),
      saldo_pendiente: saldo,
      fecha_venc_iso: dueIso,
      current_status_id: currentStatusId,
      current_status_name: stageName(currentStatusId),
      days_to_due: d,
      reminder_type: reminderType || "UNCHANGED",
      stage_target: Number(stageTarget || 0),
      stage_target_name: stageName(stageTarget || currentStatusId),
      reminder_field_id: reminderFieldId,
      reminder_field_name: markFieldName,
      would_move_stage: Number(stageTarget || 0) !== currentStatusId,
    });
  }

  logs.sort((a, b) => {
    const byStage = String(a.stage_target_name).localeCompare(String(b.stage_target_name));
    if (byStage !== 0) return byStage;
    return String(a.documento).localeCompare(String(b.documento));
  });

  return logs;
}

function summarize(logs) {
  const byType = {};
  const byStage = {};
  for (const row of logs) {
    byType[row.reminder_type] = (byType[row.reminder_type] || 0) + 1;
    const key = `${row.stage_target}|${row.stage_target_name}`;
    byStage[key] = (byStage[key] || 0) + 1;
  }
  return { byType, byStage };
}

function toCsv(rows) {
  const headers = [
    "documento",
    "razon_social",
    "telefono",
    "saldo_pendiente",
    "fecha_venc_iso",
    "days_to_due",
    "current_status_name",
    "reminder_type",
    "stage_target_name",
    "reminder_field_name",
  ];
  const escape = (value) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  return [headers.join(",")]
    .concat(rows.map((row) => headers.map((h) => escape(row[h])).join(",")))
    .join("\n");
}

function defaultOutPath(prefix, dateIso, ext) {
  return path.resolve(process.cwd(), `${prefix}_${dateIso}.${ext}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const runDateIso = todayIso(CFG.timezone, options.date);
  const sourceRows = readWorkbookRows(options.excelPath);
  const cleanRows = limpiarDatos(sourceRows);
  const existingLeads = loadExistingLeads(options.existingPath);
  const { allLeads, results: upsertRows } = simulateUpsert(cleanRows, existingLeads);
  const validUploadRows = upsertRows.filter((row) => row.upsert_status === "created" || row.upsert_status === "updated");
  const logs = simulateReminder(allLeads, validUploadRows, runDateIso, options.includeUnchanged);
  const summary = summarize(logs);

  const jsonOut = options.jsonOut || defaultOutPath("simulacion_drive_upload", runDateIso, "json");
  const csvOut = options.csvOut || defaultOutPath("simulacion_drive_upload", runDateIso, "csv");

  const payload = {
    run_date_iso: runDateIso,
    timezone: CFG.timezone,
    excel_path: path.resolve(options.excelPath),
    existing_leads_path: options.existingPath ? path.resolve(options.existingPath) : null,
    assumptions: {
      local_only: true,
      sends_nothing: true,
      touches_nothing_in_n8n: true,
      touches_nothing_in_kommo: true,
      kommo_empty_assumed: !options.existingPath,
    },
    counts: {
      source_rows: sourceRows.length,
      clean_rows: cleanRows.length,
      upsert_created: upsertRows.filter((x) => x.upsert_status === "created").length,
      upsert_updated: upsertRows.filter((x) => x.upsert_status === "updated").length,
      upsert_skipped: upsertRows.filter((x) => x.upsert_status === "skipped").length,
      reminder_moves: logs.length,
    },
    summary,
    reminder_logs: logs,
    skipped_upserts: upsertRows.filter((x) => x.upsert_status === "skipped"),
  };

  fs.writeFileSync(jsonOut, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(csvOut, toCsv(logs), "utf8");

  console.log(`Fecha simulada: ${runDateIso}`);
  console.log(`Excel: ${path.resolve(options.excelPath)}`);
  console.log(`Kommo vacío asumido: ${options.existingPath ? "no" : "sí"}`);
  console.log(`Filas fuente: ${sourceRows.length}`);
  console.log(`Filas limpias: ${cleanRows.length}`);
  console.log(`Upsert creados: ${payload.counts.upsert_created}`);
  console.log(`Upsert actualizados: ${payload.counts.upsert_updated}`);
  console.log(`Upsert omitidos: ${payload.counts.upsert_skipped}`);
  console.log(`Leads movidos por Reminder Engine: ${payload.counts.reminder_moves}`);
  console.log("");
  console.log("Resumen por regla:");
  Object.entries(summary.byType)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, count]) => {
      console.log(`- ${key}: ${count}`);
    });
  console.log("");
  console.log("Resumen por etapa destino:");
  Object.entries(summary.byStage)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, count]) => {
      const [, name] = key.split("|");
      console.log(`- ${name}: ${count}`);
    });
  console.log("");
  console.log(`JSON: ${jsonOut}`);
  console.log(`CSV: ${csvOut}`);
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
