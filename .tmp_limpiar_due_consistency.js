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
  const parts = s.split("-");
  return parts[1] + "/" + parts[2] + "/" + parts[0];
}

function excelSerialToIso(serial) {
  const num = Number(serial);
  if (!Number.isFinite(num) || num < 1000) return "";
  const utcDays = Math.floor(num - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  return y + "-" + m + "-" + d;
}

function parseUsSlashDate(str) {
  const m = String(str || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let mm = Number(m[1]);
  let dd = Number(m[2]);
  let yy = Number(m[3]);
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yy)) return null;
  if (yy < 100) yy = yy >= 70 ? 1900 + yy : 2000 + yy;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return { yyyy: String(yy), mm: pad2(mm), dd: pad2(dd) };
}

function dateTextToIso(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const us = parseUsSlashDate(str);
  if (us) return us.yyyy + "-" + us.mm + "-" + us.dd;
  const asNum = Number(str);
  if (Number.isFinite(asNum)) return excelSerialToIso(asNum);
  return "";
}

function dueIsoFromDiasVencidos(diasVencidos, todayIso) {
  if (!Number.isFinite(diasVencidos)) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(todayIso || ""))) return "";
  const base = new Date(todayIso + "T00:00:00Z");
  base.setUTCDate(base.getUTCDate() - diasVencidos);
  const y = base.getUTCFullYear();
  const m = pad2(base.getUTCMonth() + 1);
  const d = pad2(base.getUTCDate());
  return y + "-" + m + "-" + d;
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

  const diasRaw = String(pick(row, ["DIAS VENCIDOS", "DIAS_VENCIDOS", "Dias Vencidos"]) || "").trim();
  const diasParsed = Number.parseInt(diasRaw, 10);
  const diasVenc = Number.isFinite(diasParsed) ? diasParsed : 0;

  // Source of truth: DIAS VENCIDOS
  let fechaVencISO = Number.isFinite(diasParsed) ? dueIsoFromDiasVencidos(diasParsed, todayIso) : "";

  // Fallback only if DIAS VENCIDOS is missing/unusable
  if (!fechaVencISO) {
    fechaVencISO = dateTextToIso(pick(row, ["FECHA VENC", "FECHA_VENC", "Fecha Venc"]));
  }

  const fechaVencUS = isoToUS(fechaVencISO) || String(pick(row, ["FECHA VENC", "FECHA_VENC", "Fecha Venc"]) || "").trim();

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