'use client';

import { useEffect, useState } from 'react';
import { BellRing, Loader2, X } from 'lucide-react';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function syncSubscriptionToServer(
  orgId: string,
  permission: 'default' | 'granted' | 'denied' | 'unsupported'
) {
  let subscription: PushSubscriptionJSON | undefined;

  if (
    permission === 'granted' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  ) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        subscription = existing.toJSON();
      } else {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (vapidKey) {
          const created = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
          subscription = created.toJSON();
        }
      }
    } catch {
      // Permission is still granted in browser even if PushManager isn't configured yet
    }
  }

  await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId, permission, subscription }),
  }).catch(() => {});
}

export function NotificationPrompt({ orgId }: { orgId: string }) {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!('Notification' in window)) {
      const syncKey = `centrum-push-synced-${orgId}`;
      if (!sessionStorage.getItem(syncKey)) {
        sessionStorage.setItem(syncKey, '1');
        syncSubscriptionToServer(orgId, 'unsupported');
      }
      return;
    }

    const perm = Notification.permission;
    if (perm === 'granted' || perm === 'denied') {
      const syncKey = `centrum-push-synced-${orgId}-${perm}`;
      if (!sessionStorage.getItem(syncKey)) {
        sessionStorage.setItem(syncKey, '1');
        syncSubscriptionToServer(orgId, perm);
      }
      return;
    }

    // perm === 'default'
    if (!sessionStorage.getItem(`centrum-push-snoozed-${orgId}`)) {
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, [orgId]);

  async function handleAllow() {
    if (!('Notification' in window)) return;
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      const mapped =
        result === 'granted'
          ? 'granted'
          : result === 'denied'
            ? 'denied'
            : 'default';
      await syncSubscriptionToServer(orgId, mapped);
      sessionStorage.setItem(`centrum-push-synced-${orgId}-${mapped}`, '1');
      setVisible(false);
    } finally {
      setRequesting(false);
    }
  }

  function handleDismiss() {
    sessionStorage.setItem(`centrum-push-snoozed-${orgId}`, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mx-4 mt-3 flex flex-col justify-between gap-3 rounded-2xl border border-indigo-200/80 bg-indigo-50/80 p-3.5 shadow-2xs backdrop-blur-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 sm:flex-row sm:items-center lg:mx-6">
      <div className="flex items-start gap-3 sm:items-center">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <BellRing className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-900 dark:text-white">
            Увімкнути push-сповіщення?
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            Отримуйте миттєві сповіщення про нові замовлення, оплати та заявки у Виробництво.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        <button
          type="button"
          onClick={handleAllow}
          disabled={requesting}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {requesting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Дозволити
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-xl p-1.5 text-slate-400 hover:bg-white/60 hover:text-slate-700 dark:hover:bg-white/10"
          title="Не зараз"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
