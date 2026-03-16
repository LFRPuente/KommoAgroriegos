import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def require_env(name):
    value = os.environ.get(name)
    if value:
        return value
    raise RuntimeError(f"Missing required environment variable: {name}")


N8N_API_BASE = os.environ.get("N8N_API_BASE", "https://n8n.srv1388533.hstgr.cloud/api/v1")
N8N_WEBHOOK_BASE = os.environ.get("N8N_WEBHOOK_BASE", "https://n8n.srv1388533.hstgr.cloud/webhook/")
N8N_API_KEY = require_env("N8N_API_KEY")

KOMMO_BASE = os.environ.get("KOMMO_BASE", "https://agroriegosventas.kommo.com")
KOMMO_TOKEN = require_env("KOMMO_TOKEN")

INGEST_WORKFLOW_ID = "gfJm4JUoiUi7zZgaB2ob0"
COBRANZA_WEBHOOK_PATH = "kommo-cobranza"
DEFAULT_PIPELINE_ID = 13256923
DEFAULT_PAID_STATUS_ID = 102225739
TAG_NAME = "cobranza_n8n_excel"


def req_json(url, method="GET", headers=None, data=None, raw=False):
    h = headers or {}
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        h = {**h, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw_body = res.read()
            if raw:
                return raw_body.decode("utf-8", errors="replace"), res.status
            txt = raw_body.decode("utf-8", errors="replace")
            if not txt:
                return {}
            return json.loads(txt)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} {method} {url}\n{detail}") from e


def req_form(url, form_dict):
    body = urllib.parse.urlencode(form_dict).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as res:
        txt = res.read().decode("utf-8", errors="replace")
        return txt, res.status


def post_webhook_json_with_retry(path, payload, retries=8, delay_sec=1.5):
    url = N8N_WEBHOOK_BASE + path
    last_err = None
    for _ in range(retries):
        try:
            txt, status = req_json(url, method="POST", data=payload, raw=True)
            return txt, status
        except RuntimeError as e:
            last_err = e
            if "HTTP 404" in str(e):
                time.sleep(delay_sec)
                continue
            raise
    raise last_err if last_err else RuntimeError("Unknown webhook retry error")


def n8n_headers():
    return {"X-N8N-API-KEY": N8N_API_KEY}


def kommo_headers():
    return {"Authorization": f"Bearer {KOMMO_TOKEN}", "Content-Type": "application/json"}


def get_field_ids():
    with open("deploy_cobranza_summary.json", "r", encoding="utf-8") as f:
        return json.load(f)["field_ids"]


def get_stage_ids():
    with open("deploy_cobranza_summary.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("stage_ids", {})


def get_pipeline_id():
    with open("deploy_cobranza_summary.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    return int(data.get("pipeline_id") or DEFAULT_PIPELINE_ID)


def get_node_config(workflow_path, node_name):
    with open(workflow_path, "r", encoding="utf-8") as f:
        wf = json.load(f)
    for node in wf.get("nodes", []):
        if node.get("name") == node_name:
            p = node.get("parameters", {})
            return {"jsCode": p.get("jsCode", ""), "mode": p.get("mode")}
    raise RuntimeError(f"Node not found: {node_name} in {workflow_path}")


def n8n_create_workflow(payload):
    return req_json(f"{N8N_API_BASE}/workflows", method="POST", headers=n8n_headers(), data=payload)


def n8n_activate(workflow_id):
    return req_json(
        f"{N8N_API_BASE}/workflows/{workflow_id}/activate",
        method="POST",
        headers=n8n_headers(),
        data={},
    )


def n8n_deactivate(workflow_id):
    return req_json(
        f"{N8N_API_BASE}/workflows/{workflow_id}/deactivate",
        method="POST",
        headers=n8n_headers(),
        data={},
    )


def n8n_delete(workflow_id):
    return req_json(f"{N8N_API_BASE}/workflows/{workflow_id}", method="DELETE", headers=n8n_headers())


def n8n_latest_execution(workflow_id):
    return req_json(
        f"{N8N_API_BASE}/executions?workflowId={workflow_id}&limit=1&includeData=true",
        headers=n8n_headers(),
    )


def kommo_create_lead(
    name,
    field_ids,
    documento,
    telefono,
    saldo,
    pago,
    due_iso,
    extra_tags=None,
    status_id=None,
    include_cobranza_tag=True,
    pipeline_id=DEFAULT_PIPELINE_ID,
):
    due_value = str(due_iso)
    if due_value and "T" not in due_value:
        due_value = due_value + "T06:00:00+00:00"
    due_date_part = due_value.split("T")[0]
    tags = [{"name": "e2e_test"}]
    if include_cobranza_tag:
        tags.insert(0, {"name": TAG_NAME})
    for t in extra_tags or []:
        tags.append({"name": t})
    payload = [
        {
            "name": name,
            "price": round(float(saldo)),
            "pipeline_id": int(pipeline_id),
            "custom_fields_values": [
                {"field_id": field_ids["documento"], "values": [{"value": str(documento)}]},
                {"field_id": field_ids["telefono"], "values": [{"value": str(telefono)}]},
                {"field_id": field_ids["fecha_venc_text"], "values": [{"value": datetime.fromisoformat(due_date_part).strftime("%m/%d/%Y")}]},
                {"field_id": field_ids["fecha_venc_date"], "values": [{"value": due_value}]},
                {"field_id": field_ids["saldo_pendiente"], "values": [{"value": float(saldo)}]},
                {"field_id": field_ids["pago_realizado"], "values": [{"value": float(pago)}]},
                {"field_id": field_ids["razon_social"], "values": [{"value": name}]},
            ],
            "_embedded": {"tags": tags},
        }
    ]
    if status_id is not None:
        payload[0]["status_id"] = int(status_id)
    out = req_json(f"{KOMMO_BASE}/api/v4/leads", method="POST", headers=kommo_headers(), data=payload)
    return out["_embedded"]["leads"][0]["id"]


def kommo_patch_lead(lead_id, patch_payload):
    body = [{"id": int(lead_id), **patch_payload}]
    return req_json(f"{KOMMO_BASE}/api/v4/leads", method="PATCH", headers=kommo_headers(), data=body)


def kommo_get_lead(lead_id):
    return req_json(f"{KOMMO_BASE}/api/v4/leads/{lead_id}?with=custom_fields_values,tags", headers=kommo_headers())


def kommo_delete_lead(lead_id):
    req_json(f"{KOMMO_BASE}/api/v4/leads/{lead_id}", method="DELETE", headers=kommo_headers())


def lead_field(lead, field_id):
    for f in lead.get("custom_fields_values", []) or []:
        if int(f.get("field_id")) == int(field_id):
            vals = f.get("values", [])
            if vals:
                return vals[0].get("value")
    return None


def upload_fake_pdf_with_amount(amount_text):
    fname = f"e2e_receipt_{uuid.uuid4().hex[:8]}.pdf"
    pdf_bytes = f"""%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 56>>stream
BT /F1 18 Tf 20 80 Td (RECIBO ABONO {amount_text}) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000063 00000 n 
0000000116 00000 n 
0000000242 00000 n 
0000000350 00000 n 
trailer<</Root 1 0 R/Size 6>>
startxref
420
%%EOF
""".encode("latin-1", errors="ignore")
    with open(fname, "wb") as f:
        f.write(pdf_bytes)
    try:
        cmd = ["curl.exe", "-s", "-F", f"file=@{fname}", "https://0x0.st"]
        out = subprocess.check_output(cmd, text=True, timeout=60).strip()
        if not out.startswith("http"):
            raise RuntimeError(f"Upload failed: {out}")
        return out
    finally:
        if os.path.exists(fname):
            os.remove(fname)


def build_harness_workflow(name, webhook_path, code_chain):
    webhook_id = str(uuid.uuid4())
    nodes = [
        {
            "id": str(uuid.uuid4()),
            "name": "Webhook",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "webhookId": webhook_id,
            "position": [260, 300],
            "parameters": {
                "httpMethod": "POST",
                "path": webhook_path,
                "responseMode": "lastNode",
                "options": {},
            },
        }
    ]
    connections = {}
    prev = "Webhook"
    x = 560
    for idx, cfg in enumerate(code_chain, start=1):
        node_name = f"Code {idx}"
        node_parameters = {"jsCode": cfg["jsCode"]}
        if cfg.get("mode"):
            node_parameters["mode"] = cfg["mode"]
        nodes.append(
            {
                "id": str(uuid.uuid4()),
                "name": node_name,
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [x, 300],
                "parameters": node_parameters,
            }
        )
        connections[prev] = {"main": [[{"node": node_name, "type": "main", "index": 0}]]}
        prev = node_name
        x += 320
    return {"name": name, "nodes": nodes, "connections": connections, "settings": {}}


def normalize_webhook_response(resp_text):
    try:
        payload = json.loads(resp_text)
    except Exception:
        return {"raw": resp_text}
    if isinstance(payload, list):
        if payload and isinstance(payload[0], dict):
            return payload[0]
    if isinstance(payload, dict) and "json" in payload and isinstance(payload["json"], dict):
        return payload["json"]
    if isinstance(payload, dict):
        return payload
    return {"raw": payload}


def now_iso(days=0):
    mx_today = datetime.now(ZoneInfo("America/Mexico_City")).date()
    return (mx_today + timedelta(days=days)).isoformat()


def kommo_now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def run():
    field_ids = get_field_ids()
    stage_ids = get_stage_ids()
    pipeline_id = get_pipeline_id()
    paid_status_id = int(stage_ids.get("pagado") or DEFAULT_PAID_STATUS_ID)
    upsert_node = get_node_config("workflow_n8n_kommo_actualizado.json", "Upsert Lead+Contacto (Code)")
    reminder_node = get_node_config("workflow_n8n_kommo_actualizado.json", "Reminder Engine (Code)")
    parse_node = get_node_config("workflow_n8n_kommo_actualizado.json", "Parsear Chat Cobranza (Code)")
    detect_node = get_node_config("workflow_n8n_kommo_actualizado.json", "Detectar Cobranza Lead")
    ocr_node = get_node_config("workflow_n8n_kommo_actualizado.json", "Cobranza OCR + Abono")

    prefix = "E2E" + datetime.now(timezone.utc).strftime("%m%d%H%M%S")
    results = []
    created_leads = []
    temp_workflows = []

    def record(name, passed, detail):
        results.append({"case": name, "passed": bool(passed), "detail": detail})
        print(f"[{'PASS' if passed else 'FAIL'}] {name} -> {detail}")

    try:
        # ---------- Harness: Upsert ----------
        normalize_input_code = "const p = $json.body ?? $json; return { json: p };"
        upsert_harness_path = f"e2e-upsert-{prefix.lower()}"
        upsert_wf = build_harness_workflow(
            f"E2E Upsert Harness {prefix}",
            upsert_harness_path,
            [
                {"jsCode": normalize_input_code, "mode": "runOnceForEachItem"},
                upsert_node,
            ],
        )
        upsert_created = n8n_create_workflow(upsert_wf)
        upsert_wf_id = upsert_created["id"]
        temp_workflows.append(upsert_wf_id)
        n8n_activate(upsert_wf_id)
        time.sleep(1.5)

        # ---------- Harness: Reminder ----------
        reminder_harness_path = f"e2e-reminder-{prefix.lower()}"
        reminder_wf = build_harness_workflow(
            f"E2E Reminder Harness {prefix}",
            reminder_harness_path,
            [reminder_node],
        )
        reminder_created = n8n_create_workflow(reminder_wf)
        reminder_wf_id = reminder_created["id"]
        temp_workflows.append(reminder_wf_id)
        n8n_activate(reminder_wf_id)
        time.sleep(1.5)

        # ---------- Harness: Cobranza chat/webhook ---------- #
        cobranza_harness_path = f"e2e-cobranza-{prefix.lower()}"
        cobranza_wf = build_harness_workflow(
            f"E2E Cobranza Harness {prefix}",
            cobranza_harness_path,
            [
                parse_node,
                detect_node,
                ocr_node,
            ],
        )
        cobranza_created = n8n_create_workflow(cobranza_wf)
        cobranza_wf_id = cobranza_created["id"]
        temp_workflows.append(cobranza_wf_id)
        n8n_activate(cobranza_wf_id)
        time.sleep(1.5)

        # ---------- Upsert tests ----------
        doc_base = f"{prefix}01"
        p1 = {
            "DOCUMENTO": doc_base,
            "RAZON_SOCIAL": f"Cliente {prefix} A",
            "TELEFONO": "5215551001001",
            "SALDO_DOC": 1000.25,
            "PAGO": 0,
            "FECHA_VENC": "03/20/2026",
            "FECHA_VENC_ISO": "2026-03-20",
            "TITULO_TRATO": f"Factura {doc_base} - Cliente {prefix} A",
            "VENDEDOR": "E2E",
        }
        txt, status = post_webhook_json_with_retry(upsert_harness_path, p1)
        out1 = normalize_webhook_response(txt)
        lead1 = int(out1.get("lead_id", 0))
        if lead1:
            created_leads.append(lead1)
        record("upsert_create_new", status == 200 and out1.get("upsert_status") == "created" and lead1 > 0, out1)

        p2 = dict(p1)
        p2["SALDO_DOC"] = 850.75
        p2["PAGO"] = 149.5
        txt, status = post_webhook_json_with_retry(upsert_harness_path, p2)
        out2 = normalize_webhook_response(txt)
        lead2 = int(out2.get("lead_id", 0))
        record("upsert_update_same_doc_phone", status == 200 and out2.get("upsert_status") == "updated" and lead2 == lead1, out2)

        p3 = dict(p1)
        p3["TELEFONO"] = "5215551001002"
        p3["RAZON_SOCIAL"] = f"Cliente {prefix} B"
        p3["TITULO_TRATO"] = f"Factura {doc_base} - Cliente {prefix} B"
        txt, status = post_webhook_json_with_retry(upsert_harness_path, p3)
        out3 = normalize_webhook_response(txt)
        lead3 = int(out3.get("lead_id", 0))
        if lead3:
            created_leads.append(lead3)
        record("upsert_same_doc_diff_phone_creates_new", status == 200 and out3.get("upsert_status") == "created" and lead3 not in {0, lead1}, out3)

        # ---------- Reminder tests (5D / DUE / LATE+5D) ----------
        r5_id = kommo_create_lead(f"Factura {prefix}R5", field_ids, f"{prefix}R5", "5215552005005", 300.0, 0.0, now_iso(5), pipeline_id=pipeline_id)
        rd_id = kommo_create_lead(f"Factura {prefix}RD", field_ids, f"{prefix}RD", "5215552000000", 200.0, 50.0, now_iso(0), pipeline_id=pipeline_id)
        rl_id = kommo_create_lead(f"Factura {prefix}RL", field_ids, f"{prefix}RL", "5215552009009", 100.0, 0.0, now_iso(-5), pipeline_id=pipeline_id)
        rz_id = kommo_create_lead(f"Factura {prefix}RZ", field_ids, f"{prefix}RZ", "5215552099999", 0.0, 100.0, now_iso(0), pipeline_id=pipeline_id)
        rp_id = kommo_create_lead(
            f"Factura {prefix}RP",
            field_ids,
            f"{prefix}RP",
            "5215552088888",
            80.0,
            80.0,
            now_iso(0),
            status_id=paid_status_id,
            pipeline_id=pipeline_id,
        )
        created_leads += [r5_id, rd_id, rl_id, rz_id, rp_id]

        txt, status = post_webhook_json_with_retry(reminder_harness_path, {})
        rem1 = normalize_webhook_response(txt)
        logs1 = rem1.get("logs", []) if isinstance(rem1.get("logs"), list) else []
        logs1_pref = [x for x in logs1 if str(x.get("documento", "")).startswith(prefix)]
        docs1 = {x.get("documento") for x in logs1_pref}
        expected_docs = {f"{prefix}R5", f"{prefix}RD", f"{prefix}RL"}
        record("reminder_5_due_late_selection", status == 200 and docs1 == expected_docs, {"docs_logged": list(docs1), "expected": list(expected_docs)})
        record("reminder_skip_paid_and_zero", f"{prefix}RZ" not in docs1 and f"{prefix}RP" not in docs1, {"docs_logged": list(docs1)})

        r5_after = kommo_get_lead(r5_id)
        rd_after = kommo_get_lead(rd_id)
        rl_after = kommo_get_lead(rl_id)
        record(
            "reminder_moves_stage_and_marks_5d",
            int(r5_after.get("status_id") or 0) == int(stage_ids["recordatorio_enviado"])
            and bool(lead_field(r5_after, field_ids["aviso_3d"])),
            {"status_id": r5_after.get("status_id"), "aviso_3d": lead_field(r5_after, field_ids["aviso_3d"])},
        )
        record(
            "reminder_moves_stage_and_marks_due",
            int(rd_after.get("status_id") or 0) == int(stage_ids["pago_parcial"])
            and bool(lead_field(rd_after, field_ids["aviso_2d"])),
            {"status_id": rd_after.get("status_id"), "aviso_2d": lead_field(rd_after, field_ids["aviso_2d"])},
        )
        record(
            "reminder_moves_stage_and_marks_late",
            int(rl_after.get("status_id") or 0) == int(stage_ids["atrasado"])
            and bool(lead_field(rl_after, field_ids["aviso_1d"])),
            {"status_id": rl_after.get("status_id"), "aviso_1d": lead_field(rl_after, field_ids["aviso_1d"])},
        )

        # Mark 5D as sent and run again to validate idempotency gate
        kommo_patch_lead(r5_id, {"custom_fields_values": [{"field_id": field_ids["aviso_3d"], "values": [{"value": kommo_now_iso()}]}]})
        txt, status = post_webhook_json_with_retry(reminder_harness_path, {})
        rem2 = normalize_webhook_response(txt)
        logs2 = rem2.get("logs", []) if isinstance(rem2.get("logs"), list) else []
        logs2_pref = [x for x in logs2 if str(x.get("documento", "")).startswith(prefix)]
        docs2 = {x.get("documento") for x in logs2_pref}
        record("reminder_idempotency_marker", f"{prefix}R5" not in docs2, {"docs_logged_second_run": list(docs2)})

        # ---------- Receipt tests (production webhook) ----------
        rc_id = kommo_create_lead(f"Factura {prefix}RC", field_ids, f"{prefix}RC", "5215553003003", 500.0, 0.0, now_iso(2), pipeline_id=pipeline_id)
        created_leads.append(rc_id)
        kommo_patch_lead(
            rc_id,
            {
                    "custom_fields_values": [
                    {"field_id": field_ids["aviso_3d"], "values": [{"value": kommo_now_iso()}]},
                ]
            },
        )

        # Valid image (amount fallback from message text if OCR misses)
        form_img_ok = {
            "message[add][0][text]": "Te envio comprobante, abono 120.50",
            "message[add][0][author][name]": "E2E Bot",
            "message[add][0][element_id]": str(rc_id),
            "message[add][0][talk_id]": "777001",
            "message[add][0][chat_id]": "e2e-chat-recibo-1",
            "message[add][0][origin]": "telegram",
            "message[add][0][attachment][type]": "picture",
            "message[add][0][attachment][link]": "https://dummyimage.com/800x400/ffffff/000000.png&text=RECIBO",
            "message[add][0][attachment][file_name]": "recibo_ok.png",
        }
        _, status = req_form(N8N_WEBHOOK_BASE + cobranza_harness_path, form_img_ok)
        time.sleep(5)
        rc_after_1 = kommo_get_lead(rc_id)
        pago1 = float(lead_field(rc_after_1, field_ids["pago_realizado"]) or 0)
        saldo1 = float(lead_field(rc_after_1, field_ids["saldo_pendiente"]) or 0)
        partial_ok = True
        if stage_ids.get("pago_parcial"):
            partial_ok = int(rc_after_1.get("status_id")) == int(stage_ids["pago_parcial"])
        record("receipt_image_updates_balance", status == 200 and pago1 > 0 and saldo1 < 500.0 and partial_ok, {"pago": pago1, "saldo": saldo1, "status_id": rc_after_1.get("status_id")})

        # Duplicate same image/link should not apply again
        _, status = req_form(N8N_WEBHOOK_BASE + cobranza_harness_path, form_img_ok)
        time.sleep(4)
        rc_after_2 = kommo_get_lead(rc_id)
        pago2 = float(lead_field(rc_after_2, field_ids["pago_realizado"]) or 0)
        saldo2 = float(lead_field(rc_after_2, field_ids["saldo_pendiente"]) or 0)
        record("receipt_duplicate_idempotent", status == 200 and abs(pago2 - pago1) < 0.001 and abs(saldo2 - saldo1) < 0.001, {"pago_before": pago1, "pago_after": pago2})

        # Invalid image (no amount in OCR or text)
        form_img_bad = dict(form_img_ok)
        form_img_bad["message[add][0][text]"] = "Adjunto comprobante"
        form_img_bad["message[add][0][chat_id]"] = "e2e-chat-recibo-2"
        form_img_bad["message[add][0][attachment][link]"] = "https://dummyimage.com/800x400/ffffff/000000.png&text=SIN+MONTO"
        form_img_bad["message[add][0][attachment][file_name]"] = "recibo_nomonto.png"
        _, status = req_form(N8N_WEBHOOK_BASE + cobranza_harness_path, form_img_bad)
        time.sleep(4)
        rc_after_3 = kommo_get_lead(rc_id)
        pago3 = float(lead_field(rc_after_3, field_ids["pago_realizado"]) or 0)
        saldo3 = float(lead_field(rc_after_3, field_ids["saldo_pendiente"]) or 0)
        record("receipt_invalid_image_no_balance_change", status == 200 and abs(pago3 - pago2) < 0.001 and abs(saldo3 - saldo2) < 0.001, {"pago_before": pago2, "pago_after": pago3})

        # Text-only payment evidence via AI
        form_text_ok = {
            "message[add][0][text]": "Hola, abone 35.75 a la factura",
            "message[add][0][author][name]": "E2E Bot",
            "message[add][0][element_id]": str(rc_id),
            "message[add][0][talk_id]": "777002",
            "message[add][0][chat_id]": "e2e-chat-text-1",
            "message[add][0][origin]": "telegram",
        }
        _, status = req_form(N8N_WEBHOOK_BASE + cobranza_harness_path, form_text_ok)
        time.sleep(5)
        rc_after_text = kommo_get_lead(rc_id)
        pago_text = float(lead_field(rc_after_text, field_ids["pago_realizado"]) or 0)
        saldo_text = float(lead_field(rc_after_text, field_ids["saldo_pendiente"]) or 0)
        record(
            "receipt_text_ai_updates_balance",
            status == 200 and pago_text >= pago3 + 35 and saldo_text <= saldo3 - 35,
            {"pago_before": pago3, "pago_after": pago_text, "saldo_before": saldo3, "saldo_after": saldo_text},
        )
        pago3 = pago_text
        saldo3 = saldo_text

        # Valid PDF (digital/plain text file with .pdf extension)
        pdf_url = upload_fake_pdf_with_amount("50.25")
        form_pdf_ok = dict(form_img_ok)
        form_pdf_ok["message[add][0][text]"] = "Adjunto PDF de pago"
        form_pdf_ok["message[add][0][chat_id]"] = "e2e-chat-recibo-3"
        form_pdf_ok["message[add][0][attachment][type]"] = "document"
        form_pdf_ok["message[add][0][attachment][link]"] = pdf_url
        form_pdf_ok["message[add][0][attachment][file_name]"] = "comprobante.pdf"
        _, status = req_form(N8N_WEBHOOK_BASE + cobranza_harness_path, form_pdf_ok)
        time.sleep(5)
        rc_after_4 = kommo_get_lead(rc_id)
        pago4 = float(lead_field(rc_after_4, field_ids["pago_realizado"]) or 0)
        saldo4 = float(lead_field(rc_after_4, field_ids["saldo_pendiente"]) or 0)
        record("receipt_pdf_updates_balance", status == 200 and pago4 >= pago3 + 50 and saldo4 <= saldo3 - 50, {"pago_before": pago3, "pago_after": pago4, "pdf_url": pdf_url})

        # Liquidation to paid status
        form_liq = dict(form_img_ok)
        form_liq["message[add][0][text]"] = "liquidacion 9999.99"
        form_liq["message[add][0][chat_id]"] = "e2e-chat-recibo-4"
        form_liq["message[add][0][attachment][link]"] = "https://dummyimage.com/800x400/ffffff/000000.png&text=LIQUIDACION"
        form_liq["message[add][0][attachment][file_name]"] = "liquidacion.png"
        _, status = req_form(N8N_WEBHOOK_BASE + cobranza_harness_path, form_liq)
        time.sleep(5)
        rc_after_5 = kommo_get_lead(rc_id)
        saldo5 = float(lead_field(rc_after_5, field_ids["saldo_pendiente"]) or 0)
        record("receipt_liquidates_and_marks_paid", status == 200 and saldo5 == 0 and int(rc_after_5.get("status_id")) == paid_status_id, {"saldo_final": saldo5, "status_id": rc_after_5.get("status_id")})

        # ---------- Integration non-cobranza lead ----------
        nc_id = kommo_create_lead(
            f"Factura {prefix}NC",
            field_ids,
            "",
            "5215553999000",
            700.0,
            0.0,
            now_iso(2),
            include_cobranza_tag=False,
            pipeline_id=pipeline_id,
        )
        created_leads.append(nc_id)
        nc_before = kommo_get_lead(nc_id)
        nc_pago_before = float(lead_field(nc_before, field_ids["pago_realizado"]) or 0)
        nc_saldo_before = float(lead_field(nc_before, field_ids["saldo_pendiente"]) or 0)

        form_non_cob = {
            "message[add][0][text]": "abono 999.99",
            "message[add][0][author][name]": "E2E Bot",
            "message[add][0][element_id]": str(nc_id),
            "message[add][0][talk_id]": "999990",
            "message[add][0][chat_id]": "e2e-noncob-1",
            "message[add][0][origin]": "telegram",
            "message[add][0][attachment][type]": "picture",
            "message[add][0][attachment][link]": "https://dummyimage.com/800x400/ffffff/000000.png&text=NOCOB",
            "message[add][0][attachment][file_name]": "nocob.png",
        }
        _, status = req_form(N8N_WEBHOOK_BASE + cobranza_harness_path, form_non_cob)
        time.sleep(5)
        nc_after = kommo_get_lead(nc_id)
        nc_pago_after = float(lead_field(nc_after, field_ids["pago_realizado"]) or 0)
        nc_saldo_after = float(lead_field(nc_after, field_ids["saldo_pendiente"]) or 0)
        record(
            "integration_non_cobranza_ignored",
            status == 200 and abs(nc_pago_after - nc_pago_before) < 0.001 and abs(nc_saldo_after - nc_saldo_before) < 0.001,
            {"pago_before": nc_pago_before, "pago_after": nc_pago_after, "saldo_before": nc_saldo_before, "saldo_after": nc_saldo_after},
        )

    finally:
        for wf_id in temp_workflows:
            try:
                n8n_deactivate(wf_id)
            except Exception:
                pass
            try:
                n8n_delete(wf_id)
            except Exception:
                pass

        for lead_id in created_leads:
            try:
                kommo_delete_lead(lead_id)
            except Exception:
                pass

    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    summary = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "passed": passed,
        "total": total,
        "all_passed": passed == total,
        "results": results,
    }
    with open("e2e_test_report.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print("\n=== E2E SUMMARY ===")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    run()
