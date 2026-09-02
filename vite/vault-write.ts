import path from 'path'
import { existsSync, writeFileSync } from 'fs'
import type { Plugin, ViteDevServer } from 'vite'

/**
 * Запись заметок обратно в хранилище — только в режиме разработки.
 *
 * Зачем это вообще. Приложение читает vault, но править его до сих пор
 * можно было только снаружи: скопировать путь, открыть Obsidian, найти
 * место, дописать. Из-за этого трения заметки и застряли на полутора
 * сотнях слов — исправить формулировку в тот момент, когда стало видно,
 * что она плохая, было дороже, чем махнуть рукой.
 *
 * Почему `apply: 'serve'`. Собранное приложение — статика на любом хостинге,
 * и ручки записи в нём нет вовсе: не отключена флагом, а физически
 * отсутствует в бандле. Писать в хранилище можно за своим столом,
 * с телефона — только читать. Для личного инструмента это правильный
 * размен: цена ошибки в правах на запись выше, чем удобство правки в метро.
 */
export function archeVaultWritePlugin(): Plugin {
  const vaultRoot = path.resolve(process.cwd(), 'arche-vault')

  /**
   * Файлы, которые записало само приложение.
   *
   * Заметки вшиты в бандл через import.meta.glob, поэтому любое изменение
   * .md роняет полную перезагрузку страницы. Для правки из Obsidian это
   * ровно то, что нужно. Но для сохранения из редактора — нет: страница
   * перезагрузилась бы прямо под руками, а данные и так уже обновлены
   * в сторе. Поэтому свои записи перезагрузку не вызывают, чужие — вызывают.
   */
  const selfWrites = new Map<string, number>()
  const SELF_WRITE_TTL = 5000

  const toPosix = (p: string) => p.split(path.sep).join('/')

  return {
    name: 'arche-vault-write',
    apply: 'serve',

    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__vault/save', (req, res) => {
        const reply = (code: number, payload: unknown) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(payload))
        }

        if (req.method !== 'POST') return reply(405, { error: 'только POST' })

        let body = ''
        req.on('data', (chunk) => {
          body += chunk
          // Самая длинная заметка хранилища — три килобайта; мегабайт
          // означает, что что-то пошло не так
          if (body.length > 1_000_000) req.destroy()
        })

        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { path?: unknown; content?: unknown }
            const rel = parsed.path
            const content = parsed.content

            if (typeof rel !== 'string' || typeof content !== 'string') {
              return reply(400, { error: 'нужны поля path и content' })
            }

            const target = path.resolve(vaultRoot, rel)
            const inside = target.startsWith(vaultRoot + path.sep)
            if (!inside || !target.endsWith('.md')) {
              return reply(400, { error: 'путь ведёт за пределы хранилища' })
            }
            // Создавать файлы эта ручка не умеет: новая заметка — это
            // решение о названии, папке и типе, и принимать его вслепую
            // по строке из браузера не стоит
            if (!existsSync(target)) {
              return reply(404, { error: 'такого файла в хранилище нет' })
            }

            writeFileSync(target, content, 'utf-8')
            selfWrites.set(toPosix(target), Date.now())
            reply(200, { ok: true })
          } catch (error) {
            reply(500, { error: error instanceof Error ? error.message : String(error) })
          }
        })
      })
    },

    handleHotUpdate({ file }) {
      const writtenAt = selfWrites.get(file)
      if (writtenAt === undefined) return
      selfWrites.delete(file)
      if (Date.now() - writtenAt < SELF_WRITE_TTL) return []
    },
  }
}
