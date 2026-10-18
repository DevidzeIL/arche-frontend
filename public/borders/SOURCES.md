# Исторические границы: источники и лицензии

Файлы в этой папке собраны скриптом `scripts/build-borders.mjs` (`pnpm borders`)
из открытых наборов. Геометрия упрощена (шаг ~5 км), порезана по векам
и переведена в TopoJSON; русские названия добавлены из Wikidata.

## `c/` — государства

Cliopatria, Seshat Global History Databank, v0.2.1
https://github.com/Seshat-Global-History-Databank/cliopatria

Лицензия: Creative Commons Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/

Изменения: упрощение геометрии, нарезка по векам, отбор строк типа POLITY,
русские названия из Wikidata.

## `bg/` — народы и культуры

historical-basemaps, André Ourednik, коммит da7a4b7
https://github.com/aourednik/historical-basemaps

Лицензия: GNU General Public License v3.0 (GPL-3.0)
https://www.gnu.org/licenses/gpl-3.0.html

Файлы `bg/` — производные от этого набора (упрощение, отбор именованных
областей, русские названия для части из них) и распространяются на тех же
условиях, под GPL-3.0.

## `index.json` — названия

Русские названия и ссылки на статьи Википедии — из Wikidata, CC0.
https://www.wikidata.org/

Ручные поправки к названиям и недостающие государства — в хранилище,
`arche-vault/_borders/`.
