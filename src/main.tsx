import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA：仅生产环境注册 Service Worker（离线缓存 + 通知点击）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // BASE_URL 在 GitHub Pages 子路径部署时为 /chronos-ai/，本地开发为 /
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((registration) => {
      // 检测到新版本时通知旧 SW 让位，页面下次加载即用新缓存
      registration.onupdatefound = () => {
        const installing = registration.installing;
        if (installing) {
          installing.onstatechange = () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' });
            }
          };
        }
      };
    }).catch(() => {
      /* 注册失败不影响应用使用 */
    });
  });
}
