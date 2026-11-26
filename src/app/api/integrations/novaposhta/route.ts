import { NextResponse } from 'next/server';
import { getUserContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

async function callNp(
  apiKey: string,
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, unknown>
) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
  });
  return res.json();
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { orgId, action, cityName, cityRef, searchString } = body as {
      orgId: string;
      action: 'cities' | 'warehouses' | 'create_ttn';
      cityName?: string;
      cityRef?: string;
      searchString?: string;
    };

    const isMember = ctx.memberships.some((m) => m.org_id === orgId);
    if (!isMember && !ctx.profile?.is_super_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: npChannel } = await admin
      .from('integration_channels')
      .select('config')
      .eq('org_id', orgId)
      .eq('type', 'novaposhta')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const apiKey = (npChannel?.config as { apiKey?: string } | null)?.apiKey;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API-ключ Нової Пошти не налаштований у Налаштуваннях' },
        { status: 400 }
      );
    }

    if (action === 'cities') {
      const npData = await callNp(apiKey, 'Address', 'searchSettlements', {
        CityName: cityName || '',
        Limit: '20',
      });
      return NextResponse.json({ ok: true, data: npData.data || [] });
    }

    if (action === 'warehouses') {
      const npData = await callNp(apiKey, 'Address', 'getWarehouses', {
        CityRef: cityRef || '',
        FindByString: searchString || '',
        Limit: '50',
      });
      return NextResponse.json({ ok: true, data: npData.data || [] });
    }

    if (action === 'create_ttn') {
      const {
        orderId,
        recipientCityRef,
        recipientWarehouseRef,
        recipientPhone,
        recipientName,
        weight = '1',
        cost = '500',
        description = 'Товари',
      } = body as {
        orderId: string;
        recipientCityRef: string;
        recipientWarehouseRef: string;
        recipientPhone: string;
        recipientName: string;
        weight?: string;
        cost?: string;
        description?: string;
      };

      if (!recipientCityRef || !recipientWarehouseRef || !recipientPhone) {
        return NextResponse.json(
          { error: 'Оберіть місто, відділення та вкажіть телефон отримувача' },
          { status: 400 }
        );
      }

      // 1. Resolve Sender Counterparty automatically from the company's NP API key
      const sendersRes = await callNp(apiKey, 'Counterparty', 'getCounterparties', {
        CounterpartyProperty: 'Sender',
        Page: '1',
      });
      const sender = sendersRes.data?.[0];
      if (!sender?.Ref) {
        return NextResponse.json(
          { error: 'Не знайдено контрагента-відправника в кабінеті Нової Пошти' },
          { status: 400 }
        );
      }

      const [contactsRes, addressesRes] = await Promise.all([
        callNp(apiKey, 'Counterparty', 'getCounterpartyContactPersons', {
          Ref: sender.Ref,
          Page: '1',
        }),
        callNp(apiKey, 'Counterparty', 'getCounterpartyAddresses', {
          Ref: sender.Ref,
          CounterpartyProperty: 'Sender',
        }),
      ]);

      const contactSender = contactsRes.data?.[0];
      const senderAddress = addressesRes.data?.[0];

      if (!contactSender?.Ref || !senderAddress?.Ref) {
        return NextResponse.json(
          {
            error:
              'У кабінеті Нової Пошти не знайдено контактної особи або адреси відправника за замовчуванням',
          },
          { status: 400 }
        );
      }

      // 2. Create/Save Recipient Counterparty
      const parts = (recipientName || 'Клієнт').trim().split(/\s+/);
      const lastName = parts[0] || 'Клієнт';
      const firstName = parts[1] || 'Отримувач';

      const cpRes = await callNp(apiKey, 'Counterparty', 'save', {
        FirstName: firstName,
        LastName: lastName,
        Phone: recipientPhone,
        Email: '',
        CounterpartyType: 'PrivatePerson',
        CounterpartyProperty: 'Recipient',
      });

      const recipientRef = cpRes.data?.[0]?.Ref;
      const contactRecipientRef = cpRes.data?.[0]?.ContactPerson?.data?.[0]?.Ref;

      if (!recipientRef || !contactRecipientRef) {
        return NextResponse.json(
          {
            error:
              cpRes.errors?.join(', ') ||
              'Помилка створення отримувача в Новій Пошті',
          },
          { status: 400 }
        );
      }

      // 3. Format Kyiv date
      const now = new Date();
      const kyiv = new Date(
        now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' })
      );
      const dateStr = `${String(kyiv.getDate()).padStart(2, '0')}.${String(
        kyiv.getMonth() + 1
      ).padStart(2, '0')}.${kyiv.getFullYear()}`;

      // 4. Create InternetDocument (TTN)
      const ttnRes = await callNp(apiKey, 'InternetDocument', 'save', {
        Sender: sender.Ref,
        CitySender: senderAddress.CityRef || sender.City,
        SenderAddress: senderAddress.Ref,
        ContactSender: contactSender.Ref,
        SendersPhone: contactSender.Phones || '380000000000',
        Recipient: recipientRef,
        CityRecipient: recipientCityRef,
        RecipientAddress: recipientWarehouseRef,
        ContactRecipient: contactRecipientRef,
        RecipientsPhone: recipientPhone,
        DateTime: dateStr,
        CargoType: 'Parcel',
        ServiceType: 'WarehouseWarehouse',
        PaymentMethod: 'Cash',
        PayerType: 'Recipient',
        Cost: String(cost),
        SeatsAmount: '1',
        Description: description,
        Weight: String(weight),
        OptionsSeat: [
          {
            volumetricVolume: '0.004',
            volumetricWidth: '20',
            volumetricLength: '20',
            volumetricHeight: '10',
            weight: String(weight),
          },
        ],
      });

      if (!ttnRes.success || !ttnRes.data?.[0]?.IntDocNumber) {
        return NextResponse.json(
          {
            error:
              ttnRes.errors?.join(', ') || 'Нова Пошта відхилила створення ТТН',
          },
          { status: 400 }
        );
      }

      const createdTtn = ttnRes.data[0].IntDocNumber as string;

      // 5. Save TTN into order
      if (orderId) {
        await admin
          .from('orders')
          .update({ ttn: createdTtn, updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .eq('org_id', orgId);
      }

      return NextResponse.json({ ok: true, ttn: createdTtn });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('Nova Poshta API error:', err);
    return NextResponse.json(
      { error: 'Помилка запиту до Нової Пошти' },
      { status: 500 }
    );
  }
}
