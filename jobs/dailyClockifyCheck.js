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

// —— Leave/Availability tracking ——
// Store users on leave: { phone: { date: 'YYYY-MM-DD', status: 'leave' } }
const leaveStatus = new Map();

/**
 * Mark a user as on leave for today
 */
function markUserOnLeave(phone) {
  const today = nowInIST().toISOString().slice(0, 10);
  leaveStatus.set(phone, { date: today, status: 'leave' });
  console.log(`📅 User ${phone} marked as on leave for ${today}`);
}

/**
 * Mark a user as available (remove from leave)
 */
function markUserAvailable(phone) {
  leaveStatus.delete(phone);
  console.log(`✅ User ${phone} marked as available`);
}

/**
 * Check if a user is on leave today
 */
function isUserOnLeave(phone) {
  const today = nowInIST().toISOString().slice(0, 10);
  const userStatus = leaveStatus.get(phone);
  
  // If user has leave status and it's for today
  if (userStatus && userStatus.date === today && userStatus.status === 'leave') {
    return true;
  }
  
  // Clean up old leave statuses (not today)
  if (userStatus && userStatus.date !== today) {
    leaveStatus.delete(phone);
  }
  
  return false;
}

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
 * Get all individual entries with their descriptions and durations.
 * Returns each entry separately so users can see exactly what they worked on.
 */
function getIndividualEntries(entries, projectMap) {
  return entries
    .map((e) => {
      const description = (e.description || '').trim();
      const projectName = projectMap[e.projectId] || e.projectId || 'Unknown Project';
      const duration = entryDurationMs(e, new Date());
      
      // Use description if available, otherwise use project name
      const displayName = description || projectName;
      
      return {
        projectId: e.projectId,
        displayName,
        ms: duration,
        timeInterval: e.timeInterval,
      };
    })
    .sort((a, b) => b.ms - a.ms); // Sort by duration (longest first)
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
      // Skip users who are on leave
      if (isUserOnLeave(user.phone)) {
        console.log(`🏖️ ${user.name} is on leave today - skipping checks`);
        quickInsights.push({ userName: user.name, lines: ['• On Leave 🏖️'] });
        continue;
      }

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

      // Build quick insights - show all individual entries
      const todaysEntries = await getTodayEntries(user.clockifyId);
      const individualEntries = getIndividualEntries(todaysEntries, projectMap);

      if (individualEntries.length > 0) {
        const lines = individualEntries.map((entry) => {
          // Check if this is the current active task
          const isActive = inProg && 
                          inProg.projectId === entry.projectId && 
                          inProg.timeInterval.start === entry.timeInterval.start;
          
          const activeIndicator = isActive ? ' 🔄' : '';
          return `• ${entry.displayName}${activeIndicator}: ${hrs(entry.ms)} h`;
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
module.exports.markUserOnLeave = markUserOnLeave;
module.exports.markUserAvailable = markUserAvailable;
module.exports.isUserOnLeave = isUserOnLeave;
