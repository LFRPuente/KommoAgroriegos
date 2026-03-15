# Project Context

## Purpose
This project automates collections (`cobranza`) from Excel files in Google Drive into Kommo using n8n.

Primary goals:
- Read a specific Excel format from Google Drive.
- Upsert leads in Kommo by `DOCUMENTO + TELEFONO`.
- Move leads through the Agroriegos pipeline based on due date and payment state.
- Listen to chat responses and detect payments/receipts automatically.

## Current Production Workflow
- Main ingest workflow: `Kommo Cuentas por Cobrar (Ingesta vía HTTP)`
- n8n workflow id: `gfJm4JUoiUi7zZgaB2ob0`
- Google Drive trigger:
  - folder: `pruebakommo`
  - folder id: `1QFbTelTwH9M9_Sl-1F17KkiTgv9CqGl2`
  - event: `fileCreated`
  - polling: every minute

## Kommo Scope
- Account: `eduardonolasco18.kommo.com`
- Pipeline: `Alfredo - Agroriegos`
- Pipeline id: `13256923`

Stages:
- `Leads entrantes`: `102225711`
- `Entrada inicial`: `102372207`
- `Recordatorio enviado`: `102225715`
- `Pagado`: `102225739`
- `Pago parcial`: `102226103`
- `Fecha limite`: `102309531`
- `Atrasado`: `102308999`

## Kommo Lead Custom Fields
- `Documento/Factura`: `1858660`
- `Telefono Cliente`: `1858664`
- `Fecha Vencimiento (texto)`: `1858666`
- `Saldo Pendiente`: `1858672`
- `Pago Realizado`: `1858674`
- `Razon Social`: `1858676`
- `Fecha Vencimiento (date)`: `1859896`
- `Cobranza Aviso 3D Enviado`: `1860878`
- `Cobranza Aviso 2D Enviado`: `1860880`
- `Cobranza Aviso 1D Enviado`: `1860882`
- `Cobranza Ultimo Recibo Hash`: `1860884`
- `Cobranza Ultimo Abono`: `1860886`

## Current Business Logic

### Excel Ingest
- The workflow reads the uploaded Excel and normalizes only the relevant columns.
- Leads are matched by:
  - `DOCUMENTO`
  - normalized `TELEFONO`
- If lead exists:
  - update lead fields
  - update contact/link if needed
- If lead does not exist:
  - create lead
  - create or reuse contact
  - link contact to lead

### Phone Normalization
- Current normalization assumes Mexican mobile format for local 10-digit numbers.
- Rules:
  - `10 digits` -> `521XXXXXXXXXX`
  - `52XXXXXXXXXX` -> `521XXXXXXXXXX`
  - `521XXXXXXXXXX` -> unchanged
- Result:
  - lead field stores digits only, e.g. `5219932508575`
  - contact phone stores `+5219932508575`

### Reminders
- n8n does not send the outbound reminder message directly.
- n8n moves the lead to the correct stage and marks reminder control fields.
- Kommo/Salesbot is expected to send the message when the lead enters the reminder stage.

Reminder timing currently implemented in the main ingest/reminder engine:
- `5 days before due date` on file upload -> move to `Recordatorio enviado`
- `due date` and overdue transitions are handled by the reminder logic and stage mapping

### Chat / Payment Detection
- Webhook path in the workflow: `kommo-cobranza`
- The workflow listens to Kommo chat events for cobranza leads.
- Payment detection uses OpenAI `gpt-5-nano` for:
  - text messages
  - images
  - PDFs
- It can:
  - classify whether the message is a payment/abono
  - extract amount
  - update `Pago Realizado`
  - update `Saldo Pendiente`
  - write notes/tasks
  - move to `Pago parcial` or `Pagado`

## Excel Format Requirement
- The workflow expects the real Excel structure, not an invented workbook.
- Important facts about the accepted format:
  - sheet name seen in tests: `Hoja1`
  - row 1: blank
  - row 2: blank
  - row 3: real headers
  - the original workbook contains many more columns than the logic uses
- Header row starts at row 3 with columns like:
  - `VENDEDOR`
  - `COD VEN`
  - `COD CLI`
  - `RAZON SOCIAL`
  - `TELEFONO1`
  - `DOCUMENTO`
  - `FECHA VENC`
  - `MONTO USD`
  - `SALDO DOC`
  - `PAGO`

Only some columns are used by the logic, but the file should still keep the original workbook layout.

### Preferred Template for Tests
Use this file as the physical template when creating new test uploads:
- `C:\Users\luis_\Downloads\prueba5dias (1).xlsx`

Do not rebuild the workbook from scratch unless the parser is updated too.

## Files That Matter Most
- [Documento_Diseno_n8n.md](C:\Users\luis_\Desktop\newkommoproject\Documento_Diseno_n8n.md)
- [deploy_cobranza_plan.py](C:\Users\luis_\Desktop\newkommoproject\deploy_cobranza_plan.py)
- [deploy_cobranza_summary.json](C:\Users\luis_\Desktop\newkommoproject\deploy_cobranza_summary.json)
- [workflow_n8n_kommo_actualizado.json](C:\Users\luis_\Desktop\newkommoproject\workflow_n8n_kommo_actualizado.json)
- [workflow_cobranza_recordatorios.json](C:\Users\luis_\Desktop\newkommoproject\workflow_cobranza_recordatorios.json)
- [workflow_kommo_chat_cobranza.json](C:\Users\luis_\Desktop\newkommoproject\workflow_kommo_chat_cobranza.json)
- [diagrama_arquitectura.png](C:\Users\luis_\Desktop\newkommoproject\diagrama_arquitectura.png)
- [diagrama_vencimiento.png](C:\Users\luis_\Desktop\newkommoproject\diagrama_vencimiento.png)
- [diagrama_pagos.png](C:\Users\luis_\Desktop\newkommoproject\diagrama_pagos.png)

## Known Operational Notes
- The project contains exported workflows and design artifacts; local files are used as source-of-truth snapshots.
- Some JSON workflow exports contain embedded secrets/tokens from prior testing. Do not reuse or share them blindly.
- If this project is shared externally, rotate exposed credentials first.

## Recommended AI Reading Order
1. `CONTEXT.md`
2. `deploy_cobranza_summary.json`
3. `Documento_Diseno_n8n.md`
4. `workflow_n8n_kommo_actualizado.json`

## Last Validated State
- Main ingest workflow was redeployed with MX phone normalization.
- Confirmed test result after redeploy:
  - `LUIS FERNANDO RICARDEZ PUENTE` with local phone `9932508575` becomes `5219932508575`
  - `VICTOR RODOLFO` with local phone `9171176637` becomes `5219171176637`
