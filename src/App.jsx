import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Room from './pages/Room';
import { SocketProvider } from './context/SocketContext';

function App() {
  const [username, setUsername] = useState(sessionStorage.getItem('w2tch_username') || '');

  return (
    <Router>
      <SocketProvider>
        <div className="app-container">
          <Routes>
            <Route 
              path="/" 
              element={<Home username={username} setUsername={setUsername} />} 
            />
            <Route 
              path="/room/:roomId" 
              element={
                username ? (
                  <Room username={username} />
                ) : (
                  <Navigate to="/" replace />
                )
              } 
            />
          </Routes>
        </div>
      </SocketProvider>
    </Router>
  );
}

export default App;
