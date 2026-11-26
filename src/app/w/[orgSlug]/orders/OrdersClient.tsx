'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type {
  ClientRecord,
  OrderRecord,
  OrderStatus,
  Organization,
  ProductRecord,
} from '@/types/crm';
import {
  Kanban,
  List,
  Plus,
  X,
  Loader2,
  Trash2,
  Truck,
  User,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';

interface DraftItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
}

export default function OrdersClient({
  org,
  statuses,
  initialOrders,
  totalCount,
  currentPage,
  pageSize,
  initialSearch,
  initialView = 'kanban',
  clients,
  products,
  warehouses,
  canViewCost,
  openNew = false,
  prefillClientId = '',
}: {
  org: Organization;
  statuses: OrderStatus[];
  initialOrders: OrderRecord[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  initialSearch: string;
  initialView?: 'kanban' | 'list';
  clients: ClientRecord[];
  products: ProductRecord[];
  warehouses: Array<{ id: string; name: string; is_default: boolean }>;
  canViewCost: boolean;
  openNew?: boolean;
  prefillClientId?: string;
}) {
  const router = useRouter();
  const [localOrders, setOrders] = useState<OrderRecord[]>(initialOrders);
  const [searchResults, setSearchResults] = useState<OrderRecord[] | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>(initialView);
  const [search, setSearch] = useState(initialSearch);
  const [mobileStageId, setMobileStageId] = useState<string>(
    statuses[0]?.id || 'all'
  );
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [finalVisibleCount, setFinalVisibleCount] = useState(5);
  const [searching, setSearching] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const orders = search.trim() && searchResults ? searchResults : localOrders;

  useEffect(() => {
    const q = search.trim();
    if (!q) return;

    const timer = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();

      const { data: matchedClients } = await supabase
        .from('clients')
        .select('id')
        .eq('org_id', org.id)
        .or(`contact_person.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(30);

      const clientIds = (matchedClients || []).map((c) => c.id);
      const numQ = Number(q.replace('#', ''));
      const orParts = [
        `ttn.ilike.%${q}%`,
        `delivery_city.ilike.%${q}%`,
        `source_name.ilike.%${q}%`,
      ];
      if (!Number.isNaN(numQ) && Number.isInteger(numQ) && numQ > 0) {
        orParts.push(`order_number.eq.${numQ}`);
      }
      if (clientIds.length > 0) {
        orParts.push(`client_id.in.(${clientIds.join(',')})`);
      }

      const { data } = await supabase
        .from('orders')
        .select(
          'id, org_id, order_number, status_id, client_id, warehouse_id, stock_deducted, source_name, total_amount, total_cost, ttn, delivery_city, delivery_warehouse, notes, deadline, production_status, created_at, client:clients(id, contact_person, phone), order_items(id, name, qty, attributes)'
        )
        .eq('org_id', org.id)
        .or(orParts.join(','))
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        const normalized = data.map((o) => ({
          ...o,
          total_cost: canViewCost ? o.total_cost : undefined,
          client: Array.isArray(o.client) ? o.client[0] : o.client,
        })) as unknown as OrderRecord[];
        setSearchResults(normalized);
      }
      setSearching(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [search, org.id, canViewCost]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function goToPage(p: number) {
    const params = new URLSearchParams();
    if (initialSearch) params.set('q', initialSearch);
    params.set('view', viewMode);
    params.set('page', String(p));
    router.push(`/w/${org.slug}/orders?${params.toString()}`);
  }

  const prefilledClient = clients.find((c) => c.id === prefillClientId) || null;
  const [modalOpen, setModalOpen] = useState(openNew);
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState(prefillClientId);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(
    prefilledClient
  );
  const [clientQuery, setClientQuery] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientSearchResults, setClientSearchResults] = useState<
    ClientRecord[] | null
  >(null);
  const [clientSearching, setClientSearching] = useState(false);
  const [creatingClientOpen, setCreatingClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientCompany, setNewClientCompany] = useState('');
  const [savingNewClient, setSavingNewClient] = useState(false);

  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);
  const [productSearchResults, setProductSearchResults] = useState<
    ProductRecord[] | null
  >(null);
  const [statusId, setStatusId] = useState(statuses[0]?.id || '');
  const [warehouseId, setWarehouseId] = useState(
    warehouses.find((w) => w.is_default)?.id || warehouses[0]?.id || ''
  );
  const [deliveryCity, setDeliveryCity] = useState(
    prefilledClient?.np_city_name || ''
  );
  const [deliveryWarehouse, setDeliveryWarehouse] = useState(
    prefilledClient?.np_warehouse_name || ''
  );
  const [ttn, setTtn] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([
    { productId: '', name: '', qty: 1, unitPrice: 0, unitCost: 0 },
  ]);

  const currencySymbol =
    org.currency === 'USD' ? '$' : org.currency === 'EUR' ? '€' : '₴';

  const clientOptions =
    clientQuery.trim() && clientSearchResults
      ? clientSearchResults
      : clients.slice(0, 12);

  useEffect(() => {
    const q = clientQuery.trim();
    if (!q) return;

    const timer = setTimeout(async () => {
      setClientSearching(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('clients')
        .select(
          'id, org_id, contact_person, company_name, phone, email, telegram_username, np_city_name, np_warehouse_name, notes, created_at'
        )
        .eq('org_id', org.id)
        .or(`contact_person.ilike.%${q}%,phone.ilike.%${q}%,company_name.ilike.%${q}%`)
        .limit(15);
      setClientSearchResults((data || []) as ClientRecord[]);
      setClientSearching(false);
    }, 180);
    return () => clearTimeout(timer);
  }, [clientQuery, org.id]);

  const activeItemQuery =
    activeItemIdx !== null ? (items[activeItemIdx]?.name || '').trim() : '';

  const productOptions =
    activeItemQuery.length >= 2 && productSearchResults
      ? productSearchResults
      : activeItemQuery
        ? products
          .filter(
            (p) =>
              p.name.toLowerCase().includes(activeItemQuery.toLowerCase()) ||
              (p.sku || '').toLowerCase().includes(activeItemQuery.toLowerCase())
          )
          .slice(0, 15)
        : products.slice(0, 15);

  useEffect(() => {
    if (activeItemIdx === null) return;
    const q = activeItemQuery;
    if (q.length < 2) return;

    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('products')
        .select(
          canViewCost
            ? 'id, org_id, name, sku, category, sale_price, cost_price, unit, is_active, created_at'
            : 'id, org_id, name, sku, category, sale_price, unit, is_active, created_at'
        )
        .eq('org_id', org.id)
        .eq('is_active', true)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(15);
      if (data) setProductSearchResults(data as unknown as ProductRecord[]);
    }, 180);
    return () => clearTimeout(timer);
  }, [activeItemIdx, activeItemQuery, org.id, canViewCost]);

  function handleSelectClientObj(found: ClientRecord) {
    setClientId(found.id);
    setSelectedClient(found);
    setClientQuery('');
    setClientDropdownOpen(false);
    setCreatingClientOpen(false);
    if (found.np_city_name) setDeliveryCity(found.np_city_name);
    if (found.np_warehouse_name) setDeliveryWarehouse(found.np_warehouse_name);
  }

  function openInlineClientCreate() {
    const q = clientQuery.trim();
    const looksLikePhone = /^[\d+\s()-]{5,}$/.test(q);
    setNewClientPhone(looksLikePhone ? q : '');
    setNewClientName(looksLikePhone ? '' : q);
    setNewClientCompany('');
    setCreatingClientOpen(true);
    setClientDropdownOpen(false);
  }

  async function handleCreateInlineClient() {
    if (!newClientName.trim() && !newClientCompany.trim()) return;
    setSavingNewClient(true);
    const supabase = createClient();
    const { data: created, error } = await supabase
      .from('clients')
      .insert({
        org_id: org.id,
        contact_person: newClientName.trim() || newClientCompany.trim(),
        company_name: newClientCompany.trim() || null,
        phone: newClientPhone.trim() || null,
      })
      .select(
        'id, org_id, contact_person, company_name, phone, email, telegram_username, np_city_name, np_warehouse_name, notes, created_at'
      )
      .single();
    setSavingNewClient(false);
    if (!error && created) {
      handleSelectClientObj(created as ClientRecord);
    }
  }

  function handleProductPick(idx: number, prod: ProductRecord) {
    const next = [...items];
    next[idx] = {
      ...next[idx],
      productId: prod.id,
      name: prod.name,
      unitPrice: Number(prod.sale_price) || 0,
      unitCost: Number(prod.cost_price ?? 0) || 0,
    };
    setItems(next);
    setActiveItemIdx(null);
  }

  const totalAmount = items.reduce(
    (sum, i) => sum + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0),
    0
  );
  const totalCost = items.reduce(
    (sum, i) => sum + (Number(i.qty) || 0) * (Number(i.unitCost) || 0),
    0
  );

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    const { data: createdOrder, error } = await supabase
      .from('orders')
      .insert({
        org_id: org.id,
        status_id: statusId || statuses[0]?.id || null,
        client_id: clientId || null,
        warehouse_id: warehouseId || null,
        source_name: 'CRM',
        total_amount: totalAmount,
        total_cost: totalCost,
        ttn: ttn.trim() || null,
        delivery_city: deliveryCity.trim() || null,
        delivery_warehouse: deliveryWarehouse.trim() || null,
        notes: notes.trim() || null,
      })
      .select(
        'id, org_id, order_number, status_id, client_id, warehouse_id, stock_deducted, source_name, total_amount, total_cost, ttn, delivery_city, delivery_warehouse, notes, created_at, client:clients(id, contact_person, phone)'
      )
      .single();

    if (!error && createdOrder) {
      const validItems = items.filter((i) => i.name.trim());
      if (validItems.length > 0) {
        await supabase.from('order_items').insert(
          validItems.map((i) => ({
            org_id: org.id,
            order_id: createdOrder.id,
            product_id: i.productId || null,
            name: i.name.trim(),
            qty: Number(i.qty) || 1,
            unit_price: Number(i.unitPrice) || 0,
            unit_cost: Number(i.unitCost) || 0,
          }))
        );
      }

      // Check auto-deduct if initial status matches warehouse rule
      let finalDeducted = false;
      if (warehouseId && statusId) {
        const res = await fetch('/api/orders/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: org.id,
            orderId: createdOrder.id,
            newStatusId: statusId,
          }),
        });
        const stData = await res.json();
        if (!res.ok) {
          setStatusError(stData.error || null);
        } else {
          finalDeducted = Boolean(stData.stockDeducted);
        }
      }

      const normalized = {
        ...createdOrder,
        stock_deducted: finalDeducted,
        client: Array.isArray(createdOrder.client)
          ? createdOrder.client[0]
          : createdOrder.client,
      } as unknown as OrderRecord;

      setOrders([normalized, ...orders]);
      setModalOpen(false);
      setClientId('');
      setTtn('');
      setNotes('');
      setItems([{ productId: '', name: '', qty: 1, unitPrice: 0, unitCost: 0 }]);
      router.refresh();
    }

    setSaving(false);
  }

  async function moveOrderStatus(orderId: string, newStatusId: string) {
    setStatusError(null);
    const prevOrders = orders;
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status_id: newStatusId } : o))
    );

    const res = await fetch('/api/orders/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: org.id, orderId, newStatusId }),
    });

    const data = await res.json();
    if (!res.ok) {
      setStatusError(data.error || 'Помилка зміни етапу');
      setOrders(prevOrders);
      return;
    }

    if (data.stockDeducted) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, stock_deducted: true } : o
        )
      );
    }
    router.refresh();
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/40';

  const mobileStageOrders =
    mobileStageId === 'all'
      ? orders
      : orders.filter((o) => o.status_id === mobileStageId);

  return (
    <div className="mx-auto w-full space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Замовлення
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Усього: <strong className="text-slate-900 dark:text-white">{totalCount.toLocaleString('uk-UA')}</strong> (показано {orders.length} на сторінці)
          </p>
        </div>

        <div className="flex items-center justify-between gap-2.5 sm:justify-end">
          <div className="hidden rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-[#0d1017] md:flex">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'kanban'
                ? 'bg-slate-900 text-white dark:bg-white/15'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
            >
              <Kanban className="h-3.5 w-3.5" /> Канбан
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'list'
                ? 'bg-slate-900 text-white dark:bg-white/15'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
            >
              <List className="h-3.5 w-3.5" /> Список
            </button>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 sm:w-auto"
            style={{ backgroundColor: org.primary_color }}
          >
            <Plus className="h-4 w-4" /> Нове замовлення
          </button>
        </div>
      </div>

      {statusError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          <span>{statusError}</span>
          <button type="button" onClick={() => setStatusError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Real-time Search Bar */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Миттєвий пошук (№ замовлення, ПІБ, телефон, ТТН)..."
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-white/10 dark:bg-[#0d1017] dark:text-white"
        />
        {searching && (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        )}
        {!searching && search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* MOBILE STAGE PILL FILTER + CARD LIST */}
      <div className="space-y-4 md:hidden">
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setMobileStageId('all')}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${mobileStageId === 'all'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-300'
              }`}
          >
            Усі ({orders.length})
          </button>
          {statuses.map((st) => {
            const count = orders.filter((o) => o.status_id === st.id).length;
            const active = mobileStageId === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setMobileStageId(st.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${active
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-300'
                  }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: st.color }}
                />
                {st.name} ({count})
              </button>
            );
          })}
        </div>

        {mobileStageOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-400">
            На цьому етапі замовлень немає.
          </div>
        ) : (
          <div className="space-y-3">
            {mobileStageOrders.map((ord) => (
              <div
                key={ord.id}
                onClick={() => router.push(`/w/${org.slug}/orders/${ord.id}`)}
                className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-slate-400">
                    #{ord.order_number}
                  </span>
                  <select
                    value={ord.status_id || ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => moveOrderStatus(ord.id, e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                  >
                    {statuses.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="mt-2 flex items-center gap-1.5 text-base font-bold text-slate-900 dark:text-white">
                  <User className="h-4 w-4 text-slate-400" />
                  {ord.client?.contact_person || 'Без клієнта'}
                </p>

                {ord.ttn && (
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-indigo-600 dark:text-indigo-400">
                    <Truck className="h-3.5 w-3.5" /> {ord.ttn}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-white/10">
                  <span className="text-base font-bold tabular-nums text-slate-900 dark:text-white">
                    {Number(ord.total_amount).toFixed(2)} {currencySymbol}
                  </span>
                  {canViewCost && ord.total_cost !== undefined && (
                    <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      Маржа:{' '}
                      {(
                        Number(ord.total_amount) - Number(ord.total_cost)
                      ).toFixed(0)}{' '}
                      {currencySymbol}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DESKTOP KANBAN / LIST */}
      <div className="hidden md:block">
        {viewMode === 'kanban' ? (
          <div
            className={`grid grid-cols-2 gap-3 lg:grid-cols-3 ${
              statuses.length >= 6 ? 'xl:grid-cols-6' : 'xl:grid-cols-5'
            }`}
          >
            {statuses.map((st, stIdx) => {
              const validStatusIds = new Set(statuses.map((s) => s.id));
              const colOrders = orders.filter((o) =>
                stIdx === 0
                  ? o.status_id === st.id ||
                    !o.status_id ||
                    !validStatusIds.has(o.status_id)
                  : o.status_id === st.id
              );
              const visibleOrders = st.is_final
                ? colOrders.slice(0, finalVisibleCount)
                : colOrders;
              const hasMoreFinal =
                st.is_final && colOrders.length > finalVisibleCount;
              const colSum = colOrders.reduce(
                (s, o) => s + Number(o.total_amount || 0),
                0
              );

              return (
                <div
                  key={st.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedOrderId) {
                      moveOrderStatus(draggedOrderId, st.id);
                      setDraggedOrderId(null);
                    }
                  }}
                  className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white/70 p-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: st.color }}
                      />
                      <h3 className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {st.name}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {colOrders.length}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                      {colSum.toFixed(0)} {currencySymbol}
                    </span>
                  </div>

                  <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-0.5">
                    {visibleOrders.map((ord) => (
                      <div
                        key={ord.id}
                        draggable
                        onDragStart={() => setDraggedOrderId(ord.id)}
                        onClick={() =>
                          router.push(`/w/${org.slug}/orders/${ord.id}`)
                        }
                        className="cursor-pointer rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs transition hover:border-slate-300 active:cursor-grabbing dark:border-white/10 dark:bg-[#0d1017] dark:hover:border-white/20"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[11px] font-semibold text-slate-400">
                            #{ord.order_number}
                          </span>
                          <span className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
                            {ord.source_name}
                          </span>
                        </div>

                        <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs font-semibold text-slate-900 dark:text-white">
                          <User className="h-3 w-3 shrink-0 text-slate-400" />
                          <span className="truncate">
                            {ord.client?.contact_person || 'Без клієнта'}
                          </span>
                        </p>

                        {ord.order_items && ord.order_items.length > 0 && (
                          <div className="mt-2 space-y-1 rounded-lg bg-slate-50/90 p-1.5 text-[11px] dark:bg-white/[0.04]">
                            {ord.order_items.slice(0, 2).map((item) => {
                              const attrText = item.attributes
                                ? Object.entries(item.attributes)
                                    .filter(
                                      ([k, v]) =>
                                        k !== 'Артикул' &&
                                        String(v).trim() !== ''
                                    )
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(' • ')
                                : '';
                              return (
                                <div key={item.id} className="leading-tight">
                                  <div className="flex items-start justify-between gap-1.5">
                                    <span className="line-clamp-1 font-medium text-slate-700 dark:text-slate-200">
                                      {item.name}
                                    </span>
                                    <span className="shrink-0 font-mono text-[10px] font-bold text-slate-800 dark:text-white">
                                      ×{item.qty}
                                    </span>
                                  </div>
                                  {attrText && (
                                    <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">
                                      {attrText}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                            {ord.order_items.length > 2 && (
                              <p className="text-[10px] font-medium text-slate-400">
                                +{ord.order_items.length - 2} позиц.
                              </p>
                            )}
                          </div>
                        )}

                        {ord.ttn && (
                          <p className="mt-1 flex items-center gap-1 truncate font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
                            <Truck className="h-3 w-3 shrink-0" /> {ord.ttn}
                          </p>
                        )}

                        {ord.deadline && (() => {
                          const todayStr = new Date().toISOString().slice(0, 10);
                          const isOverdue = !st.is_final && ord.deadline < todayStr;
                          const isToday = ord.deadline === todayStr;
                          return (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${isOverdue
                                  ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                                  : isToday
                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                                    : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                                  }`}
                              >
                                <CalendarDays className="h-2.5 w-2.5" />
                                {ord.deadline.split('-').reverse().join('.')}
                              </span>
                              <span
                                className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                  ord.production_status === 'done'
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                                    : ord.production_status === 'in_progress'
                                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400'
                                      : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                                }`}
                              >
                                {ord.production_status === 'done'
                                  ? 'Вироблено ✓'
                                  : ord.production_status === 'in_progress'
                                    ? 'У виробництві'
                                    : 'Черга вир.'}
                              </span>
                            </div>
                          );
                        })()}

                        <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-white/10">
                          <span className="text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                            {Number(ord.total_amount).toFixed(0)} {currencySymbol}
                          </span>
                          {canViewCost && ord.total_cost !== undefined && (
                            <span className="text-[10px] font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                              +
                              {(
                                Number(ord.total_amount) -
                                Number(ord.total_cost)
                              ).toFixed(0)}{' '}
                              {currencySymbol}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {hasMoreFinal && (
                      <button
                        type="button"
                        onClick={() => setFinalVisibleCount((c) => c + 5)}
                        className="w-full rounded-xl border border-dashed border-slate-200 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        Завантажити ще (+5 з {colOrders.length - finalVisibleCount})
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-3.5">№</th>
                    <th className="px-5 py-3.5">Дата і час</th>
                    <th className="px-5 py-3.5">Клієнт</th>
                    <th className="px-5 py-3.5">Етап</th>
                    <th className="px-5 py-3.5">ТТН / Доставка</th>
                    <th className="px-5 py-3.5">Сума</th>
                    {canViewCost && <th className="px-5 py-3.5">Маржа</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {orders.map((ord) => (
                    <tr
                      key={ord.id}
                      onClick={() =>
                        router.push(`/w/${org.slug}/orders/${ord.id}`)
                      }
                      className="cursor-pointer hover:bg-slate-50/60 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-500">
                        #{ord.order_number}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {new Date(ord.created_at).toLocaleString('uk-UA', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                        {ord.client?.contact_person || 'Без клієнта'}
                      </td>
                      <td
                        className="px-5 py-3.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={ord.status_id || ''}
                          onChange={(e) =>
                            moveOrderStatus(ord.id, e.target.value)
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium dark:border-white/10 dark:bg-[#131722] dark:text-white"
                        >
                          {statuses.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                        {ord.ttn || ord.delivery_city || '—'}
                      </td>
                      <td className="px-5 py-3.5 font-semibold tabular-nums text-slate-900 dark:text-white">
                        {Number(ord.total_amount).toFixed(2)} {currencySymbol}
                      </td>
                      {canViewCost && (
                        <td className="px-5 py-3.5 font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                          {(
                            Number(ord.total_amount) -
                            Number(ord.total_cost || 0)
                          ).toFixed(2)}{' '}
                          {currencySymbol}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            Сторінка <strong className="text-slate-900 dark:text-white">{currentPage}</strong> з{' '}
            <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-200"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Назад
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-200"
            >
              Вперед <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM-SHEET / MODAL: CREATE ORDER */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#131722] sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Нове замовлення
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="relative">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Клієнт (пошук або новий)
                  </label>
                  {selectedClient ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs dark:border-indigo-500/30 dark:bg-indigo-500/10">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">
                          {selectedClient.contact_person}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {[selectedClient.phone, selectedClient.company_name]
                            .filter(Boolean)
                            .join(' • ') || 'Без телефону'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setClientId('');
                          setSelectedClient(null);
                          setClientQuery('');
                        }}
                        className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white/60 hover:text-slate-700 dark:hover:bg-white/10"
                        title="Змінити клієнта"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={clientQuery}
                          onFocus={() => setClientDropdownOpen(true)}
                          onChange={(e) => {
                            setClientQuery(e.target.value);
                            setClientDropdownOpen(true);
                          }}
                          placeholder="ПІБ, телефон або компанія..."
                          className={`${inputCls} pl-8 pr-7`}
                        />
                        {clientSearching && (
                          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />
                        )}
                      </div>

                      {clientDropdownOpen && (
                        <div className="absolute z-30 mt-1 max-h-56 w-full min-w-[260px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#1a1f2e]">
                          {clientOptions.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => handleSelectClientObj(c)}
                              className="flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-white/10"
                            >
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {c.contact_person}
                                {c.company_name ? ` (${c.company_name})` : ''}
                              </span>
                              {c.phone && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {c.phone}
                                </span>
                              )}
                            </button>
                          ))}
                          {clientOptions.length === 0 && !clientSearching && (
                            <p className="px-2.5 py-2 text-xs text-slate-400">
                              Клієнта не знайдено
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={openInlineClientCreate}
                            className="mt-1 flex w-full items-center gap-1.5 rounded-lg border-t border-slate-100 px-2.5 py-2 text-left text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:border-white/10 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Створити нового клієнта
                            {clientQuery.trim() ? ` «${clientQuery.trim()}»` : ''}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Етап
                  </label>
                  <select
                    value={statusId}
                    onChange={(e) => setStatusId(e.target.value)}
                    className={inputCls}
                  >
                    {statuses.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Склад відвантаження
                  </label>
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Без складу —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {creatingClientOpen && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                      Новий клієнт
                    </span>
                    <button
                      type="button"
                      onClick={() => setCreatingClientOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="ПІБ / Контактна особа *"
                      className={inputCls}
                    />
                    <input
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      placeholder="Телефон"
                      className={inputCls}
                    />
                    <input
                      value={newClientCompany}
                      onChange={(e) => setNewClientCompany(e.target.value)}
                      placeholder="Юр. особа / Компанія"
                      className={inputCls}
                    />
                  </div>
                  <div className="mt-2.5 flex justify-end">
                    <button
                      type="button"
                      disabled={
                        savingNewClient ||
                        (!newClientName.trim() && !newClientCompany.trim())
                      }
                      onClick={handleCreateInlineClient}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {savingNewClient && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      Зберегти і вибрати клієнта
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Позиції замовлення
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setItems([
                        ...items,
                        {
                          productId: '',
                          name: '',
                          qty: 1,
                          unitPrice: 0,
                          unitCost: 0,
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    <Plus className="h-3.5 w-3.5" /> Додати позицію
                  </button>
                </div>

                <div className="space-y-2.5">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 border-b border-slate-200/60 pb-2.5 last:border-0 last:pb-0 dark:border-white/10"
                    >
                      <div className="relative col-span-12 sm:col-span-7">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          required
                          value={item.name}
                          onFocus={() => setActiveItemIdx(idx)}
                          onBlur={() =>
                            setTimeout(
                              () =>
                                setActiveItemIdx((curr) =>
                                  curr === idx ? null : curr
                                ),
                              150
                            )
                          }
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = {
                              ...item,
                              productId: '',
                              name: e.target.value,
                            };
                            setItems(next);
                            setActiveItemIdx(idx);
                          }}
                          placeholder="Пошук товару (назва, SKU) або своя позиція..."
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-2.5 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white"
                        />
                        {activeItemIdx === idx && productOptions.length > 0 && (
                          <div className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#1a1f2e]">
                            {productOptions.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleProductPick(idx, p);
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-white/10"
                              >
                                <span className="truncate font-medium text-slate-900 dark:text-white">
                                  {p.name}
                                  {p.sku ? (
                                    <span className="ml-1.5 font-mono text-[10px] text-slate-400">
                                      ({p.sku})
                                    </span>
                                  ) : null}
                                </span>
                                <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                  {Number(p.sale_price).toFixed(0)} {currencySymbol}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.qty}
                        onChange={(e) => {
                          const next = [...items];
                          next[idx] = { ...item, qty: Number(e.target.value) };
                          setItems(next);
                        }}
                        placeholder="К-ть"
                        className="col-span-5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white sm:col-span-2"
                      />

                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => {
                          const next = [...items];
                          next[idx] = {
                            ...item,
                            unitPrice: Number(e.target.value),
                          };
                          setItems(next);
                        }}
                        placeholder="Ціна"
                        className="col-span-5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white sm:col-span-2"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setItems(items.filter((_, i) => i !== idx))
                        }
                        className="col-span-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 sm:col-span-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2.5 text-sm dark:border-white/10">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    Разом: {totalAmount.toFixed(2)} {currencySymbol}
                  </span>
                  {canViewCost && (
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Маржа: {(totalAmount - totalCost).toFixed(2)}{' '}
                      {currencySymbol}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  value={deliveryCity}
                  onChange={(e) => setDeliveryCity(e.target.value)}
                  placeholder="Місто (НП)"
                  className={inputCls}
                />
                <input
                  value={deliveryWarehouse}
                  onChange={(e) => setDeliveryWarehouse(e.target.value)}
                  placeholder="Відділення НП"
                  className={inputCls}
                />
                <input
                  value={ttn}
                  onChange={(e) => setTtn(e.target.value)}
                  placeholder="ТТН (якщо вже є)"
                  className={`${inputCls} font-mono`}
                />
              </div>

              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Коментар до замовлення..."
                className={inputCls}
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: org.primary_color }}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Створити замовлення
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
