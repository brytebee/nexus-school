import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AdminSetupScreen } from './boot/AdminSetupScreen';
import { CloudConnectScreen } from './boot/CloudConnectScreen';
import { StartupChoiceScreen } from './boot/StartupChoiceScreen';
import './index.css';
import { SudoAuthProvider } from './context/SudoAuthContext';

const params = new URLSearchParams(window.location.search);
const isFirstRun = params.get('firstRun') === '1' || window.location.hash === '#firstRun';

type BootMode = 'choice' | 'fresh' | 'connect';

function Root() {
  const [mode, setMode] = useState<BootMode>('choice');

  if (isFirstRun) {
    if (mode === 'fresh')   return <AdminSetupScreen onBack={() => setMode('choice')} />;
    if (mode === 'connect') return <CloudConnectScreen onBack={() => setMode('choice')} />;
    return (
      <StartupChoiceScreen
        onStartFresh={() => setMode('fresh')}
        onConnectCloud={() => setMode('connect')}
      />
    );
  }

  return (
    <SudoAuthProvider>
      <App />
    </SudoAuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

