const items = $input.all();
const output = [];

function pad2(n) {
  return String(n).padStart(2, "0");
}

// ── Parsear fecha DD/MM/YYYY → ISO (YYYY-MM-DD) ──
function parseDMY(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // Si ya es ISO, devolver directamente
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Formato DD/MM/YYYY o DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return "";
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  let yy = Number(m[3]);
  if (yy < 100) yy = yy >= 70 ? 1900 + yy : 2000 + yy;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  // Validar que la fecha es real (ej: 30/02 no existe)
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== (mm - 1) || dt.getUTCDate() !== dd) return "";
  return String(yy) + "-" + pad2(mm) + "-" + pad2(dd);
}

// ── Convertir ISO → DD/MM/YYYY para campo texto ──
function isoToDMY(iso) {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const p = s.split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

// ── Detectar si fecha de recepción es inválida (00-0000 etc.) ──
function esRecepcionInvalida(raw) {
  const s = String(raw || "").trim();
  if (!s) return true;
  // Cubre: "0", "00-0000", "00-00-00", "00/0000", "0-0", "00-00", etc.
  if (/^0{1,2}[-\/]?0{0,4}[-\/]?0{0,2}$/.test(s)) return true;
  return false;
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

for (const item of items) {
  const row = item.json;

  // ── Validar documento ──
  const documento = pick(row, ["DOCUMENTO", "Documento"]);
  if (!documento) continue;

  const docNum = parseInt(documento, 10);
  if (Number.isNaN(docNum)) continue;

  // ── CAMBIO 1: Filtrar por fecha de recepción ──
  // Si FECHA RECEPCION es "00-0000" o similar, ignorar esta fila.
  const rawRecepcion = pick(row, ["FECHA RECEPCION", "FECHA_RECEPCION", "Fecha Recepcion"]);
  if (esRecepcionInvalida(rawRecepcion)) continue;

  const telefono = normalizeMxPhone(pick(row, ["TELEFONO1", "TELEFONO", "Telefono"]));
  const razonSocial = String(pick(row, ["RAZON SOCIAL", "RAZON_SOCIAL", "Razon Social"]) || "Desconocido").trim();
  const vendedor = String(pick(row, ["VENDEDOR"]) || "").trim();
  const codVenRaw = String(pick(row, ["COD VEN", "COD_VEN", "Cod Ven"]) || "").trim();
  const codVen = codVenRaw.replace(/[^0-9]/g, "");

  const saldoDoc = parseFloat(String(pick(row, ["SALDO", "Saldo", "saldo"]) || "0").replace(/,/g, "")) || 0;
  const montoUsd = parseFloat(String(pick(row, ["MONTO USD", "MONTO_USD", "Monto USD"]) || "0").replace(/,/g, "")) || 0;
  const pago = parseFloat(String(pick(row, ["PAGO", "PAGO_1", "Pago"]) || "0").replace(/,/g, "")) || 0;
  const diasVenc = parseInt(String(pick(row, ["DIAS VENCIDOS", "DIAS_VENCIDOS", "Dias Vencidos"]) || "0"), 10) || 0;

  // ── CAMBIO 2: Fecha Vencimiento siempre DD/MM/YYYY ──
  const rawFechaVenc = pick(row, ["FECHA VENC", "FECHA_VENC", "Fecha Venc"]);
  const fechaVencISO = parseDMY(rawFechaVenc);
  const fechaVencDMY = isoToDMY(fechaVencISO) || String(rawFechaVenc || "").trim();

  output.push({
    json: {
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
      TITULO_TRATO: "Factura " + String(docNum) + " - " + razonSocial,
    },
  });
}

return output;
