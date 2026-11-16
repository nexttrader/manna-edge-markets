import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { VoiceProvider } from './context/VoiceContext';
import { SignalNotificationProvider } from './context/SignalNotificationContext';
import { SignalNotificationToastContainer } from './components/SignalNotificationToast';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <VoiceProvider>
              <SignalNotificationProvider>
                <App />
                <SignalNotificationToastContainer />
              </SignalNotificationProvider>
            </VoiceProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
