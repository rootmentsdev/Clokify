/**
 * clockify-cron.js
 *
 * Runs the ClickUp audit (CSV/XLSX + optional WhatsApp) and sends the
 * "today-only task creation quality" email by default.
 *
 * Flags:
 *   --noemail                  Skip sending the email
 *   --emailto=<addr>           Override recipient (useful for testing)
 *   --savehtml                 Save HTML email preview under ./reports
 *   --to=<waNumber>            Override WhatsApp number for the audit summary
 *   --dry / -d                 Don't send WhatsApp, just generate files
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const XLSX = require('xlsx');

// ✅ Import with error handling and verification
let aiAnalysisService;
try {
  aiAnalysisService = require('./services/aiAnalysisService');

  if (typeof aiAnalysisService.envSummary !== 'function') {
    throw new Error('envSummary method not found on aiAnalysisService');
  }
  if (typeof aiAnalysisService.analyzeAndSendReport !== 'function') {
    throw new Error('analyzeAndSendReport method not found on aiAnalysisService');
  }

  console.log('✅ Service imported successfully');
} catch (error) {
  console.error('❌ Failed to import aiAnalysisService:', error.message);
  console.error('Make sure your aiAnalysisService.js ends with: module.exports = new AIAnalysisService();');
  process.exit(1);
}

const { sendDocumentFromPath, sendWhatsAppMessage } = require('./services/whatsappService');

const args = process.argv.slice(2);
const has = k => args.includes(`--${k}`) || args.includes(`-${k}`);
const val = (k, d = null) =>
  (args.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;

function quote(s) {
  const v = String(s ?? '');
  return `"${v.replace(/"/g, '""')}"`;
}

(async () => {
  try {
    console.log('🚀 Auditing ALL ClickUp tasks (incl. closed)…');

    // ✅ Env summary
    console.log('🔧 Env:', aiAnalysisService.envSummary());

    const dryRun = has('dry') || has('d');
    const toFlag = val('to', null);

    // ✅ Full audit (existing behavior)
    const { summary, meta, results, nonCompliant, compliant, sent } =
      await aiAnalysisService.analyzeAndSendReport({
        dryRun,
        to: toFlag || process.env.TEAM_LEAD_NUMBER
      });

    // ---- Console: full details of compliant tasks ----
    if (compliant && compliant.length) {
      console.log(`\n✅ Compliant tasks (${compliant.length}) - Meeting all standards:`);
      compliant
        .sort((a, b) => b.score - a.score)
        .forEach((r, i) => {
          console.log(
            [
              `${i + 1}. ${r.name}`,
              ` - URL: ${r.url}`,
              ` - Status: ${r.status || '-'}`,
              ` - Assignees: ${r.assignees.length ? r.assignees.join(', ') : 'Unassigned'}`,
              ` - Due: ${r.due || '-'}`,
              ` - Priority: ${r.priority ?? '-'}`,
              ` - Score: ${r.score}/100 (${r.complianceLevel})`,
              ` - List: ${r.listName || 'Unknown'}`,
            ].join('\n')
          );
          console.log('');
        });
    }

    // ---- Console: full details of non-compliant tasks ----
    if (nonCompliant.length) {
      console.log(`\n❗ Non-compliant tasks (${nonCompliant.length}) - Need improvement:`);
      nonCompliant
        .sort((a, b) => a.score - b.score)
        .forEach((r, i) => {
          const critical = r.criticalIssues && r.criticalIssues.length > 0 ? ' ⚠️ CRITICAL' : '';
          console.log(
            [
              `${i + 1}. ${r.name}${critical}`,
              ` - URL: ${r.url}`,
              ` - Status: ${r.status || '-'}`,
              ` - Assignees: ${r.assignees.length ? r.assignees.join(', ') : 'Unassigned'}`,
              ` - Due: ${r.due || '-'}`,
              ` - Priority: ${r.priority ?? '-'}`,
              ` - Missing: ${r.missingFields.length ? r.missingFields.join(', ') : '—'}`,
              ` - Overdue: ${r.overdue ? 'Yes' : 'No'}`,
              ` - Issues: ${r.issues.join('; ')}`,
              ` - Score: ${r.score}/100 (${r.complianceLevel})`,
              ` - List: ${r.listName || 'Unknown'}`,
            ].join('\n')
          );
          console.log('');
        });
    } else {
      console.log('\n✅ All tasks meet the basic standards - Great job! 🎉');
    }

    // ---- Save CSV with full details of non-compliant tasks ----
    let file = null;
    if (nonCompliant.length) {
      const dir = path.resolve(__dirname, 'reports');
      fs.mkdirSync(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      file = path.join(dir, `clickup_noncompliance_${ts}.csv`);

      const rows = [
        [
          'TaskID','TaskName','TaskURL','ListID','ListName','Status',
          'Assignees','DueDate','Priority','Score','ComplianceLevel',
          'MissingFields','Overdue','Issues','CriticalIssues'
        ].join(',')
      ];

      nonCompliant.forEach(r => {
        const csv = [
          r.id,
          quote(r.name),
          r.url,
          r.listId || '',
          quote(r.listName || ''),
          quote(r.status || ''),
          quote(r.assignees.join(' | ') || 'Unassigned'),
          r.due || '',
          r.priority ?? '',
          r.score,
          r.complianceLevel || '',
          quote(r.missingFields.join(' | ')),
          r.overdue ? 'Yes' : 'No',
          quote(r.issues.join(' | ')),
          quote((r.criticalIssues || []).join(' | ')),
        ].join(',');
        rows.push(csv);
      });

      fs.writeFileSync(file, rows.join('\n'), 'utf8');
      console.log(`\n💾 CSV report saved: ${file}`);
    }

    // ---- Save Excel with both compliant and non-compliant tasks ----
    if (results && results.length) {
      const dir = path.resolve(__dirname, 'reports');
      fs.mkdirSync(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const excelFile = path.join(dir, `clickup_full_audit_${ts}.xlsx`);

      const excelData = results.map(r => ({
        TaskID: r.id,
        TaskName: r.name,
        TaskURL: r.url,
        ListName: r.listName || '',
        Status: r.status || '',
        Assignees: r.assignees.join(', ') || 'Unassigned',
        DueDate: r.due || '',
        Priority: r.priority ?? '',
        Score: r.score,
        ComplianceLevel: r.complianceLevel || '',
        IsCompliant: r.issues.length === 0 ? 'YES' : 'NO',
        Issues: r.issues.join('; '),
        CriticalIssues: (r.criticalIssues || []).join('; '),
        MissingFields: r.missingFields.join(', '),
        Overdue: r.overdue ? 'Yes' : 'No',
        DateCreated: r.date_created ? new Date(r.date_created).toISOString().split('T')[0] : ''
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(wb, ws, 'Task Audit Results');
      XLSX.writeFile(wb, excelFile);

      console.log(`📊 Excel report saved: ${excelFile}`);
    }

    // ---- WhatsApp: auto-send to owner/lead ----
    const owners = (process.env.OWNER_NUMBERS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const defaultTo = toFlag || process.env.TEAM_LEAD_NUMBER || owners[0] || process.env.OWNER_NUMBER;

    if (!dryRun && defaultTo) {
      try {
        await sendWhatsAppMessage(defaultTo, summary);
        console.log(`📝 WhatsApp summary sent to ${defaultTo}`);
      } catch (e) {
        console.error('❌ Failed to send summary text:', e?.response?.data || e.message);
      }

      if (file) {
        try {
          await sendDocumentFromPath(defaultTo, file, 'ClickUp noncompliance report');
          console.log(`📨 WhatsApp CSV sent to ${defaultTo}`);
        } catch (e) {
          console.error('❌ Failed to send CSV via WhatsApp:', e?.response?.data || e.message);
        }
      }
    } else if (dryRun) {
      console.log('\n🧪 DRY RUN — not sending any WhatsApp messages.');
    }

    // ==== EMAIL: send by default (today-only creation quality) ====
    const skipEmail = has('noemail');                 // --noemail to skip
    const emailToOverride = val('emailto', null);     // --emailto=you@domain.com
    const saveHtml = has('savehtml');                 // --savehtml (optional)

    if (!skipEmail) {
      console.log('\n📧 Building today’s creation quality email (IST)…');
      const { html, text } = await aiAnalysisService.buildCreationEmail();

      if (saveHtml) {
        const dir = path.resolve(__dirname, 'reports');
        fs.mkdirSync(dir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const htmlFile = path.join(dir, `daily_creation_email_${ts}.html`);
        fs.writeFileSync(htmlFile, html, 'utf8');
        console.log(`🖼️ HTML preview saved: ${htmlFile}`);
      }

      try {
        if (emailToOverride) {
          await aiAnalysisService._sendEmail({
            to: emailToOverride,
            subject: 'Daily Task Creation Quality (Today, IST)',
            html,
            text,
          });
          console.log(`✅ Email sent to ${emailToOverride}`);
        } else {
          await aiAnalysisService.sendTodayCreationEmail();
          console.log('✅ Email sent to ADMIN_EMAIL from .env');
        }
      } catch (e) {
        console.error('❌ Failed to send email:', e?.response?.data || e.message);
        console.error('   Make sure EMAIL_ENABLED, EMAIL_USER, EMAIL_PASS, ADMIN_EMAIL are set.');
      }
    } else {
      console.log('\nℹ️ Email sending skipped because --noemail flag was provided.');
    }

    // ---- Final Summary ----
    console.log('\n' + '='.repeat(60));
    console.log('📊 AUDIT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tasks: ${meta.total}`);
    console.log(`✅ Compliant: ${meta.passed} (${meta.passRate}%)`);
    console.log(`❌ Non-compliant: ${meta.failed}`);

    const cb = meta.complianceBreakdown || {};
    console.log('\nCompliance Breakdown:');
    console.log(`🟢 Excellent (90-100%): ${cb.excellent ?? 0}`);
    console.log(`🔵 Good (75-89%): ${cb.good ?? 0}`);
    console.log(`🟡 Needs Improvement (50-74%): ${cb.needsImprovement ?? cb.needs_improvement ?? 0}`);
    console.log(`🔴 Poor (<50%): ${cb.poor ?? 0}`);

    console.log('\n📝 WhatsApp Summary Preview:');
    console.log('-'.repeat(40));
    console.log(summary);
    console.log('-'.repeat(40));

    console.log('\n🎉 Audit completed successfully!');
    console.log(`📧 WhatsApp sent: ${sent ? 'Yes' : 'No (dry run or no recipient)'}`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Failed:', err?.response?.data || err);
    console.error('Full error:', err);
    process.exit(1);
  }
})();
