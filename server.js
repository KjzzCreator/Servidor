const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let foods = [];

const worldWidth = 1200;
const worldHeight = 1200;

// Gerar comidas iniciais
for (let i = 0; i < 150; i++) {
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
        let startX = Math.random() * (worldWidth - 400) + 200;
        let startY = Math.random() * (worldHeight - 400) + 200;
        
        players[socket.id] = {
            id: socket.id,
            name: data.name,
            skin: data.skin,
            snake: [
                { x: startX, y: startY },
                { x: startX, y: startY + 10 },
                { x: startX, y: startY + 20 },
                { x: startX, y: startY + 30 }
            ],
            score: 15,
            alive: true
        };
    });

    socket.on('updateMovement', (target) => {
        let player = players[socket.id];
        if (!player || !player.alive) return;

        let head = player.snake[0];
        let angle = Math.atan2(target.y - head.y, target.x - head.x);
        let speed = 1.8;

        let newX = head.x + Math.cos(angle) * speed;
        let newY = head.y + Math.sin(angle) * speed;

        // Morrer se bater nas paredes da arena
        if (newX < 0 || newX > worldWidth || newY < 0 || newY > worldHeight) {
            killPlayer(socket.id);
            return;
        }

        let newHead = { x: newX, y: newY };
        player.snake.unshift(newHead);

        // Checar colisão com comidas
        let ate = false;
        for (let i = foods.length - 1; i >= 0; i--) {
            let f = foods[i];
            let dist = Math.hypot(newHead.x - f.x, newHead.y - f.y);
            if (dist < 15) { // Raio de coleta ajustado
                foods.splice(i, 1);
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
            player.snake.push({ ...player.snake[player.snake.length - 1] });
        }
        player.score = player.snake.length;

        // ==========================================
        // COLISÃO COM OUTROS JOGADORES (Agora rigorosa)
        // ==========================================
        for (let id in players) {
            let p = players[id];
            // Se o outro jogador estiver morto ou for você mesmo, pula
            if (!p.alive || id === socket.id) continue;

            // Começa do índice 2 para evitar falsos positivos na cabeça inicial
            for (let j = 2; j < p.snake.length; j++) {
                let part = p.snake[j];
                let dist = Math.hypot(newHead.x - part.x, newHead.y - part.y);
                
                // Se a distância entre a sua cabeça e o corpo do oponente for menor que 12 pixels
                if (dist < 12) {
                    killPlayer(socket.id);
                    return;
                }
            }
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            turnSnakeIntoFood(players[socket.id]);
            delete players[socket.id];
        }
    });
});

function killPlayer(id) {
    if (!players[id] || !players[id].alive) return;
    players[id].alive = false;
    turnSnakeIntoFood(players[id]);
    io.to(id).emit('die');
    
    // Reseta e renasce o jogador após 2 segundos em um lugar seguro aleatório
    setTimeout(() => {
        if (players[id]) {
            let startX = Math.random() * (worldWidth - 400) + 200;
            let startY = Math.random() * (worldHeight - 400) + 200;
            players[id].snake = [
                { x: startX, y: startY },
                { x: startX, y: startY + 10 },
                { x: startX, y: startY + 20 }
            ];
            players[id].score = 15;
            players[id].alive = true;
        }
    }, 2000);
}

function turnSnakeIntoFood(player) {
    player.snake.forEach((part, index) => {
        if (index % 2 === 0) {
            foods.push({
                id: Math.random().toString(),
                x: part.x + (Math.random() * 20 - 10),
                y: part.y + (Math.random() * 20 - 10),
                color: player.skin === 'rainbow' ? '#ff00ff' : '#00ffcc'
            });
        }
    });
}

setInterval(() => {
    io.emit('gameState', { players, foods });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
