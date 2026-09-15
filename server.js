const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const players = {};

io.on('connection', (socket) => {
  console.log('Jogador conectado:', socket.id);
  players[socket.id] = { x: 0, y: 0, z: 0, yaw: 0 };

  // Envia a lista de jogadores atuais para quem acabou de entrar
  socket.emit('currentPlayers', players);
  // Avisa os outros que um novo jogador entrou
  socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

  // Atualiza posição do jogador
  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      players[socket.id].z = movementData.z;
      players[socket.id].yaw = movementData.yaw;
      socket.broadcast.emit('playerMoved', { id: socket.id, player: players[socket.id] });
    }
  });

  // Evento de tiro
  socket.on('shoot', (shootData) => {
    socket.broadcast.emit('playerShot', { id: socket.id, shootData });
  });

  // Desconexão
  socket.on('disconnect', () => {
    console.log('Jogador desconectado:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});