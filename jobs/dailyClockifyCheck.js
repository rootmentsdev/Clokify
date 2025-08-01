// // // // const axios = require('axios');
// // // // const { sendWhatsAppMessage } = require('../services/whatsappService');
// // // // const { metaToken, metaPhoneNumberId } = require('../config/whatsappConfig');

// // // // const users = [
// // // //   { name: 'Abhiram', clockifyId: '682ebe69a9a5d61a4c016a94', phone: '918590292642' },
// // // //   { name: 'Lakshmi', clockifyId: '67975db1c0283f7b17cc71d8', phone: '918590292642' },
// // // // ];

// // // // const adminPhone = '918590292642';
// // // // const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
// // // // const clockifyApiKey = process.env.CLOCKIFY_API_KEY;

// // // // function getTodayRange() {
// // // //   const today = new Date();
// // // //   const start = new Date(today.setHours(0, 0, 0, 0)).toISOString();
// // // //   const end = new Date().toISOString();
// // // //   return { start, end };
// // // // }

// // // // async function checkUsersStarted() {
// // // //   await sendWhatsAppMessage(adminPhone, '✅ Clockify check started!');

// // // //   const notStarted = [];
// // // //   const { start, end } = getTodayRange();

// // // //   for (const user of users) {
// // // //     try {
// // // //       const res = await axios.get(
// // // //         `https://api.clockify.me/api/v1/workspaces/${workspaceId}/user/${user.clockifyId}/time-entries?start=${start}&end=${end}`,
// // // //         {
// // // //           headers: { 'X-Api-Key': clockifyApiKey }
// // // //         }
// // // //       );

// // // //       if (!res.data || res.data.length === 0) {
// // // //         notStarted.push(user);
// // // //       }
// // // //     } catch (err) {
// // // //       console.error(`❌ Error checking user ${user.name}:`, err.message);
// // // //       notStarted.push({ ...user, error: err.message });
// // // //     }
// // // //   }

// // // //   if (notStarted.length > 0) {
// // // //     const details = notStarted
// // // //       .map(u => `${u.name}${u.error ? ' (error: ' + u.error + ')' : ''}`)
// // // //       .join('\n');
// // // //     const message = `⚠️ Clockify Alert:\nThe following users have not logged any time today:\n${details}`;

// // // //     for (const user of notStarted) {
// // // //       await sendWhatsAppMessage(user.phone, `⚠️ You haven't started your Clockify timer today. Please start it now.`);
// // // //     }

// // // //     await sendWhatsAppMessage(adminPhone, message);
// // // //   } else {
// // // //     await sendWhatsAppMessage(adminPhone, `✅ All users have logged time today.`);
// // // //   }
// // // // }

// // // // module.exports = checkUsersStarted;




// // // const axios = require('axios');
// // // const { sendWhatsAppMessage } = require('../services/whatsappService');
// // // const { metaToken, metaPhoneNumberId } = require('../config/whatsappConfig');

// // // const users = [
// // //   { name: 'Abhiram', clockifyId: '682ebe69a9a5d61a4c016a94', phone: '918590292642' },
// // //   { name: 'Lakshmi', clockifyId: '67975db1c0283f7b17cc71d8', phone: '919496649110' },
// // // ];

// // // const adminPhone = '918590292642';
// // // const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
// // // const clockifyApiKey = process.env.CLOCKIFY_API_KEY;

// // // function getTodayRange() {
// // //   const today = new Date();
// // //   const start = new Date(today.setHours(0, 0, 0, 0)).toISOString();
// // //   const end = new Date().toISOString();
// // //   return { start, end };
// // // }

// // // async function checkUsersStarted() {
// // //   await sendWhatsAppMessage(adminPhone, '✅ Clockify check started!');

// // //   const notStarted = [];
// // //   const { start, end } = getTodayRange();

// // //   for (const user of users) {
// // //   try {
// // //     const url = `https://api.clockify.me/api/v1/workspaces/${workspaceId}/user/${user.clockifyId}/time-entries?in-progress=true`;

// // //     console.log(`🚀 Checking user: ${user.name}`);
// // //     console.log(`🔗 Request URL: ${url}`);

// // //     const res = await axios.get(url, {
// // //       headers: { 'X-Api-Key': clockifyApiKey }
// // //     });

// // //     console.log(`📦 Raw response for ${user.name}:`, res.data);

// // //     if (!res.data || res.data.length === 0) {
// // //       console.log(`⛔️ ${user.name} has not started their timer.`);
// // //       notStarted.push(user);
// // //     } else {
// // //       console.log(`✅ ${user.name} has an active timer.`);
// // //     }

// // //   } catch (err) {
// // //     console.error(`❌ Error checking user ${user.name}:`, err.message);
// // //     notStarted.push({ ...user, error: err.message });
// // //   }
// // // }

// // //   if (notStarted.length > 0) {
// // //     const details = notStarted
// // //       .map(u => `${u.name}${u.error ? ' (error: ' + u.error + ')' : ''}`)
// // //       .join('\n');

// // //     const message = `⚠️ Clockify Alert:\nThe following users have not logged any time today:\n${details}`;

// // //     for (const user of notStarted) {
// // //       await sendWhatsAppMessage(user.phone, `⚠️ You haven't started your Clockify timer today. Please start it now.`);
// // //     }

// // //     await sendWhatsAppMessage(adminPhone, message);
// // //   } else {
// // //     await sendWhatsAppMessage(adminPhone, `✅ All users have logged time today.`);
// // //   }
// // // }

// // // module.exports = checkUsersStarted;



// // const axios = require('axios');
// // const { sendWhatsAppMessage } = require('../services/whatsappService');

// // const users = [
// //   { name: 'Abhiram', clockifyId: '682ebe69a9a5d61a4c016a94', phone: '918590292642' },
// //   { name: 'Lakshmi', clockifyId: '67975db1c0283f7b17cc71d8', phone: '918590302743' },
// //   { name: 'Sanu', clockifyId: '685e2baa30158b1c138222d3', phone: '919496649110' },

// // ];

// // const adminPhone = '919562684960';
// // const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
// // const clockifyApiKey = process.env.CLOCKIFY_API_KEY;

// // let firstRunCompleted = false;

// // async function checkUsersStarted() {
// //   const now = new Date();
// //   const isFirstRun = now.getHours() === 10 && now.getMinutes() < 10;

// //   console.log(`🔁 Running Clockify check at ${now.toLocaleTimeString()}`);

// //   if (isFirstRun) {
// //     firstRunCompleted = false; // Reset at 10 AM
// //   }

// //   const notStarted = [];

// //   for (const user of users) {
// //     try {
// //       const url = `https://api.clockify.me/api/v1/workspaces/${workspaceId}/user/${user.clockifyId}/time-entries?in-progress=true`;

// //       console.log(`🚀 Checking user: ${user.name}`);
// //       const res = await axios.get(url, {
// //         headers: { 'X-Api-Key': clockifyApiKey }
// //       });

// //       console.log(`📦 Raw response for ${user.name}:`, res.data);

// //       if (!res.data || res.data.length === 0) {
// //         console.log(`⛔️ ${user.name} has NOT started Clockify`);
// //         notStarted.push(user);
// //       } else {
// //         console.log(`✅ ${user.name} has an ACTIVE timer`);
// //       }

// //     } catch (err) {
// //       console.error(`❌ Error checking ${user.name}:`, err.message);
// //       notStarted.push({ ...user, error: err.message });
// //     }
// //   }

// //   // Only send messages if someone hasn’t started or it's the first run
// //   if (notStarted.length > 0 || isFirstRun) {
// //     const details = notStarted.map(u => `${u.name}${u.error ? ' (error: ' + u.error + ')' : ''}`).join('\n');

// //     try {
// //       if (notStarted.length > 0) {
// //         for (const user of notStarted) {
// //           try {
// //             await sendWhatsAppMessage(user.phone, `⚠️ You haven't started your Clockify timer today. Please start it now.`);
// //           } catch (error) {
// //             console.error(`❌ Failed to send WhatsApp message to ${user.name}:`, error.message);
// //           }
// //         }

// //         const adminMsg = `⚠️ Clockify Alert:\nThe following users have not logged time today:\n${details}`;
// //         await sendWhatsAppMessage(adminPhone, adminMsg);
// //       } else {
// //         await sendWhatsAppMessage(adminPhone, `✅ All users have logged time today.`);
// //       }
// //     } catch (error) {
// //       console.error('❌ Failed to send WhatsApp messages:', error.message);
// //     }
// //   }

// //   firstRunCompleted = true;
// // }

// // module.exports = checkUsersStarted;


// const axios = require('axios');
// const { sendWhatsAppMessage } = require('../services/whatsappService');

// const users = [
//   { name: 'Abhiram', clockifyId: '682ebe69a9a5d61a4c016a94', phone: '918590292642' },
//   { name: 'Lakshmi', clockifyId: '67975db1c0283f7b17cc71d8', phone: '918590302743' },
//   { name: 'Sanu', clockifyId: '685e2baa30158b1c138222d3', phone: '919496649110' },
// ];

// const adminPhone = '919562684960';
// const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
// const clockifyApiKey = process.env.CLOCKIFY_API_KEY;

// let firstRunCompleted = false;

// async function checkUsersStarted() {
//   const now = new Date();
//   const currentHour = now.getHours();      // 0–23
//   const currentMinute = now.getMinutes();  // 0–59
//   const currentTime = currentHour * 60 + currentMinute;

//   const startMinutes = 9 * 60 + 30;   // 9:30 AM = 570
//   const endMinutes = 17 * 60;         // 5:00 PM = 1020

//   // ⛔ DO NOTHING if not between 9:30 AM and 5:00 PM
//   if (currentTime < startMinutes || currentTime >= endMinutes) {
//     console.log("⏹️ Skipping Clockify check — outside working hours (9:30–17:00). No messages sent.");
//     return;
//   }

//   const isFirstRun = currentHour === 10 && currentMinute < 10;
//   if (isFirstRun) {
//     firstRunCompleted = false; // Reset at 10 AM
//   }

//   console.log(`🔁 Running Clockify check at ${now.toLocaleTimeString()}`);

//   const notStarted = [];

//   for (const user of users) {
//     try {
//       const url = `https://api.clockify.me/api/v1/workspaces/${workspaceId}/user/${user.clockifyId}/time-entries?in-progress=true`;

//       console.log(`🚀 Checking user: ${user.name}`);
//       const res = await axios.get(url, {
//         headers: { 'X-Api-Key': clockifyApiKey }
//       });

//       if (!res.data || res.data.length === 0) {
//         console.log(`⛔️ ${user.name} has NOT started Clockify`);
//         notStarted.push(user);
//       } else {
//         console.log(`✅ ${user.name} has an ACTIVE timer`);
//       }

//     } catch (err) {
//       console.error(`❌ Error checking ${user.name}:`, err.message);
//       notStarted.push({ ...user, error: err.message });
//     }
//   }

//   if (notStarted.length > 0 || isFirstRun) {
//     const details = notStarted.map(u => `${u.name}${u.error ? ' (error: ' + u.error + ')' : ''}`).join('\n');

//     try {
//       if (notStarted.length > 0) {
//         for (const user of notStarted) {
//           await sendWhatsAppMessage(user.phone, `⚠️ You haven't started your Clockify timer today. Please start it now.`);
//         }

//         const adminMsg = `⚠️ Clockify Alert:\nThe following users have not logged time today:\n${details}`;
//         await sendWhatsAppMessage(adminPhone, adminMsg);
//       } else {
//         await sendWhatsAppMessage(adminPhone, `✅ All users have logged time today.`);
//       }
//     } catch (error) {
//       console.error('❌ Failed to send WhatsApp messages:', error.message);
//     }
//   }

//   firstRunCompleted = true;
// }

// module.exports = checkUsersStarted;

