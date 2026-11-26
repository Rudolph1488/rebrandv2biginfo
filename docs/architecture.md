# Архітектура та Безпека CENTRUM OS

[← Повернутися на головну Вікі](./README.md)

---

## 1. Технологічний стек
* **Фронтенд і API:** Next.js 16 (App Router, Turbopack), React 19, TypeScript.
* **Стилі:** Tailwind CSS v4 (`@custom-variant dark`), Lucide Icons, Light + Dark теми ([globals.css](../src/app/globals.css), [ThemeProvider.tsx](../src/components/ThemeProvider.tsx)).
* **База даних, Auth, Storage:** Supabase Cloud (PostgreSQL + Auth + Storage).

---

## 2. Мультитенантність (Multi-Tenant SaaS)
Система спроєктована для роботи **незалежних компаній/студій** в одному екземплярі платформи:
* Кожна компанія має запис у `organizations` з унікальним `slug` (наприклад, `rebrand`) та власним брендингом (`logo_url`, `primary_color`, `currency`).
* Один користувач (наприклад, власник групи з 22 компаній) може належати до кількох компаній через таблицю `organization_members` і перемикатися між ними через **Workspace Switcher** у [WorkspaceSidebar.tsx](../src/components/WorkspaceSidebar.tsx).

---

## 3. Модель безпеки (RBAC + Supabase RLS)
Безпека тримається не на приховуванні кнопок в інтерфейсі, а на серверних перевірках та політиках PostgreSQL:
1. **Рівень платформи:** `profiles.is_super_admin = true` — доступ до `/superadmin`.
2. **Рівень компанії (`role`):** `owner`, `admin`, `manager`, `viewer`.
3. **Гранулярні права (`permissions` JSONB):**
   * `orders` — доступ до Замовлень
   * `clients` — доступ до Клієнтів та Досьє
   * `products` — доступ до Номенклатури
   * `warehouses` — доступ до Складів та Постачання
   * `view_cost_price` — перегляд собівартості та маржі
   * `cashflow` — доступ до Каси
   * `settings` — доступ до Налаштувань
4. **Серверна ізоляція:** [auth.ts](../src/lib/auth.ts) надає `requireOrgAccess(orgSlug)`, кешований через `React.cache()`, а критичні мутації (інвайти, онбординг, прийомки, рухи по складах, зміна статусів з автосписанням) виконуються через серверні API-маршрути (`src/app/api/...`) із `createAdminClient()`.

---

## 4. Продуктивність і Мобільна адаптація
* **Швидкодія:** `React.cache()` усуває дублювання auth-запитів між `layout.tsx` та `page.tsx`; `middleware.ts` використовує локальну перевірку сесії `getSession()`; [loading.tsx](../src/app/w/%5BorgSlug%5D/loading.tsx) показує миттєвий skeleton.
* **Mobile-First:** на екранах `< 768px` замість широких таблиць відображаються карткові списки, модалки відкриваються як нижні шторки (Bottom Sheets), а навігація закріплена в нижньому **Bottom Tab Bar**.

---

**Пов'язані розділи:** [База даних](./database.md) • [Модулі CRM](./modules.md)
