# KommoAgroriegos

Automatizacion de cobranza para Kommo + n8n basada en carga de Excel desde Google Drive.

## Contenido

- `deploy_cobranza_plan.py`: genera y despliega el workflow principal de cobranza.
- `run_e2e_tests.py`: pruebas end to end contra n8n/Kommo.
- `workflow_n8n_kommo_actualizado.json`: export del workflow principal.
- `workflow_kommo_chat_cobranza.json`: export de la rama de chat/cobranza.
- `workflow_cobranza_recordatorios.json`: export del workflow de recordatorios.
- `deploy_cobranza_summary.json`: ids de pipeline, etapas y custom fields.
- `CONTEXT.md`: contexto funcional y tecnico para futuras sesiones.
- `Documento_Diseno_n8n.md`: notas de diseno del flujo.

## Variables de entorno

Copia `.env.example` a `.env` o exporta estas variables en tu entorno:

- `N8N_API_BASE`
- `N8N_WEBHOOK_BASE`
- `N8N_API_KEY`
- `KOMMO_BASE`
- `KOMMO_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `KOMMO_CHAT_TEMPLATE_ID`
- `KOMMO_SALESBOT_ID`

## Notas

- Este repo esta sanitizado. No incluye tokens, llaves ni archivos locales de prueba.
- Los Excel de prueba, snapshots de ejecucion y probes locales se mantienen fuera del repo.
- Los exports JSON del workflow usan placeholders en los campos sensibles y deben rehidratarse antes de desplegar.
