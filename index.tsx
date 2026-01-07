
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

console.log("--> [index.tsx] Iniciando carga del punto de entrada");

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }

  console.log("--> [index.tsx] Elemento root encontrado, creando root de React");
  const root = ReactDOM.createRoot(rootElement);
  
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("--> [index.tsx] Render inicial disparado correctamente");
} catch (error) {
  console.error("--> [FATAL ERROR] Fallo en index.tsx:", error);
}
