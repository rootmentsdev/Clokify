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


// const axios = require('axios');
// const api = axios.create({
//   baseURL: 'https://api.clickup.com/api/v2',
//   headers: { Authorization: process.env.CLICKUP_TOKEN }
// });

// const spaceId = process.env.CLICKUP_SPACE_ID;
// const teamId  = process.env.CLICKUP_TEAM_ID;
// const defaultStatuses = (process.env.CLICKUP_STATUSES || 'IN PROGRESS')
//   .split(',').map(s => s.trim()).filter(Boolean);

// async function getTasksFromListsByStatuses(listIds, statuses) {
//   const all = [];
//   for (const listId of listIds) {
//     const params = { include_closed: false, subtasks: true };
//     if (statuses?.length) params['statuses[]'] = statuses;
//     const { data } = await api.get(`/list/${listId}/task`, { params });
//     all.push(...(data?.tasks || []).map(t => ({
//       id: t.id,
//       name: t.name,
//       status: t.status?.status || t.status,
//       url: t.url || `https://app.clickup.com/t/${t.id}`,
//       assignees: (t.assignees || []).map(a => a.username || a.email || a.id)
//     })));
//   }
//   return all;
// }

// async function getWorkspaceTasksByStatuses(statuses = defaultStatuses) {
//   if (spaceId) {
//     const { data } = await api.get(`/space/${spaceId}/list`, { params: { archived: false } });
//     const listIds = (data?.lists || []).map(l => l.id);
//     return getTasksFromListsByStatuses(listIds, statuses);
//   }
//   // fallback: team-wide
//   const results = [];
//   let page = 0;
//   while (true) {
//     const params = { include_closed: false, subtasks: true, page };
//     if (statuses?.length) params['statuses[]'] = statuses;
//     const { data } = await api.get(`/team/${teamId}/task`, { params });
//     results.push(...(data?.tasks || []).map(t => ({
//       id: t.id,
//       name: t.name,
//       status: t.status?.status || t.status,
//       url: t.url || `https://app.clickup.com/t/${t.id}`,
//       assignees: (t.assignees || []).map(a => a.username || a.email || a.id)
//     })));
//     if (!data?.tasks || data.tasks.length < 100) break;
//     page += 1;
//   }
//   return results;
// }

// module.exports = { getWorkspaceTasksByStatuses };


// services/clickupService.js
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://api.clickup.com/api/v2',
  headers: { Authorization: process.env.CLICKUP_TOKEN }
});

const spaceId = process.env.CLICKUP_SPACE_ID;
const teamId  = process.env.CLICKUP_TEAM_ID;
const defaultStatuses = (process.env.CLICKUP_STATUSES || 'IN PROGRESS')
  .split(',').map(s => s.trim()).filter(Boolean);

// --- helper to build params with repeated array keys like statuses[] ---
function buildParams(base = {}, arrays = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) p.append(k, String(v));
  for (const [k, arr] of Object.entries(arrays)) {
    (arr || []).forEach(val => p.append(k, val));
  }
  return p;
}

// --- fetch all lists in a space: folderless + inside folders ---
async function getAllListsInSpace(spaceId) {
  const lists = [];

  // 1) Folderless lists
  const { data: lf } = await api.get(`/space/${spaceId}/list`, { params: { archived: false } });
  (lf?.lists || []).forEach(l => lists.push(l.id));

  // 2) Folders -> lists
  const { data: foldersResp } = await api.get(`/space/${spaceId}/folder`, { params: { archived: false } });
  const folders = foldersResp?.folders || [];
  for (const f of folders) {
    // Each folder response often already includes lists; if not, fetch per folder
    if (Array.isArray(f.lists) && f.lists.length) {
      f.lists.filter(l => !l.archived).forEach(l => lists.push(l.id));
    } else {
      const { data: fl } = await api.get(`/folder/${f.id}/list`, { params: { archived: false } });
      (fl?.lists || []).forEach(l => lists.push(l.id));
    }
  }

  return [...new Set(lists)];
}

// --- fetch tasks from a single list with pagination ---
async function getListTasksByStatuses(listId, statuses) {
  const all = [];
  let page = 0;
  while (true) {
    const params = buildParams(
      { include_closed: false, subtasks: true, page },
      { 'statuses[]': statuses }
    );
    const { data } = await api.get(`/list/${listId}/task`, { params });
    const batch = (data?.tasks || []).map(t => ({
      id: t.id,
      name: t.name,
      status: t.status?.status || t.status,
      url: t.url || `https://app.clickup.com/t/${t.id}`,
      assignees: (t.assignees || []).map(a => a.username || a.email || String(a.id))
    }));
    all.push(...batch);
    if (!data?.tasks || data.tasks.length < 100) break;
    page += 1;
  }
  return all;
}

// --- space path (lists) ---
async function getSpaceTasksByStatuses(statuses) {
  const listIds = await getAllListsInSpace(spaceId);
  const all = [];
  for (const listId of listIds) {
    const tasks = await getListTasksByStatuses(listId, statuses);
    all.push(...tasks);
  }
  return all;
}

// --- team-wide path (one endpoint with filters) ---
async function getTeamTasksByStatuses(statuses) {
  const results = [];
  let page = 0;
  while (true) {
    const params = buildParams(
      { include_closed: false, subtasks: true, page },
      { 'statuses[]': statuses, ...(spaceId ? { 'space_ids[]': [spaceId] } : {}) }
    );
    const { data } = await api.get(`/team/${teamId}/task`, { params });
    const batch = (data?.tasks || []).map(t => ({
      id: t.id,
      name: t.name,
      status: t.status?.status || t.status,
      url: t.url || `https://app.clickup.com/t/${t.id}`,
      assignees: (t.assignees || []).map(a => a.username || a.email || String(a.id))
    }));
    results.push(...batch);
    if (!data?.tasks || data.tasks.length < 100) break;
    page += 1;
  }
  return results;
}

async function getWorkspaceTasksByStatuses(statuses = defaultStatuses) {
  // Fastest & simpler: use team endpoint and (optionally) filter by space_id
  // (This avoids crawling lists/folders and usually matches what you want.)
  return getTeamTasksByStatuses(statuses);

  // If you *must* crawl lists explicitly (e.g., special list-level behaviors), use:
  // if (spaceId) return getSpaceTasksByStatuses(statuses);
  // return getTeamTasksByStatuses(statuses);
}

module.exports = { getWorkspaceTasksByStatuses };
