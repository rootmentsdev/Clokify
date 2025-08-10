require('dotenv').config();

module.exports = {
  token: process.env.CLICKUP_TOKEN,
  teamId: process.env.CLICKUP_TEAM_ID, // Workspace ID
  statuses: (process.env.CLICKUP_STATUSES || "IN PROGRESS")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),
};
