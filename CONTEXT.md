# Project Context

## Purpose
This project automates Agroriegos collections from Excel uploads in Google Drive into Kommo through n8n.

Primary goals:
- Read the real Excel workbook format used by the client.
- Upsert leads and contacts in Kommo by `DOCUMENTO + TELEFONO`.
- Move leads through the collections pipeline based on due date and payment state.
- Listen to inbound WhatsApp replies from Kommo and process promises, questions, and payment evidence.

## Production Systems
- n8n base: `https://n8n.srv1388533.hstgr.cloud`
- Main live workflow name: `Kommo Cuentas por Cobrar (Ingesta via HTTP)`
- Main live workflow id: `gfJm4JUoiUi7zZgaB2ob0`
- Google Drive watched folder: `pruebakommo`
- Google Drive folder id: `1QFbTelTwH9M9_Sl-1F17KkiTgv9CqGl2`
- Google Drive event: `fileCreated`
- Google Drive polling: every minute

## Kommo Account
- Account: `agroriegosventas.kommo.com`
- Previous test account: `eduardonolasco18.kommo.com`
- Current collections pipeline id: `13202899`
- Collections tag used by n8n: `cobranza_n8n_excel`

### Current Live Stage IDs
- `Leads entrantes`: `101806039`
- `Leads importados`: `102933199`
- `Recordatorio enviado`: `102812943`
- `Contacto inicial`: `101806043`
- `Discusiones`: `101806047`
- `Toma de decisiones`: `101806051`
- `Por cobrar`: `101907315`
- `Pago parcial`: `102931399`
- `Fecha limite`: `102931403`
- `Atrasado`: `102931407`
- `Pagado`: `101907419`

### Current Live Lead Field IDs
- `Documento/Factura`: `2382026`
- `Telefono Cliente`: `2382028`
- `Fecha Vencimiento (texto)`: `2382030`
- `Saldo Pendiente`: `2382032`
- `Pago Realizado`: `2382034`
- `Razon Social`: `2382036`
- `Fecha Vencimiento (date)`: `2241884`
- `Cobranza Aviso 3D Enviado`: `2382038`
- `Cobranza Aviso 2D Enviado`: `2382040`
- `Cobranza Aviso 1D Enviado`: `2382042`
- `Cobranza Ultimo Recibo Hash`: `2382044`
- `Cobranza Ultimo Abono`: `2382046`
- Contact phone field id: `2227226`

## Current Live Workflow Behavior

### Excel Ingest
- n8n reads the uploaded Excel from Drive.
- The parser still expects the real workbook layout:
  - sheet `Hoja1`
  - row 1 blank
  - row 2 blank
  - row 3 real headers
- The workflow normalizes only the business columns it needs and ignores the rest.

### Lead Upsert
- Leads are matched by `DOCUMENTO + TELEFONO`.
- Phone normalization is still Mexico-specific:
  - `10 digits` -> `521XXXXXXXXXX`
  - `52XXXXXXXXXX` -> `521XXXXXXXXXX`
  - `521XXXXXXXXXX` -> unchanged
- New leads now enter `Leads importados`.
- In the current client account, using `Leads entrantes` for create/update was not reliable because Kommo treated that stage differently; `Leads importados` is the working initial stage for uploads.

### Reminder Logic
- The first reminder should not be sent directly by n8n anymore.
- n8n should move the lead to `Recordatorio enviado`.
- Kommo automation/Salesbot sends the first WhatsApp reminder when the lead enters that stage.
- For the test case used during migration:
  - `Luis Fernando Ricardez Puente` with due date at `5 days` moved to `Recordatorio enviado`
  - `Victor Rodolfo Lopez Landa` with due date at `10 days` stayed in `Leads importados`

### Inbound Cobranza Webhook
- Webhook path: `kommo-cobranza`
- Production URL: `https://n8n.srv1388533.hstgr.cloud/webhook/kommo-cobranza`
- Kommo inbound message webhooks were validated after enabling the chat webhook in the client account.
- Confirmed behavior:
  - inbound WhatsApp messages do reach the workflow
  - the workflow identifies the correct lead
  - text, image, and PDF inputs are supported

### AI Agent and Receipt Processing
- The cobranza chat path now uses an AI agent with memory:
  - `AI Agent Cobranza`
  - `OpenAI Chat Model Cobranza`
  - `Window Buffer Memory Cobranza`
  - `Parsear Cobranza Agent (Code)`
  - `Ruta Cobranza Agent?`
- Memory key is based on `talk_id`, `chat_id`, or `lead_id`.
- The agent assumes every inbound message is a reply to the first collections reminder:
  - `Hola nombre del cliente, le informamos que su pago correspondiente a numero de factura tiene fecha de vencimiento vencimiento del pago.`
  - `Si ya realizo el pago, por favor ignore este mensaje.`
  - `Somos AGR.`
- The agent classifies the message into:
  - `payment_evidence`
  - `payment_promise`
  - `question`
  - `conversation`
  - `manual_review`
- If the message contains payment evidence, the workflow routes it to OCR/payment processing.
- OCR/payment processing still uses OpenAI and updates:
  - `Pago Realizado`
  - `Saldo Pendiente`
  - status to `Pago parcial` or `Pagado`
  - notes/tasks when manual review is needed

## WhatsApp Templates and Salesbot
- First reminder template already used by Kommo automation:
  - template id: `11652`
  - name: `Nueva plantilla de WhatsApp (02.23.2026 5:33PM)`
- Conversational reply template created in the client account:
  - template id: `14996`
  - name: `envio_mensaje`
- Salesbot created for conversational replies:
  - salesbot id: `25756`
  - name: `mensaje automatico`

## What Was Validated During Migration
- Account migration moved the project from the old Kommo test tenant to `agroriegosventas`.
- The live workflow was updated in n8n to use the client tenant and the new live IDs.
- A test workbook was created from the real Excel format with only two leads:
  - `Luis Fernando Ricardez Puente` / `9932508575`
  - `Victor Rodolfo Lopez Landa` / `9171176637`
- The Drive trigger was tested with real uploads.
- Stage movement worked as expected for the `5 days` reminder scenario.
- The inbound WhatsApp webhook was validated with a real reply such as `Hola si en un momento se lo mando`.
- The AI agent correctly interpreted that message as a payment promise and produced a reply candidate.

## Current Blocker
- n8n can now:
  - ingest the Excel
  - create/update leads in the client account
  - move reminder leads to the correct stage
  - receive inbound WhatsApp replies
  - understand the conversation with memory
  - process payment evidence
- The current blocker is outbound conversational replies from n8n after the customer answers.

### Current Failure
- The live reply path currently tries:
  1. update chat template `14996` via `PATCH /api/v4/chats/templates`
  2. trigger salesbot `25756` via `POST /api/v2/salesbot/run`
- Real executions showed:
  - the agent generates a valid reply text
  - `GET /api/v4/chats/templates` lists template `14996`
  - but `PATCH /api/v4/chats/templates` returns `400 EntityNotFound` for that same template id
- This means the template exists, but the public request being used by the workflow is not accepted for updating it in this account.

### Recommended Next Fix
- Do not rely on `PATCH /api/v4/chats/templates` for conversational replies.
- Safer replacement:
  - n8n writes the agent reply text into a dedicated custom field on the lead
  - the Kommo salesbot sends that field value
- That keeps Kommo in charge of delivery and avoids the failing template update call.

## Test Files
- Real input template used for reference: `C:\Users\luis_\Downloads\prueba5dias (1).xlsx`
- Generated two-lead test workbook used during migration: `C:\Users\luis_\Downloads\prueba5dias_dos_leads.xlsx`

## Operational Notes
- Local files such as `.backup_*.json`, `.live_*.json`, `.workflow_after_*.json`, and `.codex_*` may contain live tokens or workflow snapshots and must not be committed or shared.
- The local exported workflow JSON files in the repo are not the full source of truth for the latest live workflow anymore. Before redeploying from the repo, refresh the export from n8n and sanitize secrets.
- If this repository is shared outside the team, rotate exposed credentials first.

## Files That Matter Most
- `CONTEXT.md`
- `deploy_cobranza_plan.py`
- `run_e2e_tests.py`
- `workflow_n8n_kommo_actualizado.json`
- `workflow_cobranza_recordatorios.json`

## Last Verified State
- `March 15, 2026` to `March 16, 2026`
- Live workflow id `gfJm4JUoiUi7zZgaB2ob0` active in n8n
- Drive ingest working
- Reminder stage movement working for the two-lead test
- Inbound WhatsApp webhook working
- AI agent with chat memory working
- Outbound conversational reply still blocked by Kommo template update behavior
