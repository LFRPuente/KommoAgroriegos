# Demo Cobranza Automatizada — Instrucciones

**Fecha:** 2026-04-02  
**Duración estimada:** 10–15 minutos  
**Archivo Excel:** `DEMO_Cobranza_2026-04-01.xlsx`

---

## Resumen de los 4 escenarios

| Color | Doc | Lead | Situación | Resultado esperado |
|-------|-----|------|-----------|-------------------|
| 🟠 | 10001 | Empresa Demo A | Vence el **6 abr** (d=5) | Auto → **Recordatorio 5 Dias** + WhatsApp |
| 🔴 | 10002 | Distribuidora Demo B | Venció el **31 mar** (d=-1) — **No pagó** | Manual → **Deadline** + WhatsApp |
| 🔵 | 10004 | Abastecedora Demo D | Venció el **31 mar** (d=-1) — **Abonó** $4,000 de $10,000 | Manual → **Deadline - Abono** + WhatsApp |
| 🟡 | 10005 | Proveedora Demo E | Vence el **9 abr** (d=8) — **No pagó** (aún no vence) | Manual → **No Pagado** (se queda ahí hasta que venza) |
| 🟢 | 10003 | Comercial Demo C | **Pagó completo** | Manual → **Pagado** |

Todos los mensajes llegan al número **+52 917 158 8969**.

---

## Paso 1 — Subir el Excel a Google Drive

1. Abre Google Drive → carpeta **"pruebakommo"**
2. Sube `DEMO_Cobranza_2026-04-01.xlsx`

> n8n lo detecta y ejecuta automáticamente en ~1 minuto.

---

## Paso 2 — Ver los leads creados en Kommo

1. Abre Kommo → Pipeline de **Cobranza**
2. Aparecen **5 tarjetas** en la etapa inicial ("leads importados"):
   - Factura 10001 - Empresa Demo A SA de CV
   - Factura 10002 - Distribuidora Demo B
   - Factura 10003 - Comercial Demo C SC
   - Factura 10004 - Abastecedora Demo D SA
   - Factura 10005 - Proveedora Demo E SC

---

## Paso 3 — Recordatorio automático (Doc 10001)

El lead 10001 vence en 5 días → al correr el cron el sistema lo mueve a **"Recordatorio 5 Dias"** y envía un WhatsApp automático.

1. Ve a `https://n8n.srv1388533.hstgr.cloud` → workflow **"Kommo Cuentas por Cobrar"**
2. Click en el nodo **"Cron Cobranza 09:00"** → **"Execute node"**
3. Muestra en Kommo cómo el lead 10001 se movió a **"Recordatorio 5 Dias"**
4. Muestra el WhatsApp recibido en **+52 917 158 8969**

> El Excel solo crea los leads. El cron es quien analiza fechas y mueve etapas.

---

## Paso 4 — Simular validación de pagos (preparar antes del segundo cron)

En producción, cuando un cliente manda un comprobante, el AI Agent lo detecta y mueve el lead a **"Revisar Pago"** automáticamente. En la demo lo haremos manual para cada lead:

### Doc 10002 — Distribuidora Demo B (No pagó)
1. Abre el lead en Kommo
2. Campo **"Estatus Pago"** → **"No Pagado"**
3. Arrastra el lead a la etapa **"Revisar Pago"**

### Doc 10004 — Abastecedora Demo D (Abonó $4,000 de $10,000)
1. Abre el lead en Kommo
2. Campo **"Estatus Pago"** → **"Abonado"**
3. Arrastra el lead a la etapa **"Revisar Pago"**

### Doc 10005 — Proveedora Demo E (No pagó, aún no ha vencido)
1. Abre el lead en Kommo
2. Campo **"Estatus Pago"** → **"No Pagado"**
3. Arrastra el lead a la etapa **"Revisar Pago"**

### Doc 10003 — Comercial Demo C (Pagó completo)
1. Abre el lead en Kommo
2. Campo **"Estatus Pago"** → **"Pagado"**
3. Arrastra el lead a la etapa **"Revisar Pago"**

---

## Paso 5 — Ejecutar el cron por segunda vez (en vivo frente al cliente)

1. Ve a `https://n8n.srv1388533.hstgr.cloud`
2. Abre el workflow **"Kommo Cuentas por Cobrar"**
3. Click en el nodo **"Cron Cobranza 09:00"** → **"Execute node"**

El sistema procesa los leads en "Revisar Pago":

| Lead | Estatus Pago | Resultado |
|------|-------------|-----------|
| 10002 — Distribuidora Demo B | No Pagado | → **Deadline** + WhatsApp enviado |
| 10004 — Abastecedora Demo D | Abonado | → **Deadline - Abono** + WhatsApp enviado |
| 10005 — Proveedora Demo E | No Pagado | → **No Pagado** (se queda, aún no vence) |
| 10003 — Comercial Demo C | Pagado | → **Pagado** (sin mensaje) |

4. Muestra en Kommo cómo cada lead se movió a su etapa correcta
5. Muestra los WhatsApp recibidos para 10002 y 10004

---

## Paso 6 — Mostrar el AI Agent respondiendo (opcional)

Desde el WhatsApp que recibió los mensajes, responde algo como:
- *"¿Cuánto debo exactamente?"*
- *"Voy a pagar la próxima semana"*
- *"Aquí te mando mi comprobante"* (adjunta imagen)

En pocos segundos llega la respuesta automática del AI Agent. En Kommo puedes ver la conversación en el chat del lead.

---

## Limpieza después de la demo

Elimina los 5 leads de prueba en Kommo:
- Busca por documento: 10001, 10002, 10003, 10004, 10005
- Muévelos a "Venta Perdido" o elimínalos manualmente

---

## Troubleshooting rápido

| Problema | Solución |
|----------|----------|
| Los leads no aparecen en Kommo | Ve a n8n → ejecuta manualmente el workflow |
| No llegó el WhatsApp de recordatorio | Verifica que el Salesbot "Mandar 1er recordatorio" esté activo en Kommo → Configuración → Salespots |
| El cron no movió los leads | Verifica que los leads estén en etapa **"Revisar Pago"** con Estatus Pago configurado |
| El AI Agent no responde | Verifica que el nodo "Webhook Cobranza" esté activo (en verde) en n8n |
