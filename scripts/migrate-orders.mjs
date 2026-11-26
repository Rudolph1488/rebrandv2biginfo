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

function toIsoDate(val) {
  if (!val) return new Date().toISOString();
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  if (val._seconds !== undefined) return new Date(val._seconds * 1000).toISOString();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function fetchAllSupabaseClients(orgId) {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, phone, telegram_chat_id, contact_person')
      .eq('org_id', orgId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

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

  // 1. Load statuses & products & existing orders
  const [statusesRes, productsRes, existingOrdersRes, sbClients, fbClientsSnap, fbOrdersSnap] =
    await Promise.all([
      supabase
        .from('order_statuses')
        .select('id, name, slug, position, is_final')
        .eq('org_id', org.id)
        .order('position', { ascending: true }),
      supabase
        .from('products')
        .select('id, name, cost_price')
        .eq('org_id', org.id),
      supabase
        .from('orders')
        .select('external_id')
        .eq('org_id', org.id)
        .not('external_id', 'is', null),
      fetchAllSupabaseClients(org.id),
      firestore.collection('crmData').doc('main').collection('clients').get(),
      firestore.collection('crmData').doc('main').collection('orders').get(),
    ]);

  const statuses = statusesRes.data || [];
  const defaultStatusId = statuses[0]?.id || null;
  const finalStatusId =
    statuses.find((s) => s.is_final)?.id ||
    statuses[statuses.length - 1]?.id ||
    defaultStatusId;

  function resolveStatusId(oldStatus) {
    if (!oldStatus) return defaultStatusId;
    const s = String(oldStatus).toLowerCase();
    if (s === 'new') return statuses[0]?.id || defaultStatusId;
    if (s === 'processing') return statuses[1]?.id || defaultStatusId;
    if (s === 'shipped') {
      return (
        statuses.find((st) => st.name.toLowerCase().includes('відправ'))?.id ||
        statuses[Math.min(2, statuses.length - 1)]?.id ||
        defaultStatusId
      );
    }
    if (s === 'done' || s === 'completed') return finalStatusId;
    if (s === 'cancelled') {
      return (
        statuses.find((st) => st.name.toLowerCase().includes('скас'))?.id ||
        finalStatusId
      );
    }
    return defaultStatusId;
  }

  // Client lookup maps
  const sbByPhone = new Map();
  const sbByTg = new Map();
  const sbByName = new Map();
  for (const c of sbClients) {
    if (c.phone) sbByPhone.set(c.phone.trim(), c.id);
    if (c.telegram_chat_id) sbByTg.set(c.telegram_chat_id.trim(), c.id);
    if (c.contact_person) sbByName.set(c.contact_person.toLowerCase().trim(), c.id);
  }

  const fbClientToSbId = new Map();
  for (const doc of fbClientsSnap.docs) {
    const d = doc.data();
    const phone = d.phone && d.phone !== 'N/A' ? String(d.phone).trim() : null;
    const tg = d.telegramChatId ? String(d.telegramChatId).trim() : null;
    const name = d.contactPerson ? String(d.contactPerson).toLowerCase().trim() : null;

    const matchId =
      (tg && sbByTg.get(tg)) ||
      (phone && sbByPhone.get(phone)) ||
      (name && sbByName.get(name)) ||
      null;

    if (matchId) fbClientToSbId.set(doc.id, matchId);
  }

  // Product lookup map
  const prodMap = new Map();
  for (const p of productsRes.data || []) {
    prodMap.set(p.name.toLowerCase().trim(), {
      id: p.id,
      cost_price: Number(p.cost_price || 0),
    });
  }

  const existingExtIds = new Set(
    (existingOrdersRes.data || []).map((o) => o.external_id)
  );

  // Sort Firebase orders chronologically (oldest first so serial order_number matches history!)
  const fbOrders = fbOrdersSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data(), createdIso: toIsoDate(doc.data().created) }))
    .sort((a, b) => new Date(a.createdIso).getTime() - new Date(b.createdIso).getTime());

  console.log(`📦 Знайдено замовлень у Firebase: ${fbOrders.length}`);

  let inserted = 0;
  let skipped = 0;

  for (const fbOrd of fbOrders) {
    const extId = `fb:${fbOrd.id}`;
    if (existingExtIds.has(extId)) {
      skipped++;
      continue;
    }

    const d = fbOrd.data;
    const phone = d.customerPhone && d.customerPhone !== 'N/A' ? String(d.customerPhone).trim() : null;
    const clientName = d.linkedClientName ? String(d.linkedClientName).toLowerCase().trim() : null;

    const clientId =
      (d.linkedClientId && fbClientToSbId.get(d.linkedClientId)) ||
      (phone && sbByPhone.get(phone)) ||
      (clientName && sbByName.get(clientName)) ||
      null;

    const rawItems = Array.isArray(d.items) ? d.items : [];
    let totalCost = 0;
    const itemsPayload = rawItems.map((it) => {
      const itemName = String(it.name || 'Товар').trim();
      const qty = Number(it.qty) || 1;
      const unitPrice = Number(it.price) || 0;
      const matchedProd = prodMap.get(itemName.toLowerCase());
      const unitCost = matchedProd ? matchedProd.cost_price : 0;
      totalCost += qty * unitCost;
      return {
        org_id: org.id,
        product_id: matchedProd?.id || null,
        name: itemName,
        qty,
        unit_price: unitPrice,
        unit_cost: unitCost,
        created_at: fbOrd.createdIso,
      };
    });

    const totalSum =
      Number(d.totalSum) ||
      itemsPayload.reduce((s, i) => s + i.qty * i.unit_price, 0);

    const notesParts = [];
    if (d.details) notesParts.push(`Деталі: ${d.details}`);
    if (d.notes) notesParts.push(String(d.notes));
    if (d.managerName) notesParts.push(`Менеджер (v1): ${d.managerName}`);
    if (Array.isArray(d.files) && d.files.length > 0) {
      notesParts.push(`Файли: ${d.files.join(', ')}`);
    }

    const { data: createdOrder, error: ordErr } = await supabase
      .from('orders')
      .insert({
        org_id: org.id,
        status_id: resolveStatusId(d.status),
        client_id: clientId,
        source_name: String(d.source || 'Firebase v1'),
        external_id: extId,
        total_amount: totalSum,
        total_cost: totalCost,
        ttn: d.ttn ? String(d.ttn).trim() : null,
        delivery_city: d.npCityName ? String(d.npCityName).trim() : null,
        delivery_warehouse: d.npWarehouseName ? String(d.npWarehouseName).trim() : null,
        notes: notesParts.length > 0 ? notesParts.join('\n') : null,
        created_at: fbOrd.createdIso,
        updated_at: fbOrd.createdIso,
      })
      .select('id')
      .single();

    if (ordErr || !createdOrder) {
      console.error(`❌ Помилка вставки замовлення ${fbOrd.id}:`, ordErr?.message);
      continue;
    }

    if (itemsPayload.length > 0) {
      await supabase.from('order_items').insert(
        itemsPayload.map((it) => ({ ...it, order_id: createdOrder.id }))
      );
    }

    inserted++;
    if (inserted % 50 === 0) {
      console.log(`✅ Перенесено ${inserted} замовлень...`);
    }
  }

  console.log(`⏭️  Пропущено дублікатів: ${skipped}`);
  console.log(`🎉 Готово! Перенесено ${inserted} замовлень зі збереженням дат та позицій.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Неочікувана помилка:', err);
  process.exit(1);
});
