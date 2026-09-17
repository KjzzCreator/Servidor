const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let bullets = [];

const mapSize = 1600;

const weaponsConfig = {
    glock: { name: 'Glock 17', damage: 18, speed: 12, fireRate: 350, ammoMax: 15, range: 400 },
    mp5:   { name: 'MP5',      damage: 14, speed: 14, fireRate: 150, ammoMax: 30, range: 500 },
    ak47:  { name: 'AK-47',    damage: 32, speed: 16, fireRate: 250, ammoMax: 25, range: 700 },
    xm8:   { name: 'XM8',      damage: 26, speed: 18, fireRate: 200, ammoMax: 30, range: 750 }
};

io.on('connection', (socket) => {
    console.log(`Sobrevivente conectado: ${socket.id}`);

    socket.on('joinGame', (data) => {
        let weapon = weaponsConfig[data.weapon] ? data.weapon : 'glock';
        
        players[socket.id] = {
            id: socket.id,
            name: data.name || 'Convidado',
            skin: data.skin || 'player_blue',
            weapon: weapon,
            x: Math.random() * (mapSize - 400) + 200,
            y: Math.random() * (mapSize - 400) + 200,
            angle: 0,
            hp: 100,
            ammo: weaponsConfig[weapon].ammoMax,
            kills: 0,
            alive: true,
            lastShot: 0
        };

        io.emit('chatMessage', { sender: 'Sistema', text: `${players[socket.id].name} caiu de paraquedas na ilha!` });
    });

    socket.on('playerMove', (movement) => {
        let p = players[socket.id];
        if (!p || !p.alive) return;

        p.x = Math.max(20, Math.min(mapSize - 20, movement.x));
        p.y = Math.max(20, Math.min(mapSize - 20, movement.y));
        p.angle = movement.angle;
    });

    socket.on('shoot', () => {
        let p = players[socket.id];
        if (!p || !p.alive) return;

        let now = Date.now();
        let wConfig = weaponsConfig[p.weapon];

        if (now - p.lastShot < wConfig.fireRate) return;
        if (p.ammo <= 0) return;

        p.ammo--;
        p.lastShot = now;

        bullets.push({
            id: Math.random().toString(),
            ownerId: socket.id,
            x: p.x + Math.cos(p.angle) * 25,
            y: p.y + Math.sin(p.angle) * 25,
            vx: Math.cos(p.angle) * wConfig.speed,
            vy: Math.sin(p.angle) * wConfig.speed,
            damage: wConfig.damage,
            range: wConfig.range,
            travelled: 0
        });
    });

    socket.on('reload', () => {
        let p = players[socket.id];
        if (!p || !p.alive) return;
        p.ammo = weaponsConfig[p.weapon].ammoMax;
    });

    socket.on('chatMessage', (msgText) => {
        let p = players[socket.id];
        if (!p) return;
        let cleanText = msgText.substring(0, 100);
        io.emit('chatMessage', { sender: p.name, text: cleanText });
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            io.emit('chatMessage', { sender: 'Sistema', text: `${players[socket.id].name} foi eliminado da partida.` });
            delete players[socket.id];
        }
    });
});

setInterval(() => {
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.travelled += Math.hypot(b.vx, b.vy);

        if (b.travelled >= b.range || b.x < 0 || b.x > mapSize || b.y < 0 || b.y > mapSize) {
            bullets.splice(i, 1);
            continue;
        }

        let hit = false;
        for (let id in players) {
            let p = players[id];
            if (!p.alive || id === b.ownerId) continue;

            let dist = Math.hypot(p.x - b.x, p.y - b.y);
            if (dist < 18) {
                p.hp -= b.damage;
                hit = true;

                // Envia evento de Dano Flutuante para todos na sala
                io.emit('spawnDamage', { x: p.x, y: p.y, damage: b.damage });

                if (p.hp <= 0) {
                    p.alive = false;
                    p.hp = 0;
                    
                    let killer = players[b.ownerId];
                    if (killer) {
                        killer.kills++;
                        io.emit('chatMessage', { sender: '💀', text: `${killer.name} eliminou ${p.name}!` });
                    }

                    setTimeout(() => {
                        if (players[id]) {
                            players[id].hp = 100;
                            players[id].ammo = weaponsConfig[players[id].weapon].ammoMax;
                            players[id].x = Math.random() * (mapSize - 400) + 200;
                            players[id].y = Math.random() * (mapSize - 400) + 200;
                            players[id].alive = true;
                        }
                    }, 3000);
                }
                break;
            }
        }
        if (hit) {
            bullets.splice(i, 1);
        }
    }

    io.emit('gameState', { players, bullets });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Battle Royale rodando na porta ${PORT}`);
});
