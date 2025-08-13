


// // test.js — audit ALL ClickUp tasks (all statuses, incl. closed) and use your AI to polish the summary
// const path = require('path');
// require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// const ai = require('./services/aiAnalysisService');

// const args = process.argv.slice(2);
// const has = k => args.includes(`--${k}`) || args.includes(`-${k}`);
// const val = (k, d = null) =>
//   (args.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;

// (async () => {
//   try {
//     console.log('🚀 Starting ClickUp task audit (ALL statuses)…');
//     console.log('🔧 Env:', ai.envSummary());

//     const dryRun = has('dry') || has('d');
//     const to = val('to', process.env.TEAM_LEAD_NUMBER || null);

//     const { summary, meta, results, sent } = await ai.analyzeAndSendReport({ dryRun, to });

//     // Console output
//     console.log('\n📊 Summary:', meta);
//     const worst = [...results].filter(r => r.issues.length)
//       .sort((a,b)=>a.score-b.score).slice(0, 12);
//     if (worst.length) {
//       console.log('\n❗ Worst offenders:');
//       worst.forEach((r,i) =>
//         console.log(`${i+1}. ${r.name} | score=${r.score} | issues=${r.issues.join('; ')}`)
//       );
//     } else {
//       console.log('\n✅ No issues found.');
//     }

//     console.log('\n📝 WhatsApp text (AI-polished):\n' + summary);
//     if (sent) console.log(`\n📨 WhatsApp summary sent to ${to}.`);
//     if (dryRun) console.log('\n🧪 DRY RUN — not sending WhatsApp.');

//     console.log('\n🎉 Done.');
//     process.exit(0);
//   } catch (err) {
//     console.error('❌ Failed:', err?.response?.data || err);
//     process.exit(1);
//   }
// })();


// test.js — audits ALL tasks and prints FULL details + writes a CSV of non-compliant tasks
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const ai = require('./services/aiAnalysisService');

const args = process.argv.slice(2);
const has = k => args.includes(`--${k}`) || args.includes(`-${k}`);
const val = (k, d = null) =>
  (args.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;

(async () => {
  try {
    console.log('🚀 Auditing ALL ClickUp tasks (incl. closed)…');
    console.log('🔧 Env:', ai.envSummary());

    const dryRun = has('dry') || has('d');
    const to = val('to', process.env.TEAM_LEAD_NUMBER || null);

    const { summary, meta, results, nonCompliant, sent } = await ai.analyzeAndSendReport({ dryRun, to });

    // ---- Console: full details of non-compliant tasks ----
    if (nonCompliant.length) {
      console.log(`\n❗ Non-compliant tasks (${nonCompliant.length}):`);
      nonCompliant
        .sort((a, b) => a.score - b.score)
        .forEach((r, i) => {
          console.log(
            [
              `${i + 1}. ${r.name}`,
              `   - URL: ${r.url}`,
              `   - Status: ${r.status || '-'}`,
              `   - Assignees: ${r.assignees.length ? r.assignees.join(', ') : 'Unassigned'}`,
              `   - Due: ${r.due || '-'}`,
              `   - Priority: ${r.priority ?? '-'}`,
              `   - Missing: ${r.missingFields.length ? r.missingFields.join(', ') : '—'}`,
              `   - Overdue: ${r.overdue ? 'Yes' : 'No'}`,
              `   - Issues: ${r.issues.join('; ')}`,
              `   - Score: ${r.score}`,
            ].join('\n')
          );
        });
    } else {
      console.log('\n✅ All tasks meet the basic standards.');
    }

    // ---- Save CSV with full details of non-compliant tasks ----
    if (nonCompliant.length) {
      const dir = path.resolve(__dirname, 'reports');
      fs.mkdirSync(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(dir, `clickup_noncompliance_${ts}.csv`);
      const rows = [
        [
          'TaskID','TaskName','TaskURL','ListID','ListName','Status',
          'Assignees','DueDate','Priority','Score',
          'MissingFields','Overdue','Issues'
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
          quote(r.missingFields.join(' | ')),
          r.overdue ? 'Yes' : 'No',
          quote(r.issues.join(' | ')),
        ].join(',');
        rows.push(csv);
      });

      fs.writeFileSync(file, rows.join('\n'), 'utf8');
      console.log(`\n💾 CSV saved: ${file}`);
    }

    // ---- WhatsApp summary + show the exact text ----
    console.log('\n📝 WhatsApp summary:\n' + summary);
    if (sent) console.log(`\n📨 WhatsApp summary sent to ${to}.`);
    if (dryRun) console.log('\n🧪 DRY RUN — not sending WhatsApp.');

    console.log('\n📊 Summary:', meta);
    console.log('\n🎉 Done.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed:', err?.response?.data || err);
    process.exit(1);
  }
})();

function quote(s) {
  const v = String(s ?? '');
  return `"${v.replace(/"/g, '""')}"`;
}
