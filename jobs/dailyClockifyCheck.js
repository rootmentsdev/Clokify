
// clockifyChecker.js
const axios = require('axios');
const { sendWhatsAppMessage } = require('../services/whatsappService');

const users = [
  { name: 'Abhiram', clockifyId: '682ebe69a9a5d61a4c016a94', phone: '918590292642' },
  { name: 'Lakshmi', clockifyId: '67975db1c0283f7b17cc71d8', phone: '918590302743' },
  { name: 'Sanu', clockifyId: '685e2baa30158b1c138222d3', phone: '919496649110' },
];

const adminPhone = '919562684960';
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
const clockifyApiKey = process.env.CLOCKIFY_API_KEY;

// Track which user got the “>1 hour on same timer” alert today
const hourAlertSent = Object.create(null);

// —— Time helpers (robust IST handling) ——
function nowInIST() {
  // Avoid adding 5.5h to local time (buggy). Use timezone conversion instead.
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}
function startOfDayIST(d = nowInIST()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
}
function toIsoUTC(dateIst) {
  // Convert an IST Date object’s *wall clock* to UTC ISO string that Clockify expects.
  const utc = new Date(dateIst.getTime() - (dateIst.getTimezoneOffset() * 60000));
  return utc.toISOString();
}
function minutesSinceMidnightIST(d = nowInIST()) {
  return d.getHours() * 60 + d.getMinutes();
}

// —— Clockify helpers ——
async function getInProgressEntry(userId) {
  const url = `https://api.clockify.me/api/v1/workspaces/${workspaceId}/user/${userId}/time-entries?in-progress=true`;
  const res = await axios.get(url, { headers: { 'X-Api-Key': clockifyApiKey } });
  return Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
}

async function getTodayEntries(userId) {
  const istNow = nowInIST();
  const dayStartIST = startOfDayIST(istNow);
  const startISO = toIsoUTC(dayStartIST);
  const endISO = toIsoUTC(istNow);

  // Pull today's entries (Clockify supports filters via query params)
  const url = `https://api.clockify.me/api/v1/workspaces/${workspaceId}/user/${userId}/time-entries` +
              `?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&page-size=500`;
  const res = await axios.get(url, { headers: { 'X-Api-Key': clockifyApiKey } });
  return Array.isArray(res.data) ? res.data : [];
}

// Sum duration (in ms) of an entry; support running entries (no end)
function entryDurationMs(entry, now = new Date()) {
  const s = entry?.timeInterval?.start ? new Date(entry.timeInterval.start) : null;
  const e = entry?.timeInterval?.end ? new Date(entry.timeInterval.end) : null;
  if (!s) return 0;
  return (e ? e : now) - s;
}

// Group today’s entries by project and sum durations
function summarizeByProject(entries) {
  const map = new Map(); // projectId => { ms, count }
  for (const e of entries) {
    const pid = e.projectId || 'Unknown';
    const prev = map.get(pid) || { ms: 0, count: 0 };
    prev.ms += entryDurationMs(e, new Date());
    prev.count += 1;
    map.set(pid, prev);
  }
  // Return sorted array by time desc
  return [...map.entries()]
    .map(([projectId, v]) => ({ projectId, ms: v.ms, count: v.count }))
    .sort((a, b) => b.ms - a.ms);
}

function hrs(ms) {
  return (ms / 3_600_000).toFixed(2);
}

// —— Main check ——
async function checkUsersStarted() {
  const istNow = nowInIST();
  const currentMin = minutesSinceMidnightIST(istNow);

  // Work window 09:00–17:00 IST (exclusive end)
  const startMinutes = 9 * 60;     // 540
  const endMinutes   = 17 * 60;    // 1020

  console.log(`🕐 IST now: ${istNow.toTimeString().slice(0,5)} (${currentMin} minutes)`);

  if (currentMin < startMinutes || currentMin >= endMinutes) {
    console.log('⏹️ Outside working hours (09:00–17:00 IST). Skipping.');
    return;
  }

  // Reset hour-alert bookeeping daily (keyed by date)
  const todayKey = istNow.toISOString().slice(0, 10);
  // Prune old keys
  Object.keys(hourAlertSent).forEach(k => {
    if (!k.endsWith(todayKey)) delete hourAlertSent[k];
  });

  const notStarted = [];
  const hourAlerts = [];
  const quickInsights = []; // { userName, lines[] } lines by project

  for (const user of users) {
    try {
      console.log(`🚀 Checking user: ${user.name}`);
      const inProg = await getInProgressEntry(user.clockifyId);

      if (!inProg) {
        console.log(`⛔ ${user.name} has NOT started Clockify`);
        notStarted.push(user);
      } else {
        console.log(`✅ ${user.name} has an ACTIVE timer`);
        // >1 hour alert on the active timer
        const startTime = new Date(inProg.timeInterval.start);
        const durHr = (new Date() - startTime) / 3_600_000;
        const alertKey = `${user.clockifyId}_${todayKey}`;
        if (durHr > 1 && !hourAlertSent[alertKey]) {
          hourAlerts.push({
            ...user,
            duration: durHr.toFixed(2),
            project: inProg.projectId || 'Unknown',
          });
          hourAlertSent[alertKey] = true;
        }
      }

      // —— Quick “project time” insight for TODAY ——
      const todaysEntries = await getTodayEntries(user.clockifyId);
      const byProject = summarizeByProject(todaysEntries);
      if (byProject.length > 0) {
        const lines = byProject
          .slice(0, 3) // keep it short
          .map(p => `• ${p.projectId}: ${hrs(p.ms)} h (${p.count} entries)`);
        quickInsights.push({ userName: user.name, lines });
      } else {
        quickInsights.push({ userName: user.name, lines: ['• No time tracked today'] });
      }
    } catch (err) {
      console.error(`❌ Error checking ${user.name}:`, err.message);
      notStarted.push({ ...user, error: err.message });
    }
  }

  // — Notify users who haven’t started + admin summary —
  try {
    if (notStarted.length > 0) {
      for (const u of notStarted) {
        try {
          await sendWhatsAppMessage(u.phone, `⚠️ You haven't started your Clockify timer today. Please start it now.`);
        } catch (e) {
          console.error(`❌ Failed to message ${u.name}:`, e.message);
        }
      }
      const details = notStarted.map(u => `${u.name}${u.error ? ` (error: ${u.error})` : ''}`).join('\n');
      await sendWhatsAppMessage(adminPhone, `⚠️ Clockify Alert:\nThe following users have not logged time today:\n${details}`);
    } else {
      await sendWhatsAppMessage(adminPhone, `✅ All users have logged time today.`);
    }
  } catch (e) {
    console.error('❌ Failed to send “not started” WhatsApp messages:', e.message);
  }

  // — Funny hour alerts —
  for (const u of hourAlerts) {
    const msg = `🐢 You Are Working Like a Turtle! Be a Rabbit, Be Fast! (You’ve been on this project for ${u.duration} hours)`;
    try {
      await sendWhatsAppMessage(u.phone, msg);
    } catch (e) {
      console.error(`❌ Failed to send hour alert to ${u.name}:`, e.message);
    }
  }
  if (hourAlerts.length) {
    const adminMsg = `🐢 Turtle Alert:\n${hourAlerts.map(u => `${u.name} (${u.duration} hr) - timer > 1 hr`).join('\n')}`;
    try { await sendWhatsAppMessage(adminPhone, adminMsg); } catch {}
  }

  // — Short “project time” insights (admin, compact) —
  try {
    // Send this every 10 minutes with the main check (kept brief)
    const blocks = quickInsights.map(q =>
      `👤 ${q.userName}\n${q.lines.join('\n')}`
    ).join('\n\n');

    await sendWhatsAppMessage(
      adminPhone,
      `📊 Quick Project Time (Today, IST)\n${blocks}`
    );
  } catch (e) {
    console.error('❌ Failed to send quick insights:', e.message);
  }
}

module.exports = checkUsersStarted;
