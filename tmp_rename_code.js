const rows = $input.all().map(i => i.json || {});
return rows.map(r => ({ json: {
  'Documento / Factura': r.DOCUMENTO,
  'Razon Social':        r.RAZON_SOCIAL,
  'Telefono':            r.TELEFONO,
  'Fecha Vencimiento':   r.FECHA_VENCIMIENTO,
  'Saldo Original':      r.SALDO_ORIGINAL,
  'Pago Acumulado':      r.PAGO_ACUMULADO,
  'Saldo Pendiente':     r.SALDO_PENDIENTE,
  'Fecha Ultimo Abono':  r.FECHA_ULTIMO_ABONO,
  'Fecha Pago':          r.FECHA_PAGO,
  'Estatus Pago':        r.STATUS_PAGO,
  'Lead ID':             r.LEAD_ID,
}}));
