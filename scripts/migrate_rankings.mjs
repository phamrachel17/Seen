const PROD_ID = 'hsuydsuebluhycdeqghv';
const DEV_ID = 'snrzwaqdhkqsnuwphxnz';
const TOKEN = 'sbp_b5ab089e3a91fad6f8558a4d3b433ac738751fca';
const API = 'https://api.supabase.com/v1/projects';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dbQuery(projectId, query, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await sleep(Math.pow(2, attempt) * 3000);
    const res = await fetch(`${API}/${projectId}/database/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (res.status === 429) {
      const wait = Math.pow(2, attempt + 1) * 3000;
      console.log(`    Rate limited, waiting ${wait/1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DB query failed (${res.status}): ${text}`);
    }
    return res.json();
  }
  throw new Error('Max retries exceeded');
}

function formatValue(val, colInfo) {
  if (val === null || val === undefined) return 'NULL';
  const { data_type, udt_name } = colInfo;
  if (data_type === 'ARRAY') {
    if (Array.isArray(val)) {
      if (val.length === 0) {
        if (udt_name === '_uuid') return "'{}'::uuid[]";
        if (udt_name === '_int4') return "'{}'::int[]";
        return "'{}'::text[]";
      }
      const elements = val.map(v => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
      if (udt_name === '_uuid') return `'{${elements}}'::uuid[]`;
      if (udt_name === '_int4') return `'{${elements}}'::int[]`;
      return `'{${elements}}'::text[]`;
    }
    return `'${String(val).replace(/'/g, "''")}'`;
  }
  if (data_type === 'jsonb' || data_type === 'json') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  if (data_type === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (['integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision'].includes(data_type)) {
    return String(val);
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function migrateTable(table, pkCol = 'id') {
  console.log(`\n--- Migrating: ${table} ---`);

  const columns = await dbQuery(PROD_ID,
    `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' ORDER BY ordinal_position`
  );
  const colNames = columns.map(c => c.column_name);
  const colMap = {};
  columns.forEach(c => { colMap[c.column_name] = c; });
  console.log(`  Columns: ${colNames.join(', ')}`);

  await sleep(1000);
  const rows = await dbQuery(PROD_ID, `SELECT json_agg(t) as data FROM public."${table}" t`);
  const data = (rows && rows[0] && rows[0].data) ? rows[0].data : [];
  console.log(`  Rows fetched: ${data.length}`);
  if (data.length === 0) return;

  const quotedCols = colNames.map(c => `"${c}"`).join(', ');
  let inserted = 0, skipped = 0, failed = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const vals = colNames.map(col => formatValue(row[col], colMap[col]));
    const pkVal = formatValue(row[pkCol], colMap[pkCol]);
    // Use WHERE NOT EXISTS to avoid issues with DEFERRABLE unique constraints
    const sql = `INSERT INTO public."${table}" (${quotedCols}) SELECT ${vals.join(', ')} WHERE NOT EXISTS (SELECT 1 FROM public."${table}" WHERE "${pkCol}" = ${pkVal});`;
    try {
      await dbQuery(DEV_ID, sql);
      inserted++;
      if (inserted % 20 === 0) console.log(`  Progress: ${i + 1}/${data.length}`);
    } catch (err) {
      if (err.message.includes('foreign key') || err.message.includes('violates foreign key')) {
        skipped++;
      } else {
        failed++;
        console.error(`  Row ${i + 1} failed: ${err.message.substring(0, 120)}`);
      }
    }
    await sleep(600);
  }

  console.log(`  Done: ${inserted} inserted, ${skipped} skipped (FK), ${failed} failed`);
}

async function main() {
  console.log('=== Migrate rankings + activity_log to dev ===\n');
  for (const table of ['rankings']) {
    try {
      await migrateTable(table);
    } catch (err) {
      console.error(`FAILED on ${table}: ${err.message}`);
    }
  }
  console.log('\n=== Done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
