import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('#root를 찾을 수 없습니다');
createRoot(container).render(<App />);
