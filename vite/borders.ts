import path from 'path'
import { existsSync, readdirSync, readFileSync } from 'fs'
import type { Plugin } from 'vite'
import { feature } from 'topojson-client'
import { geoArea } from 'd3-geo'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import {
  bboxOf,
  distanceKm,
  nameAt,
  patchKey,
  polityKey,
  renameBreaks,
  rewind,
  type Area,
  type BordersIndex,
  type NameOverrides,
  type PatchProperties,
  type Sovereignty,
  type SovereigntySegment,
} from '../src/arche/bordersData'

/**
 * Чья это была земля: для каждого города хранилища — какому государству
 * он принадлежал в каждый год.
 *
 * Считается здесь, а не в браузере: для ответа нужны границы всех веков
 * сразу (10 МБ), а сам ответ — несколько десятков отрезков на место.
 * Страница Канта показывает «Кёнигсберг · Королевство Пруссия», не скачивая
 * карту мира за пять тысяч лет.
 *
 * Только для городов. У «Германии» точка на глобусе — условный центр,
 * и ответ «в 1781 году здесь было Саксен-Веймарское герцогство» был бы
 * правдой про Тюрингию и неправдой про Германию.
 *
 * Пересчитывается, когда меняются места, заплатки или поправки названий.
 */

const VIRTUAL = 'virtual:arche-borders'
const RESOLVED = '\0' + VIRTUAL

/** Насколько далеко от упрощённой границы город ещё считается своим */
const TOLERANCE_KM = 25
const YEAR_MIN = -3400
const YEAR_MAX = 2024

interface Row {
  key: string
  name: string
  ru?: string
  q?: string
  union: boolean
  from: number
  to: number
  area: Area
  bbox: [number, number, number, number]
  /** Площадь в стерадианах: из двух подходящих выбираем меньшее, более конкретное */
  size: number
  src: 'clio' | 'patch' | 'bg'
  /** Только у заплаток: в какое объединение входила земля (см. PatchProperties.within) */
  within?: string
}

interface CityPlace {
  id: string
  lon: number
  lat: number
}

const toPosix = (p: string) => p.split(path.sep).join('/')

function readTopology(file: string): Area[] {
  const topology = JSON.parse(readFileSync(file, 'utf8')) as Topology
  const object = Object.values(topology.objects)[0] as GeometryCollection
  const collection = feature(topology, object) as unknown as FeatureCollection<Polygon | MultiPolygon>
  return collection.features.filter((f) => f.geometry).map((f) => rewind(f))
}

function makeRow(area: Area, fields: Omit<Row, 'area' | 'bbox' | 'size'>): Row {
  return { ...fields, area, bbox: bboxOf(area), size: geoArea(area) }
}

function loadStaticRows(bordersDir: string): { index: BordersIndex; rows: Row[] } {
  const index = JSON.parse(readFileSync(path.join(bordersDir, 'index.json'), 'utf8')) as BordersIndex
  const rows: Row[] = []
  const seen = new Set<string>()

  // Строка, пережившая смену века, лежит в нескольких файлах — берём один раз
  for (const from of index.chunks) {
    for (const area of readTopology(path.join(bordersDir, 'c', `${from}.json`))) {
      const { p, f, t } = area.properties as { p: number; f: number; t: number }
      const id = `${p}|${f}|${t}`
      if (seen.has(id)) continue
      seen.add(id)
      const entry = index.polities[p]
      rows.push(
        makeRow(area, {
          key: polityKey(entry),
          name: entry.n,
          ru: entry.ru,
          q: entry.q,
          union: entry.u === 1,
          from: f,
          to: t,
          src: 'clio',
        })
      )
    }
  }

  // Фон — срезы на отдельные годы; срез действует до следующего
  index.bg.forEach((year, i) => {
    const next = index.bg[i + 1] ?? YEAR_MAX + 1
    if (next <= YEAR_MIN) return
    for (const area of readTopology(path.join(bordersDir, 'bg', `${year}.json`))) {
      const { n, r } = area.properties as { n: string; r?: string }
      rows.push(
        makeRow(area, {
          key: `bg:${n}`,
          name: n,
          ru: r,
          union: false,
          from: year,
          to: next - 1,
          src: 'bg',
        })
      )
    }
  })

  return { index, rows }
}

function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback
}

function loadPatches(file: string): FeatureCollection<Polygon | MultiPolygon, PatchProperties> {
  return readJson(file, { type: 'FeatureCollection', features: [] })
}

/** Города с координатами; разбор как в scripts/lint-vault.mjs — без YAML-парсера */
function loadCities(vaultRoot: string): CityPlace[] {
  const out: CityPlace[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('_')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.md')) {
        const front = readFileSync(full, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
        const field = (name: string) =>
          front.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm'))?.[1]?.replace(/^["']|["']$/g, '')
        if (field('type') !== 'place' || field('scale') === 'region') continue
        const id = field('id')
        const lat = Number(field('lat'))
        const lon = Number(field('lon'))
        if (id && Number.isFinite(lat) && Number.isFinite(lon)) out.push({ id, lat, lon })
      }
    }
  }
  walk(vaultRoot)
  return out
}

interface Candidate {
  row: Row
  distance: number
}

/** Ближе всего — внутри; из подходящих одинаково — самое маленькое, то есть конкретное */
function pick(candidates: Candidate[]): Candidate | null {
  if (candidates.length === 0) return null
  const inside = candidates.filter((c) => c.distance === 0)
  const pool = inside.length > 0 ? inside : candidates
  return pool.reduce((best, c) =>
    c.distance < best.distance || (c.distance === best.distance && c.row.size < best.row.size)
      ? c
      : best
  )
}

function sovereigntyOf(place: CityPlace, rows: Row[], names: NameOverrides): SovereigntySegment[] {
  const point: [number, number] = [place.lon, place.lat]
  const padLat = TOLERANCE_KM / 111
  const padLon = padLat / Math.max(0.2, Math.cos((place.lat * Math.PI) / 180))

  const candidates: Candidate[] = []
  for (const row of rows) {
    const [w, s, e, n] = row.bbox
    if (place.lon < w - padLon || place.lon > e + padLon) continue
    if (place.lat < s - padLat || place.lat > n + padLat) continue
    const distance = distanceKm(row.area, point)
    if (distance <= TOLERANCE_KM) candidates.push({ row, distance })
  }

  const breaks = new Set<number>([YEAR_MIN, YEAR_MAX + 1])
  for (const { row } of candidates) {
    breaks.add(Math.max(YEAR_MIN, row.from))
    breaks.add(Math.min(YEAR_MAX + 1, row.to + 1))
    for (const year of renameBreaks(names, row.name)) breaks.add(year)
  }
  const years = [...breaks].filter((y) => y >= YEAR_MIN && y <= YEAR_MAX + 1).sort((a, b) => a - b)

  const segments: SovereigntySegment[] = []
  for (let i = 0; i < years.length - 1; i++) {
    const from = years[i]
    const to = years[i + 1] - 1
    const active = candidates.filter((c) => c.row.from <= from && from <= c.row.to)

    // Заплатка важнее набора: её пишут именно там, где набор ошибается
    const chosen =
      pick(active.filter((c) => c.row.src === 'patch')) ??
      pick(active.filter((c) => c.row.src === 'clio' && !c.row.union)) ??
      pick(active.filter((c) => c.row.src === 'bg'))
    // У народов и культур фона объединений не бывает, у заплатки — только явное
    const unions = active.filter((c) => c.row.union && c.distance === 0)
    const union =
      chosen?.row.src === 'clio'
        ? pick(unions)
        : chosen?.row.src === 'patch' && chosen.row.within
          ? pick(unions.filter((c) => c.row.key === chosen.row.within))
          : null

    const segment: SovereigntySegment = { f: from, t: to, k: null }
    if (chosen) {
      const row = chosen.row
      // Английское название и элемент Wikidata не выгружаем: модуль грузится
      // с каждой страницей заметки, а nameAt и так всегда даёт название
      segment.k = row.key
      segment.ru = nameAt(names, row.name, from, row.ru)
      segment.src = row.src
      if (chosen.distance > 0) segment.near = 1
      // Объединение с тем же названием («Королевство Франция» над самим
      // королевством и его вассалами) ничего не добавляет к ответу
      const unionRu = union ? nameAt(names, union.row.name, from, union.row.ru) : null
      if (union && unionRu && unionRu !== segment.ru) {
        segment.u = { k: union.row.key, ru: unionRu }
      }
    }

    const last = segments[segments.length - 1]
    const same =
      last &&
      last.k === segment.k &&
      last.ru === segment.ru &&
      last.near === segment.near &&
      last.u?.k === segment.u?.k &&
      last.u?.ru === segment.u?.ru
    if (same) last.t = to
    else segments.push(segment)
  }

  // Пустота в начале — просто «ещё нет данных», хранить её незачем
  while (segments.length > 0 && segments[0].k === null) segments.shift()
  return segments
}

export function archeBordersPlugin(): Plugin {
  const root = process.cwd()
  const vaultRoot = path.resolve(root, 'arche-vault')
  const bordersDir = path.resolve(root, 'public', 'borders')
  const patchesFile = path.join(vaultRoot, '_borders', 'patches.geojson')
  const namesFile = path.join(vaultRoot, '_borders', 'names.json')

  let staticRows: Row[] | null = null
  let code: string | null = null

  const build = (): string => {
    if (!existsSync(path.join(bordersDir, 'index.json'))) {
      // Границы ещё не собраны (pnpm borders) — приложение работает без них
      return 'export const patches = { type: "FeatureCollection", features: [] }; export const names = {}; export const sovereignty = {};'
    }

    staticRows ??= loadStaticRows(bordersDir).rows
    const patches = loadPatches(patchesFile)
    const names = readJson<NameOverrides>(namesFile, {})

    const patchRows = patches.features
      .filter((f) => f.geometry)
      .map((f) =>
        makeRow(rewind(structuredClone(f) as Area), {
          key: f.properties.polity ?? patchKey(f.properties.name),
          name: f.properties.name,
          ru: f.properties.ru,
          q: f.properties.wikidata,
          union: false,
          from: f.properties.from,
          to: f.properties.to,
          src: 'patch',
          within: f.properties.within,
        })
      )
    const rows = [...staticRows, ...patchRows]

    const sovereignty: Sovereignty = {}
    for (const place of loadCities(vaultRoot)) {
      sovereignty[place.id] = sovereigntyOf(place, rows, names)
    }

    return [
      `export const patches = ${JSON.stringify(patches)};`,
      `export const names = ${JSON.stringify(names)};`,
      `export const sovereignty = ${JSON.stringify(sovereignty)};`,
    ].join('\n')
  }

  return {
    name: 'arche-borders',

    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null
    },

    load(id) {
      if (id !== RESOLVED) return null
      code ??= build()
      return code
    },

    handleHotUpdate({ file, server }) {
      const posix = toPosix(file)
      if (!posix.startsWith(toPosix(vaultRoot) + '/')) return
      const mod = server.moduleGraph.getModuleById(RESOLVED)
      if (!mod) return

      const next = build()
      if (next === code) return
      code = next
      server.moduleGraph.invalidateModule(mod)

      // Правка заметки и так перезагружает страницу (заметки вшиты через
      // import.meta.glob), а файлы _borders никто не импортирует — для них
      // перезагрузку просим сами
      if (posix.includes('/_borders/')) server.ws.send({ type: 'full-reload' })
    },
  }
}
