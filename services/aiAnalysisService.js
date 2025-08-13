// // services/aiAnalysisService.js
// require('dotenv').config();
// const axios = require('axios');

// class AIAnalysisService {
//   constructor() {
//     // ---- ClickUp (team-wide; include closed) ----
//     this.clickup = {
//       token: process.env.CLICKUP_TOKEN,
//       teamId: process.env.CLICKUP_TEAM_ID,
//       includeClosed: true,
//     };

//     // ---- WhatsApp (used by analyzeAndSendReport when not --dry) ----
//     this.whatsapp = {
//       token: process.env.WHATSAPP_META_TOKEN,
//       phoneNumberId: process.env.WHATSAPP_META_PHONE_NUMBER_ID,
//       toDefault: process.env.TEAM_LEAD_NUMBER || null,
//     };

//     // ---- AI via OpenRouter (uses your model/key) ----
//     this.ai = {
//       enabled: (process.env.AI_ANALYSIS_ENABLED || 'true').toLowerCase() === 'true',
//       apiKey: process.env.OPENROUTER_API_KEY,
//       baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
//       model: process.env.AI_MODEL || 'gpt-4o-mini',
//       maxTokens: Number(process.env.AI_MAX_TOKENS || 500),
//     };

//     // ---- Basic standards to enforce ----
//     this.rules = {
//       minTitleLen: 6,
//       minDescLen: 15,
//       assigneeRequired: true,
//       dueDateRequired: true,
//       priorityRequired: true,
//       enforceOverdue: true,
//       completeStatuses: ['complete', 'done', 'closed'],
//     };
//   }

//   // ========================= CLICKUP =========================
//   _cu(extraHeaders = {}) {
//     return axios.create({
//       baseURL: 'https://api.clickup.com/api/v2',
//       headers: {
//         Authorization: this.clickup.token,
//         'Content-Type': 'application/json',
//         ...extraHeaders,
//       },
//       timeout: 30000,
//     });
//   }

//   /**
//    * Fetch ALL tasks across the TEAM (auto-paginate; includes closed).
//    */
//   async getTeamTasks({ includeClosed = this.clickup.includeClosed } = {}) {
//     const cu = this._cu();
//     const all = [];
//     let page = 0;

//     while (true) {
//       const params = { page, subtasks: true, include_closed: includeClosed ? true : false };
//       try {
//         const { data } = await cu.get(`/team/${this.clickup.teamId}/task`, { params });
//         const items = data?.tasks || [];
//         all.push(...items);
//         if (items.length === 0) break;
//         page += 1;
//       } catch (err) {
//         this._logAxiosError('ClickUp getTeamTasks failed', err);
//         break;
//       }
//     }
//     return all;
//   }

//   /**
//    * Check a single task against standards.
//    */
//   checkTaskStandards(task) {
//     const issues = [];
//     const name = (task.name || '').trim();
//     const rawDesc = (task.description || '').trim();
//     const description = rawDesc.replace(/<[^>]+>/g, '').trim(); // strip HTML
//     const assignees = Array.isArray(task.assignees) ? task.assignees : [];
//     const due = task.due_date ? Number(task.due_date) : null;

//     // ClickUp priority can be null, number, or object
//     let priority = task.priority ?? task.priority_id ?? null;
//     if (priority && typeof priority === 'object') {
//       priority = priority.priority || priority.label || priority.id || null;
//     }
//     const status = (task.status?.status || task.status?.name || '').toLowerCase();

//     const checks = {
//       hasTitle: name.length >= this.rules.minTitleLen,
//       hasDescription: description.length >= this.rules.minDescLen,
//       hasAssignee: assignees.length > 0,
//       hasDueDate: !!due,
//       hasPriority: priority !== null && priority !== undefined,
//     };

//     if (!checks.hasTitle) issues.push(`Short title (<${this.rules.minTitleLen})`);
//     if (!checks.hasDescription) issues.push(`Missing/short description (<${this.rules.minDescLen})`);
//     if (this.rules.assigneeRequired && !checks.hasAssignee) issues.push('No assignee');
//     if (this.rules.dueDateRequired && !checks.hasDueDate) issues.push('No due date');
//     if (this.rules.priorityRequired && !checks.hasPriority) issues.push('No priority');

//     let overdue = false;
//     if (this.rules.enforceOverdue && due && Date.now() > due) {
//       if (!this.rules.completeStatuses.includes(status)) {
//         overdue = true;
//         issues.push('Overdue but not completed');
//       }
//     }

//     const score = Math.max(0, 100 - issues.length * 20); // naive 0–100
//     const missingFields = Object.entries(checks)
//       .filter(([_, ok]) => !ok)
//       .map(([k]) => k.replace(/^has/, '').toLowerCase()); // e.g., description, assignee…

//     return { score, issues, checks, missingFields, overdue, priorityNormalized: priority };
//   }

//   /**
//    * Audit ALL team tasks and return detailed results.
//    */
//   async auditTeam() {
//     const tasks = await this.getTeamTasks({ includeClosed: true });

//     const results = tasks.map(t => {
//       const {
//         score, issues, checks, missingFields, overdue, priorityNormalized
//       } = this.checkTaskStandards(t);

//       const assignees = (t.assignees || []).map(a => a.username || a.email || a.id);
//       const due = t.due_date ? new Date(Number(t.due_date)).toISOString().slice(0,10) : null;

//       return {
//         id: t.id,
//         url: `https://app.clickup.com/t/${t.id}`,
//         name: t.name,
//         status: t.status?.status || t.status?.name || '',
//         assignees,
//         due,
//         priority: priorityNormalized,
//         score,
//         issues,
//         checks,
//         missingFields,
//         overdue,
//         listId: t.list?.id || null,
//         listName: t.list?.name || null,
//       };
//     });

//     const nonCompliant = results.filter(r => r.issues.length > 0);
//     const total = results.length;
//     const passed = total - nonCompliant.length;
//     const failed = nonCompliant.length;
//     const passRate = total ? Math.round((passed / total) * 100) : 0;

//     return { meta: { total, passed, failed, passRate }, results, nonCompliant };
//   }

//   // ========================= AI OUTPUTS =========================
//   /**
//    * WhatsApp/console-friendly summary (uses your AI to polish if available).
//    */
//   async buildSummary(report) {
//     const { total, passed, failed, passRate } = report.meta;
//     const worst = [...report.nonCompliant]
//       .sort((a, b) => a.score - b.score)
//       .slice(0, 5)
//       .map((r, i) => `${i + 1}. ${r.name.slice(0, 50)} — ${r.issues.join('; ')}`)
//       .join('\n');

//     let summary = [
//       `*ClickUp Task Audit* (All statuses, incl. closed)`,
//       `Total: ${total} | Passed: ${passed} | Failed: ${failed} | Pass Rate: ${passRate}%`,
//       failed ? `\n*Top Issues:*\n${worst}` : '\nNo issues 🎉',
//       `\nNext Step: Review and address the top issues, ensuring each task has a detailed description, an assignee, a due date, and a set priority.`,
//     ].join('\n');

//     if (!(this.ai.enabled && this.ai.apiKey)) return summary;

//     try {
//       const improved = await this._openRouterSummarize(
//         `Rewrite this in <=6 lines for WhatsApp. Keep numbers intact. Keep the Next Step line.\n\n${summary}`
//       );
//       return improved || summary;
//     } catch {
//       return summary;
//     }
//   }

//   /**
//    * Exact text block response (if you need it elsewhere).
//    */
//   async generateAuditResponse() {
//     const report = await this.auditTeam();

//     // Header counts
//     let out = '';
//     out += `total task : ${report.meta.total}\n`;
//     out += `passed : ${report.meta.passed}\n`;
//     out += `failed : ${report.meta.failed}\n\n`;

//     // Full failed list
//     out += `failed Tasks ( Full Failed Tasked )\n\n`;
//     if (report.nonCompliant.length === 0) {
//       out += `None 🎉\n\n`;
//     } else {
//       report.nonCompliant
//         .sort((a,b) => a.score - b.score)
//         .forEach((r, i) => {
//           const who = r.assignees.length ? r.assignees.join(', ') : 'Unassigned';
//           const missing = r.missingFields.length ? r.missingFields.join(', ') : '—';
//           out += `${i+1}. ${r.name}\n`;
//           out += `   - Who: ${who}\n`;
//           out += `   - Status: ${r.status || '-'}\n`;
//           out += `   - Due: ${r.due || '-'}\n`;
//           out += `   - Priority: ${r.priority ?? '-'}\n`;
//           out += `   - Missing: ${missing}${r.overdue ? ' (overdue)' : ''}\n`;
//           out += `   - URL: ${r.url}\n\n`;
//         });
//     }

//     // Methods (static, concise, action-oriented)
//     const methods = [
//       'Add a clear, outcome-oriented description (context, definition of done, acceptance criteria).',
//       'Assign a single directly-responsible owner; add watchers only if needed.',
//       'Set a realistic due date; split big items into sub-tasks with their own dates.',
//       'Set an appropriate priority (Urgent/High/Normal/Low) based on impact vs. urgency.',
//       'Resolve overdue items first: update progress, renegotiate dates, or close if done.',
//     ].map(s => `• ${s}`).join('\n');

//     out += `methods to correct these tasks\n${methods}\n`;
//     return out;
//   }

//   // ========================= MAIN ENTRY FOR test.js =========================
//   /**
//    * Back-compat for your existing test.js
//    * Returns: { summary, meta, results, nonCompliant, sent }
//    */
//   async analyzeAndSendReport({ dryRun = false, to = this.whatsapp.toDefault } = {}) {
//     const report = await this.auditTeam();
//     const summary = await this.buildSummary(report);
//     if (!dryRun && to) {
//       await this.sendWhatsAppText(to, summary);
//     }
//     return {
//       summary,
//       meta: report.meta,
//       results: report.results,
//       nonCompliant: report.nonCompliant,
//       sent: !dryRun && !!to,
//     };
//   }

//   // ========================= WHATSAPP =========================
//   _waUrl(path) {
//     return `https://graph.facebook.com/v21.0/${this.whatsapp.phoneNumberId}/${path}`;
//   }

//   async sendWhatsAppText(to, text) {
//     const { data } = await axios.post(
//       this._waUrl('messages'),
//       {
//         messaging_product: 'whatsapp',
//         to,
//         type: 'text',
//         text: { preview_url: false, body: text },
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${this.whatsapp.token}`,
//           'Content-Type': 'application/json',
//         },
//         timeout: 20000,
//       }
//     );
//     return data;
//   }

//   // ========================= OPENROUTER =========================
//   async _openRouterSummarize(prompt) {
//     const { data } = await axios.post(
//       `${this.ai.baseURL}/chat/completions`,
//       {
//         model: this.ai.model,
//         max_tokens: this.ai.maxTokens,
//         messages: [
//           { role: 'system', content: 'You are a concise operations advisor.' },
//           { role: 'user', content: prompt },
//         ],
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${this.ai.apiKey}`,
//           'Content-Type': 'application/json',
//         },
//         timeout: 60000,
//       }
//     );
//     return data?.choices?.[0]?.message?.content?.trim() || '';
//   }

//   // ========================= HELPERS =========================
//   envSummary() {
//     return {
//       clickupTeamId: this.clickup.teamId,
//       includeClosed: this.clickup.includeClosed,
//       whatsappPhoneId: this.whatsapp.phoneNumberId,
//       toDefault: this.whatsapp.toDefault,
//       tokens: {
//         clickup: this.clickup.token ? 'present' : 'missing',
//         whatsapp: this.whatsapp.token ? 'present' : 'missing',
//         openrouter: this.ai.apiKey ? 'present' : 'missing',
//       },
//       ai: { enabled: this.ai.enabled, model: this.ai.model, maxTokens: this.ai.maxTokens },
//     };
//   }

//   _logAxiosError(label, err) {
//     const status = err.response?.status;
//     const data = err.response?.data;
//     const msg = err.message;
//     console.error(`[${label}]`, { status, data, msg });
//   }
// }

// module.exports = new AIAnalysisService();


// services/aiAnalysisService.js
require('dotenv').config();
const axios = require('axios');

class AIAnalysisService {
  constructor() {
    // ---- ClickUp (team-wide; include closed) ----
    this.clickup = {
      token: process.env.CLICKUP_TOKEN,
      teamId: process.env.CLICKUP_TEAM_ID,
      includeClosed: true,
    };

    // ---- WhatsApp ----
    this.whatsapp = {
      token: process.env.WHATSAPP_META_TOKEN,
      phoneNumberId: process.env.WHATSAPP_META_PHONE_NUMBER_ID,
      toDefault: process.env.TEAM_LEAD_NUMBER || null,
    };

    // ---- AI via OpenRouter ----
    this.ai = {
      enabled: (process.env.AI_ANALYSIS_ENABLED || 'true').toLowerCase() === 'true',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      maxTokens: Number(process.env.AI_MAX_TOKENS || 500),
    };

    // ---- Standards ----
    this.rules = {
      minTitleLen: 6,
      minDescLen: 15,
      assigneeRequired: true,
      dueDateRequired: true,
      priorityRequired: true,
      enforceOverdue: true,
      completeStatuses: ['complete', 'done', 'closed'],
    };

    // Optional auto-schedule via .env
    const dailyEnabled = (process.env.DAILY_NEW_TASK_AUDIT || 'false').toLowerCase() === 'true';
    if (dailyEnabled) {
      const hourIST = Number(process.env.DAILY_NEW_TASK_AUDIT_HOUR_IST || 21);
      const minuteIST = Number(process.env.DAILY_NEW_TASK_AUDIT_MIN_IST || 0);
      this.startDailyNewTaskAudit({ hourIST, minuteIST, to: this.whatsapp.toDefault });
    }
  }

  // ========================= CLICKUP =========================
  _cu(extraHeaders = {}) {
    return axios.create({
      baseURL: 'https://api.clickup.com/api/v2',
      headers: {
        Authorization: this.clickup.token,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      timeout: 30000,
    });
  }

  /** Fetch ALL tasks across the TEAM (auto-paginate; includes closed). */
  async getTeamTasks({ includeClosed = this.clickup.includeClosed } = {}) {
    const cu = this._cu();
    const all = [];
    let page = 0;

    while (true) {
      const params = { page, subtasks: true, include_closed: includeClosed ? true : false };
      try {
        const { data } = await cu.get(`/team/${this.clickup.teamId}/task`, { params });
        const items = data?.tasks || [];
        all.push(...items);
        if (items.length === 0) break;
        page += 1;
      } catch (err) {
        this._logAxiosError('ClickUp getTeamTasks failed', err);
        break;
      }
    }
    return all;
  }

  /** Check a single task against standards. */
  checkTaskStandards(task) {
    const issues = [];
    const name = (task.name || '').trim();
    const rawDesc = (task.description || '').trim();
    const description = rawDesc.replace(/<[^>]+>/g, '').trim();
    const assignees = Array.isArray(task.assignees) ? task.assignees : [];
    const due = task.due_date ? Number(task.due_date) : null;

    // priority can be null, number, or object
    let priority = task.priority ?? task.priority_id ?? null;
    if (priority && typeof priority === 'object') {
      priority = priority.priority || priority.label || priority.id || null;
    }
    const status = (task.status?.status || task.status?.name || '').toLowerCase();

    const checks = {
      hasTitle: name.length >= this.rules.minTitleLen,
      hasDescription: description.length >= this.rules.minDescLen,
      hasAssignee: assignees.length > 0,
      hasDueDate: !!due,
      hasPriority: priority !== null && priority !== undefined,
    };

    if (!checks.hasTitle) issues.push(`Short title (<${this.rules.minTitleLen})`);
    if (!checks.hasDescription) issues.push(`Missing/short description (<${this.rules.minDescLen})`);
    if (this.rules.assigneeRequired && !checks.hasAssignee) issues.push('No assignee');
    if (this.rules.dueDateRequired && !checks.hasDueDate) issues.push('No due date');
    if (this.rules.priorityRequired && !checks.hasPriority) issues.push('No priority');

    let overdue = false;
    if (this.rules.enforceOverdue && due && Date.now() > due) {
      if (!this.rules.completeStatuses.includes(status)) {
        overdue = true;
        issues.push('Overdue but not completed');
      }
    }

    const score = Math.max(0, 100 - issues.length * 20);
    const missingFields = Object.entries(checks)
      .filter(([_, ok]) => !ok)
      .map(([k]) => k.replace(/^has/, '').toLowerCase());

    return { score, issues, checks, missingFields, overdue, priorityNormalized: priority };
  }

  /** Audit ALL team tasks and return detailed results. */
  async auditTeam() {
    const tasks = await this.getTeamTasks({ includeClosed: true });

    const results = tasks.map(t => {
      const {
        score, issues, checks, missingFields, overdue, priorityNormalized
      } = this.checkTaskStandards(t);

      const assignees = (t.assignees || []).map(a => a.username || a.email || a.id);
      const due = t.due_date ? new Date(Number(t.due_date)).toISOString().slice(0,10) : null;

      return {
        id: t.id,
        url: `https://app.clickup.com/t/${t.id}`,
        name: t.name,
        status: t.status?.status || t.status?.name || '',
        assignees,
        due,
        priority: priorityNormalized,
        score,
        issues,
        checks,
        missingFields,
        overdue,
        listId: t.list?.id || null,
        listName: t.list?.name || null,
        date_created: t.date_created ? Number(t.date_created) : null,
      };
    });

    const nonCompliant = results.filter(r => r.issues.length > 0);
    const total = results.length;
    const passed = total - nonCompliant.length;
    const failed = nonCompliant.length;
    const passRate = total ? Math.round((passed / total) * 100) : 0;

    return { meta: { total, passed, failed, passRate }, results, nonCompliant };
  }

  // ========================= DAILY NEW TASKS (IST) =========================
  /** Compute start/end of *today* in IST, as UTC ms. */
  _getTodayISTWindowMs() {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30
    const nowUTC = Date.now();
    const nowIST = new Date(nowUTC + IST_OFFSET_MS);
    const startISTutc = Date.UTC(
      nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()
    ) - IST_OFFSET_MS;
    const endISTutc = startISTutc + 24 * 60 * 60 * 1000;
    return { startMs: startISTutc, endMs: endISTutc };
  }

  /** Audit tasks created TODAY (IST) only. */
  async auditNewTasksToday() {
    const { startMs, endMs } = this._getTodayISTWindowMs();
    const all = await this.auditTeam();
    const todays = all.results.filter(r => {
      const created = r.date_created ?? null;
      return created && created >= startMs && created < endMs;
    });

    const nonCompliant = todays.filter(r => r.issues.length > 0);
    const total = todays.length;
    const passed = total - nonCompliant.length;
    const failed = nonCompliant.length;
    const passRate = total ? Math.round((passed / total) * 100) : 0;

    return {
      meta: { total, passed, failed, passRate, window: { startMs, endMs } },
      results: todays,
      nonCompliant,
    };
  }

  /** WhatsApp-friendly summary for today's new tasks. */
  async buildNewTasksSummary(report) {
    const { total, passed, failed, passRate } = report.meta;
    const worstLines = [...report.nonCompliant]
      .sort((a,b) => a.score - b.score)
      .slice(0, 8)
      .map((r, i) => {
        const who = r.assignees.length ? r.assignees.join(', ') : 'Unassigned';
        const missing = r.missingFields.length ? r.missingFields.join(', ') : '—';
        return `${i+1}. ${r.name.slice(0,50)} — Missing: ${missing}; Who: ${who}`;
      })
      .join('\n');

    let summary = [
      `*New Tasks Audit (Today, IST)*`,
      `Created Today: ${total} | Passed: ${passed} | Failed: ${failed} | Pass Rate: ${passRate}%`,
      failed ? `\n*Fix Now:*\n${worstLines}` : '\nAll new tasks meet standards 🎉',
      `\nNext Step: Ensure each new task includes description, assignee, due date, and priority before moving status.`,
    ].join('\n');

    if (!(this.ai.enabled && this.ai.apiKey)) return summary;

    try {
      const improved = await this._openRouterSummarize(
        `Polish this WhatsApp update in <=6 lines. Keep numbers and "Next Step" line intact.\n\n${summary}`
      );
      return improved || summary;
    } catch {
      return summary;
    }
  }

  /** Run today's new-task audit and send WhatsApp if there are failures (or always if sendWhenZero=true). */
  async auditTodayNewTasksAndNotify({ to = this.whatsapp.toDefault, dryRun = false, sendWhenZero = false } = {}) {
    const report = await this.auditNewTasksToday();
    const summary = await this.buildNewTasksSummary(report);

    if (!dryRun && to && (sendWhenZero || report.nonCompliant.length > 0)) {
      await this.sendWhatsAppText(to, summary);
      return { sent: true, summary, ...report };
    }
    return { sent: false, summary, ...report };
  }

  /** Start a simple daily scheduler at a given IST time. */
  startDailyNewTaskAudit({ hourIST = 21, minuteIST = 0, to = this.whatsapp.toDefault } = {}) {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const now = Date.now();
    const nowIST = new Date(now + IST_OFFSET_MS);

    const targetIST = new Date(Date.UTC(
      nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate(), hourIST, minuteIST, 0, 0
    ));
    const firstRunUTC = targetIST.getTime() - IST_OFFSET_MS;
    let delay = firstRunUTC - now;
    if (delay < 0) delay += 24 * 60 * 60 * 1000; // schedule for tomorrow

    setTimeout(() => {
      this.auditTodayNewTasksAndNotify({ to }).catch(() => {});
      setInterval(() => {
        this.auditTodayNewTasksAndNotify({ to }).catch(() => {});
      }, 24 * 60 * 60 * 1000);
    }, delay);

    console.log(
      `[DailyNewTaskAudit] Scheduled daily at ${String(hourIST).padStart(2,'0')}:${String(minuteIST).padStart(2,'0')} IST. First run in ${Math.round(delay/1000)}s`
    );
  }

  // ========================= ALL-TASK SUMMARY =========================
  async buildSummary(report) {
    const { total, passed, failed, passRate } = report.meta;
    const worst = [...report.nonCompliant]
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.name.slice(0, 50)} — ${r.issues.join('; ')}`)
      .join('\n');

    let summary = [
      `*ClickUp Task Audit* (All statuses, incl. closed)`,
      `Total: ${total} | Passed: ${passed} | Failed: ${failed} | Pass Rate: ${passRate}%`,
      failed ? `\n*Top Issues:*\n${worst}` : '\nNo issues 🎉',
      `\nNext Step: Review and address the top issues, ensuring each task has a detailed description, an assignee, a due date, and a set priority.`,
    ].join('\n');

    if (!(this.ai.enabled && this.ai.apiKey)) return summary;

    try {
      const improved = await this._openRouterSummarize(
        `Rewrite this in <=6 lines for WhatsApp. Keep numbers intact. Keep the Next Step line.\n\n${summary}`
      );
      return improved || summary;
    } catch {
      return summary;
    }
  }

  async generateAuditResponse() {
    const report = await this.auditTeam();

    let out = '';
    out += `total task : ${report.meta.total}\n`;
    out += `passed : ${report.meta.passed}\n`;
    out += `failed : ${report.meta.failed}\n\n`;

    out += `failed Tasks ( Full Failed Tasked )\n\n`;
    if (report.nonCompliant.length === 0) {
      out += `None 🎉\n\n`;
    } else {
      report.nonCompliant
        .sort((a,b) => a.score - b.score)
        .forEach((r, i) => {
          const who = r.assignees.length ? r.assignees.join(', ') : 'Unassigned';
          const missing = r.missingFields.length ? r.missingFields.join(', ') : '—';
          out += `${i+1}. ${r.name}\n`;
          out += `   - Who: ${who}\n`;
          out += `   - Status: ${r.status || '-'}\n`;
          out += `   - Due: ${r.due || '-'}\n`;
          out += `   - Priority: ${r.priority ?? '-'}\n`;
          out += `   - Missing: ${missing}${r.overdue ? ' (overdue)' : ''}\n`;
          out += `   - URL: ${r.url}\n\n`;
        });
    }

    const methods = [
      'Add a clear, outcome-oriented description (context, definition of done, acceptance criteria).',
      'Assign a single directly-responsible owner; add watchers only if needed.',
      'Set a realistic due date; split big items into sub-tasks with their own dates.',
      'Set an appropriate priority (Urgent/High/Normal/Low) based on impact vs. urgency.',
      'Resolve overdue items first: update progress, renegotiate dates, or close if done.',
    ].map(s => `• ${s}`).join('\n');

    out += `methods to correct these tasks\n${methods}\n`;
    return out;
  }

  /** Back-compat for your existing test.js */
  async analyzeAndSendReport({ dryRun = false, to = this.whatsapp.toDefault } = {}) {
    const report = await this.auditTeam();
    const summary = await this.buildSummary(report);
    if (!dryRun && to) {
      await this.sendWhatsAppText(to, summary);
    }
    return {
      summary,
      meta: report.meta,
      results: report.results,
      nonCompliant: report.nonCompliant,
      sent: !dryRun && !!to,
    };
  }

  // ========================= WHATSAPP =========================
  _waUrl(path) {
    return `https://graph.facebook.com/v21.0/${this.whatsapp.phoneNumberId}/${path}`;
  }

  async sendWhatsAppText(to, text) {
    try {
      const { data } = await axios.post(
        this._waUrl('messages'),
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { preview_url: false, body: text },
        },
        {
          headers: {
            Authorization: `Bearer ${this.whatsapp.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        }
      );
      return data;
    } catch (err) {
      this._logAxiosError('WhatsApp send text failed', err);
      throw err;
    }
  }

  // ========================= OPENROUTER =========================
  async _openRouterSummarize(prompt) {
    const { data } = await axios.post(
      `${this.ai.baseURL}/chat/completions`,
      {
        model: this.ai.model,
        max_tokens: this.ai.maxTokens,
        messages: [
          { role: 'system', content: 'You are a concise operations advisor.' },
          { role: 'user', content: prompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${this.ai.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );
    return (data?.choices?.[0]?.message?.content || '').trim();
  }

  // ========================= HELPERS =========================
  envSummary() {
    return {
      clickupTeamId: this.clickup.teamId,
      includeClosed: this.clickup.includeClosed,
      whatsappPhoneId: this.whatsapp.phoneNumberId,
      toDefault: this.whatsapp.toDefault,
      tokens: {
        clickup: this.clickup.token ? 'present' : 'missing',
        whatsapp: this.whatsapp.token ? 'present' : 'missing',
        openrouter: this.ai.apiKey ? 'present' : 'missing',
      },
      ai: { enabled: this.ai.enabled, model: this.ai.model, maxTokens: this.ai.maxTokens },
    };
  }

  _logAxiosError(label, err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const msg = err.message;
    console.error(`[${label}]`, { status, data, msg });
  }
}

module.exports = new AIAnalysisService();
