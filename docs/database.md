# База даних PostgreSQL та Міграції

[← Повернутися на головну Вікі](./README.md)

---

## 1. Історія SQL-міграцій
Усі міграції зберігаються в `supabase/migrations/` і застосовуються послідовно в **Supabase → SQL Editor**:

1. **[0001_initial_schema.sql](../supabase/migrations/0001_initial_schema.sql)** — базова мультитенантна схема, RLS-функції (`is_super_admin`, `is_org_member`, `is_org_admin`, `has_org_permission`), тригер `handle_new_user()`, індекси `pg_trgm` та бакети Storage (`org-logos`, `order-files`).
2. **[0002_warehouses.sql](../supabase/migrations/0002_warehouses.sql)** — складський облік (`warehouses`, `warehouse_stock`, `stock_movements`).
3. **[0003_supplies_and_order_warehouse.sql](../supabase/migrations/0003_supplies_and_order_warehouse.sql)** — документи постачання (`supply_documents`) та прив'язка складів до замовлень (`orders.warehouse_id`, `orders.stock_deducted`).
4. **[0004_order_item_attributes.sql](../supabase/migrations/0004_order_item_attributes.sql)** — поле `attributes` (`jsonb`) в `order_items` для збереження розміру, кольору та інших опцій товару.
5. **[0005_order_deadline.sql](../supabase/migrations/0005_order_deadline.sql)** — поле `deadline` (`date`) та індекс `idx_orders_org_deadline` в `orders` для планування відвантажень у Календарі.
6. **[0006_production_and_producer_role.sql](../supabase/migrations/0006_production_and_producer_role.sql)** — роль `producer` («Виробник»), поля виробництва (`production_status`, `production_accepted_by`, `production_accepted_at`, `production_completed_at`) в `orders` та RLS-політики доступу до модулів `production` і `calendar`.
7. **[0007_performance_indexes.sql](../supabase/migrations/0007_performance_indexes.sql)** — композитні індекси на `orders`, `order_items`, `cashflow_transactions`, `clients` для швидких запитів.
8. **[0008_push_notifications.sql](../supabase/migrations/0008_push_notifications.sql)** — статус сповіщень `push_permission` в `organization_members`, таблиця пристроїв `push_subscriptions` (Web Push VAPID) та журнал `notification_logs`.

---

## 2. Основні таблиці

| Таблиця | Призначення | Ключові поля |
| :--- | :--- | :--- |
| `profiles` | Профілі користувачів | `id`, `email`, `full_name`, `is_super_admin` |
| `organizations` | Компанії / студії | `id`, `name`, `slug`, `logo_url`, `primary_color`, `currency`, `onboarding_completed` |
| `organization_members` | Учасники та права | `org_id`, `user_id`, `role`, `permissions` (JSONB) |
| `organization_invites` | Інвайт-посилання | `org_id`, `email`, `role`, `token`, `accepted_at`, `expires_at` |
| `order_statuses` | Колонки канбану | `org_id`, `name`, `slug`, `color`, `position`, `is_final` |
| `clients` | База клієнтів | `org_id`, `contact_person`, `company_name`, `phone`, `email`, `telegram_*`, `np_*`, `notes` |
| `products` | Номенклатура | `org_id`, `name`, `sku`, `category`, `sale_price`, `cost_price`, `unit` |
| `orders` | Замовлення | `org_id`, `order_number`, `status_id`, `client_id`, `warehouse_id`, `stock_deducted`, `total_amount`, `total_cost`, `ttn`, `external_id` |
| `order_items` | Позиції замовлення | `org_id`, `order_id`, `product_id`, `name`, `qty`, `unit_price`, `unit_cost` |
| `cashflow_transactions` | Каса (доходи/витрати) | `org_id`, `type`, `amount`, `category`, `order_id`, `comment`, `occurred_at` |
| `integration_channels` | Канали та ключі | `org_id`, `type`, `name`, `config` (JSONB), `webhook_secret` |
| `warehouses` | Склади та правила | `org_id`, `name`, `type`, `is_default`, `allow_negative_stock`, `auto_deduct_status_id` |
| `warehouse_stock` | Залишки по складах | `org_id`, `warehouse_id`, `product_id`, `quantity`, `reserved_qty`, `min_quantity` |
| `stock_movements` | Журнал руху товарів | `org_id`, `doc_number`, `type`, `warehouse_id`, `target_warehouse_id`, `product_id`, `quantity` |
| `supply_documents` | Прийомки (постачання) | `org_id`, `doc_number`, `warehouse_id`, `supplier_name`, `invoice_number`, `total_amount` |

---

**Пов'язані розділи:** [Архітектура](./architecture.md) • [Міграція з Firebase v1](./migration-and-deploy.md)
