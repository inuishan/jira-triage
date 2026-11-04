import { useState, useEffect } from 'react';
import Home from './Home.jsx';
import Triage from './Triage.jsx';
import Results from './Results.jsx';

function parseRoute() {
  const hash = window.location.hash.slice(1); // Remove '#'

  // Routes: #/ → Home, #/s/:id → Triage, #/s/:id/results → Results
  if (!hash || hash === '/') {
    return { component: 'home' };
  }

  // Match #/s/:id/results
  const resultsMatch = hash.match(/^\/s\/(\d+)\/results$/);
  if (resultsMatch) {
    return { component: 'results', sessionId: Number(resultsMatch[1]) };
  }

  // Match #/s/:id
  const triageMatch = hash.match(/^\/s\/(\d+)$/);
  if (triageMatch) {
    return { component: 'triage', sessionId: Number(triageMatch[1]) };
  }

  // Unknown route → Home
  return { component: 'home' };
}

export default function App() {
  const [route, setRoute] = useState(parseRoute());

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseRoute());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  let component;
  if (route.component === 'results') {
    component = <Results sessionId={route.sessionId} />;
  } else if (route.component === 'triage') {
    component = <Triage sessionId={route.sessionId} />;
  } else {
    component = <Home />;
  }

  return (
    <div className="app">
      {component}
    </div>
  );
}
