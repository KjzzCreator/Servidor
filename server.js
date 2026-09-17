const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let bullets = [];

// Definição das Gangues do Servidor
const GANGS = {
    'gang_command': { name: 'Comando da Cidade', color: '#ef4444' },
    'gang_ravens': { name: 'Os Corvos', color: '#3b82f6' },
    'gang_ghosts': { name: 'Os Fantasmas', color: '#a855f7' },
    'gang_cartel': { name: 'Cartel Sombrio', color: '#eab308' }
};

// Definição do Arsenal Completo
const WEAPONS = {
    'glock': { damage: 15, speed: 14, maxAmmo: 17, reloadTime: 1200 },
    'mp5':   { damage: 12, speed: 18, maxAmmo: 30, reloadTime: 1500 },
    'ak47':  { damage: 28, speed: 16, maxAmmo: 25, reloadTime: 2000 },
    'xm8':   { damage: 22, speed: 20, maxAmmo: 30, reloadTime: 1800 },
    'shotgun': { damage: 45, speed: 12, maxAmmo: 8, reloadTime: 2500 },
    'minigun': { damage: 10, speed: 22, maxAmmo: 100, reloadTime: 3500 }
};

io.on('connection', (socket) => {
    console.log(`Sobrevivente conectado: ${socket.id}`);

    socket.on('joinGame', (data) => {
        let weaponInfo = WEAPONS[data.weapon] || WEAPONS['glock'];
        let gangData = GANGS[data.gang] || GANGS['gang_command'];

        players[socket.id] = {
            id: socket.id,
            name: data.name || 'Anônimo',
            gang: data.gang || 'gang_command',
            gangName: gangData.name,
            color: gangData.color,
            skin: data.skin || 'player_blue',
            weapon: data.weapon || 'glock',
            x: Math.random() * 1200 + 200,
            y: Math.random() * 1200 + 200,
            angle: 0,
            hp: 100,
            ammo: weaponInfo.maxAmmo,
            maxAmmo: weaponInfo.maxAmmo,
            kills: 0,
            alive: true,
            reloading: false
        };
    });

    socket.on('playerMove', (data) => {
        let p = players[socket.id];
        if (p && p.alive) {
            // Delimita os limites do mapa (1600x1600)
            p.x = Math.max(30, Math.min(1570, data.x));
            p.y = Math.max(30, Math.min(1570, data.y));
            p.angle = data.angle;
        }
    });

    socket.on('shoot', () => {
        let p = players[socket.id];
        if (!p || !p.alive || p.reloading) return;

        if (p.ammo > 0) {
            p.ammo--;
            let weaponInfo = WEAPONS[p.weapon] || WEAPONS['glock'];

            bullets.push({
                id: Math.random().toString(36).substr(2, 9),
                ownerId: socket.id,
                x: p.x + Math.cos(p.angle) * 20,
                y: p.y + Math.sin(p.angle) * 20,
                vx: Math.cos(p.angle) * weaponInfo.speed,
                vy: Math.sin(p.angle) * weaponInfo.speed,
                damage: weaponInfo.damage
            });
        }
    });

    socket.on('reload', () => {
        let p = players[socket.id];
        if (!p || !p.alive || p.reloading) return;

        let weaponInfo = WEAPONS[p.weapon] || WEAPONS['glock'];
        if (p.ammo < weaponInfo.maxAmmo) {
            p.reloading = true;
            setTimeout(() => {
                if (players[socket.id]) {
                    players[socket.id].ammo = weaponInfo.maxAmmo;
                    players[socket.id].reloading = false;
                }
            }, weaponInfo.reloadTime);
        }
    });

    socket.on('chatMessage', (text) => {
        let p = players[socket.id];
        if (p) {
            io.emit('chatMessage', { sender: `[${p.gangName}] ${p.name}`, text: text.substring(0, 80) });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        console.log(`Sobrevivente desconectado: ${socket.id}`);
    });
});

// Loop Principal do Servidor (60 FPS)
setInterval(() => {
    // Atualizar Balas
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        // Remover bala se sair do mapa
        if (b.x < 0 || b.x > 1600 || b.y < 0 || b.y > 1600) {
            bullets.splice(i, 1);
            continue;
        }

        // Colisão com Jogadores
        let hit = false;
        for (let id in players) {
            let p = players[id];
            if (p.alive && id !== b.ownerId) {
                let dist = Math.hypot(p.x - b.x, p.y - b.y);
                if (dist < 18) { // Acertou o jogador
                    p.hp -= b.damage;
                    hit = true;

                    io.to(id).emit('spawnDamage', { x: p.x, y: p.y, damage: b.damage });

                    if (p.hp <= 0) {
                        p.hp = 0;
                        p.alive = false;
                        
                        let killer = players[b.ownerId];
                        if (killer) {
                            killer.kills++;
                        }

                        // Respawn automático após 3 segundos
                        setTimeout(() => {
                            if (players[id]) {
                                players[id].hp = 100;
                                players[id].alive = true;
                                players[id].x = Math.random() * 1200 + 200;
                                players[id].y = Math.random() * 1200 + 200;
                                let wInfo = WEAPONS[players[id].weapon];
                                players[id].ammo = wInfo ? wInfo.maxAmmo : 30;
                            }
                        }, 3000);
                    }
                    break;
                }
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
    console.log(`Servidor rodando na porta ${PORT}`);
});
