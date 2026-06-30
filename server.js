// AlmostMet — Real-time Backend Server
// Handles WebSocket connections so multiple devices see each other on the map

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Serve all static files (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname)));

// Health check endpoint (useful for Render.com)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', users: connectedUsers.size });
});

// -------------------------------------------------------
// IN-MEMORY USER STORE
// -------------------------------------------------------
const connectedUsers = new Map();   // userId -> userData
const userSockets = new Map();      // userId -> socketId
const socketToUser = new Map();     // socketId -> userId

// -------------------------------------------------------
// SOCKET.IO CONNECTION HANDLER
// -------------------------------------------------------
io.on('connection', (socket) => {
    console.log(`[+] Socket connected: ${socket.id}`);

    // ----- USER JOINS -----
    socket.on('user:join', (userData) => {
        const userId = userData.userId;
        if (!userId) return;

        // Store mapping
        userSockets.set(userId, socket.id);
        socketToUser.set(socket.id, userId);
        connectedUsers.set(userId, {
            ...userData,
            socketId: socket.id,
            joinedAt: Date.now()
        });

        console.log(`[JOIN] ${userData.username} (${userId}) — ${connectedUsers.size} users online`);

        // Send the list of ALL currently online users to the new user
        const otherUsers = [];
        connectedUsers.forEach((u, uid) => {
            if (uid !== userId) {
                otherUsers.push(u);
            }
        });
        socket.emit('users:list', otherUsers);

        // Broadcast new user to everyone else
        socket.broadcast.emit('user:joined', connectedUsers.get(userId));
    });

    // ----- USER UPDATES (location, vibe, ghost) -----
    socket.on('user:update', (data) => {
        const userId = socketToUser.get(socket.id);
        if (!userId) return;

        const user = connectedUsers.get(userId);
        if (user) {
            // Merge new data into stored user
            Object.assign(user, data);
            connectedUsers.set(userId, user);

            // Broadcast update to everyone else
            socket.broadcast.emit('user:updated', {
                userId: userId,
                ...data
            });
        }
    });

    // ----- CHAT MESSAGE -----
    socket.on('chat:message', ({ toUserId, text }) => {
        const fromUserId = socketToUser.get(socket.id);
        if (!fromUserId || !toUserId || !text) return;

        const sender = connectedUsers.get(fromUserId);
        if (!sender) return;

        // Find the target socket
        const targetSocketId = userSockets.get(toUserId);
        if (targetSocketId) {
            const timestamp = new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });

            io.to(targetSocketId).emit('chat:message', {
                fromUserId: fromUserId,
                fromUsername: sender.username,
                text: text,
                timestamp: timestamp
            });

            console.log(`[CHAT] ${sender.username} → ${toUserId}: "${text.substring(0, 30)}..."`);
        }
    });

    // ----- CHAT IMAGE -----
    socket.on('chat:image', ({ toUserId, imageData }) => {
        const fromUserId = socketToUser.get(socket.id);
        if (!fromUserId || !toUserId || !imageData) return;

        const sender = connectedUsers.get(fromUserId);
        if (!sender) return;

        const targetSocketId = userSockets.get(toUserId);
        if (targetSocketId) {
            const timestamp = new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });

            io.to(targetSocketId).emit('chat:image', {
                fromUserId,
                fromUsername: sender.username,
                imageData,
                timestamp
            });

            console.log(`[IMAGE] ${sender.username} → ${toUserId}: image sent`);
        }
    });

    // ----- YOUTUBE MUSIC SYNC -----
    socket.on('music:share', ({ toUserId, videoId }) => {
        const fromUserId = socketToUser.get(socket.id);
        if (!fromUserId) return;
        const targetSocketId = userSockets.get(toUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('music:share', { fromUserId, videoId });
        }
        console.log(`[MUSIC] ${fromUserId} shared YouTube video with ${toUserId}`);
    });

    socket.on('music:sync', ({ toUserId, action, time }) => {
        const fromUserId = socketToUser.get(socket.id);
        if (!fromUserId) return;
        const targetSocketId = userSockets.get(toUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('music:sync', { fromUserId, action, time });
        }
    });


    // ----- GHOST MODE TOGGLE -----
    socket.on('user:ghost', (isGhost) => {
        const userId = socketToUser.get(socket.id);
        if (!userId) return;

        const user = connectedUsers.get(userId);
        if (user) {
            user.ghostMode = isGhost;
            connectedUsers.set(userId, user);

            // When in ghost mode, tell others to hide this user
            if (isGhost) {
                socket.broadcast.emit('user:ghosted', { userId: userId });
            } else {
                // Coming back from ghost — re-broadcast full user data
                socket.broadcast.emit('user:unghosted', connectedUsers.get(userId));
            }

            console.log(`[GHOST] ${user.username} ghost=${isGhost}`);
        }
    });

    // ----- DISCONNECT -----
    socket.on('disconnect', () => {
        const userId = socketToUser.get(socket.id);
        if (userId) {
            const user = connectedUsers.get(userId);
            console.log(`[-] ${user ? user.username : userId} disconnected — ${connectedUsers.size - 1} users remain`);

            connectedUsers.delete(userId);
            userSockets.delete(userId);
            socketToUser.delete(socket.id);

            // Tell everyone this user left
            io.emit('user:left', { userId: userId });
        }
    });
});

// -------------------------------------------------------
// START SERVER
// -------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════╗');
    console.log('  ║        🌸 AlmostMet Server Running 🌸     ║');
    console.log(`  ║     http://localhost:${PORT}                 ║`);
    console.log('  ║                                           ║');
    console.log('  ║  Open this URL on multiple devices        ║');
    console.log('  ║  (same WiFi) to see them interact!        ║');
    console.log('  ╚═══════════════════════════════════════════╝');
    console.log('');
});
