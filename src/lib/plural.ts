/**
 * Русское склонение числительных.
 *
 * Проверки вида `n === 1 ? 'заметка' : 'заметок'` дают «2 заметок»
 * и «7 раза». Форм три, и выбор идёт по двум последним цифрам:
 * 11–14 всегда берут последнюю форму, дальше решает последняя цифра.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count) % 100;
  if (n >= 11 && n <= 14) return many;

  switch (n % 10) {
    case 1:
      return one;
    case 2:
    case 3:
    case 4:
      return few;
    default:
      return many;
  }
}

/** Число вместе с подходящей формой слова: «7 раз», «2 заметки» */
export function withPlural(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  return `${count} ${plural(count, one, few, many)}`;
}
