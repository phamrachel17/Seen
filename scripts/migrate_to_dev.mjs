const PROD_ID = 'hsuydsuebluhycdeqghv';
const DEV_ID = 'snrzwaqdhkqsnuwphxnz';
const TOKEN = 'sbp_b5ab089e3a91fad6f8558a4d3b433ac738751fca';
const API = 'https://api.supabase.com/v1/projects';
const BATCH_SIZE = 20;

async function dbQuery(projectId, query) {
  const res = await fetch(`${API}/${projectId}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB query failed (${res.status}): ${text}\nQuery: ${query.substring(0, 200)}`);
  }
  return res.json();
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
  
  // Arrays
  if (data_type === 'ARRAY' || udt_name === '_text' || udt_name === '_varchar' || udt_name === '_int4' || udt_name === '_int8' || udt_name === '_float8') {
    if (Array.isArray(val)) {
      if (val.length === 0) return "'{}'::text[]";
      const elements = val.map(v => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
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
  
  // UUID, text, timestamps, etc - quote as string
  const strVal = String(val).replace(/'/g, "''");
  return `'${strVal}'`;
}

async function migrateTable(table) {
  console.log(`\n--- Migrating: ${table} ---`);
  
  // Get columns
  const columns = await getColumns(table);
  const colNames = columns.map(c => c.column_name);
  const colMap = {};
  columns.forEach(c => { colMap[c.column_name] = c; });
  console.log(`  Columns (${colNames.length}): ${colNames.join(', ')}`);
  
  // Get data
  const data = await getData(table);
  console.log(`  Rows fetched: ${data.length}`);
  if (data.length === 0) return;
  
  // Insert in batches
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
      console.error(`  ERROR on batch ${Math.floor(i/BATCH_SIZE)+1}: ${err.message}`);
      // Try row by row for this batch
      console.log(`  Retrying row-by-row...`);
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const vals = colNames.map(col => formatValue(row[col], colMap[col]));
        const singleSql = `INSERT INTO public."${table}" (${quotedCols}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;`;
        try {
          await dbQuery(DEV_ID, singleSql);
        } catch (rowErr) {
          console.error(`  Row ${i+j+1} failed: ${rowErr.message.substring(0, 150)}`);
        }
      }
    }
  }
}

async function resetSequence(table, col) {
  console.log(`  Resetting sequence for ${table}.${col}...`);
  try {
    await dbQuery(DEV_ID, `SELECT setval(pg_get_serial_sequence('${table}', '${col}'), (SELECT COALESCE(MAX("${col}"), 1) FROM public."${table}"));`);
    console.log(`  Sequence reset OK`);
  } catch (err) {
    console.error(`  Sequence reset failed: ${err.message.substring(0, 150)}`);
  }
}

async function main() {
  console.log('=== Supabase Production -> Dev Migration ===\n');
  
  // Order matters for foreign keys: content & movies first, then dependent tables
  const tables = [
    'content',
    'movies',
    'activity_log',
    'rankings',
    'bookmarks',
    'follows',
    'watches',
    'season_ratings',
    'user_lists',
    'pick_suggestions',
    'likes',
    'comments',
    'user_list_items',
    'comment_likes',
  ];
  
  for (const table of tables) {
    try {
      await migrateTable(table);
      // Reset sequences for tables with auto-increment ids
      if (table === 'content' || table === 'movies') {
        await resetSequence(table, 'id');
      }
    } catch (err) {
      console.error(`FAILED on table ${table}: ${err.message}`);
    }
  }
  
  console.log('\n=== Migration complete ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
