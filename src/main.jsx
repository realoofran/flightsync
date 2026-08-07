import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AppSettingsProvider } from './lib/AppSettingsContext.jsx';
import { SyncStateProvider } from './lib/SyncStateContext.jsx';
import './styles/tokens.css';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div className="mesh-blobs">
      <span className="mesh-blob mesh-blob--1" />
      <span className="mesh-blob mesh-blob--2" />
      <span className="mesh-blob mesh-blob--3" />
    </div>
    <div className="grain" />
    <ErrorBoundary>
      <AppSettingsProvider>
        <SyncStateProvider>
          <App />
        </SyncStateProvider>
      </AppSettingsProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
