import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Bundled with the app (no font CDN), so it works offline; Indic scripts fall back to the system's Noto fonts.
import '@fontsource-variable/plus-jakarta-sans';
import './i18n/index.js';
import './index.css';
import App from './App.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Do not hammer the server retrying client errors like 401/404/422.
      retry: (count, error) => count < 2 && !(error?.response?.status >= 400 && error.response.status < 500),
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
