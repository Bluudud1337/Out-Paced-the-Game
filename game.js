import { handleHorizontal, handleVertical } from './physics.js';

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const tvWrapper = document.getElementById('tv-wrapper');
canvas.width = BASE_WIDTH;
canvas.height = BASE_HEIGHT;

let floorNum = 1, timeLeft = 90, totalExp = 0, isGameOver = false, inSafeRoom = false;
let gateOpen = false;
let safeRoomDoorSlammed = false;
let safeRoomDoorTimer = 0;
let carryingPlug = false;
let inElevator = false;
let elevatorTimer = 0;
const ELEVATOR_DURATION = 300;
let platforms = [], hazards = [], lockers = [], decals = [], lasers = [];
let ceilings = [], vents = [];
let rooms = [], bgLayers = [];
let puzzles = [];
let gateX = 20000, camX = 0, camY = 0, camShake = 0;
let frameCount = 0;
let isPaused = false;

// --- VINE STATE ---
let vinePatches = [];
let vineCaught = false;
let vineCaughtPatch = null;
let vineEscapeCount = 0;
let vineJumpWasUp = true;
let vineTrapTime = 0;
const VINE_ESCAPE_JUMPS = 8;
const VINE_FLOWER_START = 180;
const VINE_FLOWER_KILL = 480;

// Vent system state
let inVentSystem = false;
let ventTimer = 0;
const VENT_CRAWL_TIME = 600;

// Dodge system
let dodgeCharges = 5, dodgeMax = 5, dodgeCooldown = 0, isDodging = false, dodgeTimer = 0;
const DODGE_DURATION = 20, DODGE_COOLDOWN = 30;

// Shop chat system
let shopChatState = 0, shopChatTimer = 0;
const shopDialogue = [
    { hearty: "//WELCOME_BACK. NEED_UPGRADES?", options: ["SHOW_MODS", "TALK"] },
    { hearty: "//SECTOR_CLEAR. NICE_WORK.", options: ["SHOW_MODS", "LEAVE"] },
    { hearty: "//THE_LAB_GETS_DEEPER._STAY_SHARP.", options: ["SHOW_MODS", "TALK_MORE"] },
    { hearty: "//I_USED_TO_RUN_TESTS_HERE._NOW_I_JUST_VEND.", options: ["TALK_MORE", "SHOW_MODS"] },
    { hearty: "//THE_VOID_BELOW?_DON'T_FALL._SERIOUSLY.", options: ["SHOW_MODS", "LEAVE"] },
    { hearty: "//TRACERS?_BYND?_YEAH,_WE_MADE_THOSE._MISTAKES_WERE_MADE.", options: ["TALK_MORE", "SHOW_MODS"] },
    { hearty: "//PHASE_TECH_IS_EXPERIMENTAL._DON'T_RELY_ON_IT.", options: ["SHOW_MODS", "LEAVE"] },
    { hearty: "//EACH_SECTOR_GETS_WORSE._BUT_THE_PAY_IS_GOOD._...THERE_IS_NO_PAY.", options: ["TALK_MORE", "SHOW_MODS"] },
];
let currentDialogue = 0;

// Particle system
let particles = [];
function spawnParticles(x, y, color, count, speed, life) {
    for (let i = 0; i < count; i++) {
        particles.push({ x, y, vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.5) * speed, life: life + Math.random() * life * 0.5, maxLife: life + Math.random() * life * 0.5, color, size: 2 + Math.random() * 3 });
    }
}
function updateParticles() { for (let i = particles.length - 1; i >= 0; i--) { let pt = particles[i]; pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.1; pt.life--; if (pt.life <= 0) particles.splice(i, 1); } }
function drawParticles(cx, cy) { particles.forEach(pt => { ctx.globalAlpha = pt.life / pt.maxLife; ctx.fillStyle = pt.color; ctx.fillRect(pt.x - cx, pt.y - cy, pt.size, pt.size); }); ctx.globalAlpha = 1; }

// Ghost trail system
let ghostTrail = [];
const MAX_GHOSTS = 8;

// Input Handling - E is a TOGGLE
const keys = { left: false, right: false, jump: false, action: false, slide: false };
let actionPressed = false;
window.onkeydown = e => {
    if (e.code === 'KeyP') { togglePause(); return; }
    if (isPaused) return;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') keys.jump = true;
    if (e.code === 'KeyE' && !actionPressed) { keys.action = true; actionPressed = true; }
    if (e.code === 'ShiftLeft' || e.code === 'KeyS' || e.code === 'ArrowDown') keys.slide = true;
};
window.onkeyup = e => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') keys.jump = false;
    if (e.code === 'KeyE') { keys.action = false; actionPressed = false; }
    if (e.code === 'ShiftLeft' || e.code === 'KeyS' || e.code === 'ArrowDown') keys.slide = false;
};

const bindBtn = (id, k) => { let btn = document.getElementById(id); btn.ontouchstart = (e) => { e.preventDefault(); keys[k] = true; }; btn.ontouchend = (e) => { e.preventDefault(); keys[k] = false; }; };
bindBtn('btn-left', 'left'); bindBtn('btn-right', 'right'); bindBtn('btn-jump', 'jump'); bindBtn('btn-action', 'action');

let crtEnabled = false;
function toggleSettings() { crtEnabled = !crtEnabled; if (crtEnabled) { tvWrapper.classList.add('tube-tv'); document.getElementById('crt').classList.add('crt-active'); } else { tvWrapper.classList.remove('tube-tv'); document.getElementById('crt').classList.remove('crt-active'); } }

// Mod System
const allMods = [
    { id: 'feather', name: 'HOLLOW', desc: 'Gravity = 0.6', exp: 30, icon: 'FEATHER' },
    { id: 'speed', name: 'OVERCLOCK', desc: 'Speed = 1.5', exp: 30, icon: 'BOLT' },
    { id: 'jump', name: 'BOUNCE', desc: 'Jump x1.5', exp: 15, icon: 'ARROW_UP' },
    { id: 'chrono', name: 'CHRONO', desc: 'Timer = 120s', exp: 50, icon: 'CLOCK' },
    { id: 'dodge', name: 'PHASE', desc: 'Dodge meter.', exp: 200, icon: 'SHIELD' },
    { id: 'tracer', name: 'TRACED', desc: 'Spawns TRACER.', exp: 600, icon: 'CROSSHAIR' },
    { id: 'bynd', name: 'BYND.V4', desc: 'Falling Pillars', exp: 700, icon: 'PILLAR' },
    { id: 'puzzles', name: 'LOGIC_GATE', desc: 'Adds Puzzles', exp: 500, icon: 'PUZZLE' },
    { id: 'vampire', name: 'DRAINING', desc: 'Timer x2 Speed', exp: 400, icon: 'SKULL' },
    { id: 'fragile', name: 'FRAGILE', desc: 'Fall Damage', exp: 950, icon: 'CRACK' },
    { id: 'dropn', name: "DROP'N", desc: 'Halt', exp: 500, icon: 'STOP' },
    { id: 'sote', name: 'SOTE', desc: 'Something to leap for.', exp: 550, icon: 'STAR' },
    { id: 'vents', name: 'DUCTWORK', desc: 'Vent system access', exp: 350, icon: 'DUCT' },
    { id: 'fastpd', name: '', desc: 'Powerdown is 2x faster.', exp: 800, icon: 'FAST' },
    { id: 'vine', name: 'OVERGROWTH', desc: 'Ground vines latch on. Spam jump to break free.', exp: 650, icon: 'VINE' },
];
let activeMods = new Set();

// --- DODGE SYSTEM ---
function tryDodge() { if (!activeMods.has('dodge')) return false; if (dodgeCharges <= 0 || dodgeCooldown > 0 || isDodging) return false; dodgeCharges--; isDodging = true; dodgeTimer = DODGE_DURATION; dodgeCooldown = DODGE_COOLDOWN; spawnParticles(p.x + p.w / 2, p.y + p.h / 2, "#4488ff", 12, 6, 15); return true; }
function updateDodge() { if (dodgeCooldown > 0) dodgeCooldown--; if (isDodging) { dodgeTimer--; if (dodgeTimer <= 0) isDodging = false; } }

// --- PUZZLE SYSTEM ---
class Puzzle {
    constructor(config) {
        this.type = config.type; this.x = config.x; this.y = config.y;
        this.doorX = config.doorX; this.doorY = config.doorY;
        this.doorW = config.doorW || 100; this.doorH = config.doorH || 400;
        this.solved = false; this.doorOpen = false;
        if (config.type === 'switch') { this.switchX = config.switchX; this.switchY = config.switchY; this.switchOn = false; }
        else if (config.type === 'cord') { this.socketX = config.socketX; this.socketY = config.socketY; this.plugX = config.plugX; this.plugY = config.plugY; this.plugHomeX = config.plugX; this.plugHomeY = config.plugY; this.plugged = false; this.dragging = false; }
        else if (config.type === 'multi_switch') { this.switches = config.switches; }
    }
    update() {
        if (this.solved) return;
        if (this.type === 'switch') {
            if (keys.action && Math.abs(p.x - this.switchX) < 60 && Math.abs(p.y - this.switchY) < 60) { this.switchOn = !this.switchOn; if (this.switchOn) { this.solved = true; this.doorOpen = true; camShake = 8; } keys.action = false; }
        } else if (this.type === 'cord') {
            if (this.plugged) { this.solved = true; this.doorOpen = true; carryingPlug = false; return; }
            if (keys.action && !this.dragging && Math.abs(p.x - this.plugHomeX) < 50 && Math.abs(p.y - this.plugHomeY) < 50) { this.dragging = true; carryingPlug = true; keys.action = false; }
            if (keys.action && this.dragging) { this.dragging = false; carryingPlug = false; this.plugX = p.x + p.w / 2; this.plugY = p.y + p.h / 2; this.plugHomeX = this.plugX; this.plugHomeY = this.plugY; keys.action = false; }
            if (this.dragging) { this.plugX = p.x + p.w / 2; this.plugY = p.y + p.h / 2; if (Math.abs(this.plugX - this.socketX) < 40 && Math.abs(this.plugY - this.socketY) < 40) { this.plugX = this.socketX; this.plugY = this.socketY; this.plugged = true; this.dragging = false; carryingPlug = false; camShake = 8; spawnParticles(this.socketX, this.socketY, "#0f0", 10, 5, 15); } }
        } else if (this.type === 'multi_switch') {
            this.switches.forEach(sw => { if (keys.action && Math.abs(p.x - sw.x) < 60 && Math.abs(p.y - sw.y) < 60) { sw.on = !sw.on; keys.action = false; spawnParticles(sw.x, sw.y, sw.on ? "#0f0" : "#f00", 5, 3, 10); } });
            if (this.switches.every(sw => sw.on)) { this.solved = true; this.doorOpen = true; camShake = 12; spawnParticles(this.doorX + this.doorW / 2, this.doorY, "#0f0", 20, 8, 20); }
        }
        if (!this.doorOpen && p.x + p.w > this.doorX && p.x < this.doorX + this.doorW && p.y + p.h > this.doorY && p.y < this.doorY + this.doorH) { if (p.vx > 0) { p.x = this.doorX - p.w; p.vx = 0; } else if (p.vx < 0) { p.x = this.doorX + this.doorW; p.vx = 0; } }
    }
    draw(cx, cy) {
        if (!this.doorOpen) {
            let dx = this.doorX - cx, dy = this.doorY - cy;
            ctx.fillStyle = '#1a0808'; ctx.fillRect(dx, dy, this.doorW, this.doorH);
            ctx.fillStyle = '#ff4d4d'; for (let sy = 0; sy < this.doorH; sy += 30) ctx.fillRect(dx, dy + sy, this.doorW, 3);
            ctx.strokeStyle = '#f00'; ctx.lineWidth = 3; ctx.strokeRect(dx, dy, this.doorW, this.doorH);
            ctx.fillStyle = '#f00'; ctx.fillRect(dx + this.doorW / 2 - 10, dy + this.doorH / 2 - 10, 20, 20);
            ctx.fillStyle = '#1a0808'; ctx.fillRect(dx + this.doorW / 2 - 6, dy + this.doorH / 2 - 6, 12, 12);
            ctx.fillStyle = '#f00'; ctx.font = 'bold 10px Consolas'; ctx.textAlign = 'center'; ctx.fillText('LOCKED', dx + this.doorW / 2, dy + this.doorH / 2 + 30); ctx.textAlign = 'left';
        } else { let dx = this.doorX - cx, dy = this.doorY - cy; ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)'; ctx.lineWidth = 2; ctx.strokeRect(dx, dy, this.doorW, this.doorH); ctx.fillStyle = 'rgba(0, 255, 0, 0.05)'; ctx.fillRect(dx, dy, this.doorW, this.doorH); }
        if (this.type === 'switch') {
            let sx = this.switchX - cx, sy = this.switchY - cy;
            ctx.fillStyle = '#0c1018'; ctx.fillRect(sx - 15, sy - 20, 30, 40);
            ctx.strokeStyle = this.switchOn ? '#0f0' : '#f00'; ctx.lineWidth = 2; ctx.strokeRect(sx - 15, sy - 20, 30, 40);
            ctx.fillStyle = this.switchOn ? '#0f0' : '#f00'; ctx.fillRect(sx - 4, this.switchOn ? sy - 12 : sy + 4, 8, 16);
            if (!this.solved && Math.abs(p.x - this.switchX) < 60 && Math.abs(p.y - this.switchY) < 60) { ctx.fillStyle = '#fff'; ctx.font = '12px Consolas'; ctx.fillText('[E] FLIP', sx - 20, sy - 30); }
        } else if (this.type === 'cord') {
            let skx = this.socketX - cx, sky = this.socketY - cy;
            ctx.fillStyle = '#0c1018'; ctx.fillRect(skx - 12, sky - 12, 24, 24);
            ctx.strokeStyle = this.plugged ? '#0f0' : '#ff4d4d'; ctx.lineWidth = 2; ctx.strokeRect(skx - 12, sky - 12, 24, 24);
            ctx.fillStyle = this.plugged ? '#0f0' : '#333'; ctx.fillRect(skx - 4, sky - 4, 3, 8); ctx.fillRect(skx + 2, sky - 4, 3, 8);
            if (!this.plugged) { ctx.fillStyle = '#ff4d4d'; ctx.font = '8px Consolas'; ctx.fillText('SOCKET', skx - 14, sky + 22); let pkx = this.plugX - cx, pky = this.plugY - cy; ctx.strokeStyle = this.dragging ? '#ff0' : '#555'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pkx, pky); let midX = (pkx + skx) / 2, midY = Math.max(pky, sky) + 40; ctx.quadraticCurveTo(midX, midY, skx, sky); ctx.stroke(); ctx.fillStyle = this.dragging ? '#ff0' : '#888'; ctx.fillRect(pkx - 8, pky - 6, 16, 12); ctx.strokeStyle = this.dragging ? '#ff0' : '#aaa'; ctx.lineWidth = 2; ctx.strokeRect(pkx - 8, pky - 6, 16, 12); ctx.fillStyle = '#aaa'; ctx.fillRect(pkx - 3, pky - 10, 2, 6); ctx.fillRect(pkx + 2, pky - 10, 2, 6); if (!this.dragging && Math.abs(p.x - this.plugHomeX) < 50 && Math.abs(p.y - this.plugHomeY) < 50) { ctx.fillStyle = '#fff'; ctx.font = '12px Consolas'; ctx.fillText('[E] GRAB', pkx - 20, pky - 16); } if (this.dragging) { ctx.fillStyle = '#ff0'; ctx.font = '10px Consolas'; ctx.fillText('PLUG >> SOCKET', pkx - 40, pky - 16); } }
        } else if (this.type === 'multi_switch') {
            this.switches.forEach((sw, i) => { let sx = sw.x - cx, sy = sw.y - cy; ctx.fillStyle = '#0c1018'; ctx.fillRect(sx - 15, sy - 20, 30, 40); ctx.strokeStyle = sw.on ? '#0f0' : '#f00'; ctx.lineWidth = 2; ctx.strokeRect(sx - 15, sy - 20, 30, 40); ctx.fillStyle = sw.on ? '#0f0' : '#f00'; ctx.fillRect(sx - 4, sw.on ? sy - 12 : sy + 4, 8, 16); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '8px Consolas'; ctx.fillText('' + (i + 1), sx - 3, sy + 28); if (!this.solved && Math.abs(p.x - sw.x) < 60 && Math.abs(p.y - sw.y) < 60) { ctx.fillStyle = '#fff'; ctx.font = '12px Consolas'; ctx.fillText('[E] FLIP', sx - 20, sy - 30); } });
            if (!this.solved) { let onCount = this.switches.filter(s => s.on).length; ctx.fillStyle = 'rgba(0,255,234,0.5)'; ctx.font = '10px Consolas'; ctx.fillText(onCount + '/' + this.switches.length + ' ACTIVE', this.doorX - cx + 10, this.doorY - cy - 10); }
        }
    }
}

// --- CRAWL ENTITY (vent monster) ---
class Crawl {
    constructor() { this.active = false; this.timer = 0; this.segments = []; this.headX = 0; this.headY = 0; }
    trigger() { if (this.active) return; this.active = true; this.timer = 0; this.segments = []; this.headX = p.x - 600; this.headY = p.y; }
    update() {
        if (!this.active || inSafeRoom) { if (inSafeRoom && this.active) this.reset(); return; } this.timer++;
        let dx = p.x - this.headX, dy = p.y - this.headY;
        let dist = Math.hypot(dx, dy);
        this.headX += (dx / dist) * 3; this.headY += (dy / dist) * 3;
        this.segments.unshift({ x: this.headX, y: this.headY });
        if (this.segments.length > 30) this.segments.pop();
        if (dist < 40 && !isDodging) { if (activeMods.has('dodge') && tryDodge()) { } else die("CONSUMED_BY_CRAWL"); }
        if (!inVentSystem) this.active = false;
    }
    reset() { this.active = false; this.timer = 0; this.segments = []; }
    draw(cx, cy) {
        if (!this.active) return;
        for (let i = 0; i < this.segments.length; i++) {
            let s = this.segments[i];
            let alpha = 1 - i / this.segments.length;
            let radius = 15 - i * 0.4;
            if (radius <= 0) continue;
            ctx.fillStyle = `rgba(10, 5, 15, ${alpha * 0.9})`;
            ctx.beginPath(); ctx.arc(s.x - cx, s.y - cy, radius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(40, 0, 60, ${alpha * 0.6})`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(s.x - cx, s.y - cy, radius, 0, Math.PI * 2); ctx.stroke();
        }
        if (this.segments.length > 0) {
            let hx = this.headX - cx, hy = this.headY - cy;
            ctx.strokeStyle = 'rgba(30, 0, 50, 0.7)'; ctx.lineWidth = 2;
            for (let t = 0; t < 6; t++) {
                let baseAngle = (Math.PI / 3) * t + frameCount * 0.03;
                ctx.beginPath(); ctx.moveTo(hx, hy);
                let len = 25 + Math.sin(frameCount * 0.1 + t * 2) * 10;
                let endX = hx + Math.cos(baseAngle) * len;
                let endY = hy + Math.sin(baseAngle) * len;
                let ctrlX = hx + Math.cos(baseAngle + 0.5) * len * 0.6;
                let ctrlY = hy + Math.sin(baseAngle + 0.5) * len * 0.6;
                ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
                ctx.stroke();
            }
            ctx.fillStyle = `rgba(255, 0, 50, ${0.5 + Math.sin(frameCount * 0.15) * 0.3})`;
            ctx.beginPath(); ctx.arc(hx - 5, hy - 3, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(hx + 5, hy - 3, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
}
const crawl = new Crawl();

// --- VINE PATCH ---
class VinePatch {
    constructor(x, y, w) {
        this.x = x; this.y = y; this.w = w;
        this.cooldown = 0;
        this.tendrils = [];
        let count = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
            this.tendrils.push({
                ox: 10 + Math.random() * Math.max(w - 20, 10),
                phase: Math.random() * Math.PI * 2,
                len: 35 + Math.random() * 45,
                spikes: 1 + Math.floor(Math.random() * 3),
                speed: 0.03 + Math.random() * 0.04,
                thickness: 2 + Math.random() * 2
            });
        }
    }
    draw(cx, cy) {
        let t = frameCount;
        let caught = vineCaught && vineCaughtPatch === this;
        ctx.lineCap = 'round';
        this.tendrils.forEach(td => {
            let bx = this.x - cx + td.ox;
            let by = this.y - cy;
            let sway = Math.sin(t * td.speed + td.phase) * 14;
            let ex = bx + sway;
            let ey = by - td.len;
            ctx.strokeStyle = caught ? 'rgba(190, 160, 50, 0.95)' : 'rgba(90, 80, 55, 0.85)';
            ctx.lineWidth = td.thickness;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + sway * 0.5, by - td.len * 0.5, ex, ey); ctx.stroke();
            for (let s = 0; s < td.spikes; s++) {
                let frac = (s + 1) / (td.spikes + 1);
                let sx = bx + (ex - bx) * frac + Math.sin(t * td.speed + td.phase + s) * 5;
                let sy = by + (ey - by) * frac;
                ctx.strokeStyle = caught ? 'rgba(210, 100, 60, 0.9)' : 'rgba(110, 75, 55, 0.85)';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 9, sy - 5); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 9, sy - 5); ctx.stroke();
            }
            if (caught) { ctx.fillStyle = `rgba(210, 170, 40, ${0.5 + Math.sin(t * 0.18) * 0.3})`; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill(); }
        });
        ctx.lineCap = 'butt';
        ctx.fillStyle = 'rgba(50, 45, 25, 0.75)'; ctx.fillRect(this.x - cx, this.y - cy - 6, this.w, 8);
        if (!caught && activeMods.has('vine') && !inSafeRoom) {
            let distX = Math.abs(p.x + p.w / 2 - (this.x + this.w / 2));
            if (distX < 130) { let alpha = (1 - distX / 130) * 0.22; ctx.fillStyle = `rgba(140, 110, 30, ${alpha})`; ctx.fillRect(this.x - cx - 4, this.y - cy - 58, this.w + 8, 58); }
        }
    }
}

// --- ENEMIES ---
class Tracer {
    constructor() { this.active = false; this.x = 0; this.y = 0; this.tx = 0; this.ty = 0; this.timer = 0; this.state = 'aiming'; this.aimAngle = 0; this.orbitAngle = 0; this.dashCount = 0; }
    spawn() { this.active = true; this.state = 'aiming'; this.timer = 0; this.x = p.x - 800; this.y = p.y - 400; this.dashCount = 0; }
    update() {
        if (!this.active || inSafeRoom) return; this.timer++; this.orbitAngle += 0.08;
        if (this.state === 'aiming') { this.x += ((p.x - 500) - this.x) * 0.05; this.y += ((p.y - 300 + Math.sin(Date.now() * 0.005) * 50) - this.y) * 0.05; this.aimAngle = Math.atan2((p.y + p.h / 2) - this.y, (p.x + p.w / 2) - this.x); if (this.timer >= 90) { this.state = 'dashing'; this.timer = 0; this.tx = this.x + Math.cos(this.aimAngle) * 2000; this.ty = this.y + Math.sin(this.aimAngle) * 2000; camShake = 10; this.dashCount++; } }
        else if (this.state === 'dashing') { let dx = this.tx - this.x, dy = this.ty - this.y, dist = Math.hypot(dx, dy); this.x += (dx / dist) * 40; this.y += (dy / dist) * 40; spawnParticles(this.x, this.y, "#f00", 2, 5, 6); if (isDodging) { } else if (Math.hypot(this.x - (p.x + p.w / 2), this.y - (p.y + p.h / 2)) < 50 && !p.hiding) { if (activeMods.has('dodge') && tryDodge()) { } else die("SNIPED_BY_TRACER"); } if (this.timer > 30 || dist < 50) { this.state = 'aiming'; this.timer = 0; } }
    }
    draw(cx, cy) {
        if (!this.active) return; let sx = this.x - cx, sy = this.y - cy;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(this.orbitAngle);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 55, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 4; i++) { let a = (Math.PI / 2) * i; ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(Math.cos(a) * 55, Math.sin(a) * 55, 5, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        if (this.state === 'aiming') { let intensity = this.timer / 90; ctx.strokeStyle = `rgba(255, 0, 0, ${intensity * 0.15})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(this.aimAngle) * 2000, sy + Math.sin(this.aimAngle) * 2000); ctx.stroke(); ctx.strokeStyle = `rgba(255, 0, 0, ${intensity})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(this.aimAngle) * 2000, sy + Math.sin(this.aimAngle) * 2000); ctx.stroke(); let retX = p.x + p.w / 2 - cx, retY = p.y + p.h / 2 - cy; ctx.strokeStyle = `rgba(255, 0, 0, ${intensity * 0.8})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(retX, retY, 30 + Math.sin(frameCount * 0.2) * 5, 0, Math.PI * 2); ctx.stroke(); }
        let grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 35); grad.addColorStop(0, '#300'); grad.addColorStop(0.7, '#100'); grad.addColorStop(1, '#000'); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(sx, sy, 35, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#f00'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, 35, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#f00'; ctx.lineCap = "round"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx - 18, sy - 12); ctx.lineTo(sx - 6, sy - 2); ctx.moveTo(sx + 18, sy - 12); ctx.lineTo(sx + 6, sy - 2); ctx.stroke();
        ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(sx - 10, sy - 5, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(sx + 10, sy - 5, 3, 0, Math.PI * 2); ctx.fill();
        if (this.dashCount > 0) { ctx.fillStyle = '#f00'; ctx.font = 'bold 10px Consolas'; ctx.fillText('x' + this.dashCount, sx - 8, sy + 50); }
    }
}

class DropN {
    constructor() { this.active = false; this.phase = "idle"; this.timer = 0; this.duration = 180; }
    trigger() { if (this.active || inSafeRoom) return; this.active = true; this.phase = "warning"; this.timer = 0; this.duration = 180; }
    update() { if (!this.active || inSafeRoom) { if (inSafeRoom && this.active) this.reset(); return; } this.timer++; if (this.phase === "warning") { if (this.timer >= this.duration) { this.phase = "active"; this.timer = 0; camShake = 15; } } else if (this.phase === "active") { if (Math.abs(p.vx) > 0.5 && !p.hiding && !isDodging) { if (activeMods.has('dodge') && tryDodge()) { } else die("MOVED_DURING_DROP'N"); } if (this.timer >= 120) this.reset(); } }
    reset() { this.active = false; this.phase = "idle"; this.timer = 0; }
    draw(cx, cy) {
        if (!this.active) return; let x = sote.active ? canvas.width / 3 : canvas.width / 2, y = canvas.height / 3;
        ctx.save(); ctx.translate(x, y); let scale = 1;
        if (this.phase === "warning") scale = 1 + Math.sin(this.timer * 0.1) * 0.1; if (this.phase === "active") scale = 1.3; ctx.scale(scale, scale);
        ctx.strokeStyle = this.phase === "active" ? 'rgba(255,0,0,0.6)' : 'rgba(255,0,0,0.2)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = this.phase === "active" ? "#f00" : "#550000"; ctx.strokeStyle = this.phase === "active" ? "#ff6" : "#888"; ctx.lineWidth = 6;
        ctx.beginPath(); for (let i = 0; i < 8; i++) { let angle = (Math.PI / 4) * i; let px = Math.cos(angle) * 60, py = Math.sin(angle) * 60; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = this.phase === "active" ? '#fff' : '#555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = this.phase === "active" ? "#fff" : "#aaa"; let stretch = this.phase === "active" ? 1.8 : 1; ctx.fillRect(-5, -30 * stretch, 10, 40 * stretch); ctx.fillRect(-5, 20 * stretch, 10, 10); ctx.restore();
    }
}

class Sote {
    constructor() { this.active = false; this.phase = "idle"; this.timer = 0; this.eyeOpen = false; this.checkTimer = 0; }
    trigger() { if (this.active || inSafeRoom) return; this.active = true; this.phase = "appear"; this.timer = 0; this.eyeOpen = false; this.checkTimer = 0; }
    update() {
        if (!this.active || inSafeRoom) { if (inSafeRoom && this.active) this.reset(); return; } this.timer++;
        if (this.phase === "appear") { if (this.timer >= 180) { this.phase = "eye_opening"; this.timer = 0; camShake = 10; } }
        else if (this.phase === "eye_opening") {
            // Must jump IMMEDIATELY - only 15 frames to react
            if (this.timer >= 15) { this.eyeOpen = true; this.phase = "checking"; this.timer = 0; this.checkTimer = 20; }
        }
        else if (this.phase === "checking") {
            this.checkTimer--;
            if (this.checkTimer <= 0) {
                if (!p.grounded && !p.hiding) { this.reset(); }
                else { if (isDodging) { } else if (activeMods.has('dodge') && tryDodge()) { this.reset(); } else die("SOTE_GAZED_UPON"); }
            }
        }
    }
    reset() { this.active = false; this.phase = "idle"; this.timer = 0; this.eyeOpen = false; }
    draw(cx, cy) {
        if (!this.active) return;
        let x = dropn.active ? canvas.width * 2 / 3 : canvas.width / 2;
        let y = canvas.height / 3;
        ctx.save(); ctx.translate(x, y);
        let starPulse = 1 + Math.sin(this.timer * 0.08) * 0.05; ctx.scale(starPulse, starPulse);
        let glowAlpha = this.phase === "appear" ? this.timer / 180 * 0.3 : 0.3;
        ctx.fillStyle = `rgba(0, 0, 0, ${glowAlpha})`; ctx.beginPath(); ctx.arc(0, 0, 100, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); for (let i = 0; i < 10; i++) { let angle = (Math.PI / 5) * i - Math.PI / 2; let r = i % 2 === 0 ? 70 : 35; let px = Math.cos(angle) * r, py = Math.sin(angle) * r; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.closePath(); ctx.fill();
        ctx.strokeStyle = this.eyeOpen ? '#f00' : 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 10; i++) { let angle = (Math.PI / 5) * i - Math.PI / 2; let r = i % 2 === 0 ? 70 : 35; let px = Math.cos(angle) * r, py = Math.sin(angle) * r; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.closePath(); ctx.stroke();
        if (this.phase === "appear" && !this.eyeOpen) { ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.stroke(); }
        else if (this.phase === "eye_opening" || this.eyeOpen) {
            let openProgress = this.eyeOpen ? 1 : Math.min(this.timer / 15, 1); let eyeH = 40 * openProgress, eyeW = 15;
            ctx.strokeStyle = '#f00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = `rgba(255, 0, 0, ${0.3 * openProgress})`; ctx.beginPath(); ctx.ellipse(0, 0, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.fill();
            if (openProgress > 0.5) { let pupilAlpha = (openProgress - 0.5) * 2; ctx.fillStyle = `rgba(0, 0, 0, ${pupilAlpha})`; ctx.fillRect(-2, -eyeH * 0.7, 4, eyeH * 1.4); ctx.fillStyle = `rgba(255, 50, 50, ${pupilAlpha * 0.5})`; ctx.beginPath(); ctx.ellipse(0, 0, 6, eyeH * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
            if (this.eyeOpen) { ctx.strokeStyle = `rgba(255, 0, 0, ${0.3 + Math.sin(frameCount * 0.15) * 0.2})`; ctx.lineWidth = 1; for (let t = 0; t < 6; t++) { let tAngle = (Math.PI / 3) * t + frameCount * 0.02; let tLen = 50 + Math.sin(frameCount * 0.1 + t) * 20; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(tAngle) * tLen, Math.sin(tAngle) * tLen); ctx.stroke(); } }
        }
        if (this.phase === "appear") { let warnAlpha = 0.3 + Math.sin(this.timer * 0.1) * 0.2; ctx.fillStyle = `rgba(255, 255, 255, ${warnAlpha})`; ctx.font = '12px Consolas'; ctx.textAlign = 'center'; ctx.fillText('SOTE APPROACHES', 0, 90); ctx.font = '10px Consolas'; ctx.fillText('PREPARE TO LEAP', 0, 105); ctx.textAlign = 'left'; }
        if (this.phase === "eye_opening" || this.eyeOpen) { ctx.fillStyle = `rgba(255, 0, 0, ${0.5 + Math.sin(frameCount * 0.2) * 0.3})`; ctx.font = 'bold 14px Consolas'; ctx.textAlign = 'center'; ctx.fillText('JUMP NOW', 0, 90); ctx.textAlign = 'left'; }
        ctx.restore();
    }
}

const sote = new Sote();

class Bynd {
    constructor() { this.pillars = []; this.timer = 0; }
    update() {
        if (!activeMods.has('bynd') || inSafeRoom) { if (inSafeRoom) this.pillars = []; return; }
        if (++this.timer > 120) { this.timer = 0; let count = Math.floor(Math.random() * 3) + 2; for (let i = 0; i < count; i++) this.pillars.push({ x: p.x + 200 + (Math.random() * 800), y: -1000, ty: p.y + 40, state: 'warn', t: 50 }); }
        this.pillars.forEach((b, i) => { if (b.state === 'warn') { b.t--; if (b.t <= 0) b.state = 'fall'; } else if (b.state === 'fall') { b.y += 60; if (b.y + 800 >= b.ty) { b.y = b.ty - 800; b.state = 'landed'; b.t = 40; camShake = 15; spawnParticles(b.x + 50, b.y + 800, "#f00", 20, 15, 5); } if (isDodging) { } else if (Math.abs((b.x + 50) - (p.x + p.w / 2)) < 60 && p.y + p.h > b.y + 700 && !p.hiding) { if (activeMods.has('dodge') && tryDodge()) { } else die("CONSUMED_BY_VOID"); } } else { b.t--; if (b.t <= 0) this.pillars.splice(i, 1); } });
    }
    draw(cx, cy) {
        this.pillars.forEach(b => { let bx = b.x - cx, by = b.y - cy; if (b.state === 'warn') { ctx.fillStyle = `rgba(255, 0, 0, ${0.05 + Math.sin(frameCount * 0.15) * 0.03})`; ctx.fillRect(bx, 0, 100, canvas.height); ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; ctx.fillRect(bx, 0, 100, 4); ctx.fillRect(bx, canvas.height - 4, 100, 4); } let pillarGrad = ctx.createLinearGradient(bx, by, bx + 100, by); pillarGrad.addColorStop(0, '#0a0000'); pillarGrad.addColorStop(0.5, '#150505'); pillarGrad.addColorStop(1, '#0a0000'); ctx.fillStyle = pillarGrad; ctx.fillRect(bx, by, 100, 800); ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, 100, 800); ctx.fillStyle = `rgba(255, 50, 0, ${0.5 + Math.sin(frameCount * 0.2) * 0.3})`; ctx.fillRect(bx - 5, by - 8, 110, 8); if (b.state === 'landed') { ctx.strokeStyle = "#f00"; ctx.lineWidth = 3; for (let j = 0; j < 5; j++) { let tX = bx + 10 + j * 20, tY = by + 800; ctx.beginPath(); ctx.moveTo(tX, tY); let wave = Math.sin(Date.now() * 0.005 + j * 1.5) * 35; let wave2 = Math.sin(Date.now() * 0.008 + j * 2) * 20; ctx.bezierCurveTo(tX + wave, tY + 30, tX + wave2, tY + 60, tX + wave / 2, tY + 90); ctx.stroke(); } } });
    }
}

class PowerDown {
    constructor() { this.active = false; this.warningTimer = 0; this.segs = []; this.x = 0; this.warningFlash = 0; }
    trigger() { if (this.active || inSafeRoom) return; this.active = true; this.warningTimer = 330; this.segs = []; this.warningFlash = 0; }
    update() {
        if (!this.active || inSafeRoom) { if (inSafeRoom && this.active) this.active = false; return; }
        if (this.warningTimer > 0) { this.warningTimer--; this.warningFlash = Math.sin(this.warningTimer * 0.1) > 0; if (this.warningTimer === 0) this.x = camX - 2500; return; }
        this.x += activeMods.has('fastpd') ? 96 : 48; this.segs.unshift({ x: this.x, y: p.y + 20 + Math.sin(Date.now() / 50) * 30 }); if (this.segs.length > 25) this.segs.pop();
        if (isDodging) { } else if (Math.abs(this.x - p.x) < 50 && !p.hiding) { if (activeMods.has('dodge') && tryDodge()) { } else die("POWERDOWN_PURGE"); }
        if (this.x > p.x + 2500) this.active = false;
    }
    draw(cx, cy) {
        if (!this.active) return;
        const pulse = 0.5 + Math.sin(frameCount * 0.18) * 0.5;
        const glitch = Math.sin(frameCount * 1.7) > 0.82;

        if (this.warningTimer > 0) {
            const elapsed = 330 - this.warningTimer;
            const progress = Math.min(1, elapsed / 330);
            const urgency = 0.25 + progress * 0.55 + pulse * 0.15;

            // Purple-red emergency lighting across the screen.
            ctx.save();
            ctx.fillStyle = `rgba(24, 0, 35, ${0.08 + urgency * 0.12})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = `rgba(220, 40, 255, ${urgency})`;
            ctx.lineWidth = 3 + pulse * 3;
            ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

            // Corner warning brackets and scanline interference.
            ctx.strokeStyle = `rgba(255, 45, 70, ${0.35 + pulse * 0.45})`;
            ctx.lineWidth = 5;
            const corner = 38 + pulse * 12;
            [[20,20,1,1],[canvas.width-20,20,-1,1],[20,canvas.height-20,1,-1],[canvas.width-20,canvas.height-20,-1,-1]].forEach(([x,y,dx,dy]) => {
                ctx.beginPath(); ctx.moveTo(x, y + dy * corner); ctx.lineTo(x, y); ctx.lineTo(x + dx * corner, y); ctx.stroke();
            });
            for (let i = 0; i < 7; i++) {
                const scanY = (frameCount * 13 + i * 97) % canvas.height;
                ctx.fillStyle = `rgba(255, 0, 90, ${0.025 + pulse * 0.035})`;
                ctx.fillRect(0, scanY, canvas.width, 2 + pulse * 2);
            }

            // Central alert panel with a progress bar.
            const panelW = Math.min(560, canvas.width - 40), panelH = 142;
            const panelX = (canvas.width - panelW) / 2, panelY = 42 + pulse * 4;
            ctx.fillStyle = 'rgba(8, 4, 14, 0.88)';
            ctx.fillRect(panelX, panelY, panelW, panelH);
            ctx.strokeStyle = `rgba(255, 35, 100, ${0.7 + pulse * 0.3})`;
            ctx.lineWidth = 2; ctx.strokeRect(panelX, panelY, panelW, panelH);

            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff315d';
            ctx.font = 'bold 13px Consolas';
            ctx.fillText('FACILITY EMERGENCY  //  PD-09', canvas.width / 2, panelY + 24);
            ctx.fillStyle = glitch ? '#fff' : '#f2d9ff';
            ctx.font = 'bold 29px Consolas';
            ctx.fillText(glitch ? 'POWER FAILURE' : 'POWER DOWN', canvas.width / 2, panelY + 61);
            ctx.fillStyle = '#ffb8c7';
            ctx.font = 'bold 15px Consolas';
            ctx.fillText('PURGE ENTITY DETECTED  •  RUN', canvas.width / 2, panelY + 88);

            const barW = panelW - 54, barX = panelX + 27, barY = panelY + 108;
            ctx.fillStyle = '#250d1b'; ctx.fillRect(barX, barY, barW, 9);
            ctx.fillStyle = '#ff315d'; ctx.fillRect(barX, barY, barW * progress, 9);
            ctx.fillStyle = '#fff'; ctx.font = '11px Consolas';
            ctx.fillText('CONTAINMENT FAILURE  //  EVACUATE NOW', canvas.width / 2, panelY + 133);
            ctx.textAlign = 'left';

            // Directional signal points toward the approaching entity.
            const signalX = canvas.width - 42, signalY = canvas.height / 2;
            ctx.translate(signalX, signalY);
            ctx.rotate(Math.PI / 2);
            ctx.fillStyle = `rgba(255, 35, 90, ${0.5 + pulse * 0.5})`;
            ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(13, 10); ctx.lineTo(-13, 10); ctx.closePath(); ctx.fill();
            ctx.restore();
            return;
        }

        // The Power Down entity is a fast-moving distortion, not just a chain of dots.
        const head = this.segs[0];
        if (head) {
            const hx = head.x - cx, hy = head.y - cy;
            ctx.save();
            // Screen-space distortion aura around the entity.
            const aura = ctx.createRadialGradient(hx, hy, 8, hx, hy, 190);
            aura.addColorStop(0, 'rgba(255, 0, 220, 0.26)');
            aura.addColorStop(0.45, 'rgba(130, 0, 180, 0.13)');
            aura.addColorStop(1, 'rgba(30, 0, 50, 0)');
            ctx.fillStyle = aura; ctx.fillRect(hx - 190, hy - 190, 380, 380);

            // Jagged energy tendrils behind its body.
            for (let t = 0; t < 5; t++) {
                const angle = frameCount * 0.07 + t * Math.PI * 2 / 5;
                ctx.strokeStyle = `rgba(255, 35, 240, ${0.25 + pulse * 0.45})`;
                ctx.lineWidth = 2 + pulse * 2;
                ctx.beginPath(); ctx.moveTo(hx, hy);
                for (let j = 1; j <= 5; j++) {
                    const distance = j * (18 + pulse * 8);
                    const jitter = Math.sin(frameCount * 0.4 + t * 8 + j * 3) * 18;
                    ctx.lineTo(hx + Math.cos(angle) * distance + jitter, hy + Math.sin(angle) * distance);
                }
                ctx.stroke();
            }
            ctx.restore();
        }

        // Trail with a bright core and fading violet outer glow.
        this.segs.forEach((seg, i) => {
            const x = seg.x - cx, y = seg.y - cy;
            const alpha = 1 - i / Math.max(this.segs.length, 1);
            const radius = Math.max(3, 30 - i * 1.05);
            ctx.fillStyle = `rgba(130, 0, 190, ${alpha * 0.12})`;
            ctx.beginPath(); ctx.arc(x, y, radius + 24, 0, Math.PI * 2); ctx.fill();
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
            gradient.addColorStop(0.22, `rgba(255, 70, 245, ${alpha})`);
            gradient.addColorStop(0.65, `rgba(170, 0, 255, ${alpha * 0.8})`);
            gradient.addColorStop(1, 'rgba(45, 0, 90, 0)');
            ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        });

        if (head) {
            const hx = head.x - cx, hy = head.y - cy;
            ctx.save();
            ctx.shadowColor = '#ff00ed'; ctx.shadowBlur = 28;
            ctx.fillStyle = '#120018'; ctx.beginPath(); ctx.arc(hx, hy, 33, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ff35f4'; ctx.lineWidth = 3; ctx.stroke();
            // Glowing eyes and a sharp, ominous center.
            ctx.shadowBlur = 12; ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.ellipse(hx - 11, hy - 5, 6, 10, -0.3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(hx + 11, hy - 5, 6, 10, 0.3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ff00d9';
            ctx.beginPath(); ctx.arc(hx - 11, hy - 5, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(hx + 11, hy - 5, 3, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ff00ed'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(hx - 9, hy + 13); ctx.lineTo(hx, hy + 18); ctx.lineTo(hx + 9, hy + 13); ctx.stroke();
            ctx.restore();
        }

        // Keep a small amount of particle activity without flooding the screen.
        if (frameCount % 3 === 0 && this.segs.length > 0) {
            const tail = this.segs[this.segs.length - 1];
            spawnParticles(tail.x, tail.y, '#d600ff', 1, 4, 8);
        }
    }
}

// --- PLAYER ---
class Player {
    constructor() { this.reset(); }
    reset() { this.x = 200; this.y = 400; this.vx = 0; this.vy = 0; this.w = 40; this.h = 40; this.vw = 40; this.vh = 40; this.grounded = false; this.hiding = false; this.wallDir = 0; this.sliding = false; this.wasSliding = false; this.speed = 0; this.hideAnim = 0; ghostTrail = []; }
    update() {
        // E is a TOGGLE: press E to enter hiding, press E again to exit
        // Cannot hide if carrying a plug
        let nearLocker = !carryingPlug && lockers.some(l => this.x + this.w > l.x && this.x < l.x + l.w && Math.abs(this.y - l.y) < 100);
        let nearVent = activeMods.has('vents') && !carryingPlug && vents.some(v => this.x + this.w > v.x && this.x < v.x + v.w && Math.abs(this.y - v.y) < 80);

        if (keys.action && !this.hiding && (nearLocker || nearVent)) {
            this.hiding = true; this.hideAnim = 0;
            if (nearVent) { inVentSystem = true; ventTimer = 0; }
            keys.action = false;
        } else if (keys.action && this.hiding) {
            this.hiding = false; inVentSystem = false; crawl.reset();
            keys.action = false;
        }

        // Vent fast travel: press jump while in vent to teleport
        if (this.hiding && inVentSystem && keys.jump) {
            let nearVent = vents.find(v => this.x + this.w > v.x && this.x < v.x + v.w && Math.abs(this.y - v.y) < 80);
            if (nearVent && nearVent.connectedTo >= 0 && vents[nearVent.connectedTo]) {
                let target = vents[nearVent.connectedTo];
                this.x = target.x + target.w / 2 - this.w / 2;
                this.y = target.y - this.h;
                spawnParticles(target.x + target.w / 2, target.y, "#00ffea", 15, 8, 12);
                camShake = 5;
                keys.jump = false;
            }
        }

        // Vent timer / Crawl monster
        if (inVentSystem) { ventTimer++; if (ventTimer >= VENT_CRAWL_TIME && !crawl.active) crawl.trigger(); }
        if (!inVentSystem && crawl.active) crawl.reset();

        this.hideAnim = this.hiding ? Math.min(this.hideAnim + 0.08, 1) : Math.max(this.hideAnim - 0.08, 0);
        this.wasSliding = this.sliding && !keys.slide ? true : false; this.sliding = keys.slide;
        if (this.hiding) { this.vx = 0; this.vy = 0; this.speed = 0; return; }

        // Vine catch check
        if (activeMods.has('vine') && !vineCaught && this.grounded && !isDodging && !inSafeRoom) {
            let catchPatch = vinePatches.find(vp => vp.cooldown <= 0 && Math.abs(this.x + this.w / 2 - (vp.x + vp.w / 2)) < vp.w * 0.65 && Math.abs((this.y + this.h) - vp.y) < 28);
            if (catchPatch) { vineCaught = true; vineCaughtPatch = catchPatch; vineEscapeCount = 0; vineJumpWasUp = !keys.jump; camShake = 7; spawnParticles(this.x + this.w / 2, this.y + this.h, "#887744", 14, 5, 16); }
        }
        if (vineCaught) {
            this.vx = 0; this.vy = 0; this.speed = 0;
            vineTrapTime++;
            if (frameCount % 45 === 0 && vineEscapeCount > 0) { vineEscapeCount = Math.max(0, vineEscapeCount - 1); camShake = 1; }
            if (!vineJumpWasUp && !keys.jump) vineJumpWasUp = true;
            if (vineJumpWasUp && keys.jump) { vineEscapeCount++; vineJumpWasUp = false; camShake = 3; spawnParticles(this.x + this.w / 2, this.y + this.h, "#aabb55", 5, 4, 10); if (vineEscapeCount >= VINE_ESCAPE_JUMPS) { vineCaught = false; vineCaughtPatch.cooldown = 240; vineCaughtPatch = null; vineEscapeCount = 0; vineTrapTime = 0; camShake = 12; spawnParticles(this.x + this.w / 2, this.y + this.h, "#88cc44", 25, 8, 20); } }
            return;
        } else {
            vineTrapTime = Math.max(0, vineTrapTime - 3);
        }

        let spd = activeMods.has('speed') ? 3.8 : 2.2, grav = activeMods.has('feather') ? 0.6 : 1.2, jmp = activeMods.has('jump') ? -28 : -20;
        handleHorizontal(this, keys, spd, 0.85, platforms);
        if (keys.jump) { if (this.grounded) { this.vy = jmp; this.grounded = false; this.vh = 60; this.vw = 20; camShake = 5; } else if (this.wallDir !== 0 && this.vy > 0) { this.vy = jmp * 0.9; this.vx = this.wallDir * -15; this.wallDir = 0; camShake = 8; } else if (this.vy > 0) { this.vy = 2; this.vh = 20; this.vw = 60; } }
        if (this.wallDir !== 0 && this.vy > 0) this.vy *= 0.7;
        let wasGrounded = this.grounded;
        handleVertical(this, grav, platforms, activeMods.has('fragile'), wasGrounded, die, () => { this.vw = 60; this.vh = 20; camShake = 4; });
        if (this.sliding && Math.abs(this.vx) > 2) { this.vw = 60; this.vh = 20; }
        this.vw += (this.w - this.vw) * 0.2; this.vh += (this.h - this.vh) * 0.2; this.speed = Math.abs(this.vx);
        if (this.sliding && this.speed > 3) { ghostTrail.push({ x: this.x, y: this.y, vw: this.vw, vh: this.vh, alpha: 0.6, life: 12 }); if (ghostTrail.length > MAX_GHOSTS) ghostTrail.shift(); if (frameCount % 3 === 0) spawnParticles(this.x + this.w / 2, this.y + this.h, "#00ffea", 1, 3, 8); }
        else { for (let i = ghostTrail.length - 1; i >= 0; i--) { ghostTrail[i].life--; ghostTrail[i].alpha *= 0.8; if (ghostTrail[i].life <= 0) ghostTrail.splice(i, 1); } }
        updateDodge();
        if (this.y > canvas.height + 800) { if (isDodging) { } else if (activeMods.has('dodge') && tryDodge()) { this.y = canvas.height - 200; this.vy = -15; } else die("VOID_FALL"); }
        hazards.forEach(h => { if (this.x + this.w > h.x && this.x < h.x + h.w && this.y + this.h > h.y && this.y < h.y + h.h) { if (isDodging) { } else if (activeMods.has('dodge') && tryDodge()) { } else die("HAZARD_CONTACT"); } });
        lasers.forEach(l => { if (l.active && this.x + this.w > l.x && this.x < l.x + l.w && this.y + this.h > l.y && this.y < l.y + l.h) { if (isDodging) { } else if (activeMods.has('dodge') && tryDodge()) { } else die("LASER_EVAPORATION"); } if (keys.action && Math.abs(this.x - l.sx) < 60 && Math.abs(this.y - l.sy) < 60) { l.active = false; keys.action = false; } });
        if (this.x > gateX && !inSafeRoom) { inSafeRoom = true; safeRoomDoorSlammed = false; safeRoomDoorTimer = 0; calculateRewards(); }
        if (inSafeRoom && !safeRoomDoorSlammed) { safeRoomDoorTimer++; if (safeRoomDoorTimer > 30) { safeRoomDoorSlammed = true; camShake = 25; spawnParticles(gateX + 100, canvas.height - 300, "#00ffea", 30, 10, 20); } }
        if (inElevator) { elevatorTimer++; camShake = 3; if (elevatorTimer >= ELEVATOR_DURATION) { inElevator = false; elevatorTimer = 0; nextFloor(); } }
        if (inSafeRoom && gateOpen && this.x > gateX + 1600 && !inElevator) { inElevator = true; elevatorTimer = 0; }
    }
    draw(cx, cy) {
        ghostTrail.forEach(g => { ctx.globalAlpha = g.alpha; let ox = (this.w - g.vw) / 2, oy = (this.h - g.vh); ctx.fillStyle = "#2ecc71"; ctx.fillRect(g.x - cx + ox, g.y - cy + oy, g.vw, g.vh); ctx.fillStyle = "#000"; ctx.fillRect(g.x - cx + ox + 8, g.y - cy + oy + 4, 4, 10); ctx.fillRect(g.x - cx + ox + 24, g.y - cy + oy + 4, 4, 10); }); ctx.globalAlpha = 1;
        ctx.save();
        if (isDodging) { ctx.globalAlpha = 0.4; ctx.shadowColor = '#4488ff'; ctx.shadowBlur = 20; if (frameCount % 2 === 0) spawnParticles(this.x + this.w / 2, this.y + this.h / 2, "#4488ff", 2, 4, 8); }
        else if (this.hiding) { ctx.globalAlpha = 0.3 - this.hideAnim * 0.2; }
        if (this.speed > 5 && !isDodging) { ctx.shadowColor = "#2ecc71"; ctx.shadowBlur = this.speed * 2; }
        let ox = (this.w - this.vw) / 2, oy = (this.h - this.vh);
        ctx.fillStyle = isDodging ? "#4488ff" : "#2ecc71"; ctx.fillRect(this.x - cx + ox, this.y - cy + oy, this.vw, this.vh);
        ctx.fillStyle = "#000"; ctx.fillRect(this.x - cx + ox + 8, this.y - cy + oy + 8, 4, 20); ctx.fillRect(this.x - cx + ox + 24, this.y - cy + oy + 8, 4, 20);
        if (carryingPlug) { ctx.fillStyle = '#ff0'; ctx.fillRect(this.x - cx + this.w / 2 - 4, this.y - cy - 12, 8, 10); ctx.fillStyle = '#aaa'; ctx.fillRect(this.x - cx + this.w / 2 - 2, this.y - cy - 18, 2, 6); ctx.fillRect(this.x - cx + this.w / 2 + 1, this.y - cy - 18, 2, 6); }
        ctx.shadowBlur = 0; ctx.restore();
    }
}

const tracer = new Tracer(); const bynd = new Bynd(); const pd = new PowerDown(); const dropn = new DropN(); const p = new Player();

// --- LAB BACKGROUND ---
function generateBgLayers() {
    bgLayers = [];
    for (let i = 0; i < 15; i++) bgLayers.push({ x: i * 1200 - 2000, y: 80 + Math.random() * 100, w: 600 + Math.random() * 200, h: 8, type: 'walkway', depth: 0.15, hasRailing: true, railingH: 30 });
    for (let i = 0; i < 10; i++) bgLayers.push({ x: i * 1500 - 2000, y: 200 + Math.random() * 150, w: 300 + Math.random() * 400, h: 6, type: 'catwalk', depth: 0.25, hasRailing: true, railingH: 25 });
    for (let i = 0; i < 15; i++) bgLayers.push({ x: i * 1000 - 2000, y: 50 + Math.random() * 500, w: 100 + Math.random() * 300, h: 4, type: 'pipe', depth: 0.35, hasRailing: false });
    for (let i = 0; i < 8; i++) bgLayers.push({ x: i * 2000 - 2000, y: 0, w: 800 + Math.random() * 400, h: canvas.height, type: 'wallpanel', depth: 0.1, hasRailing: false });
}

function drawLabBackground() {
    let bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height); bgGrad.addColorStop(0, '#020408'); bgGrad.addColorStop(0.5, '#040810'); bgGrad.addColorStop(1, '#030608');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, canvas.width, canvas.height);
    bgLayers.filter(l => l.type === 'wallpanel').forEach(l => { let sx = l.x - camX * l.depth, sy = l.y - camY * l.depth; ctx.fillStyle = 'rgba(8, 14, 20, 0.8)'; ctx.fillRect(sx, sy, l.w, l.h); ctx.strokeStyle = 'rgba(0, 255, 234, 0.02)'; ctx.lineWidth = 1; for (let gx = 0; gx < l.w; gx += 80) { ctx.beginPath(); ctx.moveTo(sx + gx, sy); ctx.lineTo(sx + gx, sy + l.h); ctx.stroke(); } });
    bgLayers.filter(l => l.type === 'pipe').forEach(l => { let sx = l.x - camX * l.depth, sy = l.y - camY * l.depth; ctx.fillStyle = 'rgba(20, 30, 40, 0.6)'; ctx.fillRect(sx, sy, l.w, l.h + 6); ctx.fillStyle = 'rgba(0, 255, 234, 0.05)'; ctx.fillRect(sx, sy, l.w, 1); });
    bgLayers.filter(l => l.type === 'walkway' || l.type === 'catwalk').forEach(l => { let sx = l.x - camX * l.depth, sy = l.y - camY * l.depth; let alpha = l.type === 'walkway' ? 0.15 : 0.25; ctx.fillStyle = `rgba(10, 20, 30, ${alpha})`; ctx.fillRect(sx, sy, l.w, l.h); ctx.fillStyle = `rgba(0, 255, 234, ${alpha * 0.3})`; ctx.fillRect(sx, sy, l.w, 1); if (l.hasRailing) { ctx.strokeStyle = `rgba(0, 255, 234, ${alpha * 0.4})`; ctx.lineWidth = 2; for (let px = 0; px < l.w; px += 40) { ctx.beginPath(); ctx.moveTo(sx + px, sy); ctx.lineTo(sx + px, sy - l.railingH); ctx.stroke(); } ctx.strokeStyle = `rgba(0, 255, 234, ${alpha * 0.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy - l.railingH); ctx.lineTo(sx + l.w, sy - l.railingH); ctx.stroke(); } });
}

// --- LAB DRAWING HELPERS ---
function drawLabPlatform(pl, cx, cy) { let sx = pl.x - cx, sy = pl.y - cy; ctx.fillStyle = '#0a0f14'; ctx.fillRect(sx, sy, pl.w, pl.h); ctx.fillStyle = '#00ffea'; ctx.fillRect(sx, sy, pl.w, 3); ctx.strokeStyle = 'rgba(0, 255, 234, 0.08)'; ctx.lineWidth = 1; for (let gx = 0; gx < pl.w; gx += 40) { ctx.beginPath(); ctx.moveTo(sx + gx, sy); ctx.lineTo(sx + gx, sy + pl.h); ctx.stroke(); } let dataOffset = (frameCount * 2) % pl.w; ctx.fillStyle = 'rgba(0, 255, 234, 0.6)'; ctx.fillRect(sx + dataOffset, sy, 20, 3); }
function drawLabSlope(pl, cx, cy) { let sx = pl.x - cx, sy1 = pl.y1 - cy, sy2 = pl.y2 - cy; ctx.beginPath(); ctx.moveTo(sx, sy1); ctx.lineTo(sx + pl.w, sy2); ctx.lineTo(sx + pl.w, sy2 + 600); ctx.lineTo(sx, sy1 + 600); ctx.closePath(); ctx.fillStyle = '#0a0f14'; ctx.fill(); ctx.strokeStyle = '#00ffea'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, sy1); ctx.lineTo(sx + pl.w, sy2); ctx.stroke(); ctx.fillStyle = 'rgba(0, 255, 234, 0.15)'; let midX = sx + pl.w / 2, midY = (sy1 + sy2) / 2 + 20; let angle = Math.atan2(sy2 - sy1, pl.w); ctx.save(); ctx.translate(midX, midY); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-10, -8); ctx.lineTo(-10, 8); ctx.closePath(); ctx.fill(); ctx.restore(); }
function drawLabHazard(h, cx, cy) { let sx = h.x - cx, sy = h.y - cy; if (h.type === 'lava') { let pulse = Math.sin(frameCount * 0.05) * 0.2 + 0.8; ctx.fillStyle = `rgba(0, 255, 100, ${0.15 * pulse})`; ctx.fillRect(sx, sy, h.w, h.h); ctx.fillStyle = `rgba(0, 255, 100, ${0.4 * pulse})`; for (let bx = 0; bx < h.w; bx += 30) { let bubbleY = Math.sin(frameCount * 0.08 + bx * 0.1) * 5; ctx.beginPath(); ctx.arc(sx + bx + 15, sy + bubbleY, 4 + Math.sin(frameCount * 0.1 + bx) * 2, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#ff4d4d'; for (let sx2 = 0; sx2 < h.w; sx2 += 20) ctx.fillRect(sx + sx2, sy - 4, 10, 4); } else { ctx.fillStyle = '#300'; ctx.fillRect(sx, sy, h.w, h.h); } }
function drawLabLocker(l, cx, cy) {
    let sx = l.x - cx, sy = l.y - cy;
    let openAmt = l.openAnim || 0;
    // Locker body
    ctx.fillStyle = '#0c1018'; ctx.fillRect(sx, sy, l.w, l.h);
    // Inner border
    ctx.strokeStyle = 'rgba(0, 255, 234, 0.3)'; ctx.lineWidth = 2; ctx.strokeRect(sx + 2, sy + 2, l.w - 4, l.h - 4);
    // Door slides open
    let doorW = l.w * (1 - openAmt * 0.7);
    ctx.fillStyle = '#0e1420'; ctx.fillRect(sx, sy, doorW, l.h);
    ctx.strokeStyle = 'rgba(0, 255, 234, 0.3)'; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, l.w, l.h);
    // Handle
    ctx.fillStyle = 'rgba(0, 255, 234, 0.5)'; ctx.fillRect(sx + doorW - 14, sy + l.h / 2 - 8, 8, 16);
    // LED - green when player inside
    let isPlayerInside = p.hiding && lockers.some(lo => lo === l && p.x + p.w > lo.x && p.x < lo.x + lo.w);
    ctx.fillStyle = isPlayerInside ? '#0f0' : (Math.sin(frameCount * 0.05) > 0 ? '#0a0' : '#040'); ctx.fillRect(sx + 6, sy + 4, 4, 4);
    // Interior visible when open
    if (openAmt > 0.3) { ctx.fillStyle = 'rgba(0, 10, 20, 0.8)'; ctx.fillRect(sx + doorW, sy + 4, l.w - doorW - 4, l.h - 8); }
}
function drawLabLaser(l, cx, cy) { let ssx = l.sx - cx, ssy = l.sy - cy; ctx.fillStyle = l.active ? '#1a0505' : '#0a1a0a'; ctx.fillRect(ssx, ssy, 24, 24); ctx.strokeStyle = l.active ? '#f00' : '#0f0'; ctx.lineWidth = 2; ctx.strokeRect(ssx, ssy, 24, 24); ctx.fillStyle = l.active ? '#f00' : '#0f0'; ctx.fillRect(ssx + 6, ssy + 6, 12, 12); if (l.active) { let lsx = l.x - cx, lsy = l.y - cy; ctx.fillStyle = "rgba(255, 0, 0, 0.15)"; ctx.fillRect(lsx - 4, lsy, l.w + 8, l.h); ctx.fillStyle = "rgba(255, 0, 0, 0.8)"; ctx.fillRect(lsx, lsy, l.w, l.h); } }
function drawLabDecal(d, cx, cy) { ctx.fillStyle = d.c; ctx.fillRect(d.x - camX * 0.5, d.y - camY * 0.5, d.w, d.h); }
function drawLabRoom(room, cx, cy) {
    // Blueprint-based room rendering. Each room type gets its own visual identity.
    const sx = room.x - cx, sy = room.y - cy;
    const wall = 24, floorY = room.floorY ?? (room.y + room.h - 150);
    const palette = {
        start: ['#111820', '#273440', '#8fa6b8'],
        hallway: ['#141a20', '#303b46', '#91a4b4'],
        storage: ['#191b1e', '#3a3b3d', '#c5a56a'],
        lab: ['#101c20', '#253c43', '#58c8d5'],
        hazard: ['#211719', '#4a292d', '#e16b61'],
        stairs: ['#15191e', '#343b44', '#aab4bf'],
        catwalk: ['#111a20', '#263b46', '#65b7c8'],
        hideout: ['#171b1c', '#303b35', '#8db49b'],
        chamber: ['#151923', '#343b50', '#9a9fe8'],
        safe: ['#101b1c', '#253d3d', '#00ffea']
    }[room.type] || ['#111820', '#252d36', '#7b8794'];
    const [base, wallColor, accent] = palette;

    ctx.fillStyle = base; ctx.fillRect(sx, sy, room.w, room.h);
    ctx.fillStyle = wallColor; ctx.fillRect(sx, sy, room.w, 24);
    ctx.fillStyle = '#0a0e12'; ctx.fillRect(sx, sy + 24, room.w, Math.max(0, floorY - sy - cy - 24));
    // Ceiling strips and structural ribs.
    ctx.fillStyle = accent; ctx.globalAlpha = 0.35; ctx.fillRect(sx, sy, room.w, 3); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(220,235,245,0.08)'; ctx.lineWidth = 1;
    for (let x = 120; x < room.w; x += room.type === 'storage' ? 180 : 260) {
        ctx.beginPath(); ctx.moveTo(sx + x, sy + 24); ctx.lineTo(sx + x, floorY - cy); ctx.stroke();
    }

    // Door openings are clear from floor to lintel. Frames line up at both ends.
    const doorW = 100, doorH = 190, doorY = floorY - doorH;
    ctx.fillStyle = '#090d11';
    if (room.hasDoorLeft) ctx.fillRect(sx, doorY - cy, wall + 4, doorH);
    if (room.hasDoorRight) ctx.fillRect(sx + room.w - wall - 4, doorY - cy, wall + 4, doorH);
    function frameDoor(edgeX, doorwayFloorY) {
        const dx = edgeX - cx, dy = doorwayFloorY - doorH - cy;
        ctx.fillStyle = '#aeb7c1';
        ctx.fillRect(dx - 4, dy - 5, doorW + 8, 7);
        ctx.fillRect(dx - 4, dy, 6, doorH);
        ctx.fillRect(dx + doorW - 2, dy, 6, doorH);
        ctx.fillStyle = accent; ctx.fillRect(dx - 4, doorwayFloorY - cy - 3, doorW + 8, 4);
    }
    if (room.hasDoorLeft) frameDoor(room.x + wall, floorY);
    if (room.hasDoorRight) frameDoor(room.x + room.w - wall - doorW, room.stairsEndY || floorY);

    // Main floor / landing
    ctx.fillStyle = '#303943';
    if (room.type === 'stairs' && room.stairsEndY) {
        const steps = room.stairSteps || 8;
        const stepW = (room.w - 180) / steps;
        const descent = room.stairsEndY - floorY;
        ctx.fillRect(sx, floorY - cy, 90, 150);
        for (let st = 0; st < steps; st++) {
            const stepX = sx + 90 + st * stepW;
            const stepY = floorY + ((st + 1) / steps) * descent - cy;
            ctx.fillStyle = '#303943'; ctx.fillRect(stepX, stepY, stepW + 2, 600);
            ctx.fillStyle = '#8a969f'; ctx.fillRect(stepX, stepY, stepW + 2, 5);
            ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(stepX, stepY + 8, stepW + 2, 2);
        }
        ctx.fillStyle = '#303943'; ctx.fillRect(sx + room.w - 90, room.stairsEndY - cy, 90, 600);
        ctx.fillStyle = '#8a969f'; ctx.fillRect(sx + room.w - 90, room.stairsEndY - cy, 90, 5);
        ctx.fillStyle = accent; ctx.globalAlpha = 0.5;
        ctx.fillRect(sx + room.w / 2 - 2, sy + 50, 4, 80); ctx.globalAlpha = 1;
    } else {
        ctx.fillRect(sx, floorY - cy, room.w, 150);
        ctx.fillStyle = accent; ctx.fillRect(sx, floorY - cy, room.w, 4);
    }

    // Room-specific fixtures.
    if (room.type === 'storage') {
        for (let i = 0; i < 3; i++) {
            const rackX = sx + 150 + i * Math.max(180, (room.w - 300) / 3);
            ctx.fillStyle = '#51483b'; ctx.fillRect(rackX, floorY - cy - 115, 130, 8);
            ctx.fillRect(rackX, floorY - cy - 230, 130, 8);
            ctx.fillStyle = '#75664f'; ctx.fillRect(rackX + 4, floorY - cy - 110, 5, 110);
            ctx.fillRect(rackX + 121, floorY - cy - 110, 5, 110);
            for (let box = 0; box < 3; box++) {
                ctx.fillStyle = ['#71604b', '#59656a', '#786b5a'][box];
                ctx.fillRect(rackX + 12 + box * 38, floorY - cy - 145, 30, 27);
            }
        }
    } else if (room.type === 'lab' || room.type === 'chamber') {
        ctx.fillStyle = '#202b32';
        ctx.fillRect(sx + 100, floorY - cy - 70, 140, 70);
        ctx.fillRect(sx + room.w - 250, floorY - cy - 70, 140, 70);
        ctx.fillStyle = accent; ctx.globalAlpha = 0.65;
        ctx.fillRect(sx + 110, floorY - cy - 60, 120, 3);
        ctx.fillRect(sx + room.w - 240, floorY - cy - 60, 120, 3);
        ctx.globalAlpha = 1;
    } else if (room.type === 'hideout') {
        ctx.fillStyle = '#080d0b'; ctx.fillRect(sx + 170, floorY - cy - 125, room.w - 340, 50);
        ctx.fillStyle = '#43574a'; ctx.fillRect(sx + 170, floorY - cy - 125, room.w - 340, 4);
        ctx.fillStyle = 'rgba(130,180,150,0.12)'; ctx.fillRect(sx + 170, floorY - cy - 120, room.w - 340, 45);
    } else if (room.type === 'catwalk') {
        ctx.strokeStyle = 'rgba(150,190,205,0.35)'; ctx.lineWidth = 3;
        for (let x = 80; x < room.w; x += 80) {
            ctx.beginPath(); ctx.moveTo(sx + x, floorY - cy); ctx.lineTo(sx + x, floorY - cy - 35); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(sx + 20, floorY - cy - 35); ctx.lineTo(sx + room.w - 20, floorY - cy - 35); ctx.stroke();
    } else if (room.type === 'hazard') {
        ctx.fillStyle = 'rgba(220,70,60,0.12)'; ctx.fillRect(sx + 80, floorY - cy - 300, room.w - 160, 240);
        ctx.fillStyle = '#d35c54'; ctx.font = 'bold 13px Consolas'; ctx.fillText('CONTAINMENT / CAUTION', sx + 100, floorY - cy - 330);
    }

    if (room.label) {
        ctx.fillStyle = accent; ctx.font = '12px Consolas'; ctx.fillText(room.label, sx + 28, sy + 42);
    }
}

// --- SAFE ROOM ---
function drawSafeRoom(cx, cy) {
    let baseY = canvas.height - 150;
    let shopStartX = gateX + 200;
    let pathX = gateX - 600;
    ctx.fillStyle = '#060a0e'; ctx.fillRect(pathX - cx, 0 - cy, 600, canvas.height);
    ctx.fillStyle = 'rgba(0, 255, 234, 0.1)'; ctx.fillRect(pathX - cx, baseY - 500 - cy, 4, 500); ctx.fillRect(pathX + 596 - cx, baseY - 500 - cy, 4, 500);
    ctx.fillStyle = 'rgba(0, 255, 234, 0.05)'; for (let mx = 0; mx < 600; mx += 60) ctx.fillRect(pathX + mx - cx, baseY - 2 - cy, 30, 2);
    ctx.fillStyle = 'rgba(0, 255, 234, 0.15)'; ctx.font = '12px Consolas'; ctx.fillText('>> SAFE_ZONE_AHEAD >>', pathX + 100 - cx, baseY - 200 - cy);
    // Blast door
    let doorX = gateX - 10, doorW = 20, doorH = 500, doorY = baseY - doorH;
    if (safeRoomDoorSlammed) { ctx.fillStyle = '#1a2030'; ctx.fillRect(doorX - cx, doorY - cy, doorW, doorH); ctx.fillStyle = '#2a3545'; for (let by = 0; by < doorH; by += 40) ctx.fillRect(doorX - cx, doorY + by - cy, doorW, 6); ctx.strokeStyle = '#00ffea'; ctx.lineWidth = 3; ctx.strokeRect(doorX - cx, doorY - cy, doorW, doorH); ctx.fillStyle = '#0f0'; ctx.fillRect(doorX + 4 - cx, doorY + 50 - cy, 12, 12); ctx.fillRect(doorX + 4 - cx, doorY + doorH - 62 - cy, 12, 12); ctx.fillStyle = '#0f0'; ctx.font = 'bold 10px Consolas'; ctx.textAlign = 'center'; ctx.fillText('SEALED', doorX + doorW / 2 - cx, doorY + doorH / 2 - cy); ctx.textAlign = 'left'; }
    else { let closeProgress = Math.min(safeRoomDoorTimer / 30, 1); let openH = doorH * (1 - closeProgress); if (openH > 0) { ctx.fillStyle = '#1a2030'; ctx.fillRect(doorX - cx, doorY - cy, doorW, openH); ctx.strokeStyle = '#f00'; ctx.lineWidth = 2; ctx.strokeRect(doorX - cx, doorY - cy, doorW, openH); } if (closeProgress < 1) { ctx.fillStyle = `rgba(255, 0, 0, ${0.5 + Math.sin(frameCount * 0.3) * 0.5})`; ctx.font = 'bold 14px Consolas'; ctx.textAlign = 'center'; ctx.fillText('DOOR CLOSING', doorX + doorW / 2 - cx, doorY - 20 - cy); ctx.textAlign = 'left'; } }
    // Upper walkway
    let walkX = gateX + 100, walkY = baseY - 350;
    ctx.fillStyle = '#0a0f14'; ctx.fillRect(walkX - cx, walkY - cy, 1400, 20);
    ctx.strokeStyle = 'rgba(0, 255, 234, 0.1)'; ctx.lineWidth = 1; for (let gx = 0; gx < 1400; gx += 20) { ctx.beginPath(); ctx.moveTo(walkX + gx - cx, walkY - cy); ctx.lineTo(walkX + gx - cx, walkY + 20 - cy); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0, 255, 234, 0.3)'; ctx.fillRect(walkX - cx, walkY - cy, 1400, 2);
    ctx.strokeStyle = 'rgba(0, 255, 234, 0.2)'; ctx.lineWidth = 2; for (let rx = 0; rx < 1400; rx += 40) { ctx.beginPath(); ctx.moveTo(walkX + rx - cx, walkY - cy); ctx.lineTo(walkX + rx - cx, walkY - 30 - cy); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(walkX - cx, walkY - 30 - cy); ctx.lineTo(walkX + 1400 - cx, walkY - 30 - cy); ctx.stroke();
    // Shop interior
    ctx.fillStyle = '#0a0f14'; ctx.fillRect(shopStartX - cx, baseY - cy, 1200, 600);
    ctx.strokeStyle = 'rgba(0, 255, 234, 0.06)'; ctx.lineWidth = 1; for (let tx = 0; tx < 1200; tx += 60) { ctx.beginPath(); ctx.moveTo(shopStartX - cx + tx, baseY - cy); ctx.lineTo(shopStartX - cx + tx, baseY - cy + 600); ctx.stroke(); }
    ctx.fillStyle = '#060a0e'; ctx.fillRect(shopStartX - cx, baseY - 400 - cy, 1200, 400);
    ctx.strokeStyle = 'rgba(0, 255, 234, 0.04)'; ctx.lineWidth = 1; for (let wx = 0; wx < 1200; wx += 80) { ctx.beginPath(); ctx.moveTo(shopStartX - cx + wx, baseY - 400 - cy); ctx.lineTo(shopStartX - cx + wx, baseY - cy); ctx.stroke(); }
    // Shelves
    ctx.fillStyle = '#0c1420'; ctx.fillRect(shopStartX + 50 - cx, baseY - 300 - cy, 300, 8); ctx.fillRect(shopStartX + 50 - cx, baseY - 200 - cy, 300, 8);
    for (let i = 0; i < 5; i++) { let ix = shopStartX + 70 + i * 55; ctx.fillStyle = `rgba(${50 + i * 30}, ${100 + i * 20}, ${200 - i * 20}, 0.6)`; ctx.fillRect(ix - cx, baseY - 320 - cy, 12, 20); ctx.fillRect(ix - cx, baseY - 220 - cy, 12, 20); }
    // Counter
    let counterX = shopStartX + 400, counterY = baseY - 80;
    ctx.fillStyle = '#0c1420'; ctx.fillRect(counterX - cx, counterY - cy, 400, 80);
    ctx.fillStyle = '#14202e'; ctx.fillRect(counterX - cx, counterY - cy, 400, 6);
    ctx.fillStyle = 'rgba(0, 255, 234, 0.2)'; ctx.fillRect(counterX - cx, counterY - cy, 400, 2);
    ctx.fillStyle = '#0a1018'; ctx.fillRect(counterX + 300 - cx, counterY - 40 - cy, 60, 40); ctx.strokeStyle = '#00ffea'; ctx.lineWidth = 1; ctx.strokeRect(counterX + 300 - cx, counterY - 40 - cy, 60, 40);
    ctx.fillStyle = `rgba(0, 255, 234, ${0.3 + Math.sin(frameCount * 0.05) * 0.1})`; ctx.fillRect(counterX + 306 - cx, counterY - 36 - cy, 48, 20);
    // Hearty
    let heartyX = counterX + 150, heartyY = counterY - 30;
    let bounce = Math.sin(Date.now() * 0.005) * 3;
    ctx.save(); ctx.translate(heartyX - cx, heartyY - cy + bounce); ctx.scale(0.9, 0.9);
    ctx.fillStyle = "#ff4d4d"; ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-20, -15, -40, 10, 0, 35); ctx.bezierCurveTo(40, 10, 20, -15, 0, 5); ctx.fill();
    ctx.fillStyle = "#000"; ctx.fillRect(-12, 5, 4, 15); ctx.fillRect(8, 5, 4, 15); ctx.restore();
    // Tables
    let table1X = shopStartX + 100, table1Y = baseY - 60;
    ctx.fillStyle = '#0c1420'; ctx.fillRect(table1X - cx, table1Y - cy, 120, 8); ctx.fillRect(table1X + 5 - cx, table1Y + 8 - cy, 6, 52); ctx.fillRect(table1X + 109 - cx, table1Y + 8 - cy, 6, 52);
    let table2X = shopStartX + 900, table2Y = baseY - 60;
    ctx.fillStyle = '#0c1420'; ctx.fillRect(table2X - cx, table2Y - cy, 120, 8); ctx.fillRect(table2X + 5 - cx, table2Y + 8 - cy, 6, 52); ctx.fillRect(table2X + 109 - cx, table2Y + 8 - cy, 6, 52);
    // Neon sign
    let signX = shopStartX + 500, signY = baseY - 350;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.fillRect(signX - cx, signY - cy, 200, 40);
    let signPulse = 0.7 + Math.sin(frameCount * 0.08) * 0.3;
    ctx.fillStyle = `rgba(255, 77, 77, ${signPulse})`; ctx.font = 'bold 16px Consolas'; ctx.textAlign = 'center'; ctx.fillText('HEARTY\'S', signX + 100 - cx, signY + 18 - cy);
    ctx.fillStyle = `rgba(0, 255, 234, ${signPulse * 0.6})`; ctx.font = '10px Consolas'; ctx.fillText('MODIFICATIONS & SUPPLY', signX + 100 - cx, signY + 32 - cy); ctx.textAlign = 'left';
    // Medical station
    let medX = gateX + 200, medY = baseY - 80;
    ctx.fillStyle = '#0c1420'; ctx.fillRect(medX - cx, medY - cy, 100, 80);
    ctx.fillStyle = 'rgba(0, 255, 100, 0.2)'; ctx.fillRect(medX - cx, medY - cy, 100, 2);
    ctx.fillStyle = `rgba(0, 255, 100, ${0.3 + Math.sin(frameCount * 0.06) * 0.2})`; ctx.font = '8px Consolas'; ctx.fillText('MED_STATION', medX + 5 - cx, medY + 14 - cy);
    ctx.fillStyle = 'rgba(0, 255, 100, 0.3)'; ctx.fillRect(medX + 10 - cx, medY + 20 - cy, 80, 4);
    // Supply crates
    for (let ci = 0; ci < 3; ci++) { let crateX = gateX + 1400 + ci * 80, crateY = baseY - 50; ctx.fillStyle = '#0c1420'; ctx.fillRect(crateX - cx, crateY - cy, 60, 50); ctx.strokeStyle = 'rgba(0, 255, 234, 0.15)'; ctx.lineWidth = 1; ctx.strokeRect(crateX - cx, crateY - cy, 60, 50); ctx.fillStyle = 'rgba(0, 255, 234, 0.1)'; ctx.font = '7px Consolas'; ctx.fillText('SUPPLY', crateX + 5 - cx, crateY + 14 - cy); }
    // Hearty interaction
    if (Math.abs(p.x - heartyX) < 100 && Math.abs(p.y - counterY) < 100) { ctx.fillStyle = '#fff'; ctx.font = '14px Consolas'; ctx.fillText('[E] TALK', heartyX - cx - 20, heartyY - cy - 30 + bounce); if (keys.action) { document.getElementById('dialogue-box').style.display = 'block'; shopChatTimer = 60; keys.action = false; } }
    // Elevator button
    let elevX = gateX + 1200, elevY = baseY - 60;
    ctx.fillStyle = '#0c1420'; ctx.fillRect(elevX - cx, elevY - cy, 60, 60);
    ctx.strokeStyle = gateOpen ? '#0f0' : 'rgba(0, 255, 234, 0.3)'; ctx.lineWidth = 2; ctx.strokeRect(elevX - cx, elevY - cy, 60, 60);
    ctx.fillStyle = gateOpen ? '#0f0' : '#0ff'; ctx.fillRect(elevX + 20 - cx, elevY + 10 - cy, 20, 20);
    if (!gateOpen && Math.abs(p.x - elevX) < 80 && Math.abs(p.y - elevY) < 80) { ctx.fillStyle = '#fff'; ctx.font = '14px Consolas'; ctx.fillText("[E] CALL", elevX - cx - 5, elevY - cy - 10); if (keys.action) { gateOpen = true; camShake = 10; keys.action = false; } }
    // Exit gate
    let gX = gateX + 1500, gY = baseY - 400, gH = gateOpen ? 0 : 400;
    if (!gateOpen) { ctx.fillStyle = '#0c1018'; ctx.fillRect(gX - cx, gY - cy, 100, gH); ctx.fillStyle = '#ff4d4d'; for (let sy = 0; sy < gH; sy += 40) ctx.fillRect(gX - cx, gY - cy + sy, 100, 4); ctx.strokeStyle = '#00ffea'; ctx.lineWidth = 3; ctx.strokeRect(gX - cx, gY - cy, 100, gH); }
    if (!gateOpen && p.x + p.w > gX) { p.x = gX - p.w; p.vx = 0; }
    // Elevator overlay
    if (inElevator) {
        let progress = elevatorTimer / ELEVATOR_DURATION;
        ctx.fillStyle = `rgba(0, 0, 0, ${progress * 0.8})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ffea'; ctx.font = 'bold 20px Consolas'; ctx.textAlign = 'center';
        ctx.fillText('SECTOR TRANSIT', canvas.width / 2, canvas.height / 2 - 20);
        ctx.font = '14px Consolas'; ctx.fillText(`SECTOR ${floorNum} >> SECTOR ${floorNum + 1}`, canvas.width / 2, canvas.height / 2 + 10);
        ctx.fillStyle = 'rgba(0, 255, 234, 0.2)'; ctx.fillRect(canvas.width / 2 - 100, canvas.height / 2 + 30, 200, 8);
        ctx.fillStyle = '#00ffea'; ctx.fillRect(canvas.width / 2 - 100, canvas.height / 2 + 30, 200 * progress, 8);
        ctx.textAlign = 'left';
    }
}

// --- ROOM GENERATION ---
function generateFloor() {
    // ROOM GENERATOR V3: stable floor grid + modular room layouts.
    // Elevation is fixed per sector so stair chains cannot push the safe room away.
    platforms=[]; hazards=[]; lockers=[]; decals=[]; lasers=[]; rooms=[]; puzzles=[];
    ceilings=[]; vents=[]; vinePatches=[];
    vineCaught=false; vineCaughtPatch=null; vineEscapeCount=0; vineTrapTime=0;

    const floorY=canvas.height-150, roomTopY=70, roomHeight=floorY-roomTopY;
    const roomTypes=['hallway','storage','lab','hazard','catwalk','hideout','chamber','maintenance','containment'];
    const roomW=1450;
    let curX=1000, roomIndex=0, ventIdCounter=0;

    // Entry zone
    platforms.push({x:-500,y:floorY,w:1500,h:600});
    ceilings.push({x:-500,y:roomTopY,w:1500,h:20});
    rooms.push({x:-500,y:roomTopY,w:1500,h:roomHeight,floorY,type:'start',label:'SECTOR_'+floorNum+'::ENTRY',hasDoorLeft:false,hasDoorRight:true});

    while(curX<gateX-2200) {
        const type=roomTypes[roomIndex%roomTypes.length];
        const w=Math.min(roomW,gateX-2200-curX);
        const room={x:curX,y:roomTopY,w,h:roomHeight,type,label:type.toUpperCase()+'_BLOCK_'+(roomIndex+1),floorY,hasDoorLeft:true,hasDoorRight:true,roomNumber:roomIndex+1};
        // One continuous ground level across every room.
        platforms.push({x:curX,y:floorY,w,h:600});

        if(type==='storage') {
            for(let i=0;i<3;i++){const x=curX+180+i*360;platforms.push({x,y:floorY-125,w:180,h:18},{x:x+35,y:floorY-245,w:110,h:18});}
        } else if(type==='lab'||type==='chamber') {
            platforms.push({x:curX+190,y:floorY-115,w:210,h:18},{x:curX+620,y:floorY-205,w:190,h:18},{x:curX+1030,y:floorY-115,w:210,h:18});
        } else if(type==='hazard'||type==='containment') {
            const hx=curX+330, hw=Math.max(180,w-660); hazards.push({x:hx,y:floorY+70,w:hw,h:500,type:'lava'});
            const sw=(hw-40)/3; for(let i=0;i<3;i++) platforms.push({x:hx+20+i*sw,y:floorY-100-(i%2)*35,w:sw-20,h:20});
        } else if(type==='catwalk') {
            platforms.push({x:curX+170,y:floorY-165,w:w-340,h:20},{x:curX+420,y:floorY-300,w:170,h:18},{x:curX+850,y:floorY-300,w:170,h:18}); room.featureY=floorY-165;
        } else if(type==='hideout'||type==='maintenance') {
            platforms.push({x:curX+260,y:floorY-85,w:w-520,h:20}); room.alcoveY=floorY-85;
        } else {
            for(let i=0;i<3;i++) platforms.push({x:curX+260+i*360,y:floorY-90-(i%2)*55,w:150,h:18});
        }

        // Door frames with a player-sized opening.
        const jamb=26, doorTop=floorY-205;
        platforms.push({x:curX,y:roomTopY,w:jamb,h:doorTop-roomTopY},{x:curX+w-jamb,y:roomTopY,w:jamb,h:doorTop-roomTopY});
        ceilings.push({x:curX,y:roomTopY,w,h:20}); rooms.push(room);

        const lockerCount=(type==='storage'||type==='hideout'||type==='maintenance')?2:(Math.random()>.55?1:0);
        for(let i=0;i<lockerCount;i++) lockers.push({x:curX+120+Math.random()*Math.max(100,w-240),y:floorY-100,w:60,h:100,openAnim:0});

        const roomPlats=platforms.filter(pl=>pl.x>=curX&&pl.x<curX+w&&pl.w>=80&&pl.y>=floorY-340&&pl.y<=floorY+10);
        if(activeMods.has('vine')&&Math.random()>.4&&roomPlats.length){const pl=roomPlats[Math.floor(Math.random()*roomPlats.length)],vw=60+Math.random()*80;vinePatches.push(new VinePatch(pl.x+30+Math.random()*Math.max(10,pl.w-vw-60),pl.y,vw));}
        if(activeMods.has('vents')&&Math.random()>.45&&roomPlats.length){const pl=roomPlats[Math.floor(Math.random()*roomPlats.length)],vx=pl.x+30+Math.random()*Math.max(10,pl.w-110),v={x:vx,y:pl.y-60,w:80,h:60,connectedTo:-1,id:ventIdCounter++};let nearest=-1,dist=Infinity;vents.forEach((old,i)=>{const d=Math.hypot(old.x-vx,old.y-v.y);if(d<dist&&d<3000){dist=d;nearest=i;}});if(nearest>=0){v.connectedTo=nearest;vents[nearest].connectedTo=v.id;}vents.push(v);}
        if(activeMods.has('puzzles')&&Math.random()>.6&&roomPlats.length){const pl=roomPlats[Math.floor(Math.random()*roomPlats.length)],dx=curX+w-120,dy=floorY-400;if(Math.random()<.5)puzzles.push(new Puzzle({type:'switch',x:curX,y:floorY,switchX:pl.x+Math.min(60,pl.w/2),switchY:pl.y-20,doorX:dx,doorY:dy,doorW:100,doorH:400}));else puzzles.push(new Puzzle({type:'cord',x:curX,y:floorY,plugX:pl.x+60,plugY:pl.y-20,socketX:dx-40,socketY:pl.y-20,doorX:dx,doorY:dy,doorW:100,doorH:400}));}
        if(Math.random()>.65) decals.push({x:curX+100+Math.random()*Math.max(20,w-200),y:roomTopY+60+Math.random()*180,w:40+Math.random()*60,h:20+Math.random()*30,c:'rgba(0,242,255,0.08)',type:'circuit'});
        if(activeMods.has('puzzles')&&Math.random()>.78) lasers.push({x:curX+w*.55,y:floorY-300,w:20,h:300,sx:curX+w*.5,sy:floorY-20,active:true});
        curX+=w; roomIndex++;
    }

    // Safe room is aligned to the exact same floor as the entire sector.
    platforms.push({x:gateX-600,y:floorY,w:600,h:600},{x:gateX,y:floorY,w:4000,h:600},{x:gateX+100,y:floorY-350,w:1400,h:20});
    ceilings.push({x:gateX-600,y:roomTopY,w:4600,h:20});
    rooms.push({x:gateX-600,y:roomTopY,w:4600,h:roomHeight+150,floorY,type:'safe',label:'SECTOR_'+floorNum+'::SAFE',hasDoorLeft:true,hasDoorRight:false});

    tracer.active=false; if(activeMods.has('tracer'))tracer.spawn(); if(activeMods.has('dodge'))dodgeCharges=dodgeMax;
    generateBgLayers();
}
function calculateRewards() { totalExp += (150 + [...activeMods].reduce((a, id) => a + allMods.find(m => m.id === id).exp, 0)); gateOpen = false; }
function rerollMods() { openShop(); }
function openShop() { document.getElementById('dialogue-box').style.display = 'none'; document.getElementById('shop-menu').style.display = 'block'; renderMods(); }

// Expose to global scope for HTML onclick handlers
window.openShop = openShop;
window.heartyChat = heartyChat;
window.rerollMods = rerollMods;
window.toggleSettings = toggleSettings;

const heartyLines = {
    talk: ["//THE_LAB_USED_TO_BE_FULL_OF_RESEARCHERS._NOW_IT'S_JUST_ME_AND_THE_HAZARDS.", "//I_KEEP_THE_SHOP_RUNNING._SOMEONE_HAS_TO_SUPPLY_THE_RUNNERS.", "//EACH_SECTOR_DEEPER_GETS_WORSE._THE_BYND_PILLARS_WEREN'T_ALWAYS_HOSTILE.", "//THE_TRACERS_HUNTED_US_TOO._I_BUILT_THIS_COUNTER_AS_A_BARRICADE._NOW_IT'S_A_STORE.", "//YOU'RE_DOING_BETTER_THAN_MOST._MOST_RUNNERS_DON'T_MAKE_IT_PAST_SECTOR_3.", "//THE_VOID_BELOW?_YEAH,_IT_GROWS._DON'T_THINK_ABOUT_IT.", "//I_FOUND_A_PHASE_MODULE_ONCE._NEARLY_BLINKED_OUT_OF_EXISTENCE._WORTH_IT_THOUGH.", "//THE_CHRONO_TECH?_STOLEN_FROM_THE_CLOCK_DIVISION._DON'T_TELL_ANYONE."],
    talk_more: ["//YOU_WANT_STORIES?_I_WATCHED_A_RUNNER_OUTPACE_A_PURGE_ONCE._SHE_DIDN'T_STOP_RUNNING_FOR_6_SECTORS.", "//THE_LAB'S_POWER_SYSTEM_IS_FAILING._THAT'S_WHY_THE_LIGHTS_FLICKER._THAT'S_WHY_THE_DOORS_LOCK.", "//I_HEARD_THERE'S_AN_EXIT._WAY_DOWN_PAST_SECTOR_99._NO_ONE'S_MADE_IT._YET.", "//THE_MODS_I_SELL?_SALVAGED_FROM_DEAD_RUNNERS._...WHAT?_THEY_DON'T_NEED_THEM_ANYMORE.", "//SOMETIMES_THE_WALLS_SHIFT._NEW_ROOMS._NEW_HAZARDS._THE_LAB_BUILDS_ITSELF."]
};
let heartyTalkIndex = 0;
function heartyChat(type) {
    let textEl = document.getElementById('hearty-text'), optionsEl = document.getElementById('chat-options');
    if (type === 'talk' || type === 'talk_more') {
        let lines = heartyLines[type] || heartyLines.talk; textEl.textContent = lines[heartyTalkIndex % lines.length]; heartyTalkIndex++;
        optionsEl.innerHTML = '';
        let talkMoreBtn = document.createElement('button'); talkMoreBtn.textContent = '[ TALK_MORE ]'; talkMoreBtn.style.cssText = 'border-color: #fbff00; color: #fbff00; margin: 4px;'; talkMoreBtn.onclick = () => heartyChat('talk_more'); optionsEl.appendChild(talkMoreBtn);
        let modsBtn = document.createElement('button'); modsBtn.textContent = '[ SHOW_MODS ]'; modsBtn.style.cssText = 'border-color: #00ffea; color: #00ffea; margin: 4px;'; modsBtn.onclick = () => openShop(); optionsEl.appendChild(modsBtn);
        let leaveBtn = document.createElement('button'); leaveBtn.textContent = '[ LEAVE ]'; leaveBtn.style.cssText = 'border-color: #555; color: #555; margin: 4px;'; leaveBtn.onclick = () => { document.getElementById('dialogue-box').style.display = 'none'; }; optionsEl.appendChild(leaveBtn);
    }
}

function getModIconSVG(icon, active) {
    const c = active ? '#00ffea' : '#888';
    const icons = {
        FEATHER: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2C8 2 4 6 4 12c0 4 2 8 8 10 6-2 8-6 8-10 0-6-4-10-8-10zm0 2c3 0 6 3 6 8 0 3-1 6-6 8-5-2-6-5-6-8 0-5 3-8 6-8z" fill="${c}" opacity="0.6"/><path d="M12 6v12M8 10l4-4 4 4" stroke="${c}" stroke-width="2" fill="none"/></svg>`,
        BOLT: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="${c}"/></svg>`,
        ARROW_UP: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 4l-8 8h5v8h6v-8h5z" fill="${c}"/></svg>`,
        CLOCK: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="${c}" stroke-width="2" fill="none"/><path d="M12 7v5l3 3" stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
        SHIELD: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2L3 7v5c0 5 4 9 9 10 5-1 9-5 9-10V7z" fill="${c}" opacity="0.4" stroke="${c}" stroke-width="1.5"/></svg>`,
        CROSSHAIR: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke="${c}" stroke-width="1.5" fill="none"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4" stroke="${c}" stroke-width="2"/></svg>`,
        PILLAR: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="20" fill="${c}" opacity="0.5" rx="1"/><path d="M6 2h12M6 22h12" stroke="${c}" stroke-width="2"/></svg>`,
        PUZZLE: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4 7h3a2 2 0 004 0h9v4a2 2 0 000 4v4h-9a2 2 0 00-4 0H4V7z" fill="${c}" opacity="0.4" stroke="${c}" stroke-width="1.5"/></svg>`,
        SKULL: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2C7 2 4 6 4 10c0 3 1 5 3 6v4h10v-4c2-1 3-3 3-6 0-4-3-8-8-8z" fill="${c}" opacity="0.4" stroke="${c}" stroke-width="1.5"/><circle cx="9" cy="9" r="2" fill="${c}"/><circle cx="15" cy="9" r="2" fill="${c}"/></svg>`,
        CRACK: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2L8 10h4l-4 12 8-10h-4l4-12z" fill="${c}" opacity="0.6"/></svg>`,
        STOP: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" fill="${c}" opacity="0.4" stroke="${c}" stroke-width="2"/><path d="M8 8l8 8M16 8l-8 8" stroke="${c}" stroke-width="2"/></svg>`,
        STAR: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.5 4.5 2 7L12 16l-6.5 4.5 2-7L2 9h7z" fill="${c}" opacity="0.5" stroke="${c}" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="3" ry="5" fill="${c}" opacity="0.6"/></svg>`,
        DUCT: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="${c}" stroke-width="2"/><path d="M4 12h6l2-4 2 8 2-4h4" stroke="${c}" stroke-width="2" fill="none"/></svg>`,
    };
    return icons[icon] || icons.BOLT;
}

function renderMods() {
    const c = document.getElementById('mod-container'); c.innerHTML = '';
    [...allMods].sort(() => 0.5 - Math.random()).slice(0, 4).forEach(m => {
        let d = document.createElement('div'); d.className = `mod-card ${activeMods.has(m.id) ? 'active' : ''}`;
        let isActive = activeMods.has(m.id);
        let svgStr = getModIconSVG(m.icon, isActive);
        d.innerHTML = `<div style="display:flex;align-items:center;gap:8px;"><img src="data:image/svg+xml;base64,${btoa(svgStr)}" width="24" height="24"><b>${m.name}</b></div><br><small>${m.desc}</small><br><span class="exp-tag">+${m.exp} SP</span>`;
        d.onclick = () => { activeMods.has(m.id) ? activeMods.delete(m.id) : activeMods.add(m.id); renderMods(); };
        c.appendChild(d);
    });
}

function nextFloor() {
    floorNum++; inSafeRoom = false; p.reset(); timeLeft = activeMods.has('chrono') ? 120 : 90;
    particles = []; ghostTrail = [];
    if (activeMods.has('dodge')) dodgeCharges = dodgeMax;
    isDodging = false; dodgeTimer = 0; dodgeCooldown = 0;
    safeRoomDoorSlammed = false; safeRoomDoorTimer = 0; carryingPlug = false;
    inElevator = false; elevatorTimer = 0;
    inVentSystem = false; ventTimer = 0; crawl.reset();
    shopChatState = 0; currentDialogue = Math.floor(Math.random() * shopDialogue.length);
    document.getElementById('floor-tag').innerText = "//SECTOR_" + floorNum;
    generateFloor();
}

function die(msg) { if (isDodging) return; isGameOver = true; document.getElementById('tv-wrapper').style.filter = "saturate(5) hue-rotate(90deg)"; setTimeout(() => { alert("FATAL: " + msg); location.reload(); }, 500); }

// --- HUD ---
function drawSpeedMeter() {
    let meterX = 20, meterY = canvas.height - 50, meterW = 160, meterH = 12, maxSpeed = 15, speedRatio = Math.min(p.speed / maxSpeed, 1);
    ctx.fillStyle = 'rgba(0, 10, 20, 0.8)'; ctx.fillRect(meterX - 2, meterY - 18, meterW + 4, meterH + 22);
    ctx.fillStyle = 'rgba(0, 255, 234, 0.6)'; ctx.font = '10px Consolas'; ctx.fillText('VELOCITY', meterX, meterY - 6);
    ctx.fillStyle = 'rgba(0, 255, 234, 0.1)'; ctx.fillRect(meterX, meterY, meterW, meterH);
    let r = Math.floor(speedRatio * 255), g = Math.floor((1 - speedRatio) * 255), fillColor = `rgb(${r}, ${g}, 100)`;
    ctx.fillStyle = fillColor; ctx.fillRect(meterX, meterY, meterW * speedRatio, meterH);
    if (speedRatio > 0.5) { ctx.shadowColor = fillColor; ctx.shadowBlur = 8; ctx.fillRect(meterX, meterY, meterW * speedRatio, meterH); ctx.shadowBlur = 0; }
    ctx.fillStyle = '#fff'; ctx.font = '10px Consolas'; ctx.fillText(Math.floor(p.speed * 10) + ' u/s', meterX + meterW + 8, meterY + 10);
}

function drawDodgeMeter() {
    if (!activeMods.has('dodge')) return;
    let meterX = 20, meterY = canvas.height - 90, cellW = 18, cellH = 14, gap = 4;
    ctx.fillStyle = 'rgba(0, 10, 20, 0.8)'; ctx.fillRect(meterX - 2, meterY - 18, dodgeMax * (cellW + gap) + 4, cellH + 22);
    ctx.fillStyle = 'rgba(68, 136, 255, 0.6)'; ctx.font = '10px Consolas'; ctx.fillText('PHASE CHARGES', meterX, meterY - 6);
    for (let i = 0; i < dodgeMax; i++) { let cx2 = meterX + i * (cellW + gap); if (i < dodgeCharges) { ctx.fillStyle = isDodging ? 'rgba(68, 136, 255, 0.4)' : '#4488ff'; ctx.fillRect(cx2, meterY, cellW, cellH); } else { ctx.fillStyle = 'rgba(68, 136, 255, 0.1)'; ctx.fillRect(cx2, meterY, cellW, cellH); ctx.strokeStyle = 'rgba(68, 136, 255, 0.3)'; ctx.lineWidth = 1; ctx.strokeRect(cx2, meterY, cellW, cellH); } }
}

// --- VINE FLOWER (eye horror) ---
function drawVineFlower() {
    if (vineTrapTime < VINE_FLOWER_START) return;
    let progress = Math.min((vineTrapTime - VINE_FLOWER_START) / (VINE_FLOWER_KILL - VINE_FLOWER_START), 1);
    let size = progress * Math.min(canvas.width, canvas.height) * 0.44;
    let cx = canvas.width / 2, cy = canvas.height / 2;
    ctx.save();
    ctx.globalAlpha = Math.min(progress * 1.2, 0.94);
    let petalCount = 10;
    for (let i = 0; i < petalCount; i++) {
        let angle = (i / petalCount) * Math.PI * 2 + frameCount * 0.004;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        let g = Math.floor(105 + Math.sin(frameCount * 0.03 + i) * 18);
        ctx.fillStyle = `rgb(${g + 8},${g},${g - 6})`;
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.63, size * 0.15, size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.fillStyle = '#0e0e0e';
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.29, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#050505';
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2); ctx.fill();
    let pOff = size * 0.055;
    let px = cx + Math.sin(frameCount * 0.05) * pOff;
    let py = cy + Math.cos(frameCount * 0.037) * pOff;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, py, size * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath(); ctx.arc(px, py, size * 0.065, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(px - size * 0.04, py - size * 0.04, size * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (progress >= 1) die("CONSUMED_BY_OVERGROWTH");
}

// --- VINE ESCAPE BAR HUD ---
function drawVineBar() {
    if (!vineCaught) return;
    let bx = canvas.width / 2 - 100, by = canvas.height - 140, bw = 200, bh = 14;
    ctx.fillStyle = 'rgba(0,8,16,0.92)'; ctx.fillRect(bx - 4, by - 24, bw + 8, bh + 28);
    ctx.fillStyle = `rgba(180,140,40,${0.6 + Math.sin(frameCount * 0.2) * 0.3})`; ctx.font = '10px Consolas'; ctx.textAlign = 'center';
    ctx.fillText('// VINE_CAUGHT — SPAM [JUMP] TO BREAK FREE', canvas.width / 2, by - 8); ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(80,60,15,0.5)'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(210,170,50,0.95)'; ctx.fillRect(bx, by, bw * (vineEscapeCount / VINE_ESCAPE_JUMPS), bh);
    ctx.strokeStyle = 'rgba(180,140,40,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
}

let loopRunning = false;
function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(3,5,8,0.82)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ffea'; ctx.font = 'bold 38px Consolas'; ctx.textAlign = 'center';
    ctx.fillText('// PAUSED', canvas.width / 2, canvas.height / 2 - 24);
    ctx.font = '15px Consolas'; ctx.fillStyle = 'rgba(0,255,234,0.55)';
    ctx.fillText('[P] OR CLICK PAUSE TO RESUME', canvas.width / 2, canvas.height / 2 + 18);
    ctx.textAlign = 'left';
}
function togglePause() {
    if (isGameOver) return;
    isPaused = !isPaused;
    let btn = document.getElementById('pause-btn');
    if (btn) btn.textContent = isPaused ? '[ RESUME ]' : '[ PAUSE ]';
    if (isPaused) {
        drawPauseOverlay();
    } else if (!loopRunning) {
        loopRunning = true;
        requestAnimationFrame(loop);
    }
}
window.togglePause = togglePause;

// --- MAIN LOOP ---
function loop() {
    if (isGameOver) { loopRunning = false; return; }
    if (isPaused) { loopRunning = false; return; }
    frameCount++;
    drawLabBackground();
    ctx.strokeStyle = 'rgba(0, 255, 234, 0.015)'; ctx.lineWidth = 1;
    let gridOffX = camX * 0.3 % 80, gridOffY = camY * 0.3 % 80;
    for (let gx = -gridOffX; gx < canvas.width; gx += 80) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); ctx.stroke(); }
    for (let gy = -gridOffY; gy < canvas.height; gy += 80) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); ctx.stroke(); }
    camX += (p.x - canvas.width / 3 - camX) * 0.1; camY += ((p.y - canvas.height / 1.5) - camY) * 0.1;
    ctx.save();
    if (camShake > 0) { ctx.translate((Math.random() - 0.5) * camShake, (Math.random() - 0.5) * camShake); if (!pd.active) camShake *= 0.85; }

    // Vent system: make everything transparent except vents and player
    let ventAlpha = inVentSystem ? 0.15 : 1.0;
    ctx.globalAlpha = ventAlpha;

    rooms.forEach(r => drawLabRoom(r, camX, camY)); decals.forEach(d => drawLabDecal(d, camX, camY));
    platforms.forEach(pl => { if (pl.isSlope) drawLabSlope(pl, camX, camY); else drawLabPlatform(pl, camX, camY); });
    hazards.forEach(h => drawLabHazard(h, camX, camY));
    lasers.forEach(l => drawLabLaser(l, camX, camY));
    ceilings.forEach(c => { let sx = c.x - camX, sy = c.y - camY; ctx.fillStyle = '#0a0f14'; ctx.fillRect(sx, sy, c.w, c.h); ctx.fillStyle = 'rgba(0, 255, 234, 0.15)'; ctx.fillRect(sx, sy + c.h - 3, c.w, 3); });

    // Lockers with animation
    lockers.forEach(l => {
        let isNear = p.hiding && lockers.some(lo => lo === l && p.x + p.w > lo.x && p.x < lo.x + lo.w);
        l.openAnim = isNear ? Math.min((l.openAnim || 0) + 0.06, 1) : Math.max((l.openAnim || 0) - 0.06, 0);
        drawLabLocker(l, camX, camY);
    });

    // Vents always visible (even in vent system)
    ctx.globalAlpha = 1.0;
    vents.forEach(v => {
        let vx = v.x - camX, vy = v.y - camY;
        let isActive = p.hiding && vents.some(ve => ve === v && p.x + p.w > ve.x && p.x < ve.x + ve.w);
        if (inVentSystem) { ctx.fillStyle = 'rgba(0, 255, 234, 0.1)'; ctx.fillRect(vx - 4, vy - 4, v.w + 8, v.h + 8); }
        ctx.fillStyle = isActive ? 'rgba(0, 255, 234, 0.15)' : 'rgba(12, 16, 24, 0.7)'; ctx.fillRect(vx, vy, v.w, v.h);
        ctx.strokeStyle = isActive ? '#00ffea' : 'rgba(0, 255, 234, 0.3)'; ctx.lineWidth = 2; ctx.strokeRect(vx, vy, v.w, v.h);
        ctx.strokeStyle = 'rgba(0, 255, 234, 0.15)'; ctx.lineWidth = 1;
        for (let sl = 8; sl < v.h; sl += 10) { ctx.beginPath(); ctx.moveTo(vx + 4, vy + sl); ctx.lineTo(vx + v.w - 4, vy + sl); ctx.stroke(); }
        // Connection line to linked vent
        if (v.connectedTo >= 0 && vents[v.connectedTo]) {
            let tv = vents[v.connectedTo];
            let tvx = tv.x - camX, tvy = tv.y - camY;
            ctx.strokeStyle = inVentSystem ? 'rgba(0, 255, 234, 0.4)' : 'rgba(0, 255, 234, 0.08)';
            ctx.lineWidth = inVentSystem ? 2 : 1;
            ctx.setLineDash([8, 8]);
            ctx.beginPath(); ctx.moveTo(vx + v.w / 2, vy + v.h / 2); ctx.lineTo(tvx + tv.w / 2, tvy + tv.h / 2); ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.fillStyle = 'rgba(0, 255, 234, 0.3)'; ctx.font = '7px Consolas'; ctx.fillText('VENT', vx + 4, vy + 8);
        if (!p.hiding && Math.abs(p.x - v.x) < 80 && Math.abs(p.y - v.y) < 80) { ctx.fillStyle = '#fff'; ctx.font = '10px Consolas'; ctx.fillText('[E] HIDE', vx, vy - 8); }
        if (inVentSystem && v.connectedTo >= 0 && Math.abs(p.x - v.x) < 80) { ctx.fillStyle = '#00ffea'; ctx.font = '10px Consolas'; ctx.fillText('[SPACE] TRAVEL', vx, vy - 20); }
    });

    // Restore alpha for rest
    ctx.globalAlpha = ventAlpha;
    // Vine patches — decrement cooldowns and draw
    if (activeMods.has('vine')) {
        vinePatches.forEach(vp => { if (vp.cooldown > 0) vp.cooldown--; vp.draw(camX, camY); });
    }

    puzzles.forEach(pz => { pz.update(); pz.draw(camX, camY); });
    updateParticles(); drawParticles(camX, camY);
    if (inSafeRoom) drawSafeRoom(camX, camY);
    pd.update(); pd.draw(camX, camY); bynd.update(); bynd.draw(camX, camY); tracer.update(); tracer.draw(camX, camY);

    // Player always fully visible
    ctx.globalAlpha = 1.0;
    p.update(); p.draw(camX, camY);
    dropn.update(); dropn.draw(camX, camY);
    sote.update(); sote.draw(camX, camY);
    crawl.update(); crawl.draw(camX, camY);

    // Vent system overlay
    if (inVentSystem) {
        let timeLeftVent = VENT_CRAWL_TIME - ventTimer;
        let seconds = Math.ceil(timeLeftVent / 60);
        ctx.fillStyle = timeLeftVent < 180 ? `rgba(255, 0, 0, ${0.5 + Math.sin(frameCount * 0.15) * 0.3})` : 'rgba(0, 255, 234, 0.5)';
        ctx.font = '12px Consolas'; ctx.fillText('VENT SYSTEM', 20, 30);
        ctx.font = '10px Consolas'; ctx.fillText('CRAWL IN: ' + seconds + 's', 20, 45);
        if (timeLeftVent < 180) { ctx.fillStyle = `rgba(255, 0, 0, ${0.3 + Math.sin(frameCount * 0.2) * 0.2})`; ctx.font = 'bold 14px Consolas'; ctx.fillText('LEAVE VENTS NOW', 20, 65); }
    }

    ctx.restore();
    drawVineFlower();
    if (activeMods.has('blind')) { let g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 50, canvas.width / 2, canvas.height / 2, canvas.width * 0.8); g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(0,0,0,0.95)'); ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    drawSpeedMeter(); drawDodgeMeter(); drawVineBar();
    document.getElementById('exp-display').innerText = "SYSTEM_POINTS: " + totalExp;
    loopRunning = true;
    requestAnimationFrame(loop);
}

let scale = 1;
function resizeGame() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    scale = Math.min(vw / BASE_WIDTH, vh / BASE_HEIGHT);

    const displayWidth = Math.floor(BASE_WIDTH * scale);
    const displayHeight = Math.floor(BASE_HEIGHT * scale);

    const left = Math.floor((vw - displayWidth) / 2);
    const top = Math.floor((vh - displayHeight) / 2);

    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    canvas.style.left = left + 'px';
    canvas.style.top = top + 'px';

    const ui = document.getElementById('ui');
    if (ui) {
        ui.style.left = left + 'px';
        ui.style.top = top + 'px';
        ui.style.transform = `scale(${scale})`;
    }
}

window.addEventListener('resize', resizeGame);
resizeGame();

setInterval(() => { if (!isGameOver && !inSafeRoom && !isPaused) { timeLeft -= (activeMods.has('vampire') ? 2 : 1); let maxTime = activeMods.has('chrono') ? 120 : 90; let mins = Math.floor(timeLeft / 60), secs = timeLeft % 60; document.getElementById('timer').innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`; if (timeLeft <= 0) { if (isDodging) { } else if (activeMods.has('dodge') && tryDodge()) { timeLeft = 1; } else die("TIME_EXPIRED"); } } }, 1000);
setInterval(() => { if (!isGameOver && !inSafeRoom && !isPaused && Math.random() < 0.3) pd.trigger(); }, 6000);
generateFloor();
setInterval(() => { if (!isGameOver && !inSafeRoom && !isPaused && activeMods.has('dropn')) { if (Math.random() < 0.4) dropn.trigger(); } }, 5000);
setInterval(() => { if (!isGameOver && !inSafeRoom && !isPaused && activeMods.has('sote')) { if (Math.random() < 0.3) sote.trigger(); } }, 8000);
loopRunning = true;
loop();
