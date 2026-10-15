// Arranque común de cada página: estilos y React montado en #root.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

export function mount(Page) {
  createRoot(document.getElementById('root')).render(<StrictMode><Page /></StrictMode>);
}
