/**
 * Цвета темы заданы CSS-переменными в src/index.css как готовые oklch(...).
 *
 * Если отдать Tailwind такую переменную голой (`border: 'var(--border)'`),
 * он не умеет подмешать в неё прозрачность и просто НЕ СОЗДАЁТ классы вида
 * `bg-card/60` или `bg-border/40`. Правила нет — фон получается прозрачный,
 * и элемент молча исчезает: так пропадали дорожки шкал прогресса и клетки
 * календаря занятий, хотя в разметке они были.
 *
 * withAlpha подставляет запрошенную прозрачность через color-mix. Без
 * модификатора Tailwind подставляет `1`, и цвет остаётся ровно исходным.
 */
const withAlpha = (variable) =>
  `color-mix(in oklab, var(${variable}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
  	extend: {
  		colors: {
  			border: withAlpha('--border'),
  			input: withAlpha('--input'),
  			ring: withAlpha('--ring'),
  			background: withAlpha('--background'),
  			foreground: withAlpha('--foreground'),
  			primary: {
  				DEFAULT: withAlpha('--primary'),
  				foreground: withAlpha('--primary-foreground')
  			},
  			secondary: {
  				DEFAULT: withAlpha('--secondary'),
  				foreground: withAlpha('--secondary-foreground')
  			},
  			destructive: {
  				DEFAULT: withAlpha('--destructive'),
  				foreground: withAlpha('--destructive-foreground')
  			},
  			muted: {
  				DEFAULT: withAlpha('--muted'),
  				foreground: withAlpha('--muted-foreground')
  			},
  			accent: {
  				DEFAULT: withAlpha('--accent'),
  				foreground: withAlpha('--accent-foreground')
  			},
  			card: {
  				DEFAULT: withAlpha('--card'),
  				foreground: withAlpha('--card-foreground')
  			},
  			popover: {
  				DEFAULT: withAlpha('--popover'),
  				foreground: withAlpha('--popover-foreground')
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [require('@tailwindcss/typography')],
}
