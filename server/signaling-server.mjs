import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

const rooms = new Map();

function getRoomUsers(room) {
  const roomMap = rooms.get(room);
  if (!roomMap) return [];
  return Array.from(roomMap.entries()).map(([id, user]) => ({
    id,
    name: user.name,
  }));
}

io.on('connection', (socket) => {
  socket.on('join-room', ({ room, name }) => {
    if (!room || !name) return;

    const cleanRoom = String(room).trim().toUpperCase();
    const cleanName = String(name).trim().slice(0, 30);

    if (!rooms.has(cleanRoom)) {
      rooms.set(cleanRoom, new Map());
    }

    const roomMap = rooms.get(cleanRoom);
    const existingUsers = Array.from(roomMap.entries()).map(([id, user]) => ({
      id,
      name: user.name,
    }));

    socket.join(cleanRoom);
    socket.data.room = cleanRoom;
    socket.data.name = cleanName;
    roomMap.set(socket.id, { name: cleanName });

    socket.emit('existing-users', existingUsers);
    socket.to(cleanRoom).emit('user-joined', {
      id: socket.id,
      name: cleanName,
    });

    io.to(cleanRoom).emit('room-users', getRoomUsers(cleanRoom));
  });

  socket.on('offer', ({ target, sdp }) => {
    io.to(target).emit('offer', {
      from: socket.id,
      sdp,
    });
  });

  socket.on('answer', ({ target, sdp }) => {
    io.to(target).emit('answer', {
      from: socket.id,
      sdp,
    });
  });

  socket.on('ice-candidate', ({ target, candidate }) => {
    io.to(target).emit('ice-candidate', {
      from: socket.id,
      candidate,
    });
  });

  socket.on('talking', ({ active }) => {
    const room = socket.data.room;
    if (!room) return;

    socket.to(room).emit('talking', {
      id: socket.id,
      name: socket.data.name || 'User',
      active: Boolean(active),
    });
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (!room) return;

    const roomMap = rooms.get(room);
    if (roomMap) {
      roomMap.delete(socket.id);
      if (roomMap.size === 0) {
        rooms.delete(room);
      }
    }

    socket.to(room).emit('user-left', { id: socket.id });
    io.to(room).emit('room-users', getRoomUsers(room));
  });
});

httpServer.listen(PORT, () => {
  console.log(`Signaling server running on http://localhost:${PORT}`);
});
