// // clockifyChecker.js
// const axios = require('axios');
// const { sendWhatsAppMessage } = require('../services/whatsappService');

// const users = [
//   { name: 'Abhiram', clockifyId: '682ebe69a9a5d61a4c016a94', phone: '918590292642' },
//   { name: 'Lakshmi', clockifyId: '67975db1c0283f7b17cc71d8', phone: '918590302743' },
//   { name: 'Sanu', clockifyId: '685e2baa30158b1c138222d3', phone: '919496649110' },
// ];

// const adminPhone = '918943300095';
// const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
// const clockifyApiKey = process.env.CLOCKIFY_API_KEY;

// let projectCache = null;
// // Per-user, per-day, per-hour alert keys
// const hourAlertSent = Object.create(null);

// // —— Time helpers (robust IST handling) ——
// function nowInIST() {
//   return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
// }
// function startOfDayIST(d = nowInIST()) {
//   return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
// }
// function toIsoUTC(dateIst) {
//   const utc = new Date(dateIst.getTime() - (dateIst.getTimezoneOffset() * 60000));
//   return utc.toISOString();
// }
// function minutesSinceMidnightIST(d = nowInIST()) {
//   return d.getHours() * 60 + d.getMinutes();
// }

// // —— Clockify helpers ——

// // Load all projects for the workspace (for fallback names)
// async function loadProjectCache() {
//   if (projectCache) return projectCache;
//   const url = `https://api.clockify.me/api/v1/workspaces/${workspaceId}/projects?page-size=500`;
//   // console.log(`📡 Fetching project list: ${url}`);
//   const res = await axios.get(url, { headers: { 'X-Api-Key': clockifyApiKey } });
//   // console.log('📥 Projects API raw response:', JSON.stringify(res.data, null, 2));
//   projectCache = {};
//   if (Array.isArray(res.data)) {
//     for (const p of res.data) {
//       projectCache[p.id] = p.name || 'Unnamed Project';
//     }
//   }
//   return projectCache;
// }

// // Get current running timer entry for a user
// async function getInProgressEntry(userId) {
//   const url = `https://api.clockify.me/api/v1/workspaces/${workspaceId}/user/${userId}/time-entries?in-progress=true`;
//   console.log(`📡 Fetching in-progress entry for user ${userId}: ${url}`);
//   const res = await axios.get(url, { headers: { 'X-Api-Key': clockifyApiKey } });
//   console.log(`📥 In-progress API raw response for ${userId}:`, JSON.stringify(res.data, null, 2));
//   return Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
// }

// // Get all today's entries for a user
// async function getTodayEntries(userId) {
//   const istNow = nowInIST();
//   const dayStartIST = startOfDayIST(istNow);
//   const startISO = toIsoUTC(dayStartIST);
//   const endISO = toIsoUTC(istNow);
  

//   const url =
//     `https://api.clockify.me/api/v1/workspaces/${workspaceId}/user/${userId}/time-entries` +
//     `?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&page-size=500`;
//   console.log(`📡 Fetching today's entries for user ${userId}: ${url}`);
//   const res = await axios.get(url, { headers: { 'X-Api-Key': clockifyApiKey } });
//   console.log(`📥 Today's entries API raw response for ${userId}:`, JSON.stringify(res.data, null, 2));
//   return Array.isArray(res.data) ? res.data : [];
// }

// // Duration helpers
// function entryDurationMs(entry, now = new Date()) {
//   const s = entry?.timeInterval?.start ? new Date(entry.timeInterval.start) : null;
//   const e = entry?.timeInterval?.end ? new Date(entry.timeInterval.end) : null;
//   if (!s) return 0;
//   return (e ? e : now) - s;
// }
// function hrs(ms) {
//   return (ms / 3_600_000).toFixed(2);
// }

// /**
//  * Group TODAY's entries by projectId and sum durations, while also
//  * capturing the longest (most complete) description seen for that project today.
//  * This lets us show the full description as the display name.
//  */
// function summarizeByProjectWithDescription(entries) {
//   // Map: projectId -> { ms, count, bestDescription }
//   const map = new Map();
//   for (const e of entries) {
//     const pid = e.projectId || 'Unknown';
//     const prev = map.get(pid) || { ms: 0, count: 0, bestDescription: '' };

//     prev.ms += entryDurationMs(e, new Date());
//     prev.count += 1;

//     // Prefer the longest non-empty description as the "full name"
//     const d = (e.description || '').trim();
//     if (d && d.length > (prev.bestDescription?.length || 0)) {
//       prev.bestDescription = d;
//     }

//     map.set(pid, prev);
//   }

//   return [...map.entries()]
//     .map(([projectId, v]) => ({
//       projectId,
//       ms: v.ms,
//       count: v.count,
//       bestDescription: v.bestDescription || '',
//     }))
//     .sort((a, b) => b.ms - a.ms);
// }

// // —— Main check ——
// async function checkUsersStarted() {
//   const istNow = nowInIST();
//   const currentMin = minutesSinceMidnightIST(istNow);

//   // Work window 09:00–17:00 IST
//   const startMinutes = 9 * 60;
//   const endMinutes = 17 * 60;

//   console.log(`🕐 IST now: ${istNow.toTimeString().slice(0, 5)} (${currentMin} minutes)`);

//   if (currentMin < startMinutes || currentMin >= endMinutes) {
//     console.log('⏹️ Outside working hours (09:00–17:00 IST). Skipping.');
//     return;
//   }

//   const projectMap = await loadProjectCache();

//   // prune hourly alert keys to only today
//   const todayKey = istNow.toISOString().slice(0, 10);
//   Object.keys(hourAlertSent).forEach((k) => {
//     if (!k.includes(`_${todayKey}_`)) delete hourAlertSent[k];
//   });

//   const notStarted = [];
//   const hourAlerts = [];
//   const quickInsights = [];

//   for (const user of users) {
//     try {
//       console.log(`🚀 Checking user: ${user.name}`);
//       const inProg = await getInProgressEntry(user.clockifyId);

//       if (!inProg) {
//         console.log(`⛔ ${user.name} has NOT started Clockify`);
//         notStarted.push(user);
//       } else {
//         console.log(`✅ ${user.name} has an ACTIVE timer`);

//         // Hourly alert (once per 1h, 2h, 3h bucket)
//         const startTime = new Date(inProg.timeInterval.start);
//         const durationMs = new Date() - startTime;
//         const durHr = durationMs / 3_600_000;
//         const hourBucket = Math.floor(durHr);
//         if (hourBucket >= 1) {
//           const alertKey = `${user.clockifyId}_${todayKey}_h${hourBucket}`;
//           if (!hourAlertSent[alertKey]) {
//             hourAlerts.push({
//               ...user,
//               duration: hourBucket.toFixed(0),
//               project: inProg.projectId || 'Unknown',
//               // include full description in alert if available
//               description: (inProg.description || '').trim(),
//             });
//             hourAlertSent[alertKey] = true;
//           }
//         }
//       }

//       // Build quick insights using FULL description where possible
//       const todaysEntries = await getTodayEntries(user.clockifyId);
//       const byProject = summarizeByProjectWithDescription(todaysEntries);

//       if (byProject.length > 0) {
//         const lines = byProject.slice(0, 3).map((p) => {
//           // prefer the longest description; fallback to project name
//           const fullName =
//             p.bestDescription ||
//             projectMap[p.projectId] ||
//             p.projectId ||
//             'Unknown Project';
//           return `• ${fullName}: ${hrs(p.ms)} h (${p.count} entries)`;
//         });
//         quickInsights.push({ userName: user.name, lines });
//       } else {
//         quickInsights.push({ userName: user.name, lines: ['• No time tracked today'] });
//       }
//     } catch (err) {
//       console.error(`❌ Error checking ${user.name}:`, err.message);
//       notStarted.push({ ...user, error: err.message });
//     }
//   }

//   // Notify users who haven’t started + admin summary
//   try {
//     if (notStarted.length > 0) {
//       for (const u of notStarted) {
//         try {
//           await sendWhatsAppMessage(
//             u.phone,
//             `⚠️ You haven't started your Clockify timer today. Please start it now.`
//           );
//         } catch (e) {
//           console.error(`❌ Failed to message ${u.name}:`, e.message);
//         }
//       }
//       const details = notStarted
//         .map((u) => `${u.name}${u.error ? ` (error: ${u.error})` : ''}`)
//         .join('\n');
//       await sendWhatsAppMessage(adminPhone, `⚠️ Clockify Alert:\n${details}`);
//     } else {
//       await sendWhatsAppMessage(adminPhone, `✅ All users have logged time today.`);
//     }
//   } catch (e) {
//     console.error('❌ Failed to send “not started” messages:', e.message);
//   }

//   // Hourly alerts
//   for (const u of hourAlerts) {
//     const msg = u.description
//       ? `🐢 Still on the same task — ${u.duration}h elapsed.\nTask: ${u.description}`
//       : `🐢 Still on the same task — ${u.duration}h elapsed. Pace up!`;
//     try {
//       await sendWhatsAppMessage(u.phone, msg);
//     } catch (e) {
//       console.error(`❌ Failed to send hour alert to ${u.name}:`, e.message);
//     }
//   }
//   if (hourAlerts.length) {
//     const adminMsg =
//       '🐢 Turtle Alert:\n' +
//       hourAlerts
//         .map((u) => {
//           const projName = projectMap[u.project] || u.project;
//           const label = u.description ? `${u.description} (${projName})` : projName;
//           return `${u.name} (${u.duration}h) - ${label}`;
//         })
//         .join('\n');
//     try {
//       await sendWhatsAppMessage(adminPhone, adminMsg);
//     } catch {}
//   }

//   // Quick insights to admin
//   try {
//     const blocks = quickInsights
//       .map((q) => `👤 ${q.userName}\n${q.lines.join('\n')}`)
//       .join('\n\n');
//     await sendWhatsAppMessage(adminPhone, `📊 Quick Project Time (Today, IST)\n${blocks}`);
//   } catch (e) {
//     console.error('❌ Failed to send quick insights:', e.message);
//   }
// }

// module.exports = checkUsersStarted;


// clockifyChecker.js
const axios = require('axios');
const { sendWhatsAppMessage } = require('../services/whatsappService');

const users = [
  { name: 'Abhiram', clockifyId: '682ebe69a9a5d61a4c016a94', phone: '918590292642' },
  { name: 'Lakshmi', clockifyId: '67975db1c0283f7b17cc71d8', phone: '918590302743' },
  { name: 'Sanu', clockifyId: '685e2baa30158b1c138222d3', phone: '919496649110' },
];

const adminPhone = '918943300095';
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
const clockifyApiKey = process.env.CLOCKIFY_API_KEY;

let projectCache = null;
const hourAlertSent = Object.create(null);

// ✨ NEW: Dynamic leave storage - stores leave status per user per day
const dailyLeaveStatus = Object.create(null);

// ✨ NEW: Function to mark user as on leave for today
function markUserOnLeave(phone, todayDateIST) {
  const user = users.find(u => u.phone === phone);
  if (user) {
    const leaveKey = `${user.clockifyId}_${todayDateIST}`;
    dailyLeaveStatus[leaveKey] = true;
    console.log(`🏖️ ${user.name} marked as on leave for ${todayDateIST}`);
    return user.name;
  }
  return null;
}

// ✨ NEW: Function to check if user is on leave for today
function isUserOnLeaveToday(userId, todayDateIST) {
  const leaveKey = `${userId}_${todayDateIST}`;
  return dailyLeaveStatus[leaveKey] === true;
}

// ✨ NEW: Function to clean up old leave statuses (optional - keeps memory clean)
function cleanupOldLeaveStatus(todayDateIST) {
  Object.keys(dailyLeaveStatus).forEach(key => {
    if (!key.includes(`_${todayDateIST}`)) {
      delete dailyLeaveStatus[key];
    }
  });
}

// ✨ NEW: Handle incoming WhatsApp message for leave requests
function handleLeaveMessage(fromPhone, message, todayDateIST) {
  const normalizedMessage = message.toLowerCase().trim();
  
  if (normalizedMessage === 'leave') {
    const userName = markUserOnLeave(fromPhone, todayDateIST);
    if (userName) {
      return {
        success: true,
        userName: userName,
        reply: `✅ Hi ${userName}! You've been marked as on leave for today. You won't receive any Clockify notifications today. Have a great day! 🏖️`
      };
    } else {
      return {
        success: false,
        reply: '❌ Sorry, your phone number is not registered in our system.'
      };
    }
  }
  
  return null; // Not a leave message
}

// ✨ NEW: Get today's date in YYYY-MM-DD format (IST)
function getTodayDateIST() {
  const istNow = nowInIST();
  return istNow.toISOString().slice(0, 10);
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
  const res = await axios.get(url, { headers: { 'X-Api-Key': clockifyApiKey } });
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
  return Array.isArray(res.data) && res.data[0] ? res.data : null;
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
  const map = new Map();
  for (const e of entries) {
    const pid = e.projectId || 'Unknown';
    const prev = map.get(pid) || { ms: 0, count: 0, bestDescription: '' };

    prev.ms += entryDurationMs(e, new Date());
    prev.count += 1;

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

// —— ✨ UPDATED Main check with dynamic leave management ——
async function checkUsersStarted() {
  const istNow = nowInIST();
  const currentMin = minutesSinceMidnightIST(istNow);
  const todayDateIST = getTodayDateIST();

  // Clean up old leave statuses
  cleanupOldLeaveStatus(todayDateIST);

  // Work window 09:00–17:00 IST
  const startMinutes = 9 * 60;
  const endMinutes = 17 * 60;

  console.log(`🕐 IST now: ${istNow.toTimeString().slice(0, 5)} (${currentMin} minutes)`);

  if (currentMin < startMinutes || currentMin >= endMinutes) {
    console.log('⏹️ Outside working hours (09:00–17:00 IST). Skipping.');
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
  const usersOnLeave = [];

  for (const user of users) {
    try {
      // ✨ Check if user is on leave today
      if (isUserOnLeaveToday(user.clockifyId, todayDateIST)) {
        console.log(`🏖️ ${user.name} is on leave today (${todayDateIST}). Skipping notifications.`);
        usersOnLeave.push(user.name);
        continue; // Skip all checks for this user
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
              description: (inProg.description || '').trim(),
            });
            hourAlertSent[alertKey] = true;
          }
        }
      }

      // Build quick insights using FULL description where possible
      const todaysEntries = await getTodayEntries(user.clockifyId);
      const byProject = summarizeByProjectWithDescription(todaysEntries);

      if (byProject.length > 0) {
        const lines = byProject.slice(0, 3).map((p) => {
          const fullName =
            p.bestDescription ||
            projectMap[p.projectId] ||
            p.projectId ||
            'Unknown Project';
          return `• ${fullName}: ${hrs(p.ms)} h (${p.count} entries)`;
        });
        quickInsights.push({ userName: user.name, lines });
      } else {
        quickInsights.push({ userName: user.name, lines: ['• No time tracked today'] });
      }
    } catch (err) {
      console.error(`❌ Error checking ${user.name}:`, err.message);
      // Only add to notStarted if user is not on leave
      if (!isUserOnLeaveToday(user.clockifyId, todayDateIST)) {
        notStarted.push({ ...user, error: err.message });
      }
    }
  }

  // Notify users who haven't started + admin summary (excluding leave users)
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
      
      // Include leave info in admin summary
      let adminMsg = `⚠️ Clockify Alert:\n${notStarted.map(u => `${u.name}${u.error ? ` (error: ${u.error})` : ''}`).join('\n')}`;
      
      if (usersOnLeave.length > 0) {
        adminMsg += `\n\n🏖️ On Leave Today: ${usersOnLeave.join(', ')}`;
      }
      
      await sendWhatsAppMessage(adminPhone, adminMsg);
    } else {
      // Include leave info in success message
      let successMsg = `✅ All users have logged time today.`;
      if (usersOnLeave.length > 0) {
        successMsg += `\n🏖️ On Leave: ${usersOnLeave.join(', ')}`;
      }
      await sendWhatsAppMessage(adminPhone, successMsg);
    }
  } catch (e) {
    console.error('❌ Failed to send "not started" messages:', e.message);
  }

  // Hourly alerts (leave users already filtered out)
  for (const u of hourAlerts) {
    const msg = u.description
      ? `🐢 Still on the same task — ${u.duration}h elapsed.\nTask: ${u.description}`
      : `🐢 Still on the same task — ${u.duration}h elapsed. Pace up!`;
    try {
      await sendWhatsAppMessage(u.phone, msg);
    } catch (e) {
      console.error(`❌ Failed to send hour alert to ${u.name}:`, e.message);
    }
  }
  if (hourAlerts.length) {
    const adminMsg =
      '🐢 Turtle Alert:\n' +
      hourAlerts
        .map((u) => {
          const projName = projectMap[u.project] || u.project;
          const label = u.description ? `${u.description} (${projName})` : projName;
          return `${u.name} (${u.duration}h) - ${label}`;
        })
        .join('\n');
    try {
      await sendWhatsAppMessage(adminPhone, adminMsg);
    } catch {}
  }

  // Quick insights to admin (leave users already filtered out)
  try {
    const blocks = quickInsights
      .map((q) => `👤 ${q.userName}\n${q.lines.join('\n')}`)
      .join('\n\n');
    await sendWhatsAppMessage(adminPhone, `📊 Quick Project Time (Today, IST)\n${blocks}`);
  } catch (e) {
    console.error('❌ Failed to send quick insights:', e.message);
  }
}

// ✨ NEW: Export both functions - you'll need to call handleLeaveMessage from your WhatsApp webhook
module.exports = {
  checkUsersStarted,
  handleLeaveMessage,
  getTodayDateIST
};
