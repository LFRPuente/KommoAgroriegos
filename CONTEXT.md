# Project Context

# Kommo Cobranza Automation

This document tracks the current state, keys, IDs, and quirks of the automated n8n + Kommo CRM workflow for managing collections via WhatsApp.

## Account Migration History

| Date | From Account | To Account | Reason |
|------|-------------|------------|--------|
| ~Mar 10, 2026 | `eduardonolasco18.kommo.com` | `agroriegosventas.kommo.com` | Initial client migration |
| Mar 24-25, 2026 | `agroriegosventas.kommo.com` | `agroriegoscorp.kommo.com` | Final production account |

The migration to `agroriegoscorp` required updating ALL IDs (pipeline, stages, custom fields, contact fields, salesbot, templates) across all three n8n workflows.

## Environment and Credentials

- **Local Credentials:** Found in `c:\Users\luis_\Desktop\newkommoproject\.env` (.env file, not tracked in git).
- n8n base: `https://n8n.srv1388533.hstgr.cloud`
- n8n API key: stored in `.env` as `N8N_API_KEY`
- n8n Webhook Endpoint (ingest): `https://n8n.srv1388533.hstgr.cloud/webhook/kommo-cobranza`
- n8n Webhook Endpoint (chat): `https://n8n.srv1388533.hstgr.cloud/webhook/kommo`
- n8n Webhook Endpoint (drive debug): `https://n8n.srv1388533.hstgr.cloud/webhook/codex-drive-debug-39516d57`
- Google Drive watched folder: `pruebakommo`
- Google Drive folder id: `1QFbTelTwH9M_Sl-1F17KkiTgv9CqGl2`
- Google Drive event: `fileCreated`
- Google Drive polling: every minute

### n8n Workflow IDs

| Workflow | ID | Purpose |
|----------|-----|---------|
| Kommo Cuentas por Cobrar (Ingesta vía HTTP) | `gfJm4JUoiUi7zZgaB2ob0` | Excel ingest, lead upsert, inbound chat/receipt processing |
| Kommo Cobranzas - Recordatorios Diario | `PRCdA1axuyZ9SMyf` | Daily cron for reminder stage movements |
| kommon8ndemo | `TDiINdgzi1YIiIZlwX0zG` | Inbound WhatsApp chat webhook |
| Codex Drive Upload Debug | `Xh4aTDrKmenx7DZ3` | Test helper for uploading Excel via API |

## Kommo Account (`agroriegoscorp`)

- **Account URL:** `agroriegoscorp.kommo.com`
- **Account ID:** `36248787`
- **Previous accounts (deprecated):** `agroriegosventas.kommo.com` (account_id=36115331), `eduardonolasco18.kommo.com`
- **Kommo API Token:** Embedded directly in n8n Code nodes (see Credential Locations below). Long-lived token, expires ~2030.
- **Collections pipeline id:** `13403731` (Embudo de ventas)
- **Collections tag:** `cobranza_n8n_excel`

### Current Live Stage IDs (Pipeline `13403731`)

| Stage | ID |
|-------|-----|
| Leads entrantes | `103388963` |
| Leads importados | `103388967` |
| recordatorio 5 dias | `103388971` |
| abono | `103610175` |
| No pagado | `103611443` |
| deadline | `103388975` |
| deadline - abono | `103610171` |
| 5 dias atrasado | `103388979` |
| revision urgente | `103429431` |
| revisar pago | `103429435` |
| pagado | `103429439` |
| cerrada / Logrado con éxito | `142` |

### Current Live Lead Custom Field IDs

| Field Name | Field ID | Type |
|------------|----------|------|
| Documento/Factura | `3272952` | text |
| fecha de Vencimiento | `3272954` | **date** (requires ISO format `Y-m-dTH:i:sP`) |
| Saldo Pendiente | `3272956` | **text** (send as String, not Number) |
| Telefono Cliente | `3281414` | text |
| Pago Realizado | `3281416` | **text** (send as String, not Number) |
| Razon Social | `3281418` | text |
| Cobranza Ultimo Recibo Hash | `3281420` | text |
| Cobranza Ultimo Abono | `3281422` | text |
| Respuesta IA | `3281424` | text |
| Fecha Vencimiento (texto) | `3281430` | text |
| Status pago | `3281432` | select |
| Aviso 3d | `3282254` | text |
| Aviso 2d | `3282256` | text |
| Aviso 1d | `3282258` | text |
| Fecha Abono | `3293960` | date |

**IMPORTANT type quirks in `agroriegoscorp`:**
- `Saldo Pendiente` and `Pago Realizado` are type **text**, so values MUST be sent as `String(value)`, not as raw numbers. Sending a Number will cause `400 InvalidType`.
- `fecha de Vencimiento` is type **date** and requires ISO 8601 format like `"2026-03-30T06:00:00+00:00"`. Sending a Unix timestamp as a string causes `400 InvalidDateFormat`. Sending a Unix timestamp as a number (integer) works. Sending null causes `400 NotNullable` — if the date is empty, do NOT include the field at all.

### Current Live Contact Custom Field IDs

| Field Name | Field ID | Type |
|------------|----------|------|
| Teléfono | `3270024` | multitext |
| Email | `3270026` | multitext |
| Posición | `3270022` | text |
| Respuesta IA | `3273856` | text |

### Status Pago Enums

- Field: `Status pago`
- Field id: `3281432`
- Enum `Pagado`: `8030168`
- Enum `Abonado`: `8030170`
- Enum `No Pagado`: `8030172`

## WhatsApp Templates and Salesbot

- First reminder template ID: `22296`
- Test template id: `22298`
- Salesbot for conversational replies: **ID `38308`**
  - Uses field `Respuesta IA` (ID `3281424`)
  - Salesbot config must reference `{{lead.cf.3281424}}` (NOT the old `2383804`)
  - Previous salesbot IDs from old accounts: `31998` (agroriegosventas), `25756` (eduardonolasco18)
- Salesbot for `deadline - abono` stage: **ID `39734`**
  - Template: `Cobranza con Abono` (WABA ID `891921103630372`)
  - Triggered automatically by Kommo automation when lead enters `deadline - abono`
  - Variables: `{{contact.name}}`, `{{lead.cf.3272952}}`, `{{lead.price}}`, `{{lead.cf.3281422}}`, `{{lead.cf.3293960}}`, `{{lead.cf.3272956}}`

## Current Live Workflow Behavior

### Excel Ingest
- n8n reads the uploaded Excel from Drive.
- The parser expects the real workbook layout:
  - sheet `Hoja1`
  - row 1 blank, row 2 blank, row 3 real headers
- The workflow normalizes only the business columns it needs and ignores the rest.

### Lead Upsert
- Leads are matched by `DOCUMENTO + TELEFONO`.
- Phone normalization is Mexico-specific:
  - `10 digits` -> `521XXXXXXXXXX`
  - `52XXXXXXXXXX` -> `521XXXXXXXXXX`
  - `521XXXXXXXXXX` -> unchanged
- New leads enter `Leads importados` (stage `103388967`).
- The `initialStatusId` in the CFG is `103388967`.
- Contact phone field uses ID `3270024` (was `1792418` in old account).

### Reminder Logic
- The first reminder is NOT sent directly by n8n.
- n8n moves the lead to `recordatorio 5 dias antes` and Kommo Salesbot sends the WhatsApp template.
- Current live reminder engine behavior:
  - `d == 5` -> `recordatorio 5 dias`
  - `d == 0` -> `deadline`
  - `d == -5` -> `5 dias atrasado`
  - `d <= -6` -> `revision urgente`
  - Uploads at `4`, `3`, `2`, or `1` days do not trigger any stage movement immediately
- The live reminder engine reads `Status pago` when a lead is in `revisar pago`:
  - empty -> stays in `revisar pago`
  - `Pagado` -> moves to `pagado`
  - `Abonado` -> moves to `abono`
  - `No Pagado` -> moves to `No pagado`
- Leads in `abono`:
  - `d == 0` -> `deadline - abono` (salesbot `39734` sends WhatsApp template)
  - `d <= -5` -> `5 dias atrasado`
- Leads in `No pagado`:
  - `d == 0` -> `deadline`
  - `d <= -5` -> `5 dias atrasado`
- Recordatorio de 5 días antes NO aplica para leads en `abono` o `No pagado`

### Inbound Cobranza Webhook
- Webhook path: `kommo-cobranza`
- Production URL: `https://n8n.srv1388533.hstgr.cloud/webhook/kommo-cobranza`
- Kommo must have this URL configured as a webhook in Settings → Webhooks.
- Confirmed behavior:
  - inbound WhatsApp messages reach the workflow
  - the workflow identifies the correct lead
  - text, image, and PDF inputs are supported

### AI Agent and Receipt Processing
- The cobranza chat path uses an AI agent with memory:
  - `AI Agent Cobranza`, `OpenAI Chat Model Cobranza`, `Window Buffer Memory Cobranza`
  - `Parsear Cobranza Agent (Code)`, `Ruta Cobranza Agent?`
- Memory key is based on `talk_id`, `chat_id`, or `lead_id`.
- The agent classifies messages into: `payment_evidence`, `payment_promise`, `question`, `conversation`, `manual_review`
- If payment evidence detected, routes to OCR/payment processing.
- OCR uses OpenAI vision and updates: `Pago Realizado`, `Saldo Pendiente`, `Cobranza Ultimo Abono`, `Cobranza Ultimo Recibo Hash`
- After applying amount, lead moves to `revisar pago` (not directly to `pagado`).

### Outbound Reply Path
- Reply field: `Respuesta IA` (ID `3281424`)
- Salesbot ID: `38308`
- Mode: `lead_field_plus_salesbot_run`
- The workflow writes the reply text into `Respuesta IA`, then calls `POST /api/v2/salesbot/run` with bot_id `38308`.
- The salesbot reads `{{lead.cf.3281424}}` and sends it via WhatsApp.
- Known issue: `salesbot/run` returns `202 accepted` but n8n reports `failed_no_outgoing_chat` because it never detects the outgoing message event. The message MAY still be delivered — verify in WhatsApp.

## Bugs Fixed During agroriegoscorp Migration (March 25, 2026)

1. **Kommo token** — All 3 workflows had tokens from `eduardonolasco18` or `agroriegosventas`. Updated via regex replacement across all Code nodes.
2. **Pipeline ID** — Was `13256923` (old) or `13158479` (older). Updated to `13403731`.
3. **All CFG field IDs** — Every `fieldIds` object in every Code node across all 3 workflows was updated to the new `agroriegoscorp` IDs.
4. **Missing custom fields** — `Aviso 3d`, `Aviso 2d`, `Aviso 1d` did not exist in `agroriegoscorp`. Created via API: `3282254`, `3282256`, `3282258`.
5. **Type mismatch** — `Saldo Pendiente` and `Pago Realizado` are `text` type in `agroriegoscorp` (were `numeric` in old account). All `value: Number(...)` calls wrapped in `String(...)`.
6. **Date format** — `fecha de Vencimiento` requires ISO 8601 (`Y-m-dTH:i:sP`). A double concatenation bug was producing `"2026-03-22T06:00:00+00:00T06:00:00+00:00"`. Fixed by using `toKommoDateTime()` output directly.
7. **Contact phone field ID** — Was `1792418` (old account). Updated to `3270024`.
8. **Salesbot field reference** — Salesbot `38308` was reading `{{lead.cf.2383804}}` (old Respuesta IA ID). Must be `{{lead.cf.3281424}}`. **This must be changed manually in Kommo UI.**

## What Was Validated on March 25, 2026

- ✅ Excel upload via Drive triggers workflow and creates/updates leads correctly
- ✅ Two test leads created in `Leads importados` with correct field data
- ✅ Upsert logic correctly detects existing leads and PATCHes them (no duplicates)
- ✅ Reminder engine moves `d==5` leads to `recordatorio 5 dias antes` automatically
- ✅ `Aviso 3d` timestamp is set on reminder
- ✅ Inbound WhatsApp receipt (image) triggers processing via `kommo-cobranza` webhook
- ✅ AI agent correctly classifies receipt as `payment_evidence`
- ✅ OCR correctly extracts payment amount from receipt image
- ✅ `Cobranza OCR + Abono` updates saldo and pago fields correctly
- ✅ `Enviar Mensaje Cobranza` writes reply to `Respuesta IA` field and calls salesbot (HTTP 202)
- ⚠️ Salesbot `38308` executes but message delivery not confirmed (`failed_no_outgoing_chat`) — likely because salesbot was still reading old field ID `2383804`

## Test Files
- Test workbook with 2 leads: `AUTO_TEST_NEW_DATE.xlsx` (in project directory)
  - Lead 1: `LUIS FERNANDO RICARDEZ PUENTE` / `9932508575` / Factura 9201 / Saldo 100
  - Lead 2: `VICTOR RODOLFO LOPEZ LANDA` / `9171176637` / Factura 9202 / Saldo 150
- Upload helper: Use `codex-drive-debug-39516d57` webhook with base64 payload

## Credential Locations
- `N8N_API_KEY` is stored in `.env` locally. Not committed.
- Live Google Drive access in n8n uses credential `Google Drive account 2`.
- Live OpenAI access in n8n uses credential `OpenAIconn`.
- **Kommo bearer token is embedded directly inside Code nodes:**
  - `Upsert Lead+Contacto (Code)`, `Reminder Engine (Code)`, `Detectar Cobranza Lead`, `Cobranza OCR + Abono`, `Enviar Mensaje Cobranza (Code)`
- **OpenAI API key** is embedded in `Cobranza OCR + Abono` node.
- Exported workflow snapshots contain these secrets and MUST NOT be committed.

## Operational Notes
- Local files such as `.backup_*.json`, `.live_*.json`, `.workflow_after_*.json`, and `.codex_*` may contain live tokens and must not be committed.
- The local exported workflow JSON files in the repo are NOT the source of truth. The live workflows in n8n are.
- `deploy_cobranza_plan.py` contains OLD fallback defaults and should not be treated as current.
- `run_e2e_tests.py` has stale fallback IDs. Use explicit env overrides.
- To update workflows programmatically, use the n8n API with `PUT /api/v1/workflows/{id}` but always send `settings: {}` to avoid 400 errors.

## Next Changes To Implement
- Verify salesbot `38308` actually delivers WhatsApp messages after fixing `{{lead.cf.3281424}}`.
- When a lead reviewed as `Abonado` or `No Pagado` sends another receipt, clear `Status pago` in the OCR/payment patch.
- Consider if `failed_no_outgoing_chat` is still an issue after salesbot field fix, or if it was purely caused by the wrong field ID.
- Populate `Fecha Abono` (`3293960`) in `Cobranza OCR + Abono` node when processing a payment receipt.

## Instruction For Next Agent
- Before applying any new workflow or code change, ask the user first: `¿Ya hago los cambios?`
- Do not assume approval from context alone.
- The live source of truth is the n8n API, not local JSON files. Always fetch the latest workflow before making changes.
- When updating Code nodes via API, use `settings: {}` in the PUT payload to avoid n8n 400 errors.

## Files That Matter Most
- `CONTEXT.md` — this file
- `AUTO_TEST_NEW_DATE.xlsx` — test workbook
- `deploy_cobranza_plan.py` (stale fallbacks; read with care)
- `run_e2e_tests.py` (stale fallback IDs)
- `workflow_n8n_kommo_actualizado.json` (stale local copy)
- `workflow_cobranza_recordatorios.json` (stale local copy)

## n8n Workflow IDs (updated)

| Workflow | ID | Purpose |
|----------|-----|---------|
| Kommo Cuentas por Cobrar (Ingesta vía HTTP) | `gfJm4JUoiUi7zZgaB2ob0` | Excel ingest, lead upsert, inbound chat/receipt processing |
| Kommo Cobranzas - Recordatorios Diario | `PRCdA1axuyZ9SMyf` | Daily cron for reminder stage movements |
| kommon8ndemo | `TDiINdgzi1YIiIZlwX0zG` | Inbound WhatsApp chat webhook |
| Codex Drive Upload Debug | `Xh4aTDrKmenx7DZ3` | Test helper for uploading Excel via API |
| Kommo Cobranzas - Reporte Excel Diario | `HW1MLmCmpwP6BmYl` | Daily cron generates cobros Excel and uploads to Drive |

## Last Verified State
- **Date:** March 30, 2026
- **Account:** `agroriegoscorp.kommo.com`
- Live workflow `gfJm4JUoiUi7zZgaB2ob0` active in n8n
- Drive ingest: ✅ working
- Lead creation/update: ✅ working (type quirks resolved)
- Reminder stage movement: ✅ working (updated with new abono/no_pagado stages)
- Inbound WhatsApp webhook: ✅ working
- AI agent + OCR payment processing: ✅ working
- Outbound reply via salesbot: ⚠️ salesbot runs but field reference needs manual fix in Kommo UI (`{{lead.cf.3281424}}`)
- Reporte Excel cobros diario: ✅ workflow `HW1MLmCmpwP6BmYl` activo, corre a las 08:00, sube `cobros_YYYY-MM-DD.xlsx` a Drive
- Salesbot `39734` configurado para `deadline - abono`: ✅ trigger por etapa configurado en Kommo UI
