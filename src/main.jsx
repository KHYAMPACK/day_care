import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/dashboard.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { TenantProvider } from './context/TenantContext.jsx';

registerSW({ immediate: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TenantProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </TenantProvider>
  </StrictMode>
);
