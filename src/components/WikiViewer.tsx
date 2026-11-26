import Link from 'next/link';
import ThemeToggle from './ThemeToggle';
import { BookOpen, ArrowLeft, FileText } from 'lucide-react';

export const WIKI_PAGES = [
  { slug: 'README', title: 'Головна Вікі', file: 'README.md' },
  { slug: 'architecture', title: 'Архітектура та Безпека', file: 'architecture.md' },
  { slug: 'database', title: 'База даних і Міграції', file: 'database.md' },
  { slug: 'modules', title: 'Модулі CRM (Туторіал)', file: 'modules.md' },
  { slug: 'integrations', title: 'Інтеграції та Вебхуки', file: 'integrations.md' },
  { slug: 'migration-and-deploy', title: 'Міграція v1 та Деплой', file: 'migration-and-deploy.md' },
];

function renderInline(text: string): React.ReactNode[] {
  // Handle markdown links [label](./file.md) and **bold** and `code`
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      if (href.startsWith('./') && href.endsWith('.md')) {
        const targetSlug = href.replace('./', '').replace('.md', '');
        const dest = targetSlug === 'README' ? '/wiki' : `/wiki/${targetSlug}`;
        return (
          <Link
            key={i}
            href={dest}
            className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-500 dark:text-indigo-400"
          >
            {label}
          </Link>
        );
      }
      return (
        <span key={i} className="font-medium text-indigo-600 dark:text-indigo-400">
          {label}
        </span>
      );
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800 dark:bg-white/10 dark:text-slate-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return part;
  });
}

function MarkdownBlocks({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre
          key={`code-${i}`}
          className="my-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 dark:border-white/10"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Table
    if (line.trim().startsWith('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
      const headers = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      i += 2; // skip header & separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(
          lines[i]
            .split('|')
            .map((c) => c.trim())
            .filter(Boolean)
        );
        i++;
      }
      elements.push(
        <div
          key={`tbl-${i}`}
          className="my-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"
        >
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
              <tr>
                {headers.map((h, hi) => (
                  <th key={hi} className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((cell, ci) => (
                    <td key={ci} className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="mt-2 mb-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="mt-8 mb-3 border-b border-slate-100 pb-2 text-lg font-bold text-slate-900 dark:border-white/10 dark:text-white">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="mt-5 mb-2 text-base font-semibold text-slate-900 dark:text-white">
          {renderInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={i}
          className="my-3 border-l-2 border-indigo-500 bg-indigo-50/50 px-4 py-2.5 text-sm text-slate-700 dark:bg-indigo-500/10 dark:text-slate-300"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
    } else if (line.startsWith('---')) {
      elements.push(<hr key={i} className="my-6 border-slate-200 dark:border-white/10" />);
    } else if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const cleaned = line.replace(/^\s*([-*]|\d+\.)\s+/, '');
      const indent = line.search(/\S/) > 1;
      elements.push(
        <div key={i} className={`my-1 flex gap-2 text-sm text-slate-700 dark:text-slate-300 ${indent ? 'pl-5' : ''}`}>
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          <p className="leading-relaxed">{renderInline(cleaned)}</p>
        </div>
      );
    } else if (line.trim() !== '') {
      elements.push(
        <p key={i} className="my-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {renderInline(line)}
        </p>
      );
    }
    i++;
  }

  return <>{elements}</>;
}

export default function WikiViewer({
  currentSlug,
  content,
}: {
  currentSlug: string;
  content: string;
}) {
  return (
    <div className="bg-dot-grid min-h-screen bg-[#f4f5f8] dark:bg-[#07080d]">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d1017]/85">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> В CRM
            </Link>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>CENTRUM Wiki</span>
            </div>
          </div>

          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-4">
        {/* Wiki Nav */}
        <aside className="lg:col-span-1">
          <div className="sticky top-20 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
            <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Розділи документації
            </p>
            <nav className="space-y-1">
              {WIKI_PAGES.map((p) => {
                const href = p.slug === 'README' ? '/wiki' : `/wiki/${p.slug}`;
                const active = p.slug === currentSlug;
                return (
                  <Link
                    key={p.slug}
                    href={href}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition ${
                      active
                        ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    {p.title}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] sm:p-8 lg:col-span-3">
          <MarkdownBlocks content={content} />
        </article>
      </div>
    </div>
  );
}
