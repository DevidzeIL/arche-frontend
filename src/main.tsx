import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { Buffer } from 'buffer'

// Полифилл для Buffer в браузере
// @ts-ignore - Buffer polyfill для браузера
window.Buffer = Buffer
// @ts-ignore
globalThis.Buffer = Buffer

// Инициализация темы при загрузке из zustand persist
const initTheme = () => {
  try {
    // Пытаемся получить тему из zustand persist storage
    const stored = localStorage.getItem('arche-storage')
    if (stored) {
      const parsed = JSON.parse(stored)
      // Zustand persist сохраняет в формате { state: { settings: { theme: ... } } }
      const theme = parsed?.state?.settings?.theme || parsed?.settings?.theme || 'dark'
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(theme)
      return
    }
  } catch (e) {
    // Failed to parse theme from storage - skip silently
  }
  
  // Fallback: темная тема по умолчанию
  const theme = 'dark'
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(theme)
}

initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
