// const axios = require('axios');

// async function sendWhatsAppMessage(to, message) {
//   const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
//   const token = process.env.WHATSAPP_META_TOKEN;

//   // Validate required environment variables
//   if (!phoneNumberId) {
//     throw new Error('WHATSAPP_META_PHONE_NUMBER_ID environment variable is not set');
//   }
  
//   if (!token) {
//     throw new Error('WHATSAPP_META_TOKEN environment variable is not set');
//   }

//   // Clean the token to remove any invalid characters
//   const cleanToken = token.trim().replace(/[^\w\-\.]/g, '');
  
//   const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
//   const data = {
//     messaging_product: 'whatsapp',
//     to,
//     type: 'text',
//     text: { body: message },
//   };
  
//   try {
//     await axios.post(url, data, {
//       headers: {
//         Authorization: `Bearer ${cleanToken}`,
//         'Content-Type': 'application/json',
//       },
//     });
//   } catch (error) {
//     console.error('WhatsApp API Error:', error.response?.data || error.message);
//     throw error;
//   }
// }

// module.exports = { sendWhatsAppMessage }; 

// services/whatsappService.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// optional override; defaults to v18.0 just like your original
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v18.0';

/* ──────────────────────────────────────────────────────────────
   ORIGINAL: text message sender (kept exactly, minus comments)
   ────────────────────────────────────────────────────────────── */
async function sendWhatsAppMessage(to, message) {
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_META_TOKEN;

  // Validate required environment variables
  if (!phoneNumberId) {
    throw new Error('WHATSAPP_META_PHONE_NUMBER_ID environment variable is not set');
  }
  if (!token) {
    throw new Error('WHATSAPP_META_TOKEN environment variable is not set');
  }

  // Clean the token to remove any invalid characters
  const cleanToken = token.trim().replace(/[^\w\-\.]/g, '');

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message },
  };

  try {
    await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('WhatsApp API Error:', error.response?.data || error.message);
    throw error;
  }
}

/* ──────────────────────────────────────────────────────────────
   NEW: helpers to upload & send a document (CSV, XLSX, PDF…)
   CSV is uploaded as text/plain (allowed by WhatsApp Cloud API)
   ────────────────────────────────────────────────────────────── */

// map file extension -> allowed WhatsApp MIME
function detectMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf':  return 'application/pdf';
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls':  return 'application/vnd.ms-excel';
    case '.doc':  return 'application/msword';
    case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.ppt':  return 'application/vnd.ms-powerpoint';
    case '.pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case '.txt':  return 'text/plain';
    case '.csv':  return 'text/plain'; // << key: CSV as text/plain (text/csv is NOT allowed)
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png':  return 'image/png';
    case '.webp': return 'image/webp';
    default:      return 'text/plain'; // safe fallback for docs
  }
}

function graphUrl(segment) {
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/${segment}`;
}

function getCleanToken() {
  const token = process.env.WHATSAPP_META_TOKEN;
  if (!token) throw new Error('WHATSAPP_META_TOKEN environment variable is not set');
  return token.trim().replace(/[^\w\-\.]/g, '');
}

// 1) Upload local file -> returns mediaId
// Replace ONLY this function in services/whatsappService.js

async function uploadMedia(filePath, mimeOverride) {
  const fs = require('fs');
  const path = require('path');
  const axios = require('axios');
  const FormData = require('form-data');

  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v18.0';
  const tokenRaw = process.env.WHATSAPP_META_TOKEN;

  if (!phoneNumberId) throw new Error('WHATSAPP_META_PHONE_NUMBER_ID environment variable is not set');
  if (!tokenRaw) throw new Error('WHATSAPP_META_TOKEN environment variable is not set');
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  // Clean token like your original code
  const cleanToken = tokenRaw.trim().replace(/[^\w\-\.]/g, '');

  // Decide MIME (CSV must be sent as text/plain to pass WhatsApp validation)
  const ext = path.extname(filePath).toLowerCase();
  let type = mimeOverride || (ext === '.csv' ? 'text/plain' : (
    ext === '.pdf'  ? 'application/pdf' :
    ext === '.xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
    ext === '.xls'  ? 'application/vnd.ms-excel' :
    ext === '.txt'  ? 'text/plain' :
    ext === '.doc'  ? 'application/msword' :
    ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
    ext === '.ppt'  ? 'application/vnd.ms-powerpoint' :
    ext === '.pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' :
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
    ext === '.png'  ? 'image/png' :
    ext === '.webp' ? 'image/webp' :
    'text/plain'
  ));

  const form = new FormData();

  // IMPORTANT: force the multipart *file part* content type.
  // Without this, FormData infers 'text/csv' from the extension and WhatsApp rejects it.
  form.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),       // keep your original filename (even .csv)
    contentType: type                        // <- force allowed MIME (e.g., text/plain)
  });

  // WhatsApp also expects a 'type' field that matches the file part content type
  form.append('messaging_product', 'whatsapp');
  form.append('type', type);

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/media`;

  try {
    const { data } = await axios.post(url, form, {
      headers: { Authorization: `Bearer ${cleanToken}`, ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength:   Infinity,
    });
    return data.id; // mediaId
  } catch (error) {
    console.error('WhatsApp UPLOAD Error:', error.response?.data || error.message);
    throw error;
  }
}


// 2) Send a document by mediaId
async function sendDocumentById(to, mediaId, filename, caption = '') {
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error('WHATSAPP_META_PHONE_NUMBER_ID environment variable is not set');

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: { id: mediaId, filename, caption },
  };

  try {
    const { data } = await axios.post(
      graphUrl('messages'),
      payload,
      { headers: { Authorization: `Bearer ${getCleanToken()}`, 'Content-Type': 'application/json' } }
    );
    return data;
  } catch (error) {
    console.error('WhatsApp DOC Error:', error.response?.data || error.message);
    throw error;
  }
}

// 3) Convenience: upload + send from a local file path
async function sendDocumentFromPath(to, filePath, caption = 'ClickUp noncompliance report') {
  const filename = path.basename(filePath);
  const mediaId = await uploadMedia(filePath); // auto MIME via detectMime()
  return sendDocumentById(to, mediaId, filename, caption);
}

// 4) Utility: find the newest CSV report in /reports
function getLatestReport(dir = path.resolve(__dirname, '../reports')) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('clickup_noncompliance_') && f.endsWith('.csv'))
    .map(f => {
      const p = path.join(dir, f);
      return { path: p, mtime: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path || null;
}

// 5) One-liner: send the newest CSV in /reports
async function sendLatestClickupReport(to = process.env.TEAM_LEAD_NUMBER, caption = 'ClickUp noncompliance report') {
  const file = getLatestReport();
  if (!file) throw new Error('No CSV report found in /reports');
  return sendDocumentFromPath(to, file, caption);
}

module.exports = {
  // your original export:
  sendWhatsAppMessage,
  // new helpers (non-breaking):
  uploadMedia,
  sendDocumentById,
  sendDocumentFromPath,
  getLatestReport,
  sendLatestClickupReport,
};
