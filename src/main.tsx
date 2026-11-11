import '@fontsource-variable/manrope';
import './styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ApiFail } from './lib/api';
import { initTelegram } from './lib/tg';
import { initTheme } from './lib/theme';
import { Toaster } from './ui';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Ошибки доступа и валидации повторять бессмысленно.
      retry: (count, error) => !(error instanceof ApiFail && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

// SDK Telegram должен прочитать параметры запуска из адреса раньше, чем роутер его изменит.
void initTelegram().then(() => {
  initTheme();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </StrictMode>,
  );
});
