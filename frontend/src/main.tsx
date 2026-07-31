import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { VoiceProvider } from './context/VoiceContext';
import { SignalNotificationProvider } from './context/SignalNotificationContext';
import { SignalNotificationToastContainer } from './components/SignalNotificationToast';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <VoiceProvider>
            <SignalNotificationProvider>
              <App />
              <SignalNotificationToastContainer />
            </SignalNotificationProvider>
          </VoiceProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
