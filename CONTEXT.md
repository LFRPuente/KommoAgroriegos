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
- `recordatorio 5 dias antes`: `102812943`
- `deadline`: `103040467`
- `5 dias atrasado`: `103040471`
- `revision urgente`: `103256551`
- `revisar pago`: `102931399`
- `pagado`: `103256459`
- `vendida`: `142`
- `cerrada`: `143`

### Current Live Lead Field IDs
- `Documento/Factura`: `2382026`
- `Telefono Cliente`: `2382028`
- `Fecha Vencimiento (texto)`: `2382030`
- `Saldo Pendiente`: `2382032`
- `Pago Realizado`: `2382034`
- `Status pago`: `2423378`
- `Razon Social`: `2382036`
- `Fecha Vencimiento (date)`: `2241884`
- `Cobranza Aviso 3D Enviado`: `2382038`
- `Cobranza Aviso 2D Enviado`: `2382040`
- `Cobranza Aviso 1D Enviado`: `2382042`
- `Cobranza Ultimo Recibo Hash`: `2382044`
- `Cobranza Ultimo Abono`: `2382046`
- Contact phone field id: `2227226`

### Status Pago Enums
- Field: `Status pago`
- Field id: `2423378`
- Enum `Pagado`: `134193626`
- Enum `Abonado`: `134193628`
- Enum `No Pagado`: `134193630`

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
- n8n should move the lead to `recordatorio 5 dias antes`.
- Kommo automation/Salesbot sends the first WhatsApp reminder when the lead enters that stage.
- For the test case used during migration:
  - `Luis Fernando Ricardez Puente` with due date at `5 days` moved to `recordatorio 5 dias antes`
  - `Victor Rodolfo Lopez Landa` with due date at `10 days` stayed in `Leads importados`
- Current live reminder engine behavior:
  - `d == 5` -> `recordatorio 5 dias antes`
  - `d == 0` -> `deadline`
  - `d == -5` -> `5 dias atrasado`
  - `d <= -6` -> `revision urgente`
  - Uploads at `4`, `3`, `2`, or `1` days do not trigger any stage movement immediately
- The live reminder engine now also reads `Status pago` when a lead is already in `revisar pago`:
  - empty -> stays in `revisar pago`
  - `Pagado` -> moves to `pagado`
  - `Abonado` or `No Pagado` -> on the next daily cycle, it is recolocated by due date:
    - `d > 5` or `1..4` -> `Leads importados`
    - `d == 5` -> `recordatorio 5 dias antes`
    - `d == 0..-4` -> `deadline`
    - `d == -5` -> `5 dias atrasado`
    - `d <= -6` -> `revision urgente`
- The Drive trigger is `fileCreated`, so creating a new file triggers the workflow; updating an existing file may not.

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
  - `Cobranza Ultimo Abono`
  - `Cobranza Ultimo Recibo Hash`
  - status to `revisar pago` when a receipt/payment is plausible and the detected amount does not exceed the saldo
  - notes/tasks when manual review is needed
- Current live OCR rule:
  - if a receipt/comprobante has amount `<= saldo pendiente`, it is treated as a valid payment signal and is applied as abono or full payment
  - if the detected amount exceeds the saldo, it is escalated for manual review
  - after applying the amount, the lead is moved to `revisar pago`, not directly to `pagado`

### Agreed Manual Review Flow
- `revisar pago` is a temporary manual validation stage after n8n detects a plausible payment or abono.
- Manual review uses the custom field `Status pago`:
  - empty: do nothing; the lead stays in `revisar pago`
  - `Pagado`: move the lead to `pagado`
  - `Abonado`: keep the registered abono and, on the next reminder cycle, return the lead to the date-based flow if reminders still apply
  - `No Pagado`: treat the receipt as invalid/false positive and, on the next reminder cycle, return the lead to the date-based flow if reminders still apply
- If a lead that was previously marked `Abonado` or `No Pagado` sends another receipt later, it should go back to `revisar pago` again.
- If `Status pago` is empty, n8n should not move the lead out of `revisar pago`; only manual intervention should set the field.
- `Abonado` and `No Pagado` should not be re-routed immediately when the reviewer sets the field; they should be recolocated only on the next reminder cycle.
- There is a separate stage `revision urgente` for late/problem cases after the normal late reminder window.
- Final agreed cutover rule:
  - `d == -5` -> `5 dias atrasado`
  - `d <= -6` -> `revision urgente`

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

## Current Outbound Reply State
- n8n can now:
  - ingest the Excel
  - create/update leads in the client account
  - move reminder leads to the correct stage
  - receive inbound WhatsApp replies
  - understand the conversation with memory
  - process payment evidence
- The old `PATCH /api/v4/chats/templates` approach was abandoned.
- The current live reply path writes the generated text into the lead custom field `Respuesta IA` and then runs a salesbot.

### Current Live Reply Routing
- Reply field: `Respuesta IA`
- Reply field id: `2383804`
- Salesbot used for conversational replies: `31998`
- The live send node reports mode similar to `lead_field_plus_salesbot_run`

### Last Verified Outbound Issue
- In a recent live execution, the field write succeeded and `salesbot/run` returned `202 accepted`.
- Even so, the workflow did not observe a new `outgoing_chat_message` event and ended as `failed_no_outgoing_chat`.
- So the current issue is no longer template update failure; it is delivery confirmation after the salesbot run.

## Test Files
- Real input template used for reference: `C:\Users\luis_\Downloads\prueba5dias (1).xlsx`
- Generated two-lead test workbook used during migration: `C:\Users\luis_\Downloads\prueba5dias_dos_leads.xlsx`
- Temporary step-by-step QA workbooks were generated from the same workbook format during testing and later removed locally.
- Those files were operator-local and were never stored in this repository.

## Current Test Blocker
- A live step-by-step test was attempted on `March 22, 2026` by uploading a 5-day workbook to the real Drive folder.
- The upload itself worked and triggered the main workflow.
- `Limpiar Datos` parsed the file correctly with:
  - `DOCUMENTO=9201`
  - `TELEFONO=5219932508575`
  - `SALDO_DOC=5000`
  - `PAGO=0`
  - `FECHA_VENC_ISO=2026-03-27`
- The workflow then failed in `Upsert Lead+Contacto (Code)` when it tried to create a lead:
  - execution ids seen during the attempts: `15011`, `15014`, `15017`
  - Kommo API response:
    - `status: 402`
    - `title: Payment Required`
    - `detail: Payment required`
- This means the Excel/parser path is working, but lead creation by API is currently blocked in the client account whenever the upsert does not find an exact `DOCUMENTO + TELEFONO` match.
- Because of that, the end-to-end reminder test cannot proceed from a non-existent lead until:
  - a matching lead already exists in Kommo, or
  - the account-side/API-side `402` issue is resolved

## Account API Findings
- `GET /api/v4/account` works and returns account metadata such as:
  - `id=36115331`
  - `name/subdomain=agroriegosventas`
  - `country=VE`
  - `currency=USD`
  - `customers_mode=unavailable`
- The public account endpoint does not expose the subscription/plan directly.
- Attempts to read billing-like information through:
  - `/api/v4/account?with=subscription`
  - `/api/v4/account?with=users`
  - `/api/v4/account?with=users,amojo_id`
  returned `400 Invalid with`
- So the exact Kommo plan/subscription must be checked in the UI, not through the public API used here.

## Operational Notes
- Local files such as `.backup_*.json`, `.live_*.json`, `.workflow_after_*.json`, and `.codex_*` may contain live tokens or workflow snapshots and must not be committed or shared.
- The local exported workflow JSON files in the repo are not the full source of truth for the latest live workflow anymore. Before redeploying from the repo, refresh the export from n8n and sanitize secrets.
- `deploy_cobranza_plan.py` still contains old fallback defaults from the previous Kommo tenant and should not be treated as current live truth until it is updated.
- `run_e2e_tests.py` already points to `agroriegosventas` for `KOMMO_BASE`, but its fallback pipeline/status IDs are still from the older setup. Use explicit env overrides or update the script before relying on it for the client account.
- If this repository is shared outside the team, rotate exposed credentials first.

## Credential Locations
- `N8N_API_KEY` is not stored in the repository as a safe source of truth; it is operator-provided at runtime.
- `.env.example` only contains placeholders and repo defaults, not live secrets.
- Live Google Drive access in n8n uses credential `Google Drive account 2`.
- Live OpenAI chat-agent access in n8n uses credential `OpenAIconn`.
- The live workflow still has secrets embedded directly inside some `Code` nodes:
  - Kommo bearer token is embedded in nodes such as `Upsert Lead+Contacto (Code)`, `Reminder Engine (Code)`, `Detectar Cobranza Lead`, `Cobranza OCR + Abono`, and `Enviar Mensaje Cobranza (Code)`.
  - OpenAI API key is embedded in `Cobranza OCR + Abono`.
- Because of that, exported live workflow snapshots are sensitive and must not be committed.

## Next Changes To Implement
- When a lead that was already reviewed as `Abonado` or `No Pagado` sends another receipt later, clear `Status pago` again as part of the OCR/payment patch so stale reviewer values do not auto-release it on the next cycle.
- Review whether outbound conversational replies should continue using `Respuesta IA + salesbot 31998` or need another delivery path if `outgoing_chat_message` is still not observed reliably.

## Instruction For Next Agent
- Before applying any new workflow or code change after compacting, the next agent must first ask the user: `Ya hago los cambios?`
- Do not assume approval from the context alone.

## Files That Matter Most
- `CONTEXT.md`
- `deploy_cobranza_plan.py` (stale fallbacks; read with care)
- `run_e2e_tests.py` (base URL updated, fallback IDs still stale)
- `workflow_n8n_kommo_actualizado.json`
- `workflow_cobranza_recordatorios.json`

## Last Verified State
- `March 15, 2026` to `March 22, 2026`
- Live workflow id `gfJm4JUoiUi7zZgaB2ob0` active in n8n
- Drive ingest working
- Reminder stage movement working for the two-lead test
- Inbound WhatsApp webhook working
- AI agent with chat memory working
- Reminder-cycle logic for `Status pago` is now live in `Reminder Engine (Code)`
- Outbound conversational reply still depends on the `Respuesta IA + salesbot 31998` path and the last known issue remains `failed_no_outgoing_chat`
- Step-by-step QA using new uploads is currently blocked by Kommo lead creation returning `402 Payment Required`
