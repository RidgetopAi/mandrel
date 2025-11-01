import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSentry } from './config/sentry';
import './api/client';
import './index.css';

// Initialize Sentry for error reporting and performance monitoring
initSentry();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <App />
);
