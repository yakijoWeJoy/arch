import { useState } from 'react';
import { getUser, setUser, useModel } from './api';
import { ErrorBanner, Modal, useHashRoute } from './components/ui';
import { CatalogPage } from './pages/CatalogPage';
import { MapPage } from './pages/MapPage';
import { ScenariosPage } from './pages/ScenariosPage';

export function App() {
  const [route, go] = useHashRoute();
  const { isLoading, error } = useModel();
  const [user, setUserState] = useState(getUser());
  const [askUser, setAskUser] = useState(!user);
  const [nameInput, setNameInput] = useState(user);
  const page = route[0] ?? 'scenarios';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◇</span> Arch Modeler
        </div>
        <nav>
          <a href="#/scenarios" className={page === 'scenarios' ? 'on' : ''}>
            תרחישים
          </a>
          <a href="#/catalog" className={page === 'catalog' ? 'on' : ''}>
            קטלוג
          </a>
          <a href="#/map" className={page === 'map' ? 'on' : ''}>
            מפת קשרים
          </a>
        </nav>
        <span className="grow" />
        <a href="/api/export/json" className="muted small-text" download>
          ⤓ יצוא JSON
        </a>
        <button className="user-btn" onClick={() => setAskUser(true)} title="שם המשתמש שיירשם בעדכונים">
          👤 {user || 'אורח'}
        </button>
      </header>

      {error && <ErrorBanner error={error} />}
      {isLoading ? (
        <div className="empty-state">טוען…</div>
      ) : page === 'catalog' ? (
        <CatalogPage kind={route[1]} id={route[2]} />
      ) : page === 'map' ? (
        <MapPage />
      ) : (
        <ScenariosPage selectedId={route[1]} go={go} />
      )}

      {askUser && (
        <Modal title="מי עורך?" onClose={() => setAskUser(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              setUser(nameInput.trim());
              setUserState(nameInput.trim());
              setAskUser(false);
            }}
          >
            <p className="muted">השם נשמר בדפדפן הזה ונרשם ליד כל שינוי, כדי ששני העורכים יידעו מי שינה מה.</p>
            <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="השם שלך" />
            <div className="form-actions">
              <button className="btn primary" type="submit" disabled={!nameInput.trim()}>
                המשך
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
