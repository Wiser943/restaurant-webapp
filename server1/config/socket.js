let io = null;

/**
 * Initializes socket.io on the given HTTP server.
 * Called once from server.js
 */
function initSocket(server, clientUrl) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: {
      origin: clientUrl || '*',
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Customers join a private room keyed by their userId so we can push
    // order-status updates to only them.
    socket.on('join:user', (userId) => {
      if (userId) socket.join(`user:${userId}`);
    });

    // Admin dashboard joins the admin room to receive new-order alerts.
    socket.on('join:admin', () => {
      socket.join('admins');
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialized yet');
  return io;
}

module.exports = { initSocket, getIO };
