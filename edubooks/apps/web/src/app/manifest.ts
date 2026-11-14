import type { MetadataRoute } from 'next';

/** Lets phones and tablets install the app to the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Knowledge Gate', short_name: 'Knowledge Gate', description: 'Books, homework, games and progress for schools.',
    start_url: '/portal', scope: '/', display: 'standalone', orientation: 'any', background_color: '#ffffff', theme_color: '#4f46e5',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
