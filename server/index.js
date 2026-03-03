import express from 'express';
import logger from 'morgan';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

import { Server } from 'socket.io';
import { createServer } from 'node:http';

dotenv.config({ path: './server/.env' });

const port = process.env.PORT ?? 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {}
});

const db = createClient({
    url: 'libsql://rapid-cyborg-gera98k.aws-us-east-2.turso.io',
    authToken: process.env.DB_TOKEN
});

await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        user TEXT
    );
`);

io.on('connection', async (socket) => {
    console.log('Nuevo usuario conectado');
    socket.on('disconnect', () => {
        console.log('Usuario desconectado');
    });

    socket.on('chat message', async (msg) => {
        let result;
        
        const username = socket.handshake.auth.username ?? 'anonimo';
        
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user) VALUES (:msg, :username)',
                args: { msg, username }
            });
        }catch (e) {
            console.error(e);
            return;
        }

        io.emit('chat message', msg, result.lastInsertRowid.toString(), username);
    });

    if(!socket.recovered) {
        try {
            const results = await db.execute({
                sql: 'SELECT id, content, user FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0]
            });

            results.rows.forEach( row => {
                socket.emit('chat message', row.content, row.id, row.user);
            });

        } catch (e) {
            console.error(e);
        }
    }
});

app.use(logger('dev'));

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html');
});

server.listen(port, () => {
    console.log(`Servidor ejecutandose en el puerto ${port}`);
});