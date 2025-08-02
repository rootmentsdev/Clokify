require('dotenv').config();
const dailyClockifyCheck = require('./jobs/dailyClockifyCheck');

(async () => {
  console.log('⏰ [Render Cron Job] Starting Clockify check at', new Date().toISOString());
  await dailyClockifyCheck();
  console.log('✅ [Render Cron Job] Finished Clockify check at', new Date().toISOString());
})();
    
runClockifyCheck().catch(err => {
    console.error('Clockify cron job failed:', err);
});
