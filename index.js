// // index.js
// require('dotenv').config();

// const express = require('express');
// const { google } = require('googleapis');
// const axios = require('axios');
// const dayjs = require('dayjs');
// const customParseFormat = require('dayjs/plugin/customParseFormat');
// const cron = require('node-cron');

// // Jobs
// const dailyClockifyCheck = require('./jobs/dailyClockifyCheck');
// const { runClickUpInProgressReport } = require('./jobs/clickupInProgressReport');

// // === AI Analysis Service (auto-schedules 6 PM IST email on require) ===
// const aiAnalysisService = require('./services/aiAnalysisService');

// // WhatsApp helpers used for audit attachments + summary
// const { sendDocumentFromPath, sendWhatsAppMessage: waSendText } = require('./services/whatsappService');

// dayjs.extend(customParseFormat);

// const app = express();
// const PORT = process.env.PORT || 9000;
// const TZ = 'Asia/Kolkata';

// // ───────────────────────────────────────────────────────────
// // Body parsing
// // ───────────────────────────────────────────────────────────
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// // ───────────────────────────────────────────────────────────
// // Google Sheets setup
// // ───────────────────────────────────────────────────────────
// let auth = null;
// let SHEET_ID = null;

// if (process.env.GOOGLE_CREDENTIALS_JSON) {
//   try {
//     auth = new google.auth.GoogleAuth({
//       credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
//       scopes: ["https://www.googleapis.com/auth/spreadsheets"],
//     });
//     SHEET_ID = process.env.SHEET_ID;
//     console.log("✅ Google Sheets configured successfully");
//   } catch (error) {
//     console.warn("⚠️ Google Sheets credentials not properly configured:", error.message);
//   }
// } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('{')) {
//   try {
//     auth = new google.auth.GoogleAuth({
//       credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
//       scopes: ["https://www.googleapis.com/auth/spreadsheets"],
//     });
//     SHEET_ID = process.env.SHEET_ID;
//     console.log("✅ Google Sheets configured successfully (using GOOGLE_APPLICATION_CREDENTIALS as JSON)");
//   } catch (error) {
//     console.warn("⚠️ Google Sheets credentials not properly configured:", error.message);
//   }
// } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('{')) {
//   try {
//     auth = new google.auth.GoogleAuth({
//       keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
//       scopes: ["https://www.googleapis.com/auth/spreadsheets"],
//     });
//     SHEET_ID = process.env.SHEET_ID;
//     console.log("✅ Google Sheets configured successfully (using keyFile)");
//   } catch (error) {
//     console.warn("⚠️ Google Sheets credentials not properly configured:", error.message);
//   }
// } else {
//   console.warn("⚠️ GOOGLE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS not found. Google Sheets functionality will be disabled.");
// }

// async function addEventToSheet([title, start, end]) {
//   if (!auth || !SHEET_ID) {
//     throw new Error("Google Sheets not configured. Please set GOOGLE_CREDENTIALS_JSON and SHEET_ID environment variables.");
//   }
//   const client = await auth.getClient();
//   const sheets = google.sheets({ version: "v4", auth: client });

//   await sheets.spreadsheets.values.append({
//     spreadsheetId: SHEET_ID,
//     range: "Sheet1!A1",
//     valueInputOption: "USER_ENTERED",
//     resource: { values: [[title, start, end]] },
//   });
// }

// // ───────────────────────────────────────────────────────────
// // WhatsApp sender (local) for the event workflow
// // (avoid name clash with helper by using a different name)
// // ───────────────────────────────────────────────────────────
// async function sendWhatsAppTextLocal(to, message) {
//   const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
//   const token = process.env.WHATSAPP_META_TOKEN;

//   if (!phoneNumberId) throw new Error('WHATSAPP_META_PHONE_NUMBER_ID environment variable is not set');
//   if (!token) throw new Error('WHATSAPP_META_TOKEN environment variable is not set');

//   const cleanToken = token.trim().replace(/[^\w\-\.]/g, '');

//   await axios.post(
//     `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
//     {
//       messaging_product: "whatsapp",
//       to,
//       type: "text",
//       text: { body: message },
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${cleanToken}`,
//         "Content-Type": "application/json",
//       },
//     }
//   );
// }

// // ───────────────────────────────────────────────────────────
// // ClickUp full audit runner (uses aiAnalysisService + WA helpers)
// // ───────────────────────────────────────────────────────────
// async function runClickUpAudit({ to, dryRun = false } = {}) {
//   try {
//     const toNumber =
//       to ||
//       process.env.TEAM_LEAD_NUMBER ||
//       (process.env.OWNER_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean)[0] ||
//       process.env.OWNER_NUMBER ||
//       null;

//     // Run audit (will send WhatsApp summary inside if "to" is provided)
//     const { summary, meta, csvExports } = await aiAnalysisService.analyzeAndSendReport({
//       dryRun,
//       to: toNumber,
//       exportCSV: true,
//     });

//     // Optionally send the generated CSV files as WhatsApp documents
//     if (!dryRun && toNumber && csvExports) {
//       try {
//         if (csvExports.poor?.path) {
//           await sendDocumentFromPath(toNumber, csvExports.poor.path, 'ClickUp poor tasks');
//         }
//         if (csvExports.excellent?.path) {
//           await sendDocumentFromPath(toNumber, csvExports.excellent.path, 'ClickUp excellent tasks');
//         }
//       } catch (e) {
//         console.error('❌ Failed to send audit CSVs via WhatsApp:', e?.response?.data || e.message);
//       }
//     }

//     console.log('✅ ClickUp audit finished. Meta:', meta);
//     return { summary, meta };
//   } catch (e) {
//     console.error('❌ runClickUpAudit failed:', e?.response?.data || e.message);
//     throw e;
//   }
// }

// // ───────────────────────────────────────────────────────────
// // Session store (user ↔ step) for Google Sheets events
// // ───────────────────────────────────────────────────────────
// const sessions = new Map();

// function parseDate(input) {
//   const formats = [
//     "D MMM YY HH:mm",
//     "DD MMM YY HH:mm",
//     "D MMM YYYY HH:mm",
//     "DD MMM YYYY HH:mm"
//   ];
//   for (let format of formats) {
//     const parsed = dayjs(input, format, true);
//     if (parsed.isValid()) return parsed.format("YYYY-MM-DD HH:mm");
//   }
//   return input;
// }

// // ───────────────────────────────────────────────────────────
// // Routes
// // ───────────────────────────────────────────────────────────
// app.get('/', (req, res) => {
//   res.send('API is running - Clockify + WhatsApp to Google Sheets + ClickUp Audit');
// });

// // Meta verification
// app.get('/webhook', (req, res) => {
//   const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
//   const mode = req.query['hub.mode'];
//   const token = req.query['hub.verify_token'];
//   const challenge = req.query['hub.challenge'];

//   console.log('🔔 VERIFY: ', { mode, token, challenge });

//   if (mode === 'subscribe' && token === VERIFY_TOKEN) {
//     console.log("✅ Meta webhook verified");
//     return res.status(200).send(challenge);
//   }
//   res.sendStatus(403);
// });

// // Meta messages
// const OWNER_NUMBERS = process.env.OWNER_NUMBERS
//   ? process.env.OWNER_NUMBERS.split(',').map(n => n.trim())
//   : [process.env.OWNER_NUMBER];

// const ALLOWED_NUMBERS = [...OWNER_NUMBERS, "15551281515"]; // Add sandbox if needed
// const EVENT_CREATOR_NUMBER = "919746462423";

// app.post('/webhook', async (req, res) => {
//   try {
//     const entry = req.body.entry?.[0];
//     const changes = entry?.changes?.[0];
//     const message = changes?.value?.messages?.[0];

//     if (!message) return res.sendStatus(200);

//     const sender = message.from;
//     const text = message.text?.body?.trim();
//     console.log("📩 Message from:", sender, "|", text);

//     if (!ALLOWED_NUMBERS.includes(sender)) {
//       console.log("❌ Unauthorized sender:", sender);
//       return res.sendStatus(200);
//     }

//     if (!sessions.has(sender)) sessions.set(sender, { step: null, data: {} });
//     const session = sessions.get(sender);

//     try {
//       if (/^add event$/i.test(text)) {
//         if (sender !== EVENT_CREATOR_NUMBER) {
//           await sendWhatsAppTextLocal(sender, "❌ You are not authorized to create events. Only the admin can add events to Google Sheets.");
//           return res.sendStatus(200);
//         }
//         session.step = "await_title";
//         session.data = {};
//         await sendWhatsAppTextLocal(sender, "Add your Event Title");
//       } else if (session.step === "await_title") {
//         if (sender !== EVENT_CREATOR_NUMBER) {
//           await sendWhatsAppTextLocal(sender, "❌ You are not authorized to create events. Only the admin can add events to Google Sheets.");
//           sessions.delete(sender);
//           return res.sendStatus(200);
//         }
//         session.data.title = text;
//         session.step = "await_start";
//         await sendWhatsAppTextLocal(sender, "Add the start date (e.g. 2 Jul 25 10:00)");
//       } else if (session.step === "await_start") {
//         if (sender !== EVENT_CREATOR_NUMBER) {
//           await sendWhatsAppTextLocal(sender, "❌ You are not authorized to create events. Only the admin can add events to Google Sheets.");
//           sessions.delete(sender);
//           return res.sendStatus(200);
//         }
//         session.data.start = parseDate(text);
//         session.step = "await_end";
//         await sendWhatsAppTextLocal(sender, "Add the end date (e.g. 2 Jul 25 11:00)");
//       } else if (session.step === "await_end") {
//         if (sender !== EVENT_CREATOR_NUMBER) {
//           await sendWhatsAppTextLocal(sender, "❌ You are not authorized to create events. Only the admin can add events to Google Sheets.");
//           sessions.delete(sender);
//           return res.sendStatus(200);
//         }
//         session.data.end = parseDate(text);
//         await addEventToSheet([
//           session.data.title,
//           session.data.start,
//           session.data.end
//         ]);
//         sessions.delete(sender);
//         await sendWhatsAppTextLocal(sender, "✅ Event added to Google Sheets. Have a nice day!");
//       } else {
//         if (sender === EVENT_CREATOR_NUMBER) {
//           await sendWhatsAppTextLocal(sender, "Send 'Add event' to start adding an event to Google Sheets.");
//         } else {
//           await sendWhatsAppTextLocal(sender, "❌ You are not authorized to create events. Only the admin can add events to Google Sheets.");
//         }
//       }
//     } catch (error) {
//       console.error("❌ Error sending WhatsApp message:", error.message);
//     }

//     res.sendStatus(200);
//   } catch (err) {
//     console.error("❌ Error in webhook handler:", err);
//     res.sendStatus(500);
//   }
// });

// // Local test route for Google Sheets
// app.post('/webhook/test', async (req, res) => {
//   const sender = req.body.from || "anonymous";
//   const message = req.body.text?.trim();

//   if (!sessions.has(sender)) sessions.set(sender, { step: null, data: {} });
//   const session = sessions.get(sender);

//   try {
//     if (message.startsWith("Add Event |")) {
//       const parts = message.split("|").map(p => p.trim());
//       if (parts.length !== 4) {
//         return res.status(400).json({ message: "Use: Add Event | Title | Start | End" });
//       }
//       const [, title, start, end] = parts;
//       await addEventToSheet([title, parseDate(start), parseDate(end)]);
//       sessions.delete(sender);
//       return res.json({ message: "✅ Event added to sheet" });
//     }

//     if (/^add event$/i.test(message)) {
//       session.step = "await_title";
//       session.data = {};
//       return res.json({ message: "Add your Event Title" });
//     }

//     if (session.step === "await_title") {
//       session.data.title = message;
//       session.step = "await_start";
//       return res.json({ message: "Add the start date (e.g. 2 Jul 25 10:00)" });
//     }

//     if (session.step === "await_start") {
//       session.data.start = parseDate(message);
//       session.step = "await_end";
//       return res.json({ message: "Add the end date (e.g. 2 Jul 25 11:00)" });
//     }

//     if (session.step === "await_end") {
//       session.data.end = parseDate(message);
//       await addEventToSheet([
//         session.data.title,
//         session.data.start,
//         session.data.end
//       ]);
//       sessions.delete(sender);
//       return res.json({ message: "✅ Event added. Have a nice day!" });
//     }

//     return res.json({ message: "Send 'Add event' to start adding an event." });
//   } catch (err) {
//     console.error("❌ Error:", err);
//     sessions.delete(sender);
//     return res.status(500).json({ message: "❌ Something went wrong." });
//   }
// });

// // Manual audit trigger (HTTP)
// app.get('/api/audit/run', async (req, res) => {
//   try {
//     const dryRun = String(req.query.dry || '0') === '1';
//     const to = req.query.to || null;
//     const result = await runClickUpAudit({ to, dryRun });
//     res.json({ ok: true, ...result });
//   } catch (e) {
//     res.status(500).json({ ok: false, error: e.message });
//   }
// });

// // ───────────────────────────────────────────────────────────
// // Error handling
// // ───────────────────────────────────────────────────────────
// app.use((error, req, res, next) => {
//   console.error('❌ Server Error:', error.message);

//   if (error.type === 'entity.parse.failed') {
//     return res.status(400).json({ error: 'Invalid JSON payload' });
//   }
//   if (error.message.includes('stream is not readable')) {
//     return res.status(400).json({ error: 'Invalid request body' });
//   }
//   res.status(500).json({ error: 'Internal server error' });
// });

// // ───────────────────────────────────────────────────────────
// // Server startup
// // ───────────────────────────────────────────────────────────
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
//   console.log('📅 Clockify + WhatsApp to Google Sheets + ClickUp Audit active');
// });

// // ───────────────────────────────────────────────────────────
// // Clockify daily check initialization
// // ───────────────────────────────────────────────────────────
// (async () => {
//   console.log('Starting daily Clockify check...');
//   await dailyClockifyCheck();
//   console.log('Finished daily Clockify check.');
// })();

// // ───────────────────────────────────────────────────────────
// // Cron jobs (IST)
// // ───────────────────────────────────────────────────────────

// // Clockify: every 10 minutes from 09:00–16:59 IST
// cron.schedule('*/10 9-16 * * *', async () => {
//   console.log('⏰ Cron tick (*/10 9-16) — running dailyClockifyCheck');
//   try {
//     await dailyClockifyCheck();
//   } catch (e) {
//     console.error('❌ Cron (*/10 9-16) failed:', e);
//   }
// }, { timezone: TZ });

// // Clockify: one last run exactly at 17:00 IST
// cron.schedule('0 17 * * *', async () => {
//   console.log('⏰ Cron tick (17:00) — running dailyClockifyCheck');
//   try {
//     await dailyClockifyCheck();
//   } catch (e) {
//     console.error('❌ Cron (17:00) failed:', e);
//   }
// }, { timezone: TZ });

// // ClickUp "IN PROGRESS" report hourly 09:00–17:00 IST
// cron.schedule('0 9-17 * * *', async () => {
//   try {
//     const { count } = await runClickUpInProgressReport();
//     console.log(`[CRON] ClickUp report sent (hourly 9–17 IST). Tasks: ${count}`);
//   } catch (e) {
//     console.error('❌ CRON ClickUp hourly error:', e?.response?.data || e.message);
//   }
// }, { timezone: TZ });

// // ClickUp full audit daily at 17:30 IST (kept separate from 18:00 email)
// cron.schedule('30 17 * * *', async () => {
//   console.log('⏰ Cron (17:30) — running ClickUp full audit');
//   try {
//     await runClickUpAudit({});
//   } catch (e) {
//     console.error('❌ Cron audit failed:', e);
//   }
// }, { timezone: TZ });

// // ───────────────────────────────────────────────────────────
// // ClickUp "IN PROGRESS" report on startup (optional via .env)
// // ───────────────────────────────────────────────────────────
// (async () => {
//   try {
//     if (String(process.env.STARTUP_CLICKUP_REPORT).toLowerCase() === 'true') {
//       await new Promise(r => setTimeout(r, 3000));
//       console.log('[STARTUP] Sending ClickUp IN PROGRESS report...');
//       const { count } = await runClickUpInProgressReport();
//       console.log(`[STARTUP] ClickUp report sent. Tasks: ${count}`);
//     } else {
//       console.log('[STARTUP] ClickUp startup report disabled (set STARTUP_CLICKUP_REPORT=true to enable).');
//     }
//   } catch (e) {
//     console.error('[STARTUP] ClickUp report failed:', e?.response?.data || e.message);
//   }
// })();

// index.js  (test.js merged so you only run: node index.js)
require('dotenv').config();

const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

dayjs.extend(customParseFormat);

// ───────────────────────────────────────────────────────────
// Jobs
// ───────────────────────────────────────────────────────────
const dailyClockifyCheck = require('./jobs/dailyClockifyCheck');
const { runClickUpInProgressReport } = require('./jobs/clickupInProgressReport');

// IMPORTANT: make sure the filename matches case on disk
// If your file is "services/AIAnalysisService.js", change the require line:
const aiAnalysisService = require('./services/aiAnalysisService'); // or './services/AIAnalysisService'

// WhatsApp helpers for sending text + documents
const { sendDocumentFromPath, sendWhatsAppMessage } = require('./services/whatsappService');

const app = express();
const PORT = process.env.PORT || 9000;
const TZ = 'Asia/Kolkata';

// ───────────────────────────────────────────────────────────
// Body parsing
// ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ───────────────────────────────────────────────────────────
// Google Sheets setup
// ───────────────────────────────────────────────────────────
let auth = null;
let SHEET_ID = null;

if (process.env.GOOGLE_CREDENTIALS_JSON) {
  try {
    auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    SHEET_ID = process.env.SHEET_ID;
    console.log("✅ Google Sheets configured successfully");
  } catch (error) {
    console.warn("⚠️ Google Sheets credentials not properly configured:", error.message);
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('{')) {
  try {
    auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    SHEET_ID = process.env.SHEET_ID;
    console.log("✅ Google Sheets configured successfully (using GOOGLE_APPLICATION_CREDENTIALS as JSON)");
  } catch (error) {
    console.warn("⚠️ Google Sheets credentials not properly configured:", error.message);
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('{')) {
  try {
    auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    SHEET_ID = process.env.SHEET_ID;
    console.log("✅ Google Sheets configured successfully (using keyFile)");
  } catch (error) {
    console.warn("⚠️ Google Sheets credentials not properly configured:", error.message);
  }
} else {
  console.warn("⚠️ GOOGLE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS not found. Google Sheets functionality will be disabled.");
}

async function addEventToSheet([title, start, end]) {
  if (!auth || !SHEET_ID) {
    throw new Error("Google Sheets not configured. Please set GOOGLE_CREDENTIALS_JSON and SHEET_ID.");
  }
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Sheet1!A1",
    valueInputOption: "USER_ENTERED",
    resource: { values: [[title, start, end]] },
  });
}

// ───────────────────────────────────────────────────────────
// WhatsApp helper for the event workflow (local, direct Meta)
// ───────────────────────────────────────────────────────────
async function sendWhatsAppTextLocal(to, message) {
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_META_TOKEN;
  if (!phoneNumberId) throw new Error('WHATSAPP_META_PHONE_NUMBER_ID not set');
  if (!token) throw new Error('WHATSAPP_META_TOKEN not set');
  const cleanToken = token.trim().replace(/[^\w\-\.]/g, '');
  await axios.post(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    { messaging_product: "whatsapp", to, type: "text", text: { body: message } },
    { headers: { Authorization: `Bearer ${cleanToken}`, "Content-Type": "application/json" } }
  );
}

// ───────────────────────────────────────────────────────────
// Utility (CSV quoting)
// ───────────────────────────────────────────────────────────
function csvQuote(s) {
  const v = String(s ?? '');
  return `"${v.replace(/"/g, '""')}"`;
}

// ───────────────────────────────────────────────────────────
// FULL AUDIT RUNNER (merged test.js behaviour)
// - Runs ClickUp audit
// - Logs compliant / non-compliant
// - Saves CSV + Excel
// - Sends WA summary + CSV
// - Sends "Daily Creation Quality" email now
// Controlled by env (see bottom notes)
// ───────────────────────────────────────────────────────────
async function runFullAuditAndEmailNow() {
  try {
    console.log('🚀 Auditing ALL ClickUp tasks (incl. closed)…');
    console.log('🔧 Env:', aiAnalysisService.envSummary());

    const dryRun = String(process.env.AUDIT_DRY_RUN || 'false').toLowerCase() === 'true';
    const toOverride = process.env.AUDIT_WHATSAPP_TO || null; // optional override
    const saveHtml = String(process.env.AUDIT_SAVE_HTML || 'false').toLowerCase() === 'true';
    const emailToOverride = process.env.AUDIT_EMAIL_TO || null; // optional override for email recipient

    // 1) Run the audit (summary text is already "polished" inside the service)
    const { summary, meta, results, nonCompliant, compliant, sent } =
      await aiAnalysisService.analyzeAndSendReport({
        dryRun,
        to: toOverride || process.env.TEAM_LEAD_NUMBER
      });

    // 2) Console: full details of compliant
    if (compliant && compliant.length) {
      console.log(`\n✅ Compliant tasks (${compliant.length}) - Meeting all standards:`);
      compliant
        .sort((a, b) => b.score - a.score)
        .forEach((r, i) => {
          console.log(
            [
              `${i + 1}. ${r.name}`,
              ` - URL: ${r.url}`,
              ` - Status: ${r.status || '-'}`,
              ` - Assignees: ${r.assignees.length ? r.assignees.join(', ') : 'Unassigned'}`,
              ` - Due: ${r.due || '-'}`,
              ` - Priority: ${r.priority ?? '-'}`,
              ` - Score: ${r.score}/100 (${r.complianceLevel})`,
              ` - List: ${r.listName || 'Unknown'}`,
            ].join('\n')
          );
          console.log('');
        });
    }

    // 3) Console: full details of non-compliant
    if (nonCompliant.length) {
      console.log(`\n❗ Non-compliant tasks (${nonCompliant.length}) - Need improvement:`);
      nonCompliant
        .sort((a, b) => a.score - b.score)
        .forEach((r, i) => {
          const critical = r.criticalIssues && r.criticalIssues.length > 0 ? ' ⚠️ CRITICAL' : '';
          console.log(
            [
              `${i + 1}. ${r.name}${critical}`,
              ` - URL: ${r.url}`,
              ` - Status: ${r.status || '-'}`,
              ` - Assignees: ${r.assignees.length ? r.assignees.join(', ') : 'Unassigned'}`,
              ` - Due: ${r.due || '-'}`,
              ` - Priority: ${r.priority ?? '-'}`,
              ` - Missing: ${r.missingFields.length ? r.missingFields.join(', ') : '—'}`,
              ` - Overdue: ${r.overdue ? 'Yes' : 'No'}`,
              ` - Issues: ${r.issues.join('; ')}`,
              ` - Score: ${r.score}/100 (${r.complianceLevel})`,
              ` - List: ${r.listName || 'Unknown'}`,
            ].join('\n')
          );
          console.log('');
        });
    } else {
      console.log('\n✅ All tasks meet the basic standards - Great job! 🎉');
    }

    // 4) Save CSV with non-compliant
    let csvFileForWA = null;
    if (nonCompliant.length) {
      const dir = path.resolve(__dirname, 'reports');
      fs.mkdirSync(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      csvFileForWA = path.join(dir, `clickup_noncompliance_${ts}.csv`);
      const rows = [
        [
          'TaskID','TaskName','TaskURL','ListID','ListName','Status',
          'Assignees','DueDate','Priority','Score','ComplianceLevel',
          'MissingFields','Overdue','Issues','CriticalIssues'
        ].join(',')
      ];
      nonCompliant.forEach(r => {
        rows.push([
          r.id,
          csvQuote(r.name),
          r.url,
          r.listId || '',
          csvQuote(r.listName || ''),
          csvQuote(r.status || ''),
          csvQuote(r.assignees.join(' | ') || 'Unassigned'),
          r.due || '',
          r.priority ?? '',
          r.score,
          r.complianceLevel || '',
          csvQuote(r.missingFields.join(' | ')),
          r.overdue ? 'Yes' : 'No',
          csvQuote(r.issues.join(' | ')),
          csvQuote((r.criticalIssues || []).join(' | '))
        ].join(','));
      });
      fs.writeFileSync(csvFileForWA, rows.join('\n'), 'utf8');
      console.log(`\n💾 CSV report saved: ${csvFileForWA}`);
    }

    // 5) Save Excel with all results
    if (results && results.length) {
      const dir = path.resolve(__dirname, 'reports');
      fs.mkdirSync(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const excelFile = path.join(dir, `clickup_full_audit_${ts}.xlsx`);
      const excelData = results.map(r => ({
        TaskID: r.id,
        TaskName: r.name,
        TaskURL: r.url,
        ListName: r.listName || '',
        Status: r.status || '',
        Assignees: r.assignees.join(', ') || 'Unassigned',
        DueDate: r.due || '',
        Priority: r.priority ?? '',
        Score: r.score,
        ComplianceLevel: r.complianceLevel || '',
        IsCompliant: r.issues.length === 0 ? 'YES' : 'NO',
        Issues: r.issues.join('; '),
        CriticalIssues: (r.criticalIssues || []).join('; '),
        MissingFields: r.missingFields.join(', '),
        Overdue: r.overdue ? 'Yes' : 'No',
        DateCreated: r.date_created ? new Date(r.date_created).toISOString().split('T')[0] : ''
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(wb, ws, 'Task Audit Results');
      XLSX.writeFile(wb, excelFile);
      console.log(`📊 Excel report saved: ${excelFile}`);
    }

    // 6) WhatsApp summary + CSV to default owner/lead (unless dryRun)
    const owners = (process.env.OWNER_NUMBERS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const defaultTo = toOverride || process.env.TEAM_LEAD_NUMBER || owners[0] || process.env.OWNER_NUMBER;

    if (!dryRun && defaultTo) {
      try {
        await sendWhatsAppMessage(defaultTo, summary);
        console.log(`📝 WhatsApp summary sent to ${defaultTo}`);
      } catch (e) {
        console.error('❌ Failed to send summary text:', e?.response?.data || e.message);
      }
      if (csvFileForWA) {
        try {
          await sendDocumentFromPath(defaultTo, csvFileForWA, 'ClickUp noncompliance report');
          console.log(`📨 WhatsApp CSV sent to ${defaultTo}`);
        } catch (e) {
          console.error('❌ Failed to send CSV via WhatsApp:', e?.response?.data || e.message);
        }
      }
    } else if (dryRun) {
      console.log('\n🧪 DRY RUN — not sending any WhatsApp messages.');
    }

    // 7) Email the daily creation quality report now (same as test.js)
    const skipEmail = String(process.env.AUDIT_SKIP_EMAIL || 'false').toLowerCase() === 'true';
    if (!skipEmail) {
      console.log('\n📧 Building today’s creation quality email (IST)…');
      const { html, text } = await aiAnalysisService.buildCreationEmail();

      if (saveHtml) {
        const dir = path.resolve(__dirname, 'reports');
        fs.mkdirSync(dir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const htmlFile = path.join(dir, `daily_creation_email_${ts}.html`);
        fs.writeFileSync(htmlFile, html, 'utf8');
        console.log(`🖼️ HTML preview saved: ${htmlFile}`);
      }

      try {
        if (emailToOverride) {
          await aiAnalysisService._sendEmail({
            to: emailToOverride,
            subject: 'Daily Task Creation Quality (Today, IST)',
            html,
            text,
          });
          console.log(`✅ Email sent to ${emailToOverride}`);
        } else {
          await aiAnalysisService.sendTodayCreationEmail();
          console.log('✅ Email sent to ADMIN_EMAIL/ADMIN_EMAILS from .env');
        }
      } catch (e) {
        console.error('❌ Failed to send email:', e?.response?.data || e.message);
        console.error('   Make sure EMAIL_ENABLED, EMAIL_USER, EMAIL_PASS, ADMIN_EMAIL(S) are set.');
      }
    } else {
      console.log('\nℹ️ Email sending skipped (AUDIT_SKIP_EMAIL=true).');
    }

    // 8) Final console summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 AUDIT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tasks: ${meta.total}`);
    console.log(`✅ Compliant: ${meta.passed} (${meta.passRate}%)`);
    console.log(`❌ Non-compliant: ${meta.failed}`);
    const cb = meta.complianceBreakdown || {};
    console.log('\nCompliance Breakdown:');
    console.log(`🟢 Excellent (90-100%): ${cb.excellent ?? 0}`);
    console.log(`🔵 Good (75-89%): ${cb.good ?? 0}`);
    console.log(`🟡 Needs Improvement (50-74%): ${cb.needsImprovement ?? cb.needs_improvement ?? 0}`);
    console.log(`🔴 Poor (<50%): ${cb.poor ?? 0}`);

    console.log('\n📝 WhatsApp Summary Preview:');
    console.log('-'.repeat(40));
    console.log(summary);
    console.log('-'.repeat(40));
    console.log('\n🎉 Audit completed successfully!');
    console.log(`📧 WhatsApp sent: ${sent ? 'Yes' : 'No (dry run or no recipient)'}`);
  } catch (err) {
    console.error('❌ Full audit failed:', err?.response?.data || err);
  }
}

// ───────────────────────────────────────────────────────────
// ClickUp audit (simple wrapper used by cron & HTTP route)
// ───────────────────────────────────────────────────────────
async function runClickUpAudit({ to, dryRun = false } = {}) {
  const toNumber =
    to ||
    process.env.TEAM_LEAD_NUMBER ||
    (process.env.OWNER_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean)[0] ||
    process.env.OWNER_NUMBER ||
    null;

  const { summary, meta, csvExports } = await aiAnalysisService.analyzeAndSendReport({
    dryRun,
    to: toNumber,
    exportCSV: true,
  });

  // attempt to send CSVs if available
  if (!dryRun && toNumber && csvExports) {
    try {
      if (csvExports.poor?.path) {
        await sendDocumentFromPath(toNumber, csvExports.poor.path, 'ClickUp poor tasks');
      }
      if (csvExports.excellent?.path) {
        await sendDocumentFromPath(toNumber, csvExports.excellent.path, 'ClickUp excellent tasks');
      }
    } catch (e) {
      console.error('❌ Failed to send audit CSVs via WhatsApp:', e?.response?.data || e.message);
    }
  }

  console.log('✅ ClickUp audit finished. Meta:', meta);
  return { summary, meta };
}

// ───────────────────────────────────────────────────────────
// Sessions for WhatsApp → Google Sheets flow
// ───────────────────────────────────────────────────────────
const sessions = new Map();

function parseDate(input) {
  const formats = ["D MMM YY HH:mm","DD MMM YY HH:mm","D MMM YYYY HH:mm","DD MMM YYYY HH:mm"];
  for (let format of formats) {
    const parsed = dayjs(input, format, true);
    if (parsed.isValid()) return parsed.format("YYYY-MM-DD HH:mm");
  }
  return input;
}

// ───────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.send('API is running - Clockify + WhatsApp to Google Sheets + ClickUp Audit (test.js merged)');
});

// Meta verification
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log('🔔 VERIFY: ', { mode, token, challenge });
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// Meta messages (allowed numbers)
const OWNER_NUMBERS = process.env.OWNER_NUMBERS
  ? process.env.OWNER_NUMBERS.split(',').map(n => n.trim())
  : [process.env.OWNER_NUMBER];
const ALLOWED_NUMBERS = [...OWNER_NUMBERS, "15551281515"];
const EVENT_CREATOR_NUMBER = "919746462423";

app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const sender = message.from;
    const text = message.text?.body?.trim();
    console.log("📩 Message from:", sender, "|", text);

    if (!ALLOWED_NUMBERS.includes(sender)) {
      console.log("❌ Unauthorized sender:", sender);
      return res.sendStatus(200);
    }

    if (!sessions.has(sender)) sessions.set(sender, { step: null, data: {} });
    const session = sessions.get(sender);

    try {
      if (/^add event$/i.test(text)) {
        if (sender !== EVENT_CREATOR_NUMBER) {
          await sendWhatsAppTextLocal(sender, "❌ You are not authorized to create events. Only the admin can add events to Google Sheets.");
          return res.sendStatus(200);
        }
        session.step = "await_title";
        session.data = {};
        await sendWhatsAppTextLocal(sender, "Add your Event Title");
      } else if (session.step === "await_title") {
        if (sender !== EVENT_CREATOR_NUMBER) {
          await sendWhatsAppTextLocal(sender, "❌ You are not authorized to create events. Only the admin can add events to Google Sheets.");
          sessions.delete(sender); return res.sendStatus(200);
        }
        session.data.title = text;
        session.step = "await_start";
        await sendWhatsAppTextLocal(sender, "Add the start date (e.g. 2 Jul 25 10:00)");
      } else if (session.step === "await_start") {
        if (sender !== EVENT_CREATOR_NUMBER) {
          await sendWhatsAppTextLocal(sender, "❌ You are not authorized to create events. Only the admin can add events to Google Sheets.");
          sessions.delete(sender); return res.sendStatus(200);
        }
        session.data.start = parseDate(text);
        session.step = "await_end";
        await sendWhatsAppTextLocal(sender, "Add the end date (e.g. 2 Jul 25 11:00)");
      } else if (session.step === "await_end") {
        if (sender !== EVENT_CREATOR_NUMBER) {
          await sendWhatsAppTextLocal(sender, "❌ You are not authorized to create events. Only the admin can add events to Google Sheets.");
          sessions.delete(sender); return res.sendStatus(200);
        }
        session.data.end = parseDate(text);
        await addEventToSheet([session.data.title, session.data.start, session.data.end]);
        sessions.delete(sender);
        await sendWhatsAppTextLocal(sender, "✅ Event added to Google Sheets. Have a nice day!");
      } else {
        if (sender === EVENT_CREATOR_NUMBER) {
          await sendWhatsAppTextLocal(sender, "Send 'Add event' to start adding an event to Google Sheets.");
        } else {
          await sendWhatsAppTextLocal(sender, "❌ You are not authorized to create events. Only the admin can add events to Google Sheets.");
        }
      }
    } catch (error) {
      console.error("❌ Error sending WhatsApp message:", error.message);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in webhook handler:", err);
    res.sendStatus(500);
  }
});

// Local test route for Google Sheets
app.post('/webhook/test', async (req, res) => {
  const sender = req.body.from || "anonymous";
  const message = req.body.text?.trim();
  if (!sessions.has(sender)) sessions.set(sender, { step: null, data: {} });
  const session = sessions.get(sender);

  try {
    if (message.startsWith("Add Event |")) {
      const parts = message.split("|").map(p => p.trim());
      if (parts.length !== 4) return res.status(400).json({ message: "Use: Add Event | Title | Start | End" });
      const [, title, start, end] = parts;
      await addEventToSheet([title, parseDate(start), parseDate(end)]);
      sessions.delete(sender);
      return res.json({ message: "✅ Event added to sheet" });
    }
    if (/^add event$/i.test(message)) {
      session.step = "await_title"; session.data = {};
      return res.json({ message: "Add your Event Title" });
    }
    if (session.step === "await_title") {
      session.data.title = message;
      session.step = "await_start";
      return res.json({ message: "Add the start date (e.g. 2 Jul 25 10:00)" });
    }
    if (session.step === "await_start") {
      session.data.start = parseDate(message);
      session.step = "await_end";
      return res.json({ message: "Add the end date (e.g. 2 Jul 25 11:00)" });
    }
    if (session.step === "await_end") {
      session.data.end = parseDate(message);
      await addEventToSheet([session.data.title, session.data.start, session.data.end]);
      sessions.delete(sender);
      return res.json({ message: "✅ Event added. Have a nice day!" });
    }
    return res.json({ message: "Send 'Add event' to start adding an event." });
  } catch (err) {
    console.error("❌ Error:", err);
    sessions.delete(sender);
    return res.status(500).json({ message: "❌ Something went wrong." });
  }
});

// Manual audit trigger (HTTP)
app.get('/api/audit/run', async (req, res) => {
  try {
    const dryRun = String(req.query.dry || '0') === '1';
    const to = req.query.to || null;
    const result = await runClickUpAudit({ to, dryRun });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ───────────────────────────────────────────────────────────
// Error handling
// ───────────────────────────────────────────────────────────
app.use((error, _req, res, _next) => {
  console.error('❌ Server Error:', error.message);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON payload' });
  if (error.message.includes('stream is not readable')) return res.status(400).json({ error: 'Invalid request body' });
  res.status(500).json({ error: 'Internal server error' });
});

// ───────────────────────────────────────────────────────────
// Server startup
// ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('📅 Clockify + WhatsApp to Google Sheets + ClickUp Audit active (test.js merged)');
});

// ───────────────────────────────────────────────────────────
// Startup flows
// ───────────────────────────────────────────────────────────
(async () => {
  console.log('Starting daily Clockify check...');
  await dailyClockifyCheck();
  console.log('Finished daily Clockify check.');
})();

// Run the full audit + email immediately on boot (test.js behaviour)
// Toggle with env if you want to skip on startup.
(async () => {
  const runOnStart = String(process.env.RUN_AUDIT_ON_START || 'true').toLowerCase() === 'true';
  if (runOnStart) {
    console.log('[STARTUP] Running full ClickUp audit + email (merged from test.js)…');
    await runFullAuditAndEmailNow();
  } else {
    console.log('[STARTUP] RUN_AUDIT_ON_START=false — skipping full audit at boot.');
  }
})();

// ───────────────────────────────────────────────────────────
// Cron jobs (IST)
// ───────────────────────────────────────────────────────────
// Clockify: every 10 minutes from 09:00–16:59 IST
cron.schedule('*/10 9-16 * * *', async () => {
  console.log('⏰ Cron tick (*/10 9-16) — running dailyClockifyCheck');
  try { await dailyClockifyCheck(); } catch (e) { console.error('❌ Cron (*/10 9-16) failed:', e); }
}, { timezone: TZ });

// Clockify: one last run exactly at 17:00 IST
cron.schedule('0 17 * * *', async () => {
  console.log('⏰ Cron tick (17:00) — running dailyClockifyCheck');
  try { await dailyClockifyCheck(); } catch (e) { console.error('❌ Cron (17:00) failed:', e); }
}, { timezone: TZ });

// ClickUp IN PROGRESS report hourly 09:00–17:00 IST
cron.schedule('0 9-17 * * *', async () => {
  try {
    const { count } = await runClickUpInProgressReport();
    console.log(`[CRON] ClickUp report sent (hourly 9–17 IST). Tasks: ${count}`);
  } catch (e) {
    console.error('❌ CRON ClickUp hourly error:', e?.response?.data || e.message);
  }
}, { timezone: TZ });

// ClickUp full audit daily at 17:30 IST (kept separate from the 18:00 auto-email)
cron.schedule('30 17 * * *', async () => {
  console.log('⏰ Cron (17:30) — running ClickUp full audit');
  try { await runFullAuditAndEmailNow(); } catch (e) { console.error('❌ Cron audit failed:', e); }
}, { timezone: TZ });

// Optional: run the "IN PROGRESS" report on startup as well
(async () => {
  try {
    if (String(process.env.STARTUP_CLICKUP_REPORT).toLowerCase() === 'true') {
      await new Promise(r => setTimeout(r, 3000));
      console.log('[STARTUP] Sending ClickUp IN PROGRESS report...');
      const { count } = await runClickUpInProgressReport();
      console.log(`[STARTUP] ClickUp report sent. Tasks: ${count}`);
    } else {
      console.log('[STARTUP] ClickUp startup report disabled (set STARTUP_CLICKUP_REPORT=true to enable).');
    }
  } catch (e) {
    console.error('[STARTUP] ClickUp report failed:', e?.response?.data || e.message);
  }
})();
