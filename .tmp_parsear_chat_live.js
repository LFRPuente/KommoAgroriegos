const p = $json.body ?? $json;
let data = p;
if (typeof data === 'string') {
  data = Object.fromEntries(new URLSearchParams(data));
}

const request_id = ($json.headers && ($json.headers['x-amocrm-requestid'] || $json.headers['X-AMOCRM-REQUESTID'])) || '';
const message_text = data['message[add][0][text]'] || '';
const contact_name = data['message[add][0][author][name]'] || '';
const lead_id = data['message[add][0][element_id]'] || data['message[add][0][entity_id]'] || '';
const talk_id = data['message[add][0][talk_id]'] || '';
const chat_id = data['message[add][0][chat_id]'] || '';
const origin = data['message[add][0][origin]'] || '';
const attachment_type = data['message[add][0][attachment][type]'] || '';
const media_url = data['message[add][0][attachment][link]'] || '';
const media_filename = data['message[add][0][attachment][file_name]'] || 'file';
const is_audio = attachment_type === 'voice';
const is_image = attachment_type === 'picture';
const is_document = attachment_type === 'document' || attachment_type === 'file' || String(media_filename).toLowerCase().endsWith('.pdf');
const is_media = is_audio || is_image || is_document;

if (!lead_id) {
  return { json: { skip_reason: 'missing_lead_id', request_id, lead_id: '', message_text: '', is_media: false } };
}
if (!message_text && !is_media) {
  return { json: { skip_reason: 'empty_message', request_id, lead_id: String(lead_id), message_text: '', is_media: false } };
}

return {
  json: {
    request_id,
    message_text,
    contact_name,
    lead_id,
    talk_id,
    chat_id,
    origin,
    sessionId: talk_id,
    is_audio,
    is_image,
    is_document,
    is_media,
    media_url,
    media_filename,
    attachment_type,
  }
};
