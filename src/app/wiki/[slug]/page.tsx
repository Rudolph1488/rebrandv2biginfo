import fs from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';
import WikiViewer, { WIKI_PAGES } from '@/components/WikiViewer';

export default async function WikiSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pageMeta = WIKI_PAGES.find((p) => p.slug === slug);
  if (!pageMeta) {
    notFound();
  }

  const filePath = path.join(process.cwd(), 'docs', pageMeta.file);
  if (!fs.existsSync(filePath)) {
    notFound();
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return <WikiViewer currentSlug={slug} content={content} />;
}
