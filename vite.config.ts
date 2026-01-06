import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readdirSync, statSync } from 'fs'
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

export default defineConfig({
  plugins: [react(), archeVaultStaticPlugin()],
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
    force: true, // Принудительная пересборка зависимостей
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
