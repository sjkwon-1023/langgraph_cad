import React from 'react';
import { createRoot } from 'react-dom/client';
import 'reactflow/dist/style.css';

import App from './app/App.jsx';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('The #root container is missing.');
}

createRoot(container).render(<App />);
