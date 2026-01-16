const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Upload
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size
    });
});

// Download
app.get('/download/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'public/uploads', req.params.filename);
    res.download(filePath);
});

// Active peers: { socketId: { id, name, ip, roomId } }
let peers = {};

function getIp(socket) {
    const headers = socket.handshake.headers;
    const xForwardedFor = headers['x-forwarded-for'];
    if (xForwardedFor) {
        return xForwardedFor.split(',')[0].trim();
    }
    return socket.handshake.address;
}

function broadcastToRoom(roomId) {
    // Filter peers in this room
    const roomPeers = Object.values(peers).filter(p => p.roomId === roomId);
    io.to(roomId).emit('peer-list', roomPeers);
}

io.on('connection', (socket) => {
    const ip = getIp(socket);

    // Logic Fix:
    // If we are behind a proxy (Cloud), use the IP (Public IP) to group users.
    // If we are NOT behind a proxy (Local LAN), everyone has a different LAN IP (e.g. 192.168.1.5, 192.168.1.6).
    // In LAN mode, we want everyone to see each other, so we put them in a shared 'local' room.
    const isBehindProxy = !!socket.handshake.headers['x-forwarded-for'];
    const roomId = isBehindProxy ? ip : 'local-network';

    console.log(`User connected: ${socket.id} from IP: ${ip} (Room: ${roomId})`);

    // Join Room
    socket.join(roomId);

    socket.on('join', (data) => {
        peers[socket.id] = {
            id: socket.id,
            name: data.name || `Device-${socket.id.substr(0, 4)}`,
            ip: ip, // Storing IP for debug, though redundant with room logic
            roomId: roomId
        };
        broadcastToRoom(roomId);
    });

    socket.on('update-name', (name) => {
        if (peers[socket.id]) {
            peers[socket.id].name = name;
            broadcastToRoom(peers[socket.id].roomId);
        }
    });

    socket.on('signal', (data) => {
        const { to, type, payload } = data;
        const targetPeer = peers[to];

        // Security: Ensure target is in same room & Sender is registered
        if (targetPeer && targetPeer.roomId === roomId && peers[socket.id]) {
            io.to(to).emit('signal', {
                from: socket.id,
                fromName: peers[socket.id].name,
                type,
                payload
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (peers[socket.id]) {
            const room = peers[socket.id].roomId;
            delete peers[socket.id];
            broadcastToRoom(room);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
