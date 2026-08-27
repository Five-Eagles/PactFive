import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Vite 진입점 — App을 렌더링만 한다 (app/web/AGENTS.md "진입점 구조").
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root 엘리먼트를 찾을 수 없습니다.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
