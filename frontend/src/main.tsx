import React from 'react';
import ReactDOM from 'react-dom/client';
import ExperienceRouter from './experience/ExperienceRouter';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ExperienceRouter />
    </ErrorBoundary>
  </React.StrictMode>,
);
