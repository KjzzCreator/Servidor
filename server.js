const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let bullets = [];

const GANGS = {
    'gang_command': { name: 'Comando da Cidade', color: 0xef4444 },
    'gang_ravens': { name: 'Os Corvos', color: 0x3b82f6 },
    'gang_ghosts': { name: 'Os Fantasmas', color: 0xa855f7 },
    'gang_cartel': { name: 'Cartel Sombrio', color: 0xeab308 }
};

const WEAPONS = {
    'glock': { damage: 15, speed: 1.5, maxAmmo: 17, reloadTime: 1200 },
    'mp5':   { damage: 12, speed: 1.8, maxAmmo: 30, reloadTime: 1500 },
    'ak47':  { damage: 28, speed: 1.7, maxAmmo: 25, reloadTime: 2000 },
    'xm8':   { damage: 22, speed: 1.9, maxAmmo: 30, reloadTime: 1800 },
    'shotgun': { damage: 45, speed: 1.3, maxAmmo: 8, reloadTime: 2500 },
    'minigun': { damage: 10, speed: 2.2, maxAmmo: 100, reloadTime: 3500 }
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
            x: Math.random() * 800 - 400,
            y: 0.75,
            z: Math.random() * 800 - 400,
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
            p.x = Math.max(-500, Math.min(500, data.x));
            p.z = Math.max(-500, Math.min(500, data.z));
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
                ownerId: socket.id,
                x: p.x + Math.sin(p.angle) * 15,
                z: p.z + Math.cos(p.angle) * 15,
                vx: Math.sin(p.angle) * (weaponInfo.speed * 1.5),
                vz: Math.cos(p.angle) * (weaponInfo.speed * 1.5),
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

// Loop principal do servidor otimizado para 30 FPS (reduz o lag pela metade)
setInterval(() => {
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.z += b.vz;

        if (b.x < -550 || b.x > 550 || b.z < -550 || b.z > 550) {
            bullets.splice(i, 1);
            continue;
        }

        let hit = false;
        for (let id in players) {
            let p = players[id];
            if (p.alive && id !== b.ownerId) {
                let dist = Math.hypot(p.x - b.x, p.z - b.z);
                if (dist < 15) {
                    p.hp -= b.damage;
                    hit = true;

                    io.to(id).emit('spawnDamage', { x: p.x, z: p.z, damage: b.damage });

                    if (p.hp <= 0) {
                        p.hp = 0;
                        p.alive = false;
                        
                        let killer = players[b.ownerId];
                        if (killer) killer.kills++;

                        setTimeout(() => {
                            if (players[id]) {
                                players[id].hp = 100;
                                players[id].alive = true;
                                players[id].x = Math.random() * 800 - 400;
                                players[id].z = Math.random() * 800 - 400;
                                let wInfo = WEAPONS[players[id].weapon];
                                players[id].ammo = wInfo ? wInfo.maxAmmo : 30;
                            }
                        }, 3000);
                    }
                    break;
                }
            }
        }

        if (hit) bullets.splice(i, 1);
    }

    io.emit('gameState', { players, bullets });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor 3D otimizado rodando na porta ${PORT}`);
});
