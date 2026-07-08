const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const path = require('path');

const SERVER_NAME = 'Server 2';
const PORT = 3001;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CHANNEL = 'nexatech:notifications';
const USER_KEY = 'nexatech:connected_users';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const pub = createClient({ url: REDIS_URL });
const sub = createClient({ url: REDIS_URL });
const store = createClient({ url: REDIS_URL });

app.use(express.static(path.join(__dirname, 'public')));

function buildUser(socket) {
    return {
        id: socket.id,
        username: socket.data.username,
        role: socket.data.role,
        server: SERVER_NAME
    };
}

async function publishUsers() {
    const users = await store.hGetAll(USER_KEY);
    const userList = Object.values(users).map((value) => JSON.parse(value));
    io.emit('users updated', userList);
}

async function init() {
    await pub.connect();
    await sub.connect();
    await store.connect();
    await store.del(USER_KEY);
    console.log(`${SERVER_NAME}: connected users reset.`);

    await sub.subscribe(CHANNEL, async (rawMessage) => {
        const message = JSON.parse(rawMessage);
        io.emit('new message', message);
        await publishUsers();
    });

    io.on('connection', (socket) => {
        console.log(`${SERVER_NAME}: client connected ${socket.id}`);

        socket.emit('server info', { serverName: SERVER_NAME, port: PORT });

        socket.on('join', async (user) => {
            socket.data.username = user.username || 'Anonymous';
            socket.data.role = user.role || 'Student';

            const connectedUser = buildUser(socket);
            await store.hSet(USER_KEY, socket.id, JSON.stringify(connectedUser));

            await pub.publish(CHANNEL, JSON.stringify({
                type: 'system',
                username: 'System',
                role: 'System',
                text: `${connectedUser.username} joined as ${connectedUser.role} through ${SERVER_NAME}.`,
                server: SERVER_NAME,
                time: new Date().toLocaleString()
            }));

            await publishUsers();
        });

        socket.on('send message', async (data) => {
            const message = {
                type: data.type || 'response',
                username: socket.data.username || 'Anonymous',
                role: socket.data.role || 'Student',
                text: data.text,
                server: SERVER_NAME,
                time: new Date().toLocaleString()
            };

            console.log(`${SERVER_NAME}: publishing message to Redis`, message);
            await pub.publish(CHANNEL, JSON.stringify(message));
        });

        socket.on('disconnect', async () => {
            console.log(`${SERVER_NAME}: client disconnected ${socket.id}`);
            const username = socket.data.username || 'A user';
            await store.hDel(USER_KEY, socket.id);

            await pub.publish(CHANNEL, JSON.stringify({
                type: 'system',
                username: 'System',
                role: 'System',
                text: `${username} disconnected from ${SERVER_NAME}.`,
                server: SERVER_NAME,
                time: new Date().toLocaleString()
            }));

            await publishUsers();
        });
    });

    server.listen(PORT, () => {
        console.log(`${SERVER_NAME} is running at http://localhost:${PORT}`);
        console.log(`${SERVER_NAME} is connected to Redis at ${REDIS_URL}`);
    });
}

init().catch((error) => {
    console.error(`${SERVER_NAME} failed to start:`, error.message);
});
