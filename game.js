const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;
const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const tvWrapper = document.getElementById('tv-wrapper');
    canvas.width = BASE_WIDTH;
    canvas.height = BASE_HEIGHT;

    let floorNum = 1, timeLeft = 90, totalExp = 0, isGameOver = false, inSafeRoom = false;
    let gateOpen = false;
    let platforms = [], hazards = [], lockers = [], decals = [], lasers = [];
    let gateX = 20000, camX = 0, camY = 0, camShake = 0;
    
    // Input Handling
    const keys = { left: false, right: false, jump: false, action: false };
    window.onkeydown = e => { 
        if(e.code==='KeyA'||e.code==='ArrowLeft') keys.left = true;
        if(e.code==='KeyD'||e.code==='ArrowRight') keys.right = true;
        if(e.code==='Space'||e.code==='KeyW'||e.code==='ArrowUp') keys.jump = true;
        if(e.code==='KeyE') keys.action = true;
    };
    window.onkeyup = e => {
        if(e.code==='KeyA'||e.code==='ArrowLeft') keys.left = false;
        if(e.code==='KeyD'||e.code==='ArrowRight') keys.right = false;
        if(e.code==='Space'||e.code==='KeyW'||e.code==='ArrowUp') keys.jump = false;
        if(e.code==='KeyE') keys.action = false;
    };

    // Mobile mapping
    const bindBtn = (id, k) => {
        let btn = document.getElementById(id);
        btn.ontouchstart = (e) => { e.preventDefault(); keys[k] = true; };
        btn.ontouchend = (e) => { e.preventDefault(); keys[k] = false; };
    };
    bindBtn('btn-left', 'left'); bindBtn('btn-right', 'right');
    bindBtn('btn-jump', 'jump'); bindBtn('btn-action', 'action');

    // Settings Toggle
    let crtEnabled = false;
    function toggleSettings() {
        crtEnabled = !crtEnabled;
        if(crtEnabled) {
            tvWrapper.classList.add('tube-tv');
            document.getElementById('crt').classList.add('crt-active');
        } else {
            tvWrapper.classList.remove('tube-tv');
            document.getElementById('crt').classList.remove('crt-active');
        }
    }

    // Mod System
    const allMods = [
        { id: 'feather', name: 'HOLLOW', desc: 'Gravity = 0.6', exp: 30 },
        { id: 'speed', name: 'OVERCLOCK', desc: 'Speed = 1.5', exp: 30 },
        { id: 'jump', name: 'BOUNCE', desc: 'Jump x1.5', exp: 15 },
        { id: 'tracer', name: 'TRACED', desc: 'Spawn TRACER', exp: 600 },
        { id: 'bynd', name: 'BYND.V4', desc: 'Falling Pillars', exp: 700 },
        { id: 'puzzles', name: 'LOGIC_GATE', desc: 'Adds Lasers/Switches', exp: 500 },
        { id: 'vampire', name: 'DRAINING', desc: 'Timer x2 Speed', exp: 400 },
        { id: 'fragile', name: 'FRAGILE', desc: 'Fall Damage', exp: 950 }
    ];
    let activeMods = new Set();

    // --- ENTITIES & HAZARDS ---
    class Tracer {
        constructor() { this.active=false; this.x=0; this.y=0; }
        spawn() { this.active = true; this.x = p.x - 1200; this.y = p.y; }
        update() {
            if(!this.active || inSafeRoom) return;
            let tx = p.x+20, ty = p.y+20;
            let ang = Math.atan2(ty - this.y, tx - this.x);
            this.x += Math.cos(ang) * 4.5; this.y += Math.sin(ang) * 4.5;
            if (Math.hypot(this.x - tx, this.y - ty) < 40 && !p.hiding) die("TRACER_CONTACT");
        }
        draw(cx, cy) {
            if(!this.active) return;
            ctx.shadowBlur = 15; ctx.shadowColor = "#ff0000";
            ctx.fillStyle = "#000"; ctx.strokeStyle = "#f00"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(this.x-cx, this.y-cy, 30, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#f00";
            ctx.fillRect(this.x-cx-10, this.y-cy-10, 4, 15); ctx.fillRect(this.x-cx+6, this.y-cy-10, 4, 15);
        }
    }

    class Bynd {
        constructor() { this.pillars = []; this.timer = 0; }
        update() {
            if(!activeMods.has('bynd') || inSafeRoom) return;
            if(++this.timer > 120) {
                this.timer = 0;
                let tx = p.x + 300 + Math.random()*500;
                this.pillars.push({x: tx, y: -1000, ty: p.y+40, state: 'warn', t: 50});
            }
            this.pillars.forEach((b, i) => {
                if(b.state === 'warn') { b.t--; if(b.t<=0) b.state='fall'; }
                else if(b.state === 'fall') { 
                    b.y += 60; 
                    if(b.y+800 >= b.ty) { b.y = b.ty-800; b.state='landed'; b.t=20; camShake=15; }
                    if(Math.abs((b.x+50)-(p.x+20)) < 70 && p.y+40 > b.y+700 && !p.hiding) die("CRUSHED_BY_BYND");
                }
                else { b.t--; if(b.t<=0) this.pillars.splice(i,1); }
            });
        }
        draw(cx, cy) {
            this.pillars.forEach(b => {
                if(b.state === 'warn') { ctx.fillStyle="rgba(255,255,255,0.1)"; ctx.fillRect(b.x-cx, 0, 100, canvas.height); }
                ctx.fillStyle="#000"; ctx.strokeStyle="#0f0"; ctx.fillRect(b.x-cx, b.y-cy, 100, 800); ctx.strokeRect(b.x-cx, b.y-cy, 100, 800);
            });
        }
    }

    class PowerDown {
        constructor() { this.active=false; this.warningTimer=0; this.segs=[]; this.x=0; }
        trigger() { 
            if(inSafeRoom || this.active) return; 
            this.active = true; 
            this.warningTimer = 330; // 5.5 seconds of warning
            this.segs = []; 
        }
        update() {
            if(!this.active) return;
            
            if(this.warningTimer > 0) {
                this.warningTimer--;
                if(this.warningTimer === 0) {
                    this.x = camX - 2500; // Spawn from the beginning/far behind
                }
                return; // Wait out the warning before moving
            }

            this.x += 48; 
            this.segs.unshift({x: this.x, y: p.y+20 + Math.sin(Date.now()/50)*30});
            if(this.segs.length > 20) this.segs.pop();
            
            if(Math.abs(this.x - p.x) < 50 && !p.hiding) die("POWERDOWN_PURGE");
            if(this.x > p.x + 2500) this.active = false; // Deactivate when far ahead
        }
        draw(cx, cy) {
            if(!this.active || this.warningTimer > 0) return; // Don't draw snake during warning
            this.segs.forEach((s, i) => {
                ctx.fillStyle = i===0 ? "#f0f" : `rgba(150,0,150,${1 - i/20})`;
                ctx.beginPath(); ctx.arc(s.x-cx, s.y-cy, 40-i*1.5, 0, Math.PI*2); ctx.fill();
            });
        }
    }

    // --- ROBUST COLLISION ENGINE (AABB) ---
    class Player {
        constructor() { this.reset(); }
        reset() { this.x=200; this.y=400; this.vx=0; this.vy=0; this.w=40; this.h=40; this.vw=40; this.vh=40; this.grounded=false; this.hiding=false; this.wallDir=0; }
        
        update() {
            this.hiding = keys.action && lockers.some(l => this.x+this.w > l.x && this.x < l.x+l.w && Math.abs(this.y-l.y) < 100);
            if (this.hiding) { this.vx=0; this.vy=0; return; }

            // Movement Config
            let spd = activeMods.has('speed') ? 3.8 : 2.2;
            let grav = activeMods.has('feather') ? 0.6 : 1.2;
            let jmp = activeMods.has('jump') ? -28 : -20;

            if (keys.right) this.vx += spd;
            if (keys.left) this.vx -= spd;
            this.vx *= 0.85; // Friction

            // --- X AXIS COLLISION ---
            this.x += this.vx;
            this.wallDir = 0;
            platforms.forEach(pl => {
                if (this.x < pl.x+pl.w && this.x+this.w > pl.x && this.y < pl.y+pl.h && this.y+this.h > pl.y) {
                    if (this.vx > 0) { this.x = pl.x - this.w; this.vx = 0; this.wallDir = 1; }
                    else if (this.vx < 0) { this.x = pl.x + pl.w; this.vx = 0; this.wallDir = -1; }
                }
            });

            // --- JUMP & GLIDE ---
            if (keys.jump) {
                if (this.grounded) {
                    this.vy = jmp; this.grounded = false; this.vh = 60; this.vw = 20; camShake = 5;
                } else if (this.wallDir !== 0 && this.vy > 0) {
                    // WALL HOP
                    this.vy = jmp * 0.9; this.vx = this.wallDir * -15; this.wallDir = 0; camShake = 8;
                } else if (this.vy > 0) {
                    // GLIDE
                    this.vy = 2; this.vh = 20; this.vw = 60;
                }
            }

            // --- Y AXIS COLLISION ---
            this.vy += grav;
            if(this.wallDir !== 0 && this.vy > 0) this.vy *= 0.7; // Wall slide friction
            this.y += this.vy;
            
            let wasGrounded = this.grounded;
            this.grounded = false;

            platforms.forEach(pl => {
                if (this.x < pl.x+pl.w && this.x+this.w > pl.x && this.y < pl.y+pl.h && this.y+this.h > pl.y) {
                    if (this.vy > 0) { // Landing
                        if (activeMods.has('fragile') && !wasGrounded && this.vy > 35) die("SHATTERED_IMPACT");
                        this.y = pl.y - this.h; this.vy = 0; this.grounded = true;
                        if (!wasGrounded) { this.vw = 60; this.vh = 20; camShake = 4; }
                    } else if (this.vy < 0) { // Hit Ceiling
                        this.y = pl.y + pl.h; this.vy = 0;
                    }
                }
            });

            // Squish recovery
            this.vw += (this.w - this.vw) * 0.2; this.vh += (this.h - this.vh) * 0.2;

            // Hazards & Logic
            if (this.y > canvas.height + 800) die("VOID_FALL");
            hazards.forEach(h => { if (this.x+this.w>h.x && this.x<h.x+h.w && this.y+this.h>h.y && this.y<h.y+h.h) die("HAZARD_CONTACT"); });
            lasers.forEach(l => { 
                if (l.active && this.x+this.w>l.x && this.x<l.x+l.w && this.y+this.h>l.y && this.y<l.y+l.h) die("LASER_EVAPORATION"); 
                if (keys.action && Math.abs(this.x - l.sx) < 60 && Math.abs(this.y - l.sy) < 60) l.active = false;
            });

            if (this.x > gateX && !inSafeRoom) { inSafeRoom = true; calculateRewards(); }
            if (inSafeRoom && gateOpen && this.x > gateX + 1600) nextFloor();
        }

        draw(cx, cy) {
            ctx.save(); if (this.hiding) ctx.globalAlpha = 0.3;
            let ox = (this.w - this.vw)/2, oy = (this.h - this.vh);
            ctx.fillStyle = "#2ecc71"; ctx.fillRect(this.x-cx+ox, this.y-cy+oy, this.vw, this.vh);
            
            // Eyes
            ctx.fillStyle = "#000";
            ctx.fillRect(this.x-cx+ox + 8, this.y-cy+oy + 8, 4, 20);
            ctx.fillRect(this.x-cx+ox + 24, this.y-cy+oy + 8, 4, 20);
            ctx.restore();
        }
    }

    const tracer = new Tracer(); const bynd = new Bynd(); const pd = new PowerDown(); const p = new Player();

    function drawSafeRoom(cx, cy) {
        let sx = gateX + 800, sy = canvas.height - 150;
        
        // Hearty (Heart Shape)
        let bounce = Math.sin(Date.now() * 0.005) * 5;
        ctx.save();
        ctx.translate(sx - cx + 20, sy - 30 - cy + bounce);
        ctx.scale(1.2, 1.2);
        
        ctx.fillStyle = "#ff4d4d";
        ctx.beginPath(); // Bezier Heart Math
        ctx.moveTo(0, 5);
        ctx.bezierCurveTo(-20, -15, -40, 10, 0, 35);
        ctx.bezierCurveTo(40, 10, 20, -15, 0, 5);
        ctx.fill();
        
        // Hearty Eyes
        ctx.fillStyle = "#000";
        ctx.fillRect(-12, 5, 4, 15);
        ctx.fillRect(8, 5, 4, 15);
        ctx.restore();

        if (Math.abs(p.x - sx) < 100) {
            ctx.fillStyle = "#fff"; ctx.fillText("[E] TALK", sx-cx-10, sy-60-cy+bounce);
            if (keys.action) document.getElementById('dialogue-box').style.display = 'block';
        }

        // Blue Button
        let btnX = gateX + 1200;
        ctx.fillStyle = gateOpen ? "#055" : "#0ff"; ctx.fillRect(btnX - cx, sy - 20 - cy, 40, 20);
        if (!gateOpen && Math.abs(p.x - btnX) < 60) {
            ctx.fillStyle = "#fff"; ctx.fillText("[E] PRESS", btnX-cx-10, sy-30-cy);
            if (keys.action) { gateOpen = true; camShake = 20; }
        }

        // The Gate
        let gX = gateX + 1500;
        ctx.fillStyle = "#222"; ctx.strokeStyle = "#0ff"; ctx.lineWidth = 4;
        let gY = sy - 400; 
        let gH = gateOpen ? 0 : 400;
        if(!gateOpen) { ctx.fillRect(gX - cx, gY - cy, 100, gH); ctx.strokeRect(gX - cx, gY - cy, 100, gH); }
        if(!gateOpen && p.x + p.w > gX) { p.x = gX - p.w; p.vx = 0; }
    }

    function generateFloor() {
        platforms = []; hazards = []; lockers = []; decals = []; lasers = [];
        let curX = 0; 
        platforms.push({x: -500, y: canvas.height - 150, w: 1500, h: 600}); curX = 1000;
        
        while (curX < gateX - 1500) {
            for(let i=0; i<3; i++) decals.push({x: curX + Math.random()*500, y: Math.random()*canvas.height, w: 50+Math.random()*150, h: 50+Math.random()*150, c: `rgba(0,255,234,0.${Math.floor(Math.random()*2+1)})`});

            let type = Math.random();
            let y = canvas.height - 150 - Math.random()*200;
            let platW = 600;
            
            if (type < 0.3) { // Normal Jump Gap
                curX += 200 + Math.random()*400;
                platW = 600;
                platforms.push({x: curX, y: y, w: platW, h: 600});
            } 
            else if (type < 0.5) { // Lava Pit
                platforms.push({x: curX, y: y, w: 200, h: 600});
                hazards.push({x: curX+200, y: y+100, w: 400, h: 500, type: 'lava'});
                platW = 200;
                platforms.push({x: curX+600, y: y, w: platW, h: 600});
                curX += 800; // Shift curX to the end of the pit block
            } 
            else if (type < 0.7) { // High Wall / Wall Hop Section
                platforms.push({x: curX, y: y, w: 400, h: 600});
                platforms.push({x: curX+600, y: y-300, w: 150, h: 800}); 
                platW = 400;
                platforms.push({x: curX+900, y: y-400, w: platW, h: 600}); 
                y = y - 400; // Update local y for locker placement
                curX += 1300;
            } 
            else { // Bridge
                platforms.push({x: curX, y: y, w: 200, h: 600});
                platforms.push({x: curX+200, y: y, w: 500, h: 20}); 
                platW = 200;
                platforms.push({x: curX+700, y: y, w: platW, h: 600});
                curX += 900;
            }

            // Decor & Logic - Locked securely onto the active platform
            if(Math.random() > 0.5) lockers.push({x: curX + (platW/2) - 30, y: y - 100, w: 60, h: 100});
            if(activeMods.has('puzzles') && Math.random() > 0.6) {
                lasers.push({x: curX - 100, y: y-300, w: 20, h: 300, sx: curX - 250, sy: y-20, active: true});
            }
        }
        
        platforms.push({x: gateX, y: canvas.height - 150, w: 4000, h: 600});
        tracer.active = false; if (activeMods.has('tracer')) tracer.spawn();
    }

    function calculateRewards() { totalExp += (150 + [...activeMods].reduce((a, id) => a + allMods.find(m => m.id === id).exp, 0)); gateOpen = false; }
    function rerollMods() { openShop(); } // Free reroll
    function openShop() { document.getElementById('dialogue-box').style.display='none'; document.getElementById('shop-menu').style.display='block'; renderMods(); }
    
    function renderMods() {
        const c = document.getElementById('mod-container'); c.innerHTML = '';
        [...allMods].sort(() => 0.5 - Math.random()).slice(0, 4).forEach(m => {
            let d = document.createElement('div'); d.className = `mod-card ${activeMods.has(m.id) ? 'active' : ''}`;
            d.innerHTML = `<b>${m.name}</b><br><small>${m.desc}</small><br><span class="exp-tag">+${m.exp} SP</span>`;
            d.onclick = () => { activeMods.has(m.id) ? activeMods.delete(m.id) : activeMods.add(m.id); renderMods(); };
            c.appendChild(d);
        });
    }
    
    function nextFloor() { floorNum++; inSafeRoom=false; p.reset(); timeLeft=90; document.getElementById('floor-tag').innerText = "//SECTOR_"+floorNum; generateFloor(); }
    function die(msg) { isGameOver=true; document.getElementById('tv-wrapper').style.filter="saturate(5) hue-rotate(90deg)"; setTimeout(()=> { alert("FATAL: " + msg); location.reload(); }, 500); }

    function loop() {
        if (isGameOver) return;
        
        // Powerdown Environmental Effects
        if (pd.active) {
            ctx.fillStyle = '#1e0033'; // Purple background during Powerdown
            camShake = 10;              // Constant screen shake
        } else {
            ctx.fillStyle = '#050508';
        }
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        camX += (p.x - canvas.width / 3 - camX) * 0.1;
        camY += ((p.y - canvas.height / 1.5) - camY) * 0.1;
        
        ctx.save(); 
        if(camShake > 0) { ctx.translate((Math.random()-0.5)*camShake, (Math.random()-0.5)*camShake); if(!pd.active) camShake *= 0.85; }

        decals.forEach(d => { ctx.fillStyle=d.c; ctx.fillRect(d.x - camX*0.5, d.y - camY*0.5, d.w, d.h); });

        platforms.forEach(pl => { ctx.fillStyle = '#111'; ctx.fillRect(pl.x-camX, pl.y-camY, pl.w, pl.h); ctx.strokeStyle = '#00ffea'; ctx.strokeRect(pl.x-camX, pl.y-camY, pl.w, pl.h); });
        hazards.forEach(h => { ctx.fillStyle = h.type==='lava' ? '#f30' : '#300'; ctx.fillRect(h.x-camX, h.y-camY, h.w, h.h); });
        lockers.forEach(l => { ctx.fillStyle = '#000'; ctx.fillRect(l.x-camX, l.y-camY, l.w, l.h); ctx.strokeStyle = '#fff'; ctx.strokeRect(l.x-camX, l.y-camY, l.w, l.h); });
        
        lasers.forEach(l => {
            ctx.fillStyle = l.active ? "#f00" : "#050"; ctx.fillRect(l.sx-camX, l.sy-camY, 20, 20); 
            if(l.active) { ctx.fillStyle="rgba(255,0,0,0.6)"; ctx.fillRect(l.x-camX, l.y-camY, l.w, l.h); }
        });

        pd.update(); pd.draw(camX, camY);
        bynd.update(); bynd.draw(camX, camY);
        tracer.update(); tracer.draw(camX, camY);
        p.update(); p.draw(camX, camY);
        
        if (inSafeRoom) drawSafeRoom(camX, camY);
        
        ctx.restore();
        
        if(activeMods.has('blind')) {
            let g = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 50, canvas.width/2, canvas.height/2, canvas.width*0.8);
            g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(0,0,0,0.95)');
            ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width, canvas.height);
        }

        document.getElementById('exp-display').innerText = "SYSTEM_POINTS: " + totalExp;
        requestAnimationFrame(loop);
    }
let scale = 1;

function resizeGame() {
    const scaleX = window.innerWidth / BASE_WIDTH;
    const scaleY = window.innerHeight / BASE_HEIGHT;
    scale = Math.min(scaleX, scaleY);
}

window.addEventListener('resize', resizeGame);
resizeGame();
    setInterval(() => { if(!isGameOver && !inSafeRoom) { timeLeft -= (activeMods.has('vampire') ? 2 : 1); document.getElementById('timer').innerText = `0:${timeLeft < 10 ? '0' : ''}${timeLeft}`; if (timeLeft <= 0) die("TIME_EXPIRED"); } }, 1000);
    setInterval(() => { if(!isGameOver && !inSafeRoom && Math.random() < 0.3) pd.trigger(); }, 6000);
    
    generateFloor(); loop();
