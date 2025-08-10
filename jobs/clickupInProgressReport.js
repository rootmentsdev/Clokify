const dayjs = require('dayjs');
const { getWorkspaceTasksByStatuses } = require('../services/clickupService');
const { sendWhatsAppMessage } = require('../services/whatsappService');

const TEAM_LEAD_NUMBER = process.env.TEAM_LEAD_NUMBER;

function formatMessage(tasks, statusName = "IN PROGRESS") {
  const when = dayjs().format('DD MMM YYYY, HH:mm');
  if (!tasks.length) {
    return `*ClickUp – ${statusName}*\n${when}\nNo tasks right now ✅`;
  }

  const perAssignee = new Map();
  for (const t of tasks) {
    const names = t.assignees.length ? t.assignees : ["Unassigned"];
    for (const n of names) {
      perAssignee.set(n, (perAssignee.get(n) || 0) + 1);
    }
  }

  const assigneeSummary = [...perAssignee.entries()]
    .sort((a,b) => b[1]-a[1])
    .map(([n,c]) => `• ${n}: ${c}`)
    .slice(0, 15)
    .join('\n');

  const sorted = tasks.slice(0, 60);
  const lines = [];
  let totalLen = 0;
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const line = `${i+1}. ${t.name}\n   ${t.url}`;
    if (totalLen + line.length > 3200) break;
    lines.push(line);
    totalLen += line.length;
  }
  const more = tasks.length > lines.length ? `\n…and ${tasks.length - lines.length} more.` : "";

  return `*ClickUp – ${statusName}*\n${when}\n\n*By assignee*\n${assigneeSummary}\n\n*Tasks*\n${lines.join('\n')}${more}`;
}

async function runClickUpInProgressReport() {
  const tasks = await getWorkspaceTasksByStatuses();
  const msg = formatMessage(tasks, process.env.CLICKUP_STATUSES || "IN PROGRESS");
  await sendWhatsAppMessage(TEAM_LEAD_NUMBER, msg);
  return { count: tasks.length };
}

module.exports = { runClickUpInProgressReport };
