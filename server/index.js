import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory data store for rooms
const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create or join a room
  socket.on('join-room', ({ roomId, password, username, isCreator, avatar, title }) => {
    // If room doesn't exist, create it if isCreator is true
    if (!rooms[roomId]) {
      if (isCreator) {
        rooms[roomId] = {
          id: roomId,
          creatorId: socket.id,
          title: title || 'Movie Night',
          watching: 'Nothing specified',
          memberLimit: 10,
          password: password || null,
          users: {},
          createdAt: Date.now()
        };
      } else {
        socket.emit('error', 'Room does not exist.');
        return;
      }
    }

    // Check password
    if (rooms[roomId].password && rooms[roomId].password !== password && !isCreator) {
      socket.emit('error', 'Incorrect password.');
      return;
    }

    // Check member limit
    if (!isCreator && Object.keys(rooms[roomId].users).length >= rooms[roomId].memberLimit) {
      socket.emit('error', 'Room is full.');
      return;
    }

    // Add user to room
    const room = rooms[roomId];
    room.users[socket.id] = { id: socket.id, username, avatar };
    
    socket.join(roomId);
    
    // Notify others in the room
    socket.to(roomId).emit('user-connected', { userId: socket.id, username, avatar });
    
    // Send current room state to the joining user
    socket.emit('room-joined', { 
      roomId, 
      users: room.users,
      roomInfo: {
        title: room.title,
        watching: room.watching,
        memberLimit: room.memberLimit,
        creatorId: room.creatorId
      }
    });
    
    // Update global room list
    io.emit('update-room-list', getPublicRooms());
  });

  socket.on('get-rooms', () => {
    socket.emit('update-room-list', getPublicRooms());
  });

  socket.on('check-room', (roomId) => {
    const room = rooms[roomId];
    if (room) {
      socket.emit('room-check-result', { exists: true, hasPassword: !!room.password, roomId });
    } else {
      socket.emit('room-check-result', { exists: false, roomId });
    }
  });

  // WebRTC Signaling
  socket.on('offer', (payload) => {
    io.to(payload.target).emit('offer', { sender: socket.id, sdp: payload.sdp });
  });

  socket.on('answer', (payload) => {
    io.to(payload.target).emit('answer', { sender: socket.id, sdp: payload.sdp });
  });

  socket.on('ice-candidate', (payload) => {
    io.to(payload.target).emit('ice-candidate', { sender: socket.id, candidate: payload.candidate });
  });

  // Chat & Reactions
  socket.on('send-chat', ({ roomId, message, username }) => {
    io.to(roomId).emit('receive-chat', { userId: socket.id, username, message, timestamp: Date.now() });
  });

  socket.on('send-reaction', ({ roomId, reaction }) => {
    io.to(roomId).emit('receive-reaction', { userId: socket.id, reaction });
  });

  socket.on('screen-share-status', ({ roomId, isSharing }) => {
    socket.to(roomId).emit('screen-share-status', { userId: socket.id, isSharing });
  });

  socket.on('camera-status', ({ roomId, isOn }) => {
    socket.to(roomId).emit('camera-status', { userId: socket.id, isOn });
  });

  // Room Settings
  socket.on('update-room-settings', ({ roomId, title, watching, memberLimit }) => {
    const room = rooms[roomId];
    if (room && room.creatorId === socket.id) {
      room.title = title;
      room.watching = watching;
      room.memberLimit = memberLimit;
      
      io.to(roomId).emit('room-settings-updated', { title, watching, memberLimit });
      io.emit('update-room-list', getPublicRooms());
    }
  });

  socket.on('delete-room', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.creatorId === socket.id) {
      io.to(roomId).emit('room-deleted');
      delete rooms[roomId];
      io.emit('update-room-list', getPublicRooms());
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Remove user from all rooms they were in
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.users[socket.id]) {
        delete room.users[socket.id];
        socket.to(roomId).emit('user-disconnected', socket.id);
        
        // Clean up empty rooms
        if (Object.keys(room.users).length === 0) {
          delete rooms[roomId];
        }
      }
    }
    // Update global room list
    io.emit('update-room-list', getPublicRooms());
  });
});

function getPublicRooms() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    title: r.title,
    watching: r.watching,
    hasPassword: !!r.password,
    userCount: Object.keys(r.users).length,
    memberLimit: r.memberLimit,
    createdAt: r.createdAt
  }));
}

// Serve static files from the React app
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
