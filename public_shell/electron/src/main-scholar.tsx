import React from 'react';
import ReactDOM from 'react-dom/client';
import { NexusScholar } from './views/NexusScholar';
import './index.css';

const rootEl = document.getElementById('root-scholar');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <NexusScholar />
    </React.StrictMode>
  );
}
