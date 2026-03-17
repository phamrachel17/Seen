const PROD_ID = 'hsuydsuebluhycdeqghv';
const DEV_ID = 'snrzwaqdhkqsnuwphxnz';
const TOKEN = 'sbp_b5ab089e3a91fad6f8558a4d3b433ac738751fca';
const API = 'https://api.supabase.com/v1/projects';
const BATCH_SIZE = 20;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dbQuery(projectId, query, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${API}/${projectId}/database/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (res.status === 429) {
      const wait = Math.pow(2, attempt + 1) * 2000;
      console.log(`    Rate limited, waiting ${wait/1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DB query failed (${res.status}): ${text}\nQuery snippet: ${query.substring(0, 300)}`);
    }
    return res.json();
  }
  throw new Error('Max retries exceeded due to rate limiting');
}

async function getColumns(table) {
  const rows = await dbQuery(PROD_ID,
    `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' ORDER BY ordinal_position`
  );
  return rows;
}

async function getData(table) {
  const rows = await dbQuery(PROD_ID, `SELECT json_agg(t) as data FROM public."${table}" t`);
  if (!rows || !rows[0] || !rows[0].data) return [];
  return rows[0].data;
}

function formatValue(val, colInfo) {
  if (val === null || val === undefined) return 'NULL';
  
  const { data_type, udt_name } = colInfo;
  
  // Arrays - detect the element type from udt_name
  if (data_type === 'ARRAY') {
    if (Array.isArray(val)) {
      if (val.length === 0) {
        // Determine correct cast type
        if (udt_name === '_uuid') return "'{}'::uuid[]";
        if (udt_name === '_int4') return "'{}'::int[]";
        if (udt_name === '_int8') return "'{}'::bigint[]";
        return "'{}'::text[]";
      }
      const elements = val.map(v => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
      if (udt_name === '_uuid') return `'{${elements}}'::uuid[]`;
      if (udt_name === '_int4') return `'{${elements}}'::int[]`;
      if (udt_name === '_int8') return `'{${elements}}'::bigint[]`;
      return `'{${elements}}'::text[]`;
    }
    return `'${String(val).replace(/'/g, "''")}'`;
  }
  
  // JSONB / JSON
  if (data_type === 'jsonb' || data_type === 'json') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  
  // Booleans
  if (data_type === 'boolean') {
    return val ? 'TRUE' : 'FALSE';
  }
  
  // Numbers
  if (['integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision'].includes(data_type)) {
    return String(val);
  }
  
  // UUID, text, timestamps, etc
  const strVal = String(val).replace(/'/g, "''");
  return `'${strVal}'`;
}

async function migrateTable(table) {
  console.log(`\n--- Migrating: ${table} ---`);
  
  const columns = await getColumns(table);
  const colNames = columns.map(c => c.column_name);
  const colMap = {};
  columns.forEach(c => { colMap[c.column_name] = c; });
  console.log(`  Columns (${colNames.length}): ${colNames.join(', ')}`);
  console.log(`  Array columns: ${columns.filter(c => c.data_type === 'ARRAY').map(c => `${c.column_name}(${c.udt_name})`).join(', ') || 'none'}`);
  
  await sleep(500);
  const data = await getData(table);
  console.log(`  Rows fetched: ${data.length}`);
  if (data.length === 0) return;
  
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const valueRows = batch.map(row => {
      const vals = colNames.map(col => formatValue(row[col], colMap[col]));
      return `(${vals.join(', ')})`;
    });
    
    const quotedCols = colNames.map(c => `"${c}"`).join(', ');
    const sql = `INSERT INTO public."${table}" (${quotedCols}) VALUES ${valueRows.join(',\n')} ON CONFLICT DO NOTHING;`;
    
    try {
      await dbQuery(DEV_ID, sql);
      console.log(`  Inserted batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(data.length/BATCH_SIZE)} (rows ${i+1}-${Math.min(i+BATCH_SIZE, data.length)})`);
    } catch (err) {
      console.error(`  ERROR on batch ${Math.floor(i/BATCH_SIZE)+1}: ${err.message.substring(0, 200)}`);
      // Row by row fallback
      console.log(`  Retrying row-by-row...`);
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const vals = colNames.map(col => formatValue(row[col], colMap[col]));
        const singleSql = `INSERT INTO public."${table}" (${quotedCols}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;`;
        try {
          await dbQuery(DEV_ID, singleSql);
        } catch (rowErr) {
          console.error(`  Row ${i+j+1} failed: ${rowErr.message.substring(0, 200)}`);
        }
        await sleep(300);
      }
    }
    // Delay between batches to avoid rate limiting
    await sleep(1500);
  }
}

async function main() {
  console.log('=== Supabase Migration v2 (failed tables retry) ===\n');
  
  // These are the tables that failed or had partial failures
  const tables = [
    'activity_log',
    'likes',
  ];
  
  for (const table of tables) {
    try {
      await migrateTable(table);
    } catch (err) {
      console.error(`FAILED on table ${table}: ${err.message}`);
    }
  }
  
  console.log('\n=== Migration v2 complete ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
