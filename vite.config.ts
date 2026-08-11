import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readdirSync, statSync, mkdirSync, copyFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Плагин для обслуживания статических файлов из arche-vault
function archeVaultStaticPlugin() {
  return {
    name: 'arche-vault-static',
    configureServer(server: any) {
      server.middlewares.use('/arche-vault', (req: any, res: any, next: any) => {
        try {
          // Убираем /arche-vault из пути и строим полный путь
          const relativePath = req.url.replace(/^\/arche-vault/, '');
          const filePath = path.resolve(__dirname, 'arche-vault', relativePath);
          
          // Проверяем, что файл существует и находится в arche-vault (безопасность)
          const normalizedPath = path.normalize(filePath);
          const vaultPath = path.resolve(__dirname, 'arche-vault');
          
          if (!normalizedPath.startsWith(vaultPath)) {
            // Путь вне arche-vault - отклоняем
            next();
            return;
          }
          
          if (statSync(filePath).isFile()) {
            res.setHeader('Content-Type', getContentType(filePath));
            res.sendFile(filePath);
          } else {
            next();
          }
        } catch (err) {
          // Файл не найден, продолжаем
          next();
        }
      });
    },
    // Копируем файлы из arche-vault в dist при сборке
    writeBundle() {
      const sourceDir = path.resolve(__dirname, 'arche-vault', '_imgs');
      const destDir = path.resolve(__dirname, 'dist', 'arche-vault', '_imgs');
      
      if (!existsSync(sourceDir)) {
        console.warn('[arche-vault-static] Source directory not found:', sourceDir);
        return;
      }
      
      // Создаем целевую директорию
      mkdirSync(destDir, { recursive: true });
      
      // Копируем все файлы изображений
      try {
        const files = readdirSync(sourceDir);
        let copiedCount = 0;
        
        for (const file of files) {
          const sourcePath = path.join(sourceDir, file);
          const destPath = path.join(destDir, file);
          
          if (statSync(sourcePath).isFile()) {
            copyFileSync(sourcePath, destPath);
            copiedCount++;
          }
        }
        
        console.log(`[arche-vault-static] Copied ${copiedCount} image files to dist`);
      } catch (err) {
        console.error('[arche-vault-static] Error copying files:', err);
      }
    },
  };
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Установка на домашний экран и работа без сети.
 *
 * Раздел «Сегодня» рассчитан на то, что человек заходит каждый день, —
 * а значит с телефона и часто там, где связи нет. Заметки и так вшиты
 * в бандл, поэтому офлайн даётся почти даром: достаточно закэшировать
 * сам бандл.
 *
 * Изображения хранилища НЕ попадают в предзагрузку: их около сорока,
 * и весят они куда больше самого приложения — скачивать всё это при
 * первом заходе было бы издевательством. Они кэшируются по мере
 * просмотра.
 */
const pwaPlugin = VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['icons/apple-touch-icon.png'],
  manifest: {
    name: 'Arche — карта знаний',
    short_name: 'Arche',
    description:
      'Личная энциклопедия философии и культуры: карта идей на оси времени, глобус, карточки и ежедневная практика.',
    lang: 'ru',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#08090b',
    theme_color: '#08090b',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Сегодня', short_name: 'Сегодня', url: '/study/today' },
      { name: 'Листать', short_name: 'Листать', url: '/feed' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,woff,woff2}'],
    globIgnores: ['**/arche-vault/**'],
    navigateFallback: '/index.html',
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.pathname.startsWith('/arche-vault/_imgs/'),
        handler: 'CacheFirst',
        options: {
          cacheName: 'arche-images',
          expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 },
        },
      },
    ],
  },
  devOptions: {
    // В разработке service worker только мешает: он подсовывает
    // закэшированный бандл поверх горячей перезагрузки
    enabled: false,
  },
})

export default defineConfig({
  plugins: [react(), archeVaultStaticPlugin(), pwaPlugin],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
    },
    dedupe: ['react', 'react-dom'],
  },
  // Настройки для правильной обработки CommonJS модулей
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  define: {
    'global': 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  server: {
    port: 5177,
    fs: {
      strict: false,
    },
  },
})
