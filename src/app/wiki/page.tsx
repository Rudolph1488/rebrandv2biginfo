import fs from 'node:fs';
import path from 'node:path';
import WikiViewer from '@/components/WikiViewer';

export default function WikiHomePage() {
  const filePath = path.join(process.cwd(), 'docs', 'README.md');
  const content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : '# Wiki\nДокументація не знайдена.';

  return <WikiViewer currentSlug="README" content={content} />;
}
