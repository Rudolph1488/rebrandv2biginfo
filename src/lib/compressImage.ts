/**
 * Compresses any browser image File to a lightweight WebP thumbnail (max 800px, ~25-60 KB)
 * so mockups take minimal space in Supabase Storage.
 */
export async function compressMockupToWebp(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 800;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.72)
  );

  if (!blob) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, {
    type: 'image/webp',
  });
}
