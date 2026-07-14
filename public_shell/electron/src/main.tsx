import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AdminSetupScreen } from './boot/AdminSetupScreen';
import { StartupChoiceScreen } from './boot/StartupChoiceScreen';
import './index.css';
import { SudoAuthProvider } from './context/SudoAuthContext';

const params = new URLSearchParams(window.location.search);
const isFirstRun = params.get('firstRun') === '1' || window.location.hash === '#firstRun';

function Root() {
  // During firstRun the user first picks Start Fresh or Restore Backup.
  // Only after clicking "Start Fresh" do we advance to AdminSetupScreen.
  const [setupStarted, setSetupStarted] = useState(false);

  if (isFirstRun) {
    if (!setupStarted) {
      return <StartupChoiceScreen onStartFresh={() => setSetupStarted(true)} />;
    }
    return <AdminSetupScreen />;
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

