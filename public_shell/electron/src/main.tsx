import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AdminSetupScreen } from './boot/AdminSetupScreen';
import './index.css';
import { SudoAuthProvider } from './context/SudoAuthContext';

const params = new URLSearchParams(window.location.search);
const isFirstRun = params.get('firstRun') === '1';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isFirstRun ? (
      <AdminSetupScreen />
    ) : (
      <SudoAuthProvider>
        <App />
      </SudoAuthProvider>
    )}
  </React.StrictMode>,
);
