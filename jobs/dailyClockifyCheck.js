


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

let firstRunCompleted = false;

async function checkUsersStarted() {
  // Convert to India time (GMT+5:30)
  const now = new Date();
  const indiaTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000)); // Add 5.5 hours for GMT+5:30
  const currentHour = indiaTime.getUTCHours();      // 0–23
  const currentMinute = indiaTime.getUTCMinutes();  // 0–59
  const currentTime = currentHour * 60 + currentMinute;

  const startMinutes = 9 * 60 + 30;   // 9:30 AM = 570
  const endMinutes = 17 * 60;         // 5:00 PM = 1020

  console.log(`🕐 Current India time: ${currentHour}:${currentMinute.toString().padStart(2, '0')} (${currentTime} minutes)`);
  console.log(`⏰ Working hours: 9:30-17:00 (${startMinutes}-${endMinutes} minutes)`);

  // ⛔ DO NOTHING if not between 9:30 AM and 5:00 PM
  if (currentTime < startMinutes || currentTime >= endMinutes) {
    console.log("⏹️ Skipping Clockify check — outside working hours (9:30–17:00). No messages sent.");
    return;
  }

  const isFirstRun = currentHour === 10 && currentMinute < 20;
  if (isFirstRun) {
    firstRunCompleted = false; // Reset at 10 AM
  }

  console.log(`🔁 Running Clockify check at ${currentHour}:${currentMinute.toString().padStart(2, '0')} (India time)`);

  const notStarted = [];

  for (const user of users) {
    try {
      const url = `https://api.clockify.me/api/v1/workspaces/${workspaceId}/user/${user.clockifyId}/time-entries?in-progress=true`;

      console.log(`🚀 Checking user: ${user.name}`);
      const res = await axios.get(url, {
        headers: { 'X-Api-Key': clockifyApiKey }
      });

      if (!res.data || res.data.length === 0) {
        console.log(`⛔️ ${user.name} has NOT started Clockify`);
        notStarted.push(user);
      } else {
        console.log(`✅ ${user.name} has an ACTIVE timer`);
      }

    } catch (err) {
      console.error(`❌ Error checking ${user.name}:`, err.message);
      notStarted.push({ ...user, error: err.message });
    }
  }

  if (notStarted.length > 0 || isFirstRun) {
    const details = notStarted.map(u => `${u.name}${u.error ? ' (error: ' + u.error + ')' : ''}`).join('\n');

    try {
      if (notStarted.length > 0) {
        for (const user of notStarted) {
          await sendWhatsAppMessage(user.phone, `⚠️ You haven't started your Clockify timer today. Please start it now.`);
        }

        const adminMsg = `⚠️ Clockify Alert:\nThe following users have not logged time today:\n${details}`;
        await sendWhatsAppMessage(adminPhone, adminMsg);
      } else {
        await sendWhatsAppMessage(adminPhone, `✅ All users have logged time today.`);
      }
    } catch (error) {
      console.error('❌ Failed to send WhatsApp messages:', error.message);
    }
  }

  firstRunCompleted = true;
}

module.exports = checkUsersStarted;

