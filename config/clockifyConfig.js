// Clockify configuration
require('dotenv').config();

module.exports = {
  apiKey: process.env.CLOCKIFY_API_KEY,
  workspaceId: process.env.CLOCKIFY_WORKSPACE_ID,
}; 