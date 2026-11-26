import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
// Reuse firebase-admin already installed in a:\CRM BOT\functions
const admin = require(path.resolve('a:\\CRM BOT\\functions\\node_modules\\firebase-admin'));

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
  console.error('❌ Не знайдено NEXT_PUBLIC_SUPABASE_URL або SUPABASE_SERVICE_ROLE_KEY в .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', targetSlug)
    .single();

  if (orgErr || !org) {
    console.error(`❌ Організацію зі slug "${targetSlug}" не знайдено:`, orgErr?.message);
    process.exit(1);
  }

  console.log(`🎯 Цільова компанія: ${org.name} (${org.id})`);

  const snap = await firestore
    .collection('crmData')
    .doc('main')
    .collection('clients')
    .get();

  console.log(`📦 Знайдено клієнтів у Firebase: ${snap.size}`);

  const { data: existingClients } = await supabase
    .from('clients')
    .select('phone, telegram_chat_id')
    .eq('org_id', org.id);

  const existingPhones = new Set(
    (existingClients || []).map((c) => c.phone).filter(Boolean)
  );
  const existingTgIds = new Set(
    (existingClients || []).map((c) => c.telegram_chat_id).filter(Boolean)
  );

  const rowsToInsert = [];
  let skipped = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const rawPhone = d.phone && d.phone !== 'N/A' ? String(d.phone).trim() : null;
    const rawTgId = d.telegramChatId ? String(d.telegramChatId).trim() : null;

    if ((rawPhone && existingPhones.has(rawPhone)) || (rawTgId && existingTgIds.has(rawTgId))) {
      skipped++;
      continue;
    }

    if (rawPhone) existingPhones.add(rawPhone);
    if (rawTgId) existingTgIds.add(rawTgId);

    const notesParts = [];
    if (d.edrpou) notesParts.push(`ЄДРПОУ: ${d.edrpou}`);
    if (d.notes) notesParts.push(String(d.notes));

    rowsToInsert.push({
      org_id: org.id,
      contact_person: String(d.contactPerson || d.companyName || 'Клієнт без імені').trim(),
      company_name: d.companyName ? String(d.companyName).trim() : null,
      phone: rawPhone,
      email: d.email ? String(d.email).trim() : null,
      telegram_chat_id: rawTgId,
      telegram_username: d.telegramUsername ? String(d.telegramUsername).trim() : null,
      np_city_ref: d.npCityRef ? String(d.npCityRef).trim() : null,
      np_city_name: d.npCityName ? String(d.npCityName).trim() : null,
      np_warehouse_ref: d.npWarehouseRef ? String(d.npWarehouseRef).trim() : null,
      np_warehouse_name: d.npWarehouseName ? String(d.npWarehouseName).trim() : null,
      notes: notesParts.length > 0 ? notesParts.join('\n') : null,
    });
  }

  console.log(`⏭️  Пропущено дублікатів: ${skipped}`);
  console.log(`🚀 Готово до вставки: ${rowsToInsert.length}`);

  let inserted = 0;
  for (let i = 0; i < rowsToInsert.length; i += 100) {
    const chunk = rowsToInsert.slice(i, i + 100);
    const { error } = await supabase.from('clients').insert(chunk);
    if (error) {
      console.error('❌ Помилка вставки:', error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    console.log(`✅ Перенесено ${inserted} / ${rowsToInsert.length}`);
  }

  console.log('🎉 Міграція клієнтів успішно завершена!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Неочікувана помилка:', err);
  process.exit(1);
});
