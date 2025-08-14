


// // // test.js — audit ALL ClickUp tasks (all statuses, incl. closed) and use your AI to polish the summary
// // const path = require('path');
// // require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// // const ai = require('./services/aiAnalysisService');

// // const args = process.argv.slice(2);
// // const has = k => args.includes(`--${k}`) || args.includes(`-${k}`);
// // const val = (k, d = null) =>
// //   (args.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;

// // (async () => {
// //   try {
// //     console.log('🚀 Starting ClickUp task audit (ALL statuses)…');
// //     console.log('🔧 Env:', ai.envSummary());

// //     const dryRun = has('dry') || has('d');
// //     const to = val('to', process.env.TEAM_LEAD_NUMBER || null);

// //     const { summary, meta, results, sent } = await ai.analyzeAndSendReport({ dryRun, to });

// //     // Console output
// //     console.log('\n📊 Summary:', meta);
// //     const worst = [...results].filter(r => r.issues.length)
// //       .sort((a,b)=>a.score-b.score).slice(0, 12);
// //     if (worst.length) {
// //       console.log('\n❗ Worst offenders:');
// //       worst.forEach((r,i) =>
// //         console.log(`${i+1}. ${r.name} | score=${r.score} | issues=${r.issues.join('; ')}`)
// //       );
// //     } else {
// //       console.log('\n✅ No issues found.');
// //     }

// //     console.log('\n📝 WhatsApp text (AI-polished):\n' + summary);
// //     if (sent) console.log(`\n📨 WhatsApp summary sent to ${to}.`);
// //     if (dryRun) console.log('\n🧪 DRY RUN — not sending WhatsApp.');

// //     console.log('\n🎉 Done.');
// //     process.exit(0);
// //   } catch (err) {
// //     console.error('❌ Failed:', err?.response?.data || err);
// //     process.exit(1);
// //   }
// // })();


// // test.js — audits ALL tasks and prints FULL details + writes a CSV of non-compliant tasks
// const path = require('path');
// const fs = require('fs');
// require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// const ai = require('./services/aiAnalysisService');

// const args = process.argv.slice(2);
// const has = k => args.includes(`--${k}`) || args.includes(`-${k}`);
// const val = (k, d = null) =>
//   (args.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;

// (async () => {
//   try {
//     console.log('🚀 Auditing ALL ClickUp tasks (incl. closed)…');
//     console.log('🔧 Env:', ai.envSummary());

//     const dryRun = has('dry') || has('d');
//     const to = val('to', process.env.TEAM_LEAD_NUMBER || null);

//     const { summary, meta, results, nonCompliant, sent } = await ai.analyzeAndSendReport({ dryRun, to });

//     // ---- Console: full details of non-compliant tasks ----
//     if (nonCompliant.length) {
//       console.log(`\n❗ Non-compliant tasks (${nonCompliant.length}):`);
//       nonCompliant
//         .sort((a, b) => a.score - b.score)
//         .forEach((r, i) => {
//           console.log(
//             [
//               `${i + 1}. ${r.name}`,
//               `   - URL: ${r.url}`,
//               `   - Status: ${r.status || '-'}`,
//               `   - Assignees: ${r.assignees.length ? r.assignees.join(', ') : 'Unassigned'}`,
//               `   - Due: ${r.due || '-'}`,
//               `   - Priority: ${r.priority ?? '-'}`,
//               `   - Missing: ${r.missingFields.length ? r.missingFields.join(', ') : '—'}`,
//               `   - Overdue: ${r.overdue ? 'Yes' : 'No'}`,
//               `   - Issues: ${r.issues.join('; ')}`,
//               `   - Score: ${r.score}`,
//             ].join('\n')
//           );
//         });
//     } else {
//       console.log('\n✅ All tasks meet the basic standards.');
//     }

//     // ---- Save CSV with full details of non-compliant tasks ----
//     if (nonCompliant.length) {
//       const dir = path.resolve(__dirname, 'reports');
//       fs.mkdirSync(dir, { recursive: true });
//       const ts = new Date().toISOString().replace(/[:.]/g, '-');
//       const file = path.join(dir, `clickup_noncompliance_${ts}.csv`);
//       const rows = [
//         [
//           'TaskID','TaskName','TaskURL','ListID','ListName','Status',
//           'Assignees','DueDate','Priority','Score',
//           'MissingFields','Overdue','Issues'
//         ].join(',')
//       ];

//       nonCompliant.forEach(r => {
//         const csv = [
//           r.id,
//           quote(r.name),
//           r.url,
//           r.listId || '',
//           quote(r.listName || ''),
//           quote(r.status || ''),
//           quote(r.assignees.join(' | ') || 'Unassigned'),
//           r.due || '',
//           r.priority ?? '',
//           r.score,
//           quote(r.missingFields.join(' | ')),
//           r.overdue ? 'Yes' : 'No',
//           quote(r.issues.join(' | ')),
//         ].join(',');
//         rows.push(csv);
//       });

//       fs.writeFileSync(file, rows.join('\n'), 'utf8');
//       console.log(`\n💾 CSV saved: ${file}`);
//     }

//     // ---- WhatsApp summary + show the exact text ----
//     console.log('\n📝 WhatsApp summary:\n' + summary);
//     if (sent) console.log(`\n📨 WhatsApp summary sent to ${to}.`);
//     if (dryRun) console.log('\n🧪 DRY RUN — not sending WhatsApp.');

//     console.log('\n📊 Summary:', meta);
//     console.log('\n🎉 Done.');
//     process.exit(0);
//   } catch (err) {
//     console.error('❌ Failed:', err?.response?.data || err);
//     process.exit(1);
//   }
// })();

// function quote(s) {
//   const v = String(s ?? '');
//   return `"${v.replace(/"/g, '""')}"`;
// }


// const { sendDocumentFromPath, sendWhatsAppMessage } = require('./services/whatsappService');

// // … after you create `file`:
// const defaultTo = (() => {
//   const owners = (process.env.OWNER_NUMBERS || '')
//     .split(',')
//     .map(s => s.trim())
//     .filter(Boolean);
//   return process.env.TEAM_LEAD_NUMBER || owners[0] || process.env.OWNER_NUMBER;
// })();

// try {
//   await sendDocumentFromPath(defaultTo, file, 'ClickUp noncompliance report');
//   console.log(`📨 WhatsApp CSV sent to ${defaultTo}`);
// } catch (e) {
//   console.error('❌ Failed to send CSV via WhatsApp:', e?.response?.data || e.message);
// }

// // (optional) also send the summary text:
// try {
//   await sendWhatsAppMessage(defaultTo, summary);
//   console.log(`📝 WhatsApp summary sent to ${defaultTo}`);
// } catch (e) {
//   console.error('❌ Failed to send summary text:', e?.response?.data || e.message);
// }



// const path = require('path');
// const fs = require('fs');
// require('dotenv').config({ path: path.resolve(__dirname, '.env') });
// const XLSX = require('xlsx');


// const ai = require('./services/aiAnalysisService');
// const { sendDocumentFromPath, sendWhatsAppMessage } = require('./services/whatsappService');

// const args = process.argv.slice(2);
// const has = k => args.includes(`--${k}`) || args.includes(`-${k}`);
// const val = (k, d = null) =>
//   (args.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;

// function quote(s) {
//   const v = String(s ?? '');
//   return `"${v.replace(/"/g, '""')}"`;
// }

// (async () => {
//   try {
//     console.log('🚀 Auditing ALL ClickUp tasks (incl. closed)…');
//     console.log('🔧 Env:', ai.envSummary());

//     const dryRun = has('dry') || has('d');
//     const toFlag = val('to', null);

//     const { summary, meta, results, nonCompliant, sent } =
//       await ai.analyzeAndSendReport({ dryRun, to: toFlag || process.env.TEAM_LEAD_NUMBER });

//     // ---- Console: full details of non-compliant tasks ----
//     if (nonCompliant.length) {
//       console.log(`\n❗ Non-compliant tasks (${nonCompliant.length}):`);
//       nonCompliant
//         .sort((a, b) => a.score - b.score)
//         .forEach((r, i) => {
//           console.log(
//             [
//               `${i + 1}. ${r.name}`,
//               `   - URL: ${r.url}`,
//               `   - Status: ${r.status || '-'}`,
//               `   - Assignees: ${r.assignees.length ? r.assignees.join(', ') : 'Unassigned'}`,
//               `   - Due: ${r.due || '-'}`,
//               `   - Priority: ${r.priority ?? '-'}`,
//               `   - Missing: ${r.missingFields.length ? r.missingFields.join(', ') : '—'}`,
//               `   - Overdue: ${r.overdue ? 'Yes' : 'No'}`,
//               `   - Issues: ${r.issues.join('; ')}`,
//               `   - Score: ${r.score}`,
//             ].join('\n')
//           );
//         });
//     } else {
//       console.log('\n✅ All tasks meet the basic standards.');
//     }

//     // ---- Save CSV with full details of non-compliant tasks ----
//     let file = null;
//     if (nonCompliant.length) {
//       const dir = path.resolve(__dirname, 'reports');
//       fs.mkdirSync(dir, { recursive: true });
//       const ts = new Date().toISOString().replace(/[:.]/g, '-');
//       file = path.join(dir, `clickup_noncompliance_${ts}.csv`);
//       const rows = [
//         [
//           'TaskID','TaskName','TaskURL','ListID','ListName','Status',
//           'Assignees','DueDate','Priority','Score',
//           'MissingFields','Overdue','Issues'
//         ].join(',')
//       ];

//       nonCompliant.forEach(r => {
//         const csv = [
//           r.id,
//           quote(r.name),
//           r.url,
//           r.listId || '',
//           quote(r.listName || ''),
//           quote(r.status || ''),
//           quote(r.assignees.join(' | ') || 'Unassigned'),
//           r.due || '',
//           r.priority ?? '',
//           r.score,
//           quote(r.missingFields.join(' | ')),
//           r.overdue ? 'Yes' : 'No',
//           quote(r.issues.join(' | ')),
//         ].join(',');
//         rows.push(csv);
//       });

//       fs.writeFileSync(file, rows.join('\n'), 'utf8');
//       console.log(`\n💾 CSV saved: ${file}`);
//     }

//     // ---- WhatsApp: auto-send to owner/lead ----
//     const owners = (process.env.OWNER_NUMBERS || '')
//       .split(',')
//       .map(s => s.trim())
//       .filter(Boolean);
//     const defaultTo = toFlag || process.env.TEAM_LEAD_NUMBER || owners[0] || process.env.OWNER_NUMBER;

//     if (!dryRun && defaultTo) {
//       // 1) send summary text
//       try {
//         await sendWhatsAppMessage(defaultTo, summary);
//         console.log(`📝 WhatsApp summary sent to ${defaultTo}`);
//       } catch (e) {
//         console.error('❌ Failed to send summary text:', e?.response?.data || e.message);
//       }

//       // 2) send CSV document if created
//       if (file) {
//         try {
//           await sendDocumentFromPath(defaultTo, file, 'ClickUp noncompliance report');
//           console.log(`📨 WhatsApp CSV sent to ${defaultTo}`);
//         } catch (e) {
//           console.error('❌ Failed to send CSV via WhatsApp:', e?.response?.data || e.message);
//         }
//       }
//     } else if (dryRun) {
//       console.log('\n🧪 DRY RUN — not sending any WhatsApp messages.');
//     }

//     // ---- Wrap up ----
//     console.log('\n📝 WhatsApp summary preview:\n' + summary);
//     console.log('\n📊 Summary:', meta);
//     console.log('\n🎉 Done.');
//     process.exit(0);
//   } catch (err) {
//     console.error('❌ Failed:', err?.response?.data || err);
//     process.exit(1);
//   }
// })();



const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const XLSX = require('xlsx');

// ✅ Import with error handling and verification
let aiAnalysisService;
try {
  aiAnalysisService = require('./services/aiAnalysisService');
  
  // ✅ Verify the methods exist
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
    
    // ✅ This should now work - calling envSummary on the service instance
    console.log('🔧 Env:', aiAnalysisService.envSummary());

    const dryRun = has('dry') || has('d');
    const toFlag = val('to', null);

    // ✅ Call analyzeAndSendReport on the correct service instance
    const { summary, meta, results, nonCompliant, compliant, sent } =
      await aiAnalysisService.analyzeAndSendReport({ 
        dryRun, 
        to: toFlag || process.env.TEAM_LEAD_NUMBER 
      });

    // ---- Console: full details of compliant tasks ----
    if (compliant && compliant.length) {
      console.log(`\n✅ Compliant tasks (${compliant.length}) - Meeting all standards:`);
      compliant
        .sort((a, b) => b.score - a.score) // Sort by highest score first
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
          console.log(''); // Add spacing
        });
    }

    // ---- Console: full details of non-compliant tasks ----
    if (nonCompliant.length) {
      console.log(`\n❗ Non-compliant tasks (${nonCompliant.length}) - Need improvement:`);
      nonCompliant
        .sort((a, b) => a.score - b.score) // Sort by lowest score first
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
          console.log(''); // Add spacing
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
      
      // Prepare data for Excel
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

      // Create workbook
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
      // 1) send summary text
      try {
        await sendWhatsAppMessage(defaultTo, summary);
        console.log(`📝 WhatsApp summary sent to ${defaultTo}`);
      } catch (e) {
        console.error('❌ Failed to send summary text:', e?.response?.data || e.message);
      }

      // 2) send CSV document if created
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

    // ---- Final Summary ----
    console.log('\n' + '='.repeat(60));
    console.log('📊 AUDIT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tasks: ${meta.total}`);
    console.log(`✅ Compliant: ${meta.passed} (${meta.passRate}%)`);
    console.log(`❌ Non-compliant: ${meta.failed}`);
    
    if (meta.complianceBreakdown) {
      console.log('\nCompliance Breakdown:');
      console.log(`🟢 Excellent (90-100%): ${meta.complianceBreakdown.excellent}`);
      console.log(`🔵 Good (75-89%): ${meta.complianceBreakdown.good}`);
      console.log(`🟡 Needs Improvement (50-74%): ${meta.complianceBreakdown.needs_improvement}`);
      console.log(`🔴 Poor (<50%): ${meta.complianceBreakdown.poor}`);
    }

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
