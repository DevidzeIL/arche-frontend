/// <reference types="vite/client" />

declare global {
  interface Window {
    Buffer: typeof import('buffer').Buffer;
  }
  var Buffer: typeof import('buffer').Buffer;
  var global: typeof globalThis;
}