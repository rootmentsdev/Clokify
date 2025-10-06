// clockifyChecker.js
const axios = require('axios');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const configLoader = require('../config/configLoader');

// Get users and admin phones from JSON configuration
const getUsers = () => configLoader.getUsers();
const getAdminPhones = () => configLoader.getAdminPhones();
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
const clockifyApiKey = process.env.CLOCKIFY_API_KEY;

let projectCache = null;
// Per-user, per-day, per-hour alert keys
const hourAlertSent = Object.create(null);

// —— Time helpers (robust IST handling) ——
function nowInIST() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}
function startOfDayIST(d = nowInIST()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
}
function toIsoUTC(dateIst) {
  const utc = new Date(dateIst.getTime() - (dateIst.getTimezoneOffset() * 60000));
  return utc.toISOString();
}
function minutesSinceMidnightIST(d = nowInIST()) {
  return d.getHours() * 60 + d.getMinutes();
}

// —— Clockify helpers ——

// Load all projects for the workspace (for fallback names)
async function loadProjectCache() {
  if (projectCache) return projectCache;
  const url = `https://api.clockify.me/api/v1/workspaces/${workspaceId}/projects?page-size=500`;
  // console.log(`📡 Fetching project list: ${url}`);
  const res = await axios.get(url, { headers: { 'X-Api-Key': clockifyApiKey } });
  // console.log('📥 Projects API raw response:', JSON.stringify(res.data, null, 2));
  projectCache = {};
  if (Array.isArray(res.data)) {
    for (const p of res.data) {
      projectCache[p.id] = p.name || 'Unnamed Project';
    }
  }
  return projectCache;
}

// Get current running timer entry for a user
async function getInProgressEntry(userId) {
  const url = `https://api.clockify.me/api/v1/workspaces/${workspaceId}/user/${userId}/time-entries?in-progress=true`;
  console.log(`📡 Fetching in-progress entry for user ${userId}: ${url}`);
  const res = await axios.get(url, { headers: { 'X-Api-Key': clockifyApiKey } });
  console.log(`📥 In-progress API raw response for ${userId}:`, JSON.stringify(res.data, null, 2));
  return Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
}

// Get all today's entries for a user
async function getTodayEntries(userId) {
  const istNow = nowInIST();
  const dayStartIST = startOfDayIST(istNow);
  const startISO = toIsoUTC(dayStartIST);
  const endISO = toIsoUTC(istNow);
  

  const url =
    `https://api.clockify.me/api/v1/workspaces/${workspaceId}/user/${userId}/time-entries` +
    `?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&page-size=500`;
  console.log(`📡 Fetching today's entries for user ${userId}: ${url}`);
  const res = await axios.get(url, { headers: { 'X-Api-Key': clockifyApiKey } });
  console.log(`📥 Today's entries API raw response for ${userId}:`, JSON.stringify(res.data, null, 2));
  return Array.isArray(res.data) ? res.data : [];
}

// Duration helpers
function entryDurationMs(entry, now = new Date()) {
  const s = entry?.timeInterval?.start ? new Date(entry.timeInterval.start) : null;
  const e = entry?.timeInterval?.end ? new Date(entry.timeInterval.end) : null;
  if (!s) return 0;
  return (e ? e : now) - s;
}
function hrs(ms) {
  return (ms / 3_600_000).toFixed(2);
}

/**
 * Group TODAY's entries by projectId and sum durations, while also
 * capturing the longest (most complete) description seen for that project today.
 * This lets us show the full description as the display name.
 */
function summarizeByProjectWithDescription(entries) {
  // Map: projectId -> { ms, count, bestDescription }
  const map = new Map();
  for (const e of entries) {
    const pid = e.projectId || 'Unknown';
    const prev = map.get(pid) || { ms: 0, count: 0, bestDescription: '' };

    prev.ms += entryDurationMs(e, new Date());
    prev.count += 1;

    // Prefer the longest non-empty description as the "full name"
    const d = (e.description || '').trim();
    if (d && d.length > (prev.bestDescription?.length || 0)) {
      prev.bestDescription = d;
    }

    map.set(pid, prev);
  }

  return [...map.entries()]
    .map(([projectId, v]) => ({
      projectId,
      ms: v.ms,
      count: v.count,
      bestDescription: v.bestDescription || '',
    }))
    .sort((a, b) => b.ms - a.ms);
}

// —— Main check ——
async function checkUsersStarted() {
  const istNow = nowInIST();
  const currentMin = minutesSinceMidnightIST(istNow);

  // Work window 09:00–18:00 IST
  const startMinutes = 9 * 60;
  const endMinutes = 18 * 60;

  console.log(`🕐 IST now: ${istNow.toTimeString().slice(0, 5)} (${currentMin} minutes)`);

  if (currentMin < startMinutes || currentMin >= endMinutes) {
    console.log('⏹️ Outside working hours (09:00–18:00 IST). Skipping.');
    return;
  }

  const projectMap = await loadProjectCache();

  // prune hourly alert keys to only today
  const todayKey = istNow.toISOString().slice(0, 10);
  Object.keys(hourAlertSent).forEach((k) => {
    if (!k.includes(`_${todayKey}_`)) delete hourAlertSent[k];
  });

  const notStarted = [];
  const hourAlerts = [];
  const quickInsights = [];

  const users = getUsers();
  for (const user of users) {
    try {
      console.log(`🚀 Checking user: ${user.name}`);
      const inProg = await getInProgressEntry(user.clockifyId);

      if (!inProg) {
        console.log(`⛔ ${user.name} has NOT started Clockify`);
        notStarted.push(user);
      } else {
        console.log(`✅ ${user.name} has an ACTIVE timer`);

        // Hourly alert (once per 1h, 2h, 3h bucket)
        const startTime = new Date(inProg.timeInterval.start);
        const durationMs = new Date() - startTime;
        const durHr = durationMs / 3_600_000;
        const hourBucket = Math.floor(durHr);
        if (hourBucket >= 1) {
          const alertKey = `${user.clockifyId}_${todayKey}_h${hourBucket}`;
          if (!hourAlertSent[alertKey]) {
            hourAlerts.push({
              ...user,
              duration: hourBucket.toFixed(0),
              project: inProg.projectId || 'Unknown',
              // include full description in alert if available
              description: (inProg.description || '').trim(),
            });
            hourAlertSent[alertKey] = true;
          }
        }
      }

      // Build quick insights - prioritize current active task
      const todaysEntries = await getTodayEntries(user.clockifyId);
      const byProject = summarizeByProjectWithDescription(todaysEntries);

      if (byProject.length > 0) {
        const lines = byProject.slice(0, 3).map((p) => {
          // If this is the current active task, use its description
          let fullName;
          if (inProg && inProg.projectId === p.projectId) {
            // This is the current active task - use its current description
            fullName = (inProg.description || '').trim() || 
                      projectMap[p.projectId] || 
                      p.projectId || 
                      'Unknown Project';
          } else {
            // This is a completed task - use the best description from today
            fullName = p.bestDescription ||
                      projectMap[p.projectId] ||
                      p.projectId ||
                      'Unknown Project';
          }
          
          // Add indicator for current active task
          const activeIndicator = (inProg && inProg.projectId === p.projectId) ? ' 🔄' : '';
          return `• ${fullName}${activeIndicator}: ${hrs(p.ms)} h (${p.count} entries)`;
        });
        quickInsights.push({ userName: user.name, lines });
      } else {
        quickInsights.push({ userName: user.name, lines: ['• No time tracked today'] });
      }
    } catch (err) {
      console.error(`❌ Error checking ${user.name}:`, err.message);
      notStarted.push({ ...user, error: err.message });
    }
  }

  // Notify users who haven’t started + admin summary
  try {
    if (notStarted.length > 0) {
      for (const u of notStarted) {
        try {
          await sendWhatsAppMessage(
            u.phone,
            `⚠️ You haven't started your Clockify timer today. Please start it now.`
          );
        } catch (e) {
          console.error(`❌ Failed to message ${u.name}:`, e.message);
        }
      }
      const details = notStarted
        .map((u) => `${u.name}${u.error ? ` (error: ${u.error})` : ''}`)
        .join('\n');
      // Send to all admin numbers
      const adminPhones = getAdminPhones();
      for (const adminPhone of adminPhones) {
        await sendWhatsAppMessage(adminPhone, `⚠️ Clockify Alert:\n${details}`);
      }
    } else {
      // Send to all admin numbers
      const adminPhones = getAdminPhones();
      for (const adminPhone of adminPhones) {
        await sendWhatsAppMessage(adminPhone, `✅ All users have logged time today.`);
      }
    }
  } catch (e) {
    console.error('❌ Failed to send “not started” messages:', e.message);
  }

  // Hourly alerts - get current task info for each user
  for (const u of hourAlerts) {
    try {
      // Get the current active task to ensure we show the right description
      const currentTask = await getInProgressEntry(u.clockifyId);
      const currentDescription = currentTask ? (currentTask.description || '').trim() : '';
      
      const msg = currentDescription
        ? `🐢 Still on the same task — ${u.duration}h elapsed.\nCurrent Task: ${currentDescription}`
        : `🐢 Still on the same task — ${u.duration}h elapsed. Pace up!`;
      
      await sendWhatsAppMessage(u.phone, msg);
    } catch (e) {
      console.error(`❌ Failed to send hour alert to ${u.name}:`, e.message);
    }
  }
  if (hourAlerts.length) {
    // Get current task info for admin alert
    const adminAlertDetails = await Promise.all(
      hourAlerts.map(async (u) => {
        try {
          const currentTask = await getInProgressEntry(u.clockifyId);
          const currentDescription = currentTask ? (currentTask.description || '').trim() : '';
          const projName = projectMap[u.project] || u.project;
          const label = currentDescription ? `${currentDescription} (${projName})` : projName;
          return `${u.name} (${u.duration}h) - ${label}`;
        } catch (e) {
          const projName = projectMap[u.project] || u.project;
          const label = u.description ? `${u.description} (${projName})` : projName;
          return `${u.name} (${u.duration}h) - ${label}`;
        }
      })
    );
    
    const adminMsg = '🐢 Turtle Alert:\n' + adminAlertDetails.join('\n');
    try {
      // Send to all admin numbers
      const adminPhones = getAdminPhones();
      for (const adminPhone of adminPhones) {
        await sendWhatsAppMessage(adminPhone, adminMsg);
      }
    } catch {}
  }

  // Quick insights to admin
  try {
    const blocks = quickInsights
      .map((q) => `👤 ${q.userName}\n${q.lines.join('\n')}`)
      .join('\n\n');
    // Send to all admin numbers
    const adminPhones = getAdminPhones();
    for (const adminPhone of adminPhones) {
      await sendWhatsAppMessage(adminPhone, `📊 Quick Project Time (Today, IST)\n${blocks}`);
    }
  } catch (e) {
    console.error('❌ Failed to send quick insights:', e.message);
  }
}

module.exports = checkUsersStarted;
