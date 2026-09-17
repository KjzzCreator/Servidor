const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let foods = [];

// Gerar comidas iniciais no servidor
const worldWidth = 1000;
const worldHeight = 1000;

for (let i = 0; i < 100; i++) {
    foods.push({
        id: Math.random().toString(),
        x: Math.random() * worldWidth,
        y: Math.random() * worldHeight,
        color: `hsl(${Math.random() * 360}, 100%, 60%)`
    });
}

io.on('connection', (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);

    socket.on('joinGame', (data) => {
        players[socket.id] = {
            id: socket.id,
            name: data.name,
            skin: data.skin,
            snake: [
                { x: worldWidth / 2, y: worldHeight / 2 },
                { x: worldWidth / 2, y: worldHeight / 2 + 10 }
            ],
            score: 10
        };
    });

    socket.on('updateMovement', (target) => {
        let player = players[socket.id];
        if (!player) return;

        let head = player.snake[0];
        let angle = Math.atan2(target.y - head.y, target.x - head.x);
        let speed = 1.5;

        let newX = head.x + Math.cos(angle) * speed;
        let newY = head.y + Math.sin(angle) * speed;

        // Limites da arena
        if (newX >= 0 && newX <= worldWidth && newY >= 0 && newY <= worldHeight) {
            player.snake.unshift({ x: newX, y: newY });

            // Comer comida
            let ate = false;
            for (let i = foods.length - 1; i >= 0; i--) {
                let f = foods[i];
                let dist = Math.hypot(newX - f.x, newY - f.y);
                if (dist < 12) {
                    foods.splice(i, 1);
                    // Repõe comida
                    foods.push({
                        id: Math.random().toString(),
                        x: Math.random() * worldWidth,
                        y: Math.random() * worldHeight,
                        color: `hsl(${Math.random() * 360}, 100%, 60%)`
                    });
                    ate = true;
                    break;
                }
            }

            if (!ate) {
                player.snake.pop();
            } else {
                player.score = player.snake.length;
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        delete players[socket.id];
    });
});

// Enviar estado do jogo para todos os clientes 30 vezes por segundo
setInterval(() => {
    io.emit('gameState', { players, foods });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});