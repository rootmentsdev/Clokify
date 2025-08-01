require('dotenv').config();
const dailyClockifyCheck = require('./jobs/dailyClockifyCheck');
const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const cron = require('node-cron');

dayjs.extend(customParseFormat);

const app = express();
const PORT = process.env.PORT || 9000;

// Configure body parsing middleware properly
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ───────────────────────────────────────────────────────────
// Google Sheets setup
// ───────────────────────────────────────────────────────────
let auth = null;
let SHEET_ID = null;

// Only initialize Google Sheets if credentials are provided
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
  // If GOOGLE_APPLICATION_CREDENTIALS contains JSON, parse it
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
  // Only use as keyFile if it's not JSON content
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
    throw new Error("Google Sheets not configured. Please set GOOGLE_CREDENTIALS_JSON and SHEET_ID environment variables.");
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
// WhatsApp sender helper
// ───────────────────────────────────────────────────────────
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
  
  await axios.post(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    },
    {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// ───────────────────────────────────────────────────────────
// Session store (user ↔ step) for Google Sheets events
// ───────────────────────────────────────────────────────────
const sessions = new Map();

function parseDate(input) {
  const formats = [
    "D MMM YY HH:mm",
    "DD MMM YY HH:mm",
    "D MMM YYYY HH:mm",
    "DD MMM YYYY HH:mm"
  ];
  for (let format of formats) {
    const parsed = dayjs(input, format, true);
    if (parsed.isValid()) return parsed.format("YYYY-MM-DD HH:mm");
  }
  return input;
}

// ───────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('API is running - Clockify + WhatsApp to Google Sheets');
});

// ───────────────────────────────────────────────────────────
// Combined Webhook Handler (GET - Meta verification)
// ───────────────────────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('🔔 VERIFY: ', { mode, token, challenge });

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("✅ Meta webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ───────────────────────────────────────────────────────────
// Combined Webhook Handler (POST - Meta messages)
// ───────────────────────────────────────────────────────────
// Support multiple owner numbers from env, comma-separated
const OWNER_NUMBERS = process.env.OWNER_NUMBERS
  ? process.env.OWNER_NUMBERS.split(',').map(n => n.trim())
  : [process.env.OWNER_NUMBER];

const ALLOWED_NUMBERS = [...OWNER_NUMBERS, "15551281515"]; // Add sandbox if needed

app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const sender = message.from;
    const text = message.text?.body?.trim();
    console.log("📩 Message from:", sender, "|", text);

    // Restrict access
    if (!ALLOWED_NUMBERS.includes(sender)) {
      console.log("❌ Unauthorized sender:", sender);
      return res.sendStatus(200);
    }

    if (!sessions.has(sender)) sessions.set(sender, { step: null, data: {} });
    const session = sessions.get(sender);

    // Handle Google Sheets event creation
    try {
      if (/^add event$/i.test(text)) {
        session.step = "await_title";
        session.data = {};
        await sendWhatsAppMessage(sender, "Add your Event Title");
      } else if (session.step === "await_title") {
        session.data.title = text;
        session.step = "await_start";
        await sendWhatsAppMessage(sender, "Add the start date (e.g. 2 Jul 25 10:00)");
      } else if (session.step === "await_start") {
        session.data.start = parseDate(text);
        session.step = "await_end";
        await sendWhatsAppMessage(sender, "Add the end date (e.g. 2 Jul 25 11:00)");
      } else if (session.step === "await_end") {
        session.data.end = parseDate(text);
        await addEventToSheet([
          session.data.title,
          session.data.start,
          session.data.end
        ]);
        sessions.delete(sender);
        await sendWhatsAppMessage(sender, "✅ Event added to Google Sheets. Have a nice day!");
      } else {
        await sendWhatsAppMessage(sender, "Send 'Add event' to start adding an event to Google Sheets.");
      }
    } catch (error) {
      console.error("❌ Error sending WhatsApp message:", error.message);
      // Don't crash the webhook, just log the error
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in webhook handler:", err);
    res.sendStatus(500);
  }
});

// ───────────────────────────────────────────────────────────
// Local testing route for Google Sheets functionality
// ───────────────────────────────────────────────────────────
app.post('/webhook/test', async (req, res) => {
  const sender = req.body.from || "anonymous";
  const message = req.body.text?.trim();

  if (!sessions.has(sender)) sessions.set(sender, { step: null, data: {} });
  const session = sessions.get(sender);

  try {
    if (message.startsWith("Add Event |")) {
      const parts = message.split("|").map(p => p.trim());
      if (parts.length !== 4) {
        return res.status(400).json({ message: "Use: Add Event | Title | Start | End" });
      }
      const [, title, start, end] = parts;
      await addEventToSheet([title, parseDate(start), parseDate(end)]);
      sessions.delete(sender);
      return res.json({ message: "✅ Event added to sheet" });
    }

    if (/^add event$/i.test(message)) {
      session.step = "await_title";
      session.data = {};
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
      await addEventToSheet([
        session.data.title,
        session.data.start,
        session.data.end
      ]);
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

// ───────────────────────────────────────────────────────────
// Error handling middleware
// ───────────────────────────────────────────────────────────
app.use((error, req, res, next) => {
  console.error('❌ Server Error:', error.message);
  
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  
  if (error.message.includes('stream is not readable')) {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// ───────────────────────────────────────────────────────────
// Server startup
// ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('📅 Clockify + WhatsApp to Google Sheets integration active');
});

// ───────────────────────────────────────────────────────────
// Clockify daily check initialization
// ───────────────────────────────────────────────────────────
(async () => {
  console.log('Starting daily Clockify check...');
  await dailyClockifyCheck();
  console.log('Finished daily Clockify check.');
})();

// ───────────────────────────────────────────────────────────
// Cron jobs for Clockify
// ───────────────────────────────────────────────────────────
// Run every 10 minutes from 10:00 to 16:59
cron.schedule('*/10 10-16 * * *', () => {
  dailyClockifyCheck();
});

// One last run at 5:00 PM
cron.schedule('0 17 * * *', () => {
  dailyClockifyCheck();
});
