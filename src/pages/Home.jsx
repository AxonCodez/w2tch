import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { MonitorPlay, Users, Lock, Plus, LogIn } from 'lucide-react';
import './Home.css';

const Home = ({ username, setUsername }) => {
  const [nameInput, setNameInput] = useState(username);
  const [rooms, setRooms] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newRoomId, setNewRoomId] = useState('');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [joinRoomIdInput, setJoinRoomIdInput] = useState('');
  
  const socket = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    socket.emit('get-rooms');

    socket.on('update-room-list', (roomList) => {
      setRooms(roomList);
    });

    socket.on('room-check-result', ({ exists, hasPassword, roomId }) => {
      if (!exists) {
        alert('Room does not exist.');
        return;
      }
      handleJoinRoom(roomId, hasPassword);
    });

    return () => {
      socket.off('update-room-list');
      socket.off('room-check-result');
    };
  }, [socket]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (nameInput.trim()) {
      setUsername(nameInput.trim());
      sessionStorage.setItem('w2tch_username', nameInput.trim());
    }
  };

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!newRoomId.trim()) return;
    
    // The actual creation happens when joining
    navigate(`/room/${newRoomId}?isCreator=true${newRoomPassword ? `&pwd=${newRoomPassword}` : ''}`);
  };

  const handleJoinRoom = (roomId, hasPassword) => {
    if (hasPassword) {
      const pwd = prompt('Enter room password:');
      if (pwd === null) return;
      navigate(`/room/${roomId}?pwd=${pwd}`);
    } else {
      navigate(`/room/${roomId}`);
    }
  };

  if (!username) {
    return (
      <div className="home-container login-view">
        <div className="glass-panel login-card animate-fade-in">
          <div className="logo-container">
            <MonitorPlay size={48} className="logo-icon" />
            <h1 className="logo-text">W2tch</h1>
          </div>
          <p className="login-subtitle">Join the ultimate watch party experience.</p>
          
          <form onSubmit={handleLogin} className="login-form">
            <input 
              type="text" 
              placeholder="Enter your username" 
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              autoFocus
              className="styled-input"
            />
            <button type="submit" className="primary-btn">
              <LogIn size={20} />
              <span>Enter</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <header className="home-header">
        <div className="logo-container">
          <MonitorPlay size={32} className="logo-icon" />
          <h1 className="logo-text">W2tch</h1>
        </div>
        <div className="user-profile">
          <div className="avatar">{username.charAt(0).toUpperCase()}</div>
          <span className="username">{username}</span>
          <button 
            className="text-btn" 
            onClick={() => {
              setUsername('');
              sessionStorage.removeItem('w2tch_username');
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="home-main">
        <div className="main-header">
          <h2>Active Rooms</h2>
          <div className="header-actions">
            <button className="secondary-btn" onClick={() => setShowJoinModal(true)}>
              <LogIn size={20} />
              <span>Join via Code</span>
            </button>
            <button className="primary-btn" onClick={() => setShowCreateModal(true)}>
              <Plus size={20} />
              <span>Create Room</span>
            </button>
          </div>
        </div>

        <div className="room-grid">
          {rooms.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-wrapper">
                <Users size={48} />
              </div>
              <h3>No active rooms</h3>
              <p>Be the first to create a watch party!</p>
            </div>
          ) : (
            rooms.map((room) => (
              <div key={room.id} className="glass-panel room-card animate-fade-in" onClick={() => handleJoinRoom(room.id, room.hasPassword)}>
                <div className="room-card-header">
                  <h3 className="room-title">{room.title || `Room ${room.id.substring(0, 4)}`}</h3>
                  {room.hasPassword && <Lock size={16} className="lock-icon" />}
                </div>
                {room.watching && room.watching !== 'Nothing specified' && (
                  <div className="room-watching-tag" style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                    Watching: {room.watching}
                  </div>
                )}
                <div className="room-card-footer">
                  <div className="user-count">
                    <Users size={16} />
                    <span>{room.userCount} / {room.memberLimit || 10} watching</span>
                  </div>
                  <button className="join-btn">Join</button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="glass-panel modal-content animate-fade-in" onClick={e => e.stopPropagation()}>
            <h2>Create New Room</h2>
            <form onSubmit={handleCreateRoom} className="create-form">
              <div className="form-group">
                <label>Room ID</label>
                <input 
                  type="text" 
                  placeholder="e.g. movie-night" 
                  value={newRoomId}
                  onChange={(e) => setNewRoomId(e.target.value)}
                  className="styled-input"
                  required
                />
              </div>
              <div className="form-group">
                <label>Password (Optional)</label>
                <input 
                  type="password" 
                  placeholder="Leave blank for public" 
                  value={newRoomPassword}
                  onChange={(e) => setNewRoomPassword(e.target.value)}
                  className="styled-input"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="glass-panel modal-content animate-fade-in" onClick={e => e.stopPropagation()}>
            <h2>Join Room via Code</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Enter the unique Room ID shared by your friend to join their watch party.
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const id = joinRoomIdInput.trim();
              if (id) {
                // Check if we already have this room in our list
                const knownRoom = rooms.find(r => r.id === id);
                if (knownRoom) {
                  handleJoinRoom(id, knownRoom.hasPassword);
                } else {
                  // If unknown, check with server
                  socket.emit('check-room', id);
                }
                setShowJoinModal(false);
                setJoinRoomIdInput('');
              }
            }} className="create-form">
              <div className="form-group">
                <label>Room ID</label>
                <input 
                  type="text" 
                  placeholder="Enter Room ID" 
                  value={joinRoomIdInput}
                  onChange={(e) => setJoinRoomIdInput(e.target.value)}
                  className="styled-input"
                  required
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={() => setShowJoinModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Join Party</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
