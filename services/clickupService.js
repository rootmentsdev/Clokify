// const axios = require('axios');
// const { token, teamId, statuses } = require('../config/clickupConfig');

// const api = axios.create({
//   baseURL: 'https://api.clickup.com/api/v2',
//   headers: { Authorization: token }
// });

// async function getWorkspaceTasksByStatuses(customStatuses = statuses) {
//   const results = [];
//   let page = 0;

//   while (true) {
//     const { data } = await api.get(`/team/${teamId}/task`, {
//       params: {
//         'statuses[]': customStatuses,
//         include_closed: false,
//         subtasks: true,
//         page
//       }
//     });

//     const tasks = (data?.tasks || []).map(t => ({
//       id: t.id,
//       name: t.name,
//       status: t.status?.status || t.status,
//       url: t.url || `https://app.clickup.com/t/${t.id}`,
//       assignees: (t.assignees || []).map(a =>
//         a.username || a.email || a.id
//       )
//     }));

//     results.push(...tasks);

//     if (!data?.tasks || data.tasks.length < 100) break;
//     page += 1;
//   }

//   return results;
// }

// module.exports = { getWorkspaceTasksByStatuses };


const axios = require('axios');
const api = axios.create({
  baseURL: 'https://api.clickup.com/api/v2',
  headers: { Authorization: process.env.CLICKUP_TOKEN }
});

const spaceId = process.env.CLICKUP_SPACE_ID;
const teamId  = process.env.CLICKUP_TEAM_ID;
const defaultStatuses = (process.env.CLICKUP_STATUSES || 'IN PROGRESS')
  .split(',').map(s => s.trim()).filter(Boolean);

async function getTasksFromListsByStatuses(listIds, statuses) {
  const all = [];
  for (const listId of listIds) {
    const params = { include_closed: false, subtasks: true };
    if (statuses?.length) params['statuses[]'] = statuses;
    const { data } = await api.get(`/list/${listId}/task`, { params });
    all.push(...(data?.tasks || []).map(t => ({
      id: t.id,
      name: t.name,
      status: t.status?.status || t.status,
      url: t.url || `https://app.clickup.com/t/${t.id}`,
      assignees: (t.assignees || []).map(a => a.username || a.email || a.id)
    })));
  }
  return all;
}

async function getWorkspaceTasksByStatuses(statuses = defaultStatuses) {
  if (spaceId) {
    const { data } = await api.get(`/space/${spaceId}/list`, { params: { archived: false } });
    const listIds = (data?.lists || []).map(l => l.id);
    return getTasksFromListsByStatuses(listIds, statuses);
  }
  // fallback: team-wide
  const results = [];
  let page = 0;
  while (true) {
    const params = { include_closed: false, subtasks: true, page };
    if (statuses?.length) params['statuses[]'] = statuses;
    const { data } = await api.get(`/team/${teamId}/task`, { params });
    results.push(...(data?.tasks || []).map(t => ({
      id: t.id,
      name: t.name,
      status: t.status?.status || t.status,
      url: t.url || `https://app.clickup.com/t/${t.id}`,
      assignees: (t.assignees || []).map(a => a.username || a.email || a.id)
    })));
    if (!data?.tasks || data.tasks.length < 100) break;
    page += 1;
  }
  return results;
}

module.exports = { getWorkspaceTasksByStatuses };
