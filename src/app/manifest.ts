import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CENTRUM CRM',
    short_name: 'CENTRUM',
    description: 'Мультитенантна CRM-система для управління бізнесом',
    start_url: '/',
    display: 'standalone',
    background_color: '#090b10',
    theme_color: '#090b10',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
