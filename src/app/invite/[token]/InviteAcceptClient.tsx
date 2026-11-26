'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Building2, CheckCircle2 } from 'lucide-react';

interface Props {
  token: string;
  email: string;
  role: string;
  orgName: string;
  isLoggedIn: boolean;
  loggedInEmail: string | null;
}

export default function InviteAcceptClient({
  token,
  email,
  role,
  orgName,
  isLoggedIn,
  loggedInEmail,
}: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleLabels: Record<string, string> = {
    owner: 'Власник',
    admin: 'Адміністратор',
    manager: 'Менеджер',
    viewer: 'Спостерігач',
  };

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, fullName, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Помилка активації запрошення');
      setLoading(false);
      return;
    }

    router.push(data.redirectTo);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-blue-600">
              Запрошення в команду
            </p>
            <h1 className="text-xl font-bold text-slate-900">{orgName}</h1>
          </div>
        </div>

        <div className="mb-5 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-700">
          <p>
            <span className="text-slate-500">Email:</span>{' '}
            <strong className="font-medium">{email}</strong>
          </p>
          <p className="mt-1">
            <span className="text-slate-500">Роль:</span>{' '}
            <strong className="font-medium">{roleLabels[role] || role}</strong>
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleAccept} className="space-y-4">
          {!isLoggedIn ? (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Ваше ім&apos;я
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Олександр Шевчук"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Придумайте пароль
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Мінімум 6 символів"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              Ви увійшли як <strong>{loggedInEmail}</strong>. Натисніть кнопку
              нижче, щоб приєднатися до компанії.
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Прийняти запрошення
              </>
            )}
          </button>
        </form>

        {!isLoggedIn && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Вже маєте акаунт?{' '}
            <Link href="/login" className="font-medium text-blue-600 hover:underline">
              Увійти спочатку
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
