

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

//     // ---- WhatsApp ----
//     this.whatsapp = {
//       token: process.env.WHATSAPP_META_TOKEN,
//       phoneNumberId: process.env.WHATSAPP_META_PHONE_NUMBER_ID,
//       toDefault: process.env.TEAM_LEAD_NUMBER || null,
//     };

//     // ---- AI via OpenRouter ----
//     this.ai = {
//       enabled: (process.env.AI_ANALYSIS_ENABLED || 'true').toLowerCase() === 'true',
//       apiKey: process.env.OPENROUTER_API_KEY,
//       baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
//       model: process.env.AI_MODEL || 'gpt-4o-mini',
//       maxTokens: Number(process.env.AI_MAX_TOKENS || 500),
//     };

//     // ---- Enhanced Standards (aligned with Rootments prompt) ----
//     this.rules = {
//       minTitleLen: 6,
//       minDescLen: 15,
//       assigneeRequired: true,
//       dueDateRequired: true,
//       priorityRequired: true,
//       enforceOverdue: true,
//       completeStatuses: ['complete', 'done', 'closed'],
//       // Title format validation - No longer requires module-based format
//       titleFormatRequired: false,
//       titlePattern: /^.+$/,
//       // Description content validation
//       descriptionContextRequired: true,
//       descriptionOutputRequired: true,
//     };

//     // Optional auto-schedule via .env
//     const dailyEnabled = (process.env.DAILY_NEW_TASK_AUDIT || 'false').toLowerCase() === 'true';
//     if (dailyEnabled) {
//       const hourIST = Number(process.env.DAILY_NEW_TASK_AUDIT_HOUR_IST || 21);
//       const minuteIST = Number(process.env.DAILY_NEW_TASK_AUDIT_MIN_IST || 0);
//       this.startDailyNewTaskAudit({ hourIST, minuteIST, to: this.whatsapp.toDefault });
//     }
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

//   /** Fetch ALL tasks across the TEAM (auto-paginate; includes closed). */
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

//   /** Check if description has context and output definition */
//   _validateDescriptionContent(description) {
//     const contextKeywords = ['what', 'why', 'context', 'background', 'reason', 'purpose', 'goal'];
//     const outputKeywords = ['done', 'complete', 'deliver', 'output', 'result', 'acceptance', 'criteria', 'should'];
    
//     const hasContext = contextKeywords.some(keyword => description.toLowerCase().includes(keyword));
//     const hasOutput = outputKeywords.some(keyword => description.toLowerCase().includes(keyword));
    
//     return { hasContext, hasOutput };
//   }

//   /** ENHANCED: Check a single task against Rootments standards */
//   checkTaskStandards(task) {
//     const issues = [];
//     const name = (task.name || '').trim();
//     const rawDesc = (task.description || '').trim();
//     const description = rawDesc.replace(/<[^>]+>/g, '').trim();
//     const assignees = Array.isArray(task.assignees) ? task.assignees : [];
//     const due = task.due_date ? Number(task.due_date) : null;

//     // priority can be null, number, or object
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
//       hasTitleFormat: true,
//       hasDescriptionContext: true,
//       hasDescriptionOutput: true,
//     };

//     // Basic validations
//     if (!checks.hasTitle) issues.push(`Short title (<${this.rules.minTitleLen})`);
//     if (!checks.hasDescription) issues.push(`Missing/short description (<${this.rules.minDescLen})`);
//     if (this.rules.assigneeRequired && !checks.hasAssignee) issues.push('No assignee');
//     if (this.rules.dueDateRequired && !checks.hasDueDate) issues.push('No due date');
//     if (this.rules.priorityRequired && !checks.hasPriority) issues.push('No priority');

//     // Description content validation
//     if (this.rules.descriptionContextRequired || this.rules.descriptionOutputRequired) {
//       const { hasContext, hasOutput } = this._validateDescriptionContent(description);
//       if (this.rules.descriptionContextRequired && !hasContext) {
//         issues.push('Description missing context (what/why)');
//         checks.hasDescriptionContext = false;
//       }
//       if (this.rules.descriptionOutputRequired && !hasOutput) {
//         issues.push('Description missing expected output/definition of done');
//         checks.hasDescriptionOutput = false;
//       }
//     }

//     // Overdue validation
//     let overdue = false;
//     if (this.rules.enforceOverdue && due && Date.now() > due) {
//       if (!this.rules.completeStatuses.includes(status)) {
//         overdue = true;
//         issues.push('Overdue but not completed');
//       }
//     }

//     const score = Math.max(0, 100 - issues.length * 15);
//     const missingFields = Object.entries(checks)
//       .filter(([_, ok]) => !ok)
//       .map(([k]) => k.replace(/^has/, '').toLowerCase());

//     return { 
//       score, 
//       issues, 
//       checks, 
//       missingFields, 
//       overdue, 
//       priorityNormalized: priority,
//     };
//   }

//   /** Get compliance level based on score - Simplified to excellent (75%+) or poor (<75%) */
//   _getComplianceLevel(score) {
//     if (score >= 75) return 'excellent';
//     return 'poor';
//   }

//   /** Identify critical issues that need immediate attention */
//   _getCriticalIssues(issues) {
//     const critical = issues.filter(issue => 
//       issue.includes('No assignee') || 
//       issue.includes('Overdue') || 
//       issue.includes('No due date')
//     );
//     return critical;
//   }

//   /** Generate CSV content for tasks */
//   _generateTaskCSV(tasks) {
//     if (tasks.length === 0) return 'id,name,score,complianceLevel,assignees,due,priority,status,issues,url\n';
    
//     const headers = 'id,name,score,complianceLevel,assignees,due,priority,status,issues,url\n';
//     const rows = tasks.map(task => {
//       const assignees = task.assignees.join(';') || 'Unassigned';
//       const issues = task.issues.join(';') || 'None';
//       const name = `"${task.name.replace(/"/g, '""')}"`;
//       const status = `"${task.status || 'None'}"`;
      
//       return [
//         task.id,
//         name,
//         task.score,
//         task.complianceLevel,
//         `"${assignees}"`,
//         task.due || 'Not set',
//         task.priority || 'Not set',
//         status,
//         `"${issues}"`,
//         task.url
//       ].join(',');
//     }).join('\n');
    
//     return headers + rows;
//   }

//   /** Export excellent and poor tasks to CSV files */
//   async exportTasksToCSV(report) {
//     const fs = require('fs');
//     const path = require('path');
    
//     const excellentTasks = report.results.filter(r => r.complianceLevel === 'excellent');
//     const poorTasks = report.results.filter(r => r.complianceLevel === 'poor');
    
//     const excellentCSV = this._generateTaskCSV(excellentTasks);
//     const poorCSV = this._generateTaskCSV(poorTasks);
    
//     // Create exports directory if it doesn't exist
//     const exportDir = path.join(__dirname, 'exports');
//     if (!fs.existsSync(exportDir)) {
//       fs.mkdirSync(exportDir, { recursive: true });
//     }
    
//     // Generate timestamp for unique filenames
//     const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    
//     const excellentFilePath = path.join(exportDir, `excellent_tasks_${timestamp}.csv`);
//     const poorFilePath = path.join(exportDir, `poor_tasks_${timestamp}.csv`);
    
//     // Write CSV files
//     fs.writeFileSync(excellentFilePath, excellentCSV);
//     fs.writeFileSync(poorFilePath, poorCSV);
    
//     console.log(`\n📊 CSV EXPORTS GENERATED:`);
//     console.log(`✅ Excellent Tasks (${excellentTasks.length}): ${excellentFilePath}`);
//     console.log(`❌ Poor Tasks (${poorTasks.length}): ${poorFilePath}\n`);
    
//     return {
//       excellent: { count: excellentTasks.length, path: excellentFilePath },
//       poor: { count: poorTasks.length, path: poorFilePath }
//     };
//   }

//   /** Audit ALL team tasks and return detailed results */
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
//         date_created: t.date_created ? Number(t.date_created) : null,
//         complianceLevel: this._getComplianceLevel(score),
//         criticalIssues: this._getCriticalIssues(issues),
//       };
//     });

//     const nonCompliant = results.filter(r => r.issues.length > 0);
//     const compliant = results.filter(r => r.issues.length === 0);
//     const total = results.length;
//     const passed = total - nonCompliant.length;
//     const failed = nonCompliant.length;
//     const passRate = total ? Math.round((passed / total) * 100) : 0;

//     // Console logging for both compliant and non-compliant tasks
//     console.log('\n=== TASK AUDIT RESULTS ===');
//     console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed} | Pass Rate: ${passRate}%\n`);

//     // Log compliant tasks
//     if (compliant.length > 0) {
//       console.log('✅ COMPLIANT TASKS (Meeting all standards):');
//       compliant.forEach((task, index) => {
//         const assigneesList = task.assignees.length ? task.assignees.join(', ') : 'Unassigned';
//         console.log(`${index + 1}. ${task.name}`);
//         console.log(`   • Score: ${task.score}/100 (${task.complianceLevel})`);
//         console.log(`   • Assignee: ${assigneesList}`);
//         console.log(`   • Status: ${task.status || 'None'}`);
//         console.log(`   • Due: ${task.due || 'Not set'}`);
//         console.log(`   • Priority: ${task.priority ?? 'Not set'}`);
//         console.log(`   • URL: ${task.url}\n`);
//       });
//     } else {
//       console.log('✅ COMPLIANT TASKS: None\n');
//     }

//     // Log non-compliant tasks
//     if (nonCompliant.length > 0) {
//       console.log('❌ NON-COMPLIANT TASKS (Need improvement):');
//       nonCompliant.forEach((task, index) => {
//         const assigneesList = task.assignees.length ? task.assignees.join(', ') : 'Unassigned';
//         const critical = task.criticalIssues.length > 0 ? ' ⚠️ CRITICAL' : '';
//         console.log(`${index + 1}. ${task.name}${critical}`);
//         console.log(`   • Score: ${task.score}/100 (${task.complianceLevel})`);
//         console.log(`   • Assignee: ${assigneesList}`);
//         console.log(`   • Status: ${task.status || 'None'}`);
//         console.log(`   • Due: ${task.due || 'Not set'}`);
//         console.log(`   • Priority: ${task.priority ?? 'Not set'}`);
//         console.log(`   • Issues: ${task.issues.join('; ')}`);
//         console.log(`   • URL: ${task.url}\n`);
//       });
//     } else {
//       console.log('❌ NON-COMPLIANT TASKS: None - All tasks meet standards! 🎉\n');
//     }

//     console.log('=== END AUDIT RESULTS ===\n');

//     // Compliance breakdown - Updated for 2-tier system
//     const complianceBreakdown = {
//       excellent: results.filter(r => r.complianceLevel === 'excellent').length,
//       poor: results.filter(r => r.complianceLevel === 'poor').length,
//     };

//     return { 
//       meta: { total, passed, failed, passRate, complianceBreakdown }, 
//       results, 
//       nonCompliant,
//       compliant
//     };
//   }

//   // ========================= ENHANCED REPORTING =========================
  
//   /** Enhanced WhatsApp summary with compliance levels */
//   async buildSummary(report) {
//     const { total, passed, failed, passRate, complianceBreakdown } = report.meta;
    
//     const worst = [...report.nonCompliant]
//       .sort((a, b) => a.score - b.score)
//       .slice(0, 5)
//       .map((r, i) => {
//         const criticalCount = r.criticalIssues.length;
//         const criticalMark = criticalCount > 0 ? ` (${criticalCount} critical)` : '';
//         return `${i + 1}. ${r.name.slice(0, 40)} — ${r.issues.slice(0,2).join('; ')}${criticalMark}`;
//       })
//       .join('\n');

//     let summary = [
//       `*ClickUp Task Standards Audit*`,
//       `Total: ${total} | Pass Rate: ${passRate}% | Failed: ${failed}`,
//       `Excellent (≥75%): ${complianceBreakdown.excellent} | Poor (<75%): ${complianceBreakdown.poor}`,
//       failed ? `\n*Priority Fixes:*\n${worst}` : '\nAll tasks meet Rootments standards 🎉',
//       `\nNext: Fix critical issues first (assignee, due date), then improve descriptions with context and expected output.`,
//     ].join('\n');

//     if (!(this.ai.enabled && this.ai.apiKey)) return summary;

//     try {
//       const improved = await this._openRouterSummarize(
//         `Polish this task audit summary for Rootments tech team WhatsApp. Keep it <=8 lines, preserve numbers and "Next:" section. Make it actionable for task creators.\n\n${summary}`
//       );
//       return improved || summary;
//     } catch {
//       return summary;
//     }
//   }

//   /** Enhanced audit response with Rootments-specific guidance */
//   async generateAuditResponse() {
//     const report = await this.auditTeam();

//     let out = '';
//     out += `=== ROOTMENTS TASK STANDARDS AUDIT ===\n`;
//     out += `Total Tasks: ${report.meta.total}\n`;
//     out += `Standards Compliant: ${report.meta.passed}\n`;
//     out += `Needs Improvement: ${report.meta.failed}\n`;
//     out += `Pass Rate: ${report.meta.passRate}%\n\n`;

//     // Compliance breakdown - Updated for 2-tier system
//     out += `COMPLIANCE LEVELS:\n`;
//     out += `• Excellent (≥75%): ${report.meta.complianceBreakdown.excellent}\n`;
//     out += `• Poor (<75%): ${report.meta.complianceBreakdown.poor}\n\n`;

//     // Failed tasks with enhanced details
//     out += `NON-COMPLIANT TASKS:\n\n`;
//     if (report.nonCompliant.length === 0) {
//       out += `None! All tasks meet Rootments standards 🎉\n\n`;
//     } else {
//       report.nonCompliant
//         .sort((a,b) => a.score - b.score)
//         .forEach((r, i) => {
//           const who = r.assignees.length ? r.assignees.join(', ') : 'Unassigned';
//           const missing = r.missingFields.length ? r.missingFields.join(', ') : '—';
//           const critical = r.criticalIssues.length > 0 ? ` ⚠️ CRITICAL` : '';
          
//           out += `${i+1}. ${r.name}${critical}\n`;
//           out += `   • Score: ${r.score}/100 (${r.complianceLevel})\n`;
//           out += `   • Assignee: ${who}\n`;
//           out += `   • Status: ${r.status || 'None'}\n`;
//           out += `   • Due: ${r.due || 'Not set'}\n`;
//           out += `   • Priority: ${r.priority ?? 'Not set'}\n`;
//           out += `   • Issues: ${r.issues.join('; ')}\n`;
//           out += `   • URL: ${r.url}\n\n`;
//         });
//     }

//     // Rootments-specific correction methods
//     const methods = [
//       'TITLE: Use clear, descriptive titles that explain what needs to be done',
//       'DESCRIPTION: Include context (what/why), clear acceptance criteria, and expected deliverables',
//       'ASSIGNEE: Assign to ONE responsible person; use watchers for visibility only',
//       'DUE DATE: Set realistic deadlines; break large tasks if needed with individual dates',
//       'PRIORITY: Use Urgent (blocking), High (important), Normal (planned), Low (nice-to-have)',
//       'OVERDUE: Update progress, renegotiate dates, or mark complete immediately',
//     ].map(s => `• ${s}`).join('\n');

//     out += `ROOTMENTS TASK CREATION STANDARDS:\n${methods}\n\n`;
    
//     out += `Use this ChatGPT prompt for creating compliant tasks:\n`;
//     out += `"I want you to act like a task creation assistant for Rootments tech team. Create clear, descriptive titles. Include context, acceptance criteria, assignee, due date, and priority suggestions."\n`;
    
//     return out;
//   }

//   // ========================= DAILY NEW TASKS (IST) =========================
//   _getTodayISTWindowMs() {
//     const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
//     const nowUTC = Date.now();
//     const nowIST = new Date(nowUTC + IST_OFFSET_MS);
//     const startISTutc = Date.UTC(
//       nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()
//     ) - IST_OFFSET_MS;
//     const endISTutc = startISTutc + 24 * 60 * 60 * 1000;
//     return { startMs: startISTutc, endMs: endISTutc };
//   }

//   async auditNewTasksToday() {
//     const { startMs, endMs } = this._getTodayISTWindowMs();
//     const all = await this.auditTeam();
//     const todays = all.results.filter(r => {
//       const created = r.date_created ?? null;
//       return created && created >= startMs && created < endMs;
//     });

//     const nonCompliant = todays.filter(r => r.issues.length > 0);
//     const total = todays.length;
//     const passed = total - nonCompliant.length;
//     const failed = nonCompliant.length;
//     const passRate = total ? Math.round((passed / total) * 100) : 0;

//     return {
//       meta: { total, passed, failed, passRate, window: { startMs, endMs } },
//       results: todays,
//       nonCompliant,
//     };
//   }

//   async buildNewTasksSummary(report) {
//     const { total, passed, failed, passRate } = report.meta;
//     const worstLines = [...report.nonCompliant]
//       .sort((a,b) => a.score - b.score)
//       .slice(0, 8)
//       .map((r, i) => {
//         const who = r.assignees.length ? r.assignees.join(', ') : 'Unassigned';
//         const critical = r.criticalIssues.length > 0 ? ' ⚠️' : '';
//         return `${i+1}. ${r.name.slice(0,45)} — ${r.issues.slice(0,2).join(', ')}${critical}`;
//       })
//       .join('\n');

//     let summary = [
//       `*New Tasks Audit (Today, IST)*`,
//       `Created: ${total} | Standards Met: ${passed} | Need Fix: ${failed} | Rate: ${passRate}%`,
//       failed ? `\n*Fix Before Moving Status:*\n${worstLines}` : '\nAll new tasks meet Rootments standards 🎉',
//       `\nReminder: Use clear titles, add context, assignee, due date, and priority.`,
//     ].join('\n');

//     if (!(this.ai.enabled && this.ai.apiKey)) return summary;

//     try {
//       const improved = await this._openRouterSummarize(
//         `Polish this new task audit for Rootments team WhatsApp. Keep <=6 lines, preserve numbers and reminder.\n\n${summary}`
//       );
//       return improved || summary;
//     } catch {
//       return summary;
//     }
//   }

//   async auditTodayNewTasksAndNotify({ to = this.whatsapp.toDefault, dryRun = false, sendWhenZero = false } = {}) {
//     const report = await this.auditNewTasksToday();
//     const summary = await this.buildNewTasksSummary(report);

//     if (!dryRun && to && (sendWhenZero || report.nonCompliant.length > 0)) {
//       await this.sendWhatsAppText(to, summary);
//       return { sent: true, summary, ...report };
//     }
//     return { sent: false, summary, ...report };
//   }

//   startDailyNewTaskAudit({ hourIST = 21, minuteIST = 0, to = this.whatsapp.toDefault } = {}) {
//     const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
//     const now = Date.now();
//     const nowIST = new Date(now + IST_OFFSET_MS);

//     const targetIST = new Date(Date.UTC(
//       nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate(), hourIST, minuteIST, 0, 0
//     ));
//     const firstRunUTC = targetIST.getTime() - IST_OFFSET_MS;
//     let delay = firstRunUTC - now;
//     if (delay < 0) delay += 24 * 60 * 60 * 1000;

//     setTimeout(() => {
//       this.auditTodayNewTasksAndNotify({ to }).catch(() => {});
//       setInterval(() => {
//         this.auditTodayNewTasksAndNotify({ to }).catch(() => {});
//       }, 24 * 60 * 60 * 1000);
//     }, delay);

//     console.log(
//       `[DailyNewTaskAudit] Scheduled daily at ${String(hourIST).padStart(2,'0')}:${String(minuteIST).padStart(2,'0')} IST. First run in ${Math.round(delay/1000)}s`
//     );
//   }

//   // ========================= MAIN METHODS =========================

//   async analyzeAndSendReport({ dryRun = false, to = this.whatsapp.toDefault, exportCSV = true } = {}) {
//     const report = await this.auditTeam();
//     const summary = await this.buildSummary(report);
    
//     // Export CSVs if requested
//     let csvExports = null;
//     if (exportCSV) {
//       csvExports = await this.exportTasksToCSV(report);
//     }
    
//     if (!dryRun && to) {
//       await this.sendWhatsAppText(to, summary);
//     }
    
//     return {
//       summary,
//       meta: report.meta,
//       results: report.results,
//       nonCompliant: report.nonCompliant,
//       compliant: report.compliant,
//       csvExports,
//       sent: !dryRun && !!to,
//     };
//   }

//   // ========================= WHATSAPP =========================

//   _waUrl(path) {
//     return `https://graph.facebook.com/v21.0/${this.whatsapp.phoneNumberId}/${path}`;
//   }

//   async sendWhatsAppText(to, text) {
//     try {
//       const { data } = await axios.post(
//         this._waUrl('messages'),
//         {
//           messaging_product: 'whatsapp',
//           to,
//           type: 'text',
//           text: { preview_url: false, body: text },
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${this.whatsapp.token}`,
//             'Content-Type': 'application/json',
//           },
//           timeout: 20000,
//         }
//       );
//       return data;
//     } catch (err) {
//       this._logAxiosError('WhatsApp send text failed', err);
//       throw err;
//     }
//   }

//   // ========================= AI/OPENROUTER =========================

//   async _openRouterSummarize(prompt) {
//     const { data } = await axios.post(
//       `${this.ai.baseURL}/chat/completions`,
//       {
//         model: this.ai.model,
//         max_tokens: this.ai.maxTokens,
//         messages: [
//           { role: 'system', content: 'You are a concise operations advisor for tech teams.' },
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
//     return (data?.choices?.[0]?.message?.content || '').trim();
//   }

//   // ========================= UTILITY =========================

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
//       rules: this.rules,
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



// AIAnalysisService.js
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

    // ---- Enhanced Standards (aligned with Rootments prompt) ----
    this.rules = {
      minTitleLen: 6,
      minDescLen: 15,
      assigneeRequired: true,
      dueDateRequired: true,
      priorityRequired: true,
      enforceOverdue: true,
      completeStatuses: ['complete', 'done', 'closed'],

      // Title format validation - No longer requires module-based format
      titleFormatRequired: false,
      titlePattern: /^.+$/,

      // Description content validation
      descriptionContextRequired: true,
      descriptionOutputRequired: true,

      // Compliance threshold (two-tier system)
      excellentMin: Number(process.env.EXCELLENT_MIN || 75),
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

  /** Check if description has context and output definition */
  _validateDescriptionContent(description) {
    const desc = (description || '').toLowerCase();
    const contextKeywords = ['what', 'why', 'context', 'background', 'reason', 'purpose', 'goal'];
    const outputKeywords = ['done', 'complete', 'deliver', 'output', 'result', 'acceptance', 'criteria', 'should'];

    const hasContext = contextKeywords.some(keyword => desc.includes(keyword));
    const hasOutput = outputKeywords.some(keyword => desc.includes(keyword));

    return { hasContext, hasOutput };
  }

  /** ENHANCED: Check a single task against Rootments standards */
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
      hasTitleFormat: true,
      hasDescriptionContext: true,
      hasDescriptionOutput: true,
    };

    // Basic validations
    if (!checks.hasTitle) issues.push(`Short title (<${this.rules.minTitleLen})`);
    if (!checks.hasDescription) issues.push(`Missing/short description (<${this.rules.minDescLen})`);
    if (this.rules.assigneeRequired && !checks.hasAssignee) issues.push('No assignee');
    if (this.rules.dueDateRequired && !checks.hasDueDate) issues.push('No due date');
    if (this.rules.priorityRequired && !checks.hasPriority) issues.push('No priority');

    // Description content validation
    if (this.rules.descriptionContextRequired || this.rules.descriptionOutputRequired) {
      const { hasContext, hasOutput } = this._validateDescriptionContent(description);
      if (this.rules.descriptionContextRequired && !hasContext) {
        issues.push('Description missing context (what/why)');
        checks.hasDescriptionContext = false;
      }
      if (this.rules.descriptionOutputRequired && !hasOutput) {
        issues.push('Description missing expected output/definition of done');
        checks.hasDescriptionOutput = false;
      }
    }

    // Overdue validation
    let overdue = false;
    if (this.rules.enforceOverdue && due && Date.now() > due) {
      if (!this.rules.completeStatuses.includes(status)) {
        overdue = true;
        issues.push('Overdue but not completed');
      }
    }

    const score = Math.max(0, 100 - issues.length * 15);
    const missingFields = Object.entries(checks)
      .filter(([_, ok]) => !ok)
      .map(([k]) => k.replace(/^has/, '').toLowerCase());

    return {
      score,
      issues,
      checks,
      missingFields,
      overdue,
      priorityNormalized: priority,
    };
  }

  /** Two-tier compliance: Excellent if score ≥ excellentMin, otherwise Poor */
  _getComplianceLevel(score) {
    return score >= this.rules.excellentMin ? 'excellent' : 'poor';
  }

  /** Identify critical issues that need immediate attention */
  _getCriticalIssues(issues) {
    const critical = issues.filter(issue =>
      issue.includes('No assignee') ||
      issue.includes('Overdue') ||
      issue.includes('No due date')
    );
    return critical;
  }

  /** Generate CSV content for tasks (expects items from auditTeam().results) */
  _generateTaskCSV(tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return 'id,name,score,complianceLevel,assignees,due,priority,status,issues,url\n';
    }

    const headers = 'id,name,score,complianceLevel,assignees,due,priority,status,issues,url\n';
    const rows = tasks.map(task => {
      const assignees = Array.isArray(task.assignees) && task.assignees.length
        ? task.assignees.join(';')
        : 'Unassigned';
      const issues = Array.isArray(task.issues) && task.issues.length
        ? task.issues.join(';')
        : 'None';
      const name = `"${String(task.name || '').replace(/"/g, '""')}"`;
      const status = `"${task.status || 'None'}"`;

      return [
        task.id,
        name,
        task.score,
        task.complianceLevel,
        `"${assignees}"`,
        task.due || 'Not set',
        task.priority ?? 'Not set',
        status,
        `"${issues}"`,
        task.url
      ].join(',');
    }).join('\n');

    return headers + rows;
  }

  /** Export excellent and poor tasks to CSV files */
  async exportTasksToCSV(report) {
    const fs = require('fs');
    const path = require('path');

    const excellentTasks = report.results.filter(r => r.complianceLevel === 'excellent');
    const poorTasks = report.results.filter(r => r.complianceLevel === 'poor');

    const excellentCSV = this._generateTaskCSV(excellentTasks);
    const poorCSV = this._generateTaskCSV(poorTasks);

    // Create exports directory if it doesn't exist
    const exportDir = path.join(__dirname, 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    // Generate timestamp for unique filenames
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');

    const excellentFilePath = path.join(exportDir, `excellent_tasks_${timestamp}.csv`);
    const poorFilePath = path.join(exportDir, `poor_tasks_${timestamp}.csv`);

    // Write CSV files
    fs.writeFileSync(excellentFilePath, excellentCSV);
    fs.writeFileSync(poorFilePath, poorCSV);

    console.log(`\n📊 CSV EXPORTS GENERATED:`);
    console.log(`✅ Excellent Tasks (${excellentTasks.length}): ${excellentFilePath}`);
    console.log(`❌ Poor Tasks (${poorTasks.length}): ${poorFilePath}\n`);

    return {
      excellent: { count: excellentTasks.length, path: excellentFilePath },
      poor: { count: poorTasks.length, path: poorFilePath }
    };
  }

  /** Audit ALL team tasks and return detailed results */
  async auditTeam() {
    const tasks = await this.getTeamTasks({ includeClosed: true });

    const results = tasks.map(t => {
      const {
        score, issues, checks, missingFields, overdue, priorityNormalized
      } = this.checkTaskStandards(t);

      const assignees = (t.assignees || []).map(a => a.username || a.email || a.id);
      const due = t.due_date ? new Date(Number(t.due_date)).toISOString().slice(0, 10) : null;

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
        complianceLevel: this._getComplianceLevel(score),
        criticalIssues: this._getCriticalIssues(issues),
      };
    });

    const nonCompliant = results.filter(r => r.issues.length > 0);
    const compliant = results.filter(r => r.issues.length === 0);
    const total = results.length;
    const passed = total - nonCompliant.length;
    const failed = nonCompliant.length;
    const passRate = total ? Math.round((passed / total) * 100) : 0;

    // Console logging for both compliant and non-compliant tasks
    console.log('\n=== TASK AUDIT RESULTS ===');
    console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed} | Pass Rate: ${passRate}%\n`);

    // Log compliant tasks
    if (compliant.length > 0) {
      console.log('✅ COMPLIANT TASKS (Meeting all standards):');
      compliant.forEach((task, index) => {
        const assigneesList = task.assignees.length ? task.assignees.join(', ') : 'Unassigned';
        console.log(`${index + 1}. ${task.name}`);
        console.log(`   • Score: ${task.score}/100 (${task.complianceLevel})`);
        console.log(`   • Assignee: ${assigneesList}`);
        console.log(`   • Status: ${task.status || 'None'}`);
        console.log(`   • Due: ${task.due || 'Not set'}`);
        console.log(`   • Priority: ${task.priority ?? 'Not set'}`);
        console.log(`   • URL: ${task.url}\n`);
      });
    } else {
      console.log('✅ COMPLIANT TASKS: None\n');
    }

    // Log non-compliant tasks
    if (nonCompliant.length > 0) {
      console.log('❌ NON-COMPLIANT TASKS (Need improvement):');
      nonCompliant.forEach((task, index) => {
        const assigneesList = task.assignees.length ? task.assignees.join(', ') : 'Unassigned';
        const critical = task.criticalIssues.length > 0 ? ' ⚠️ CRITICAL' : '';
        console.log(`${index + 1}. ${task.name}${critical}`);
        console.log(`   • Score: ${task.score}/100 (${task.complianceLevel})`);
        console.log(`   • Assignee: ${assigneesList}`);
        console.log(`   • Status: ${task.status || 'None'}`);
        console.log(`   • Due: ${task.due || 'Not set'}`);
        console.log(`   • Priority: ${task.priority ?? 'Not set'}`);
        console.log(`   • Issues: ${task.issues.join('; ')}`);
        console.log(`   • URL: ${task.url}\n`);
      });
    } else {
      console.log('❌ NON-COMPLIANT TASKS: None - All tasks meet standards! 🎉\n');
    }

    console.log('=== END AUDIT RESULTS ===\n');

    // Compliance breakdown - 2-tier with legacy keys retained as 0 to avoid "undefined" in external printers
    const complianceBreakdown = {
      excellent: results.filter(r => r.complianceLevel === 'excellent').length, // ≥ excellentMin
      poor: results.filter(r => r.complianceLevel === 'poor').length,          // < excellentMin
      // legacy buckets for any external dashboards/scripts expecting them:
      good: 0,
      needsImprovement: 0,
    };

    return {
      meta: { total, passed, failed, passRate, complianceBreakdown },
      results,
      nonCompliant,
      compliant
    };
  }

  // ========================= ENHANCED REPORTING =========================

  /** Enhanced WhatsApp summary with compliance levels */
  async buildSummary(report) {
    const { total, passed, failed, passRate, complianceBreakdown } = report.meta;
    const exMin = this.rules.excellentMin;

    const worst = [...report.nonCompliant]
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map((r, i) => {
        const criticalCount = r.criticalIssues.length;
        const criticalMark = criticalCount > 0 ? ` (${criticalCount} critical)` : '';
        return `${i + 1}. ${r.name.slice(0, 40)} — ${r.issues.slice(0, 2).join('; ')}${criticalMark}`;
      })
      .join('\n');

    let summary = [
      `*ClickUp Task Standards Audit*`,
      `Total: ${total} | Pass Rate: ${passRate}% | Failed: ${failed}`,
      `Excellent (≥${exMin}%): ${complianceBreakdown.excellent} | Poor (<${exMin}%): ${complianceBreakdown.poor}`,
      failed ? `\n*Priority Fixes:*\n${worst}` : '\nAll tasks meet Rootments standards 🎉',
      `\nNext: Fix critical issues first (assignee, due date), then improve descriptions with context and expected output.`,
    ].join('\n');

    if (!(this.ai.enabled && this.ai.apiKey)) return summary;

    try {
      const improved = await this._openRouterSummarize(
        `Polish this task audit summary for Rootments tech team WhatsApp. Keep it <=8 lines, preserve numbers and "Next:" section. Make it actionable for task creators.\n\n${summary}`
      );
      return improved || summary;
    } catch {
      return summary;
    }
  }

  /** Enhanced audit response with Rootments-specific guidance */
  async generateAuditResponse() {
    const report = await this.auditTeam();
    const exMin = this.rules.excellentMin;

    let out = '';
    out += `=== ROOTMENTS TASK STANDARDS AUDIT ===\n`;
    out += `Total Tasks: ${report.meta.total}\n`;
    out += `Standards Compliant: ${report.meta.passed}\n`;
    out += `Needs Improvement: ${report.meta.failed}\n`;
    out += `Pass Rate: ${report.meta.passRate}%\n\n`;

    // Compliance breakdown - 2-tier
    out += `COMPLIANCE LEVELS:\n`;
    out += `• Excellent (≥${exMin}%): ${report.meta.complianceBreakdown.excellent}\n`;
    out += `• Poor (<${exMin}%): ${report.meta.complianceBreakdown.poor}\n\n`;

    // Failed tasks with enhanced details
    out += `NON-COMPLIANT TASKS:\n\n`;
    if (report.nonCompliant.length === 0) {
      out += `None! All tasks meet Rootments standards 🎉\n\n`;
    } else {
      report.nonCompliant
        .sort((a, b) => a.score - b.score)
        .forEach((r, i) => {
          const who = r.assignees.length ? r.assignees.join(', ') : 'Unassigned';
          const critical = r.criticalIssues.length > 0 ? ` ⚠️ CRITICAL` : '';

          out += `${i + 1}. ${r.name}${critical}\n`;
          out += `   • Score: ${r.score}/100 (${r.complianceLevel})\n`;
          out += `   • Assignee: ${who}\n`;
          out += `   • Status: ${r.status || 'None'}\n`;
          out += `   • Due: ${r.due || 'Not set'}\n`;
          out += `   • Priority: ${r.priority ?? 'Not set'}\n`;
          out += `   • Issues: ${r.issues.join('; ')}\n`;
          out += `   • URL: ${r.url}\n\n`;
        });
    }

    // Rootments-specific correction methods
    const methods = [
      'TITLE: Use clear, descriptive titles that explain what needs to be done',
      'DESCRIPTION: Include context (what/why), clear acceptance criteria, and expected deliverables',
      'ASSIGNEE: Assign to ONE responsible person; use watchers for visibility only',
      'DUE DATE: Set realistic deadlines; break large tasks if needed with individual dates',
      'PRIORITY: Use Urgent (blocking), High (important), Normal (planned), Low (nice-to-have)',
      'OVERDUE: Update progress, renegotiate dates, or mark complete immediately',
    ].map(s => `• ${s}`).join('\n');

    out += `ROOTMENTS TASK CREATION STANDARDS:\n${methods}\n\n`;

    out += `Use this ChatGPT prompt for creating compliant tasks:\n`;
    out += `"I want you to act like a task creation assistant for Rootments tech team. Create clear, descriptive titles. Include context, acceptance criteria, assignee, due date, and priority suggestions."\n`;

    return out;
  }

  // ========================= DAILY NEW TASKS (IST) =========================
  _getTodayISTWindowMs() {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowUTC = Date.now();
    const nowIST = new Date(nowUTC + IST_OFFSET_MS);
    const startISTutc = Date.UTC(
      nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()
    ) - IST_OFFSET_MS;
    const endISTutc = startISTutc + 24 * 60 * 60 * 1000;
    return { startMs: startISTutc, endMs: endISTutc };
  }

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

  async buildNewTasksSummary(report) {
    const { total, passed, failed, passRate } = report.meta;
    const exMin = this.rules.excellentMin;

    const worstLines = [...report.nonCompliant]
      .sort((a, b) => a.score - b.score)
      .slice(0, 8)
      .map((r, i) => {
        const critical = r.criticalIssues.length > 0 ? ' ⚠️' : '';
        return `${i + 1}. ${r.name.slice(0, 45)} — ${r.issues.slice(0, 2).join(', ')}${critical}`;
      })
      .join('\n');

    let summary = [
      `*New Tasks Audit (Today, IST)*`,
      `Created: ${total} | Standards Met: ${passed} | Need Fix: ${failed} | Rate: ${passRate}%`,
      `Excellent (≥${exMin}%): ${report.results.filter(r => r.complianceLevel === 'excellent').length} | Poor (<${exMin}%): ${report.results.filter(r => r.complianceLevel === 'poor').length}`,
      failed ? `\n*Fix Before Moving Status:*\n${worstLines}` : '\nAll new tasks meet Rootments standards 🎉',
      `\nReminder: Use clear titles, add context, assignee, due date, and priority.`,
    ].join('\n');

    if (!(this.ai.enabled && this.ai.apiKey)) return summary;

    try {
      const improved = await this._openRouterSummarize(
        `Polish this new task audit for Rootments team WhatsApp. Keep <=6 lines, preserve numbers and reminder.\n\n${summary}`
      );
      return improved || summary;
    } catch {
      return summary;
    }
  }

  async auditTodayNewTasksAndNotify({ to = this.whatsapp.toDefault, dryRun = false, sendWhenZero = false } = {}) {
    const report = await this.auditNewTasksToday();
    const summary = await this.buildNewTasksSummary(report);

    if (!dryRun && to && (sendWhenZero || report.nonCompliant.length > 0)) {
      await this.sendWhatsAppText(to, summary);
      return { sent: true, summary, ...report };
    }
    return { sent: false, summary, ...report };
  }

  startDailyNewTaskAudit({ hourIST = 21, minuteIST = 0, to = this.whatsapp.toDefault } = {}) {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const now = Date.now();
    const nowIST = new Date(now + IST_OFFSET_MS);

    const targetIST = new Date(Date.UTC(
      nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate(), hourIST, minuteIST, 0, 0
    ));
    const firstRunUTC = targetIST.getTime() - IST_OFFSET_MS;
    let delay = firstRunUTC - now;
    if (delay < 0) delay += 24 * 60 * 60 * 1000;

    setTimeout(() => {
      this.auditTodayNewTasksAndNotify({ to }).catch(() => {});
      setInterval(() => {
        this.auditTodayNewTasksAndNotify({ to }).catch(() => {});
      }, 24 * 60 * 60 * 1000);
    }, delay);

    console.log(
      `[DailyNewTaskAudit] Scheduled daily at ${String(hourIST).padStart(2, '0')}:${String(minuteIST).padStart(2, '0')} IST. First run in ${Math.round(delay / 1000)}s`
    );
  }

  // ========================= MAIN METHODS =========================

  async analyzeAndSendReport({ dryRun = false, to = this.whatsapp.toDefault, exportCSV = true } = {}) {
    const report = await this.auditTeam();
    const summary = await this.buildSummary(report);

    // Export CSVs if requested
    let csvExports = null;
    if (exportCSV) {
      csvExports = await this.exportTasksToCSV(report);
    }

    if (!dryRun && to) {
      await this.sendWhatsAppText(to, summary);
    }

    return {
      summary,
      meta: report.meta,
      results: report.results,
      nonCompliant: report.nonCompliant,
      compliant: report.compliant,
      csvExports,
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

  // ========================= AI/OPENROUTER =========================

  async _openRouterSummarize(prompt) {
    const { data } = await axios.post(
      `${this.ai.baseURL}/chat/completions`,
      {
        model: this.ai.model,
        max_tokens: this.ai.maxTokens,
        messages: [
          { role: 'system', content: 'You are a concise operations advisor for tech teams.' },
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

  // ========================= UTILITY =========================

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
      rules: this.rules,
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
