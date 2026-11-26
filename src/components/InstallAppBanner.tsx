'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIosHint, setIsIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as { standalone?: boolean }).standalone);

    if (isStandalone || sessionStorage.getItem('centrum-pwa-dismissed')) {
      return;
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIos) {
      timer = setTimeout(() => setIsIosHint(true), 800);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }

  function handleDismiss() {
    sessionStorage.setItem('centrum-pwa-dismissed', '1');
    setDismissed(true);
  }

  if (dismissed || (!deferredPrompt && !isIosHint)) return null;

  return (
    <div className="mx-4 mt-3 flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] sm:flex-row sm:items-center lg:mx-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
          <Download className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-900 dark:text-white">
            Встановити додаток CENTRUM CRM
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {isIosHint
              ? 'На iPhone натисніть «Поділитися» (квадрат зі стрілкою внизу) → «На екран Додому».'
              : 'Швидкий запуск з робочого столу та миттєві push-сповіщення.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        {deferredPrompt && (
          <button
            type="button"
            onClick={handleInstall}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <Download className="h-3.5 w-3.5" />
            Встановити
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
          title="Закрити"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
