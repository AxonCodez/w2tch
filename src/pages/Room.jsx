import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Send, Smile, Info, Users, Minimize2, Maximize2, Settings, Trash2, X, Expand, Shrink, MessageSquare } from 'lucide-react';
import './Room.css';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const Room = ({ username }) => {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const socket = useSocket();

  const isCreator = searchParams.get('isCreator') === 'true';
  const password = searchParams.get('pwd');

  const [peers, setPeers] = useState({});
  const [participants, setParticipants] = useState({});
  const [localStream, setLocalStream] = useState(new MediaStream());
  
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteSharers, setRemoteSharers] = useState({});
  const [remoteCameraStatus, setRemoteCameraStatus] = useState({});
  const [micOn, setMicOn] = useState(false); 
  const [videoOn, setVideoOn] = useState(false); 
  
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [reactions, setReactions] = useState([]);
  const [networkStats, setNetworkStats] = useState({ ping: 0, quality: 'Good' });
  const [isPipCollapsed, setIsPipCollapsed] = useState(false);
  const [volumes, setVolumes] = useState({}); // { userId: isTalking }
  const [isPipHorizontal, setIsPipHorizontal] = useState(false);

  // Setup & Room Info State
  const [setupComplete, setSetupComplete] = useState(false);
  const [avatarSeed, setAvatarSeed] = useState(username);
   const [avatarStyle, setAvatarStyle] = useState('adventurer');
  const [roomTitleInput, setRoomTitleInput] = useState('Movie Night');
  const [roomDescriptionInput, setRoomDescriptionInput] = useState('Welcome to our watch party!');
  
  const [roomInfo, setRoomInfo] = useState({ title: '', watching: '', memberLimit: 10, creatorId: '', description: '' });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ title: '', watching: '', memberLimit: 10 });
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isChatFloatingOpen, setIsChatFloatingOpen] = useState(false);

  // Fullscreen toast stack: [{ id, username, message }]
  const [chatToasts, setChatToasts] = useState([]);
  const chatInputFocusRef = useRef(false);
  const chatInputRef = useRef(null);

  const audioContextRef = useRef(null);
  const audioDestinationRef = useRef(null);
  const localVideoRef = useRef();
  const peerConnections = useRef({}); 
  const chatEndRef = useRef(null);
  const roomContainerRef = useRef(null);

  const localVideoCallback = useCallback((node) => {
    if (node) {
      node.srcObject = localStream;
      localVideoRef.current = node;
    }
  }, [localStream]);

  useEffect(() => {
    if (!socket || !setupComplete) return;

    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

    // Join room
    socket.emit('join-room', { 
      roomId, password, username, isCreator,
      avatar: `${avatarStyle}/svg?seed=${avatarSeed}&backgroundColor=8b5cf6`,
      title: roomTitleInput,
      description: roomDescriptionInput
    });

    // Socket Events
    socket.on('error', (msg) => {
      alert(msg);
      navigate('/');
    });

    socket.on('room-joined', ({ users, roomInfo, sharing, cameras }) => {
      setParticipants(users);
      if (roomInfo) setRoomInfo(roomInfo);
      if (sharing) setRemoteSharers(sharing);
      if (cameras) setRemoteCameraStatus(cameras);
      
      // Create offer to all existing users
      Object.keys(users).forEach(userId => {
        if (userId !== socket.id) {
          createPeerConnection(userId, true);
        }
      });
    });

    socket.on('user-connected', ({ userId, username, avatar }) => {
      setParticipants(prev => ({ ...prev, [userId]: { id: userId, username, avatar } }));
    });

    socket.on('user-disconnected', (userId) => {
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].close();
        delete peerConnections.current[userId];
      }
      setPeers(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setParticipants(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setRemoteSharers(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setRemoteCameraStatus(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    });

    socket.on('offer', async ({ sender, sdp }) => {
      let pc = peerConnections.current[sender];
      if (!pc) {
        pc = createPeerConnection(sender, false);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      
      // Force transceivers to sendrecv so we can replaceTrack later even if we start with no tracks
      pc.getTransceivers().forEach(t => {
        t.direction = 'sendrecv';
      });

      // Attach any currently active tracks
      setLocalStream(currentStream => {
        currentStream.getTracks().forEach(track => {
          const transceiver = pc.getTransceivers().find(t => t.receiver.track.kind === track.kind);
          if (transceiver) transceiver.sender.replaceTrack(track);
        });
        return currentStream;
      });

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { target: sender, sdp: pc.localDescription });
    });

    socket.on('answer', async ({ sender, sdp }) => {
      const pc = peerConnections.current[sender];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    });

    socket.on('ice-candidate', async ({ sender, candidate }) => {
      const pc = peerConnections.current[sender];
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on('receive-chat', (msg) => {
      if (msg.roomId !== roomId) return; // Ignore messages from other rooms
      setMessages(prev => [...prev, msg]);
      // Push toast when in fullscreen and user isn't typing
      if (document.fullscreenElement && !chatInputFocusRef.current) {
        const id = Date.now() + Math.random();
        setChatToasts(prev => [...prev, { id, username: msg.username, message: msg.message }]);
        setTimeout(() => {
          setChatToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
      }
    });

    socket.on('receive-reaction', ({ reaction, roomId: rId }) => {
      if (rId !== roomId) return; // Ignore reactions from other rooms
      const newReact = { id: Date.now() + Math.random(), emoji: reaction };
      setReactions(prev => [...prev, newReact]);
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== newReact.id));
      }, 3000);
    });

    socket.on('screen-share-status', ({ userId, isSharing }) => {
      setRemoteSharers(prev => ({ ...prev, [userId]: isSharing }));
    });

    socket.on('camera-status', ({ userId, isOn }) => {
      setRemoteCameraStatus(prev => ({ ...prev, [userId]: isOn }));
      if (!isOn) {
        setPeers(prev => {
          const stream = prev[userId];
          if (stream) {
            stream.getVideoTracks().forEach(t => stream.removeTrack(t));
            return { ...prev, [userId]: new MediaStream(stream.getTracks()) };
          }
          return prev;
        });
      }
    });

    socket.on('room-settings-updated', (info) => {
      setRoomInfo(prev => ({ ...prev, ...info }));
    });

    socket.on('room-deleted', () => {
      alert("This room has been closed by the host.");
      navigate('/');
    });

    return () => {
      socket.emit('leave-room', { roomId });
      socket.off('error');
      socket.off('room-joined');
      socket.off('user-connected');
      socket.off('user-disconnected');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('receive-chat');
      socket.off('receive-reaction');
      socket.off('screen-share-status');
      socket.off('camera-status');
      socket.off('room-settings-updated');
      socket.off('room-deleted');
      
      // Stop all local tracks
      setLocalStream(prev => {
        prev.getTracks().forEach(track => track.stop());
        return prev;
      });
      Object.values(peerConnections.current).forEach(pc => pc.close());
    };
  }, [socket, roomId, password, username, isCreator, navigate, setupComplete]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleFsChange = () => {
      const entering = !!document.fullscreenElement;
      setIsFullscreen(entering);
      if (entering) {
        setIsChatFloatingOpen(false);
        setIsPipCollapsed(true);
      } else {
        setIsChatFloatingOpen(true);
        setIsPipCollapsed(false);
        setChatToasts([]);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Drag handlers removed — PiP is fixed at bottom-right

  useEffect(() => {
    const interval = setInterval(() => {
      setNetworkStats({
        ping: Math.floor(Math.random() * 20) + 10,
        quality: isScreenSharing ? 'Lossless Max' : '1080p HD'
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [isScreenSharing]);

  const createPeerConnection = (targetId, isInitiator) => {
    const pc = new RTCPeerConnection(configuration);
    peerConnections.current[targetId] = pc;

    if (isInitiator) {
      // Initiator creates the transceivers
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });

      // Attach any currently active tracks
      setLocalStream(currentStream => {
        currentStream.getTracks().forEach(track => {
          const transceiver = pc.getTransceivers().find(t => t.receiver.track.kind === track.kind);
          if (transceiver) transceiver.sender.replaceTrack(track);
        });
        return currentStream;
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { target: targetId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      setPeers(prev => {
        const stream = prev[targetId] || new MediaStream();
        if (!stream.getTracks().find(t => t.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        // Force a new reference to ensure React updates
        return { ...prev, [targetId]: new MediaStream(stream.getTracks()) };
      });
    };

    if (isInitiator) {
      pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer);
      }).then(() => {
        socket.emit('offer', { target: targetId, sdp: pc.localDescription });
      });
    }

    return pc;
  };

  const toggleMic = async () => {
    if (!micOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const track = stream.getAudioTracks()[0];
        
        setLocalStream(prev => {
          const newStream = new MediaStream(prev.getTracks().filter(t => t.kind !== 'audio'));
          newStream.addTrack(track);
          return newStream;
        });

        Object.values(peerConnections.current).forEach(pc => {
          const transceiver = pc.getTransceivers().find(t => t.receiver.track.kind === 'audio');
          if (transceiver) transceiver.sender.replaceTrack(track);
        });

        setMicOn(true);
      } catch (err) {
        console.error("Failed to get mic", err);
      }
    } else {
      setLocalStream(prev => {
        prev.getAudioTracks().forEach(t => t.stop());
        const newStream = new MediaStream(prev.getTracks().filter(t => t.kind !== 'audio'));
        return newStream;
      });

      Object.values(peerConnections.current).forEach(pc => {
        const transceiver = pc.getTransceivers().find(t => t.receiver.track.kind === 'audio');
        if (transceiver) transceiver.sender.replaceTrack(null);
      });

      setMicOn(false);
    }
  };

  const toggleVideo = async () => {
    if (isScreenSharing) return; 

    if (!videoOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        
        setLocalStream(prev => {
          const newStream = new MediaStream(prev.getTracks().filter(t => t.kind !== 'video'));
          newStream.addTrack(track);
          if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
          return newStream;
        });

        Object.values(peerConnections.current).forEach(pc => {
          const transceiver = pc.getTransceivers().find(t => t.receiver.track.kind === 'video');
          if (transceiver) transceiver.sender.replaceTrack(track);
        });

        setVideoOn(true);
        socket.emit('camera-status', { roomId, isOn: true });
      } catch (err) {
        console.error("Failed to get video", err);
      }
    } else {
      setLocalStream(prev => {
        prev.getVideoTracks().forEach(t => t.stop());
        const newStream = new MediaStream(prev.getTracks().filter(t => t.kind !== 'video'));
        if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
        return newStream;
      });

      Object.values(peerConnections.current).forEach(pc => {
        const transceiver = pc.getTransceivers().find(t => t.receiver.track.kind === 'video');
        if (transceiver) transceiver.sender.replaceTrack(null);
      });

      setVideoOn(false);
      socket.emit('camera-status', { roomId, isOn: false });
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { frameRate: { ideal: 60 } },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        
        const videoTrack = stream.getVideoTracks()[0];
        const screenAudioTrack = stream.getAudioTracks()[0];
        
        videoTrack.onended = () => stopScreenShare();

        let finalAudioTrack = screenAudioTrack;

        // If mic is on, mix it with screen audio
        if (micOn && screenAudioTrack) {
          const micTrack = localStream.getAudioTracks()[0];
          if (micTrack) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            audioDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
            
            const micSource = audioContextRef.current.createMediaStreamSource(new MediaStream([micTrack]));
            const screenSource = audioContextRef.current.createMediaStreamSource(new MediaStream([screenAudioTrack]));
            
            micSource.connect(audioDestinationRef.current);
            screenSource.connect(audioDestinationRef.current);
            
            finalAudioTrack = audioDestinationRef.current.stream.getAudioTracks()[0];
          }
        }

        setLocalStream(prev => {
          let tracks = prev.getTracks().filter(t => t.kind !== 'video');
          
          if (finalAudioTrack) {
            // Only replace audio if we have a new combined track
            tracks = tracks.filter(t => t.kind !== 'audio');
            tracks.push(finalAudioTrack);
          }

          const newStream = new MediaStream([...tracks, videoTrack]);
          if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
          return newStream;
        });

        Object.values(peerConnections.current).forEach(pc => {
          const vTransceiver = pc.getTransceivers().find(t => t.receiver.track.kind === 'video');
          if (vTransceiver) vTransceiver.sender.replaceTrack(videoTrack);
          
          if (finalAudioTrack) {
            const aTransceiver = pc.getTransceivers().find(t => t.receiver.track.kind === 'audio');
            if (aTransceiver) aTransceiver.sender.replaceTrack(finalAudioTrack);
          }
        });

        setIsScreenSharing(true);
        setVideoOn(false); 
        socket.emit('screen-share-status', { roomId, isSharing: true });
        socket.emit('camera-status', { roomId, isOn: false });
      } catch (err) {
        console.error("Failed to share screen", err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setLocalStream(prev => {
      prev.getTracks().forEach(t => t.stop());
      const newStream = new MediaStream();
      if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
      return newStream;
    });

    Object.values(peerConnections.current).forEach(pc => {
      pc.getTransceivers().forEach(t => t.sender.replaceTrack(null));
    });
    
    setIsScreenSharing(false);
    setMicOn(false);
    setVideoOn(false);
    socket.emit('screen-share-status', { roomId, isSharing: false });
    socket.emit('camera-status', { roomId, isOn: false });
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('send-chat', { roomId, message: chatInput, username });
    setChatInput('');
    setChatToasts([]);
  };

  const handleChatInputFocus = () => {
    chatInputFocusRef.current = true;
    setChatToasts([]);
  };

  const handleChatInputBlur = () => {
    chatInputFocusRef.current = false;
  };

  const sendReaction = (emoji) => {
    socket.emit('send-reaction', { roomId, reaction: emoji });
  };

  const handleLeave = () => {
    socket.emit('leave-room', { roomId });
    navigate('/');
  };

  const activeSharerId = isScreenSharing ? 'local' : Object.keys(remoteSharers).find(id => remoteSharers[id]);

  // Auto-mute all mics when someone starts sharing screen (Cinema Mode)
  useEffect(() => {
    if (activeSharerId && micOn && activeSharerId !== 'local') {
      // If someone else starts sharing, mute myself automatically
      setLocalStream(prev => {
        prev.getAudioTracks().forEach(t => t.stop());
        const newStream = new MediaStream(prev.getTracks().filter(t => t.kind !== 'audio'));
        if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
        return newStream;
      });

      Object.values(peerConnections.current).forEach(pc => {
        const transceiver = pc.getTransceivers().find(t => t.receiver.track.kind === 'audio');
        if (transceiver) transceiver.sender.replaceTrack(null);
      });
      
      setMicOn(false);
    }
  }, [activeSharerId]);

  // Voice Activity Detection
  useEffect(() => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyzers = {};
    const animationFrameIds = {};

    const monitorStream = (userId, stream) => {
      if (!stream || stream.getAudioTracks().length === 0) {
        setVolumes(prev => ({ ...prev, [userId]: false }));
        return;
      }

      try {
        const source = audioCtx.createMediaStreamSource(stream);
        const analyzer = audioCtx.createAnalyser();
        analyzer.fftSize = 512;
        source.connect(analyzer);
        analyzers[userId] = { analyzer, source };

        const bufferLength = analyzer.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkVolume = () => {
          analyzer.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          setVolumes(prev => ({ ...prev, [userId]: average > 15 }));
          animationFrameIds[userId] = requestAnimationFrame(checkVolume);
        };
        checkVolume();
      } catch (e) {
        console.error("VAD error", e);
      }
    };

    // Monitor local stream
    if (micOn && localStream.getAudioTracks().length > 0) {
      monitorStream('local', localStream);
    } else {
      setVolumes(prev => ({ ...prev, local: false }));
    }

    // Monitor remote streams
    Object.entries(peers).forEach(([id, stream]) => {
      if (stream.getAudioTracks().length > 0) {
        monitorStream(id, stream);
      }
    });

    return () => {
      Object.values(animationFrameIds).forEach(cancelAnimationFrame);
      Object.values(analyzers).forEach(({ source }) => source.disconnect());
      audioCtx.close();
    };
  }, [micOn, localStream, peers]);

  const getAvatarUrl = (user) => {
    if (user?.avatar) return `https://api.dicebear.com/7.x/${user.avatar}`;
    const seed = user?.username || user || 'default';
    return `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}`;
  };

  const openSettings = () => {
    setSettingsForm({ title: roomInfo.title, watching: roomInfo.watching, memberLimit: roomInfo.memberLimit });
    setIsSettingsOpen(true);
  };

  const saveSettings = (e) => {
    e.preventDefault();
    socket.emit('update-room-settings', { roomId, ...settingsForm });
    setIsSettingsOpen(false);
  };

  const deleteRoom = () => {
    if (window.confirm("Are you sure you want to delete this room? Everyone will be kicked.")) {
      socket.emit('delete-room', { roomId });
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      roomContainerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  if (!setupComplete) {
    return (
      <div className="setup-modal-overlay">
        <div className="setup-modal glass-panel">
          <h2>Room Setup</h2>
          <div className="setup-avatar-section">
            <div className="avatar-preview-container">
              <img src={`https://api.dicebear.com/7.x/${avatarStyle}/svg?seed=${avatarSeed}&backgroundColor=8b5cf6`} alt="avatar preview" className="setup-avatar" />
            </div>
            
            <div className="avatar-style-selector">
              {[
                { id: 'adventurer', label: 'Adventurer' },
                { id: 'bottts', label: 'Robots' },
                { id: 'avataaars', label: 'Human' },
                { id: 'micah', label: 'Sketch' },
                { id: 'lorelei', label: 'Cute' },
                { id: 'pixel-art', label: 'Pixel' },
                { id: 'big-ears', label: 'Fun' }
              ].map(style => (
                <div 
                  key={style.id} 
                  className={`avatar-style-option ${avatarStyle === style.id ? 'active' : ''}`}
                  onClick={() => setAvatarStyle(style.id)}
                >
                  <img src={`https://api.dicebear.com/7.x/${style.id}/svg?seed=preview&backgroundColor=8b5cf6`} alt={style.label} />
                  <span>{style.label}</span>
                </div>
              ))}
            </div>

            <button type="button" className="shuffle-btn glass-btn" onClick={() => setAvatarSeed(Math.random().toString(36).substring(7))}>
              Shuffle Character
            </button>
          </div>
          
          <div className="setup-forms">
            {isCreator && (
              <>
                <div className="form-group">
                  <label>Room Name</label>
                  <input 
                    type="text" 
                    className="glass-input"
                    value={roomTitleInput} 
                    onChange={e => setRoomTitleInput(e.target.value)} 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Room Description</label>
                  <textarea 
                    className="glass-input"
                    rows="2"
                    value={roomDescriptionInput} 
                    onChange={e => setRoomDescriptionInput(e.target.value)} 
                    placeholder="What are we watching?"
                  />
                </div>
              </>
            )}
          </div>

          <button className="join-room-btn glass-btn" onClick={() => setSetupComplete(true)}>Join Room</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`room-container ${isFullscreen ? 'is-fullscreen' : ''} ${isChatFloatingOpen ? 'chat-open' : ''}`} ref={roomContainerRef}>
      {reactions.map(r => (
        <div key={r.id} className="floating-reaction" style={{ left: `${Math.random() * 80 + 10}%` }}>
          {r.emoji}
        </div>
      ))}

      {/* Invisible High-Priority Audio Elements */}
      {Object.entries(peers).map(([id, stream]) => (
        <audio 
          key={`audio-${id}`} 
          autoPlay 
          playsInline
          ref={el => { 
            if (el && el.srcObject !== stream) {
              el.srcObject = stream;
              el.play().catch(() => {});
            }
          }} 
        />
      ))}

      {/* Fullscreen stacked chat toasts — top-right, newest below, each fades in 5s */}
      {isFullscreen && chatToasts.length > 0 && (
        <div className="chat-toast-stack">
          {chatToasts.map(t => (
            <div key={t.id} className="chat-toast">
              <span className="chat-toast-sender">{t.username}</span>
              <span className="chat-toast-msg">{t.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="room-main">
        <div className={`video-grid ${activeSharerId ? 'has-active-sharer' : ''}`}>
          {/* Main Stage for the active sharer */}
          {activeSharerId && (
            <div className="main-stage-wrapper glass-panel">
              {activeSharerId === 'local' ? (
                <video ref={localVideoCallback} autoPlay muted playsInline className="video-element" />
              ) : (
                <VideoPlayer stream={peers[activeSharerId]} />
              )}
              <div className="video-badge">
                {activeSharerId === 'local' ? 'You' : participants[activeSharerId]?.username} (Screen)
              </div>
            </div>
          )}

          {/* Picture in Picture Container for non-sharers */}
          {activeSharerId ? (
            <div 
              className={`pip-container ${isPipCollapsed ? 'collapsed' : ''}`}
            >
              <button className="pip-toggle-btn" onClick={() => setIsPipCollapsed(!isPipCollapsed)}>
                {isPipCollapsed ? <VideoOff size={16} /> : <Video size={16} />}
              </button>
              
              <div className="pip-videos">
                {activeSharerId !== 'local' && (
                    <div className={`video-wrapper pip-video glass-panel ${volumes['local'] && !videoOn ? 'is-talking' : ''}`}>
                    {!videoOn && <img src={getAvatarUrl({ username, avatar: `${avatarStyle}/svg?seed=${avatarSeed}&backgroundColor=8b5cf6` })} alt="avatar" className="avatar-overlay" />}
                    <video ref={localVideoCallback} autoPlay muted playsInline className="video-element" />
                    <div className="video-badge">You</div>
                  </div>
                )}
                {Object.entries(peers).map(([id, stream]) => {
                  if (id === activeSharerId) return null;
                  return (
                    <div key={id} className={`video-wrapper pip-video glass-panel ${volumes[id] && !remoteCameraStatus[id] ? 'is-talking' : ''}`}>
                      {!remoteCameraStatus[id] && <img src={getAvatarUrl(participants[id])} alt="avatar" className="avatar-overlay" />}
                      <VideoPlayer stream={stream} />
                      <div className="video-badge">{participants[id]?.username || 'Peer'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Normal Grid Layout when no one is sharing */
            <>
              <div className={`video-wrapper main-video glass-panel ${volumes['local'] && !videoOn ? 'is-talking' : ''}`}>
                {!videoOn && <img src={getAvatarUrl({ username, avatar: `${avatarStyle}/svg?seed=${avatarSeed}&backgroundColor=8b5cf6` })} alt="avatar" className="avatar-overlay" />}
                <video ref={localVideoCallback} autoPlay muted playsInline className="video-element" />
                <div className="video-badge">You</div>
              </div>
              
              {Object.entries(peers).map(([id, stream]) => (
                <div key={id} className={`video-wrapper peer-video glass-panel ${volumes[id] && !remoteCameraStatus[id] ? 'is-talking' : ''}`}>
                  {!remoteCameraStatus[id] && <img src={getAvatarUrl(participants[id])} alt="avatar" className="avatar-overlay" />}
                  <VideoPlayer stream={stream} />
                  <div className="video-badge">{participants[id]?.username || 'Peer'}</div>
                </div>
              ))}
            </>
          )}

        </div>

        {isFullscreen && <div className="fullscreen-bottom-trigger" />}
        <div className="control-bar glass-panel">
          <div className="stats-indicator">
            <Info size={16} />
            <span>Ping: {networkStats.ping}ms | {networkStats.quality}</span>
          </div>
          
          <div className="control-buttons">
            <button className={`control-btn ${!micOn ? 'danger' : ''}`} onClick={toggleMic}>
              {micOn ? <Mic /> : <MicOff />}
            </button>
            <button className={`control-btn ${!videoOn ? 'danger' : ''} ${isScreenSharing ? 'disabled' : ''}`} onClick={toggleVideo}>
              {videoOn ? <Video /> : <VideoOff />}
            </button>
            <button className={`control-btn ${isScreenSharing ? 'active' : ''}`} onClick={toggleScreenShare}>
              <MonitorUp />
            </button>
            <button className="control-btn" onClick={toggleFullscreen}>
              {isFullscreen ? <Shrink /> : <Expand />}
            </button>
            {roomInfo.creatorId === socket?.id && (
              <button className="control-btn" onClick={openSettings}>
                <Settings />
              </button>
            )}
            <button className="control-btn danger leave-btn" onClick={handleLeave}>
              <PhoneOff />
            </button>
          </div>

          <div className="reaction-picker">
            <button onClick={() => sendReaction('🔥')}>🔥</button>
            <button onClick={() => sendReaction('😂')}>😂</button>
            <button onClick={() => sendReaction('❤️')}>❤️</button>
            <button onClick={() => sendReaction('😲')}>😲</button>
          </div>
        </div>
      </div>

      {isFullscreen && !isChatFloatingOpen && (
        <button className="open-floating-chat-btn glass-panel" onClick={() => setIsChatFloatingOpen(true)}>
          <MessageSquare size={20} />
          <span>Chat</span>
        </button>
      )}

      {/* Chat sidebar — z-index 50, pip is 60 so pip appears above chat */}
      <div className={`room-sidebar glass-panel ${isFullscreen ? 'floating-chat' : ''} ${isFullscreen && !isChatFloatingOpen ? 'hidden' : ''}`}>
        {isFullscreen && (
          <button className="close-floating-chat-btn" onClick={() => setIsChatFloatingOpen(false)}>
            <X size={18} />
          </button>
        )}
        <div className="sidebar-header room-info-header">
          <div>
            <h3 className="room-title">{roomInfo.title || 'Loading...'}</h3>
            {roomInfo.watching && roomInfo.watching !== 'Nothing specified' && (
              <div className="room-watching">Watching: {roomInfo.watching}</div>
            )}
          </div>
          <span className="room-id" title="Room ID">#{roomId}</span>
        </div>
        
        <div className="participants-list" style={{ padding: '1rem 1.5rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          <strong>{Object.keys(participants).length} / {roomInfo.memberLimit || '?'} in room</strong>
        </div>

        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.username === username ? 'own-message' : ''}`}>
              <span className="message-sender">{msg.username}</span>
              <p className="message-content">{msg.message}</p>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <form className="chat-input-form" onSubmit={sendChat}>
          <input 
            type="text" 
            placeholder="Type a message..." 
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onFocus={handleChatInputFocus}
            onBlur={handleChatInputBlur}
            ref={chatInputRef}
          />
          <button type="submit" className="send-btn">
            <Send size={18} />
          </button>
        </form>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="setup-modal-overlay">
          <div className="setup-modal glass-panel">
            <div className="modal-header">
              <h2>Room Settings</h2>
              <button className="close-btn" onClick={() => setIsSettingsOpen(false)}><X size={20}/></button>
            </div>
            <form onSubmit={saveSettings} className="settings-form">
              <div className="form-group">
                <label>Room Name</label>
                <input 
                  type="text" 
                  className="glass-input"
                  value={settingsForm.title} 
                  onChange={e => setSettingsForm({...settingsForm, title: e.target.value})} 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Currently Watching</label>
                <input 
                  type="text" 
                  className="glass-input"
                  value={settingsForm.watching} 
                  onChange={e => setSettingsForm({...settingsForm, watching: e.target.value})} 
                  placeholder="e.g., Inception (2010)"
                />
              </div>
              <div className="form-group">
                <label>Member Limit</label>
                <input 
                  type="number" 
                  className="glass-input"
                  min="2" max="50"
                  value={settingsForm.memberLimit} 
                  onChange={e => setSettingsForm({...settingsForm, memberLimit: e.target.value})} 
                  required 
                />
              </div>
              <div className="settings-actions">
                <button type="submit" className="glass-btn save-btn">Save Changes</button>
                <button type="button" className="glass-btn danger-btn" onClick={deleteRoom}>
                  <Trash2 size={16} /> Delete Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const VideoPlayer = ({ stream }) => {
  const ref = useRef();
  const [muted, setMuted] = useState(false);
  const [showUnmute, setShowUnmute] = useState(false);

  useEffect(() => {
    if (ref.current) {
      if (stream && stream.getVideoTracks().length > 0) {
        ref.current.srcObject = stream;
        
        const attemptPlay = () => {
          if (!ref.current) return;
          ref.current.play().then(() => {
            setShowUnmute(false);
          }).catch(err => {
            console.warn("Autoplay blocked, showing unmute button", err);
            setShowUnmute(true);
          });
        };

        attemptPlay();
        
        const timeout = setTimeout(attemptPlay, 1000);
        const interval = setInterval(attemptPlay, 3000); 
        return () => {
          clearTimeout(timeout);
          clearInterval(interval);
        };
      } else {
        ref.current.srcObject = null;
        setShowUnmute(false);
      }
    }
  }, [stream]);

  const handleManualUnmute = () => {
    if (ref.current) {
      ref.current.play();
      ref.current.muted = false;
      setShowUnmute(false);
    }
  };

  return (
    <div className="video-player-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <video 
        ref={ref} 
        autoPlay 
        playsInline 
        className="video-element"
      />
      {showUnmute && (
        <div className="autoplay-overlay" onClick={handleManualUnmute}>
          <div className="unmute-badge glass-panel">
            <MicOff size={16} />
            <span>Click to enable sound</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Room;
