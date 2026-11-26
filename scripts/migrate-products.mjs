import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const admin = require(
  path.resolve('a:\\CRM BOT\\functions\\node_modules\\firebase-admin')
);

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const targetSlug = process.argv[2] || 'rebrand';
const keyPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(process.cwd(), 'firebase-key.json');

if (!fs.existsSync(keyPath)) {
  console.error(`❌ Не знайдено файл ключа: ${keyPath}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Не знайдено Supabase ключі в .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', targetSlug)
    .single();

  if (orgErr || !org) {
    console.error(`❌ Організацію "${targetSlug}" не знайдено:`, orgErr?.message);
    process.exit(1);
  }

  console.log(`🎯 Цільова компанія: ${org.name}`);

  const snap = await firestore
    .collection('crmData')
    .doc('main')
    .collection('products')
    .get();

  console.log(`📦 Знайдено товарів у Firebase: ${snap.size}`);

  const { data: existingProducts } = await supabase
    .from('products')
    .select('name, sku')
    .eq('org_id', org.id);

  const existingNames = new Set(
    (existingProducts || []).map((p) => p.name.toLowerCase().trim())
  );
  const existingSkus = new Set(
    (existingProducts || []).map((p) => p.sku?.toLowerCase().trim()).filter(Boolean)
  );

  const rowsToInsert = [];
  let skipped = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const name = String(d.name || '').trim();
    if (!name) continue;

    const sku = d.sku ? String(d.sku).trim() : null;

    if (
      existingNames.has(name.toLowerCase()) ||
      (sku && existingSkus.has(sku.toLowerCase()))
    ) {
      skipped++;
      continue;
    }

    existingNames.add(name.toLowerCase());
    if (sku) existingSkus.add(sku.toLowerCase());

    rowsToInsert.push({
      org_id: org.id,
      name,
      sku,
      category: d.category ? String(d.category).trim() : null,
      sale_price: Number(d.price ?? d.salePrice ?? 0) || 0,
      cost_price: Number(d.costPrice ?? d.cost ?? 0) || 0,
      unit: d.unit ? String(d.unit).trim() : 'шт',
      is_active: true,
    });
  }

  console.log(`⏭️  Пропущено дублікатів: ${skipped}`);
  console.log(`🚀 Готово до вставки: ${rowsToInsert.length}`);

  let inserted = 0;
  for (let i = 0; i < rowsToInsert.length; i += 100) {
    const chunk = rowsToInsert.slice(i, i + 100);
    const { error } = await supabase.from('products').insert(chunk);
    if (error) {
      console.error('❌ Помилка вставки:', error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    console.log(`✅ Перенесено ${inserted} / ${rowsToInsert.length}`);
  }

  console.log('🎉 Міграція номенклатури успішно завершена!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Помилка:', err);
  process.exit(1);
});
