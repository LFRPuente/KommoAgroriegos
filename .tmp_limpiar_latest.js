const items = $input.all();
const output = [];
const TZ = "America/Mexico_City";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayIsoInTz(tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? y + "-" + m + "-" + d : "";
}

function isoToUS(iso) {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const p = s.split("-");
  return p[1] + "/" + p[2] + "/" + p[0];
}

function isoFromYMD(y, m, d) {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return "";
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== (mm - 1) || dt.getUTCDate() !== dd) return "";
  return String(yy) + "-" + pad2(mm) + "-" + pad2(dd);
}

function excelSerialToIso(serial) {
  const num = Number(serial);
  if (!Number.isFinite(num) || num < 1000) return "";
  const utcDays = Math.floor(num - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return String(date.getUTCFullYear()) + "-" + pad2(date.getUTCMonth() + 1) + "-" + pad2(date.getUTCDate());
}

function parseSlashParts(str) {
  const m = String(str || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let a = Number(m[1]);
  let b = Number(m[2]);
  let y = Number(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(y)) return null;
  if (y < 100) y = y >= 70 ? 1900 + y : 2000 + y;
  return { a, b, y };
}

function parseFechaCandidates(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  const out = [];

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) out.push(s);

  const p = parseSlashParts(s);
  if (p) {
    const mdy = isoFromYMD(p.y, p.a, p.b); // MM/DD/YYYY
    const dmy = isoFromYMD(p.y, p.b, p.a); // DD/MM/YYYY
    if (mdy) out.push(mdy);
    if (dmy) out.push(dmy);
  }

  const asNum = Number(s);
  if (Number.isFinite(asNum)) {
    const iso = excelSerialToIso(asNum);
    if (iso) out.push(iso);
  }

  return Array.from(new Set(out));
}

function daysBetween(aIso, bIso) {
  const a = new Date(aIso + "T00:00:00Z");
  const b = new Date(bIso + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function dueIsoFromDiasVencidos(dias, todayIso) {
  if (!Number.isFinite(dias)) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(todayIso || ""))) return "";
  const base = new Date(todayIso + "T00:00:00Z");
  base.setUTCDate(base.getUTCDate() - dias);
  return String(base.getUTCFullYear()) + "-" + pad2(base.getUTCMonth() + 1) + "-" + pad2(base.getUTCDate());
}

function pickBestFechaIso(rawFecha, diasVencidos, todayIso) {
  const candidates = parseFechaCandidates(rawFecha);
  if (!candidates.length) return "";

  const expected = dueIsoFromDiasVencidos(diasVencidos, todayIso);
  if (!expected) return candidates[0];

  let best = candidates[0];
  let bestErr = Math.abs(daysBetween(best, expected));
  for (let i = 1; i < candidates.length; i += 1) {
    const c = candidates[i];
    const err = Math.abs(daysBetween(c, expected));
    if (err < bestErr) {
      best = c;
      bestErr = err;
    }
  }
  return best;
}

function normalizeMxPhone(value) {
  const digits = String(value || "").replace(/[^0-9]/g, "").trim();
  if (!digits) return "";
  if (digits.length === 10) return "521" + digits;
  if (digits.length === 12 && digits.startsWith("52")) return "521" + digits.slice(2);
  if (digits.length === 13 && digits.startsWith("521")) return digits;
  return digits;
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
  }
  return "";
}

const todayIso = todayIsoInTz(TZ);

for (const item of items) {
  const row = item.json;

  const documento = pick(row, ["DOCUMENTO", "Documento"]);
  if (!documento) continue;

  const docNum = parseInt(documento, 10);
  if (Number.isNaN(docNum)) continue;

  const telefono = normalizeMxPhone(pick(row, ["TELEFONO1", "TELEFONO", "Telefono"]));
  const razonSocial = String(pick(row, ["RAZON SOCIAL", "RAZON_SOCIAL", "Razon Social"]) || "Desconocido").trim();
  const vendedor = String(pick(row, ["VENDEDOR"]) || "").trim();
  const codVenRaw = String(pick(row, ["COD VEN", "COD_VEN", "Cod Ven"]) || "").trim();
  const codVen = codVenRaw.replace(/[^0-9]/g, "");

  const saldoDoc = parseFloat(String(pick(row, ["SALDO", "Saldo", "saldo"]) || "0").replace(/,/g, "")) || 0;
  const montoUsd = parseFloat(String(pick(row, ["MONTO USD", "MONTO_USD", "Monto USD"]) || "0").replace(/,/g, "")) || 0;
  const pago = parseFloat(String(pick(row, ["PAGO", "PAGO_1", "Pago"]) || "0").replace(/,/g, "")) || 0;
  const diasVenc = parseInt(String(pick(row, ["DIAS VENCIDOS", "DIAS_VENCIDOS", "Dias Vencidos"]) || "0"), 10) || 0;

  const rawFechaVenc = pick(row, ["FECHA VENC", "FECHA_VENC", "Fecha Venc"]);
  const fechaVencISO = pickBestFechaIso(rawFechaVenc, diasVenc, todayIso);
  const fechaVencUS = isoToUS(fechaVencISO) || String(rawFechaVenc || "").trim();

  output.push({
    json: {
      VENDEDOR: vendedor,
      COD_VEN: codVen,
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