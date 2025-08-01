const axios = require('axios');
const { apiKey, workspaceId } = require('../config/clockifyConfig');

const clockifyApi = axios.create({
  baseURL: 'https://api.clockify.me/api/v1',
  headers: {
    'X-Api-Key': apiKey,
    'Content-Type': 'application/json',
  },
});

async function getUsers() {
  const res = await clockifyApi.get(`/workspaces/${workspaceId}/users`);
  return res.data;
}

async function getTimeEntries(userId, start, end) {
  const res = await clockifyApi.get(`/workspaces/${workspaceId}/user/${userId}/time-entries`, {
    params: { start, end },
  });
  return res.data;
}

module.exports = {
  getUsers,
  getTimeEntries,
}; 