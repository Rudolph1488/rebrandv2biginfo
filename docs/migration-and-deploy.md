# Міграція з Firebase v1 та Деплой

[← Повернутися на головну Вікі](./README.md)

---

## 1. Скрипти міграції з Firebase (`crm.rebrand.com.ua`)
У папці `scripts/` лежать 3 скрипти для перенесення даних із Firestore (`crmData/main/...`) у Supabase для вказаної компанії (`slug`):

1. **[migrate-clients.mjs](../scripts/migrate-clients.mjs)** — переносить клієнтів із дедублікацією за телефоном і `telegramChatId`.
   * *Результат для `rebrand`:* 4 946 у Firebase → 1 095 дублів пропущено → **3 851** перенесено.
2. **[migrate-products.mjs](../scripts/migrate-products.mjs)** — переносить номенклатуру (назва, артикул, ціна).
   * *Результат для `rebrand`:* 13 у Firebase → 1 дубль пропущено → **12** перенесено.
3. **[migrate-orders.mjs](../scripts/migrate-orders.mjs)** — переносить замовлення в хронологічному порядку зі збереженням `created_at`, позицій (`order_items`), ТТН, доставки та прив'язкою до клієнтів.
   * *Результат для `rebrand`:* **900** замовлень перенесено.

### Запуск міграції вручну
```powershell
cd a:\centrum-v2
node scripts/migrate-clients.mjs <orgSlug> "<шлях-до-firebase-adminsdk.json>"
node scripts/migrate-products.mjs <orgSlug> "<шлях-до-firebase-adminsdk.json>"
node scripts/migrate-orders.mjs <orgSlug> "<шлях-до-firebase-adminsdk.json>"
```

---

## 2. Перевірка збірки перед деплоєм
```powershell
cd a:\centrum-v2
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

---

## 3. Чеклист деплою на Vercel
1. Створити приватний репозиторій на GitHub і запушити `a:\centrum-v2` (перевірити, що `.env.local` і будь-які `*.json` ключі в `.gitignore`).
2. Підключити репозиторій у [vercel.com](https://vercel.com) → **Add New Project**.
3. Додати змінні середовища (**Environment Variables**):
   * `NEXT_PUBLIC_SUPABASE_URL`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * `SUPABASE_SERVICE_ROLE_KEY`
   * `NEXT_PUBLIC_APP_URL` (ваш бойовий домен, наприклад `https://app.rebrand.com.ua`)
4. У **Supabase → Authentication → URL Configuration** додати бойовий домен у `Site URL` та `Redirect URLs`.
5. Підключити кастомний домен у Vercel → **Settings → Domains**.

---

**Пов'язані розділи:** [Головна Вікі](./README.md) • [База даних](./database.md)
