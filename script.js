/**
 * Minimal Web Project - Candy Spawner
 */

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('app-container');
    const candies = [
        'bear.png', 'worm.png', 'lolli.png', 'tofy.png', 
        'cola.png', 'dragon.png', 'cucumber.png'
    ];
    let currentIndex = 0;
    const activeAnts = [];
    const activeCandies = [];
    const trailCountsPerEdge = { top: 0, bottom: 0, left: 0, right: 0 };

    // Overlap detection: axis-aligned bounding box check
    function candiesOverlap(a, b) {
        return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 10 &&
               Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 10;
    }

    // Global Animation Loop
    function update() {
        const now = Date.now();
        const dt = 1/60;
        
        for (let i = activeCandies.length - 1; i >= 0; i--) {
            const c = activeCandies[i];

            // --- Priority / Overlap Logic ---
            // Higher index = higher priority (placed later, rendered on top)
            if (c.state !== 'carrying') {
                let higherCandy = null;
                for (let j = i + 1; j < activeCandies.length; j++) {
                    const candidate = activeCandies[j];
                    if (candidate.state !== 'carrying' && candiesOverlap(c, candidate)) {
                        higherCandy = candidate;
                        break;
                    }
                }

                if (higherCandy) {
                    // Redirect ants to the higher-priority candy
                    if (c.state !== 'blocked') {
                        c.state = 'blocked';
                        c.ants.forEach(ant => {
                            if (ant.state === 'carrying') return;
                            ant.redirectTarget = higherCandy;
                            // Wake up stopped ants so they move toward the new candy
                            if (ant.state === 'stopped') ant.state = 'approaching';
                        });
                    }
                    continue; // Skip state machine for this candy
                } else if (c.state === 'blocked') {
                    // Unblock: clear redirect and let ants resume to original candy
                    c.state = 'waiting';
                    c.ants.forEach(ant => {
                        ant.redirectTarget = null;
                        if (ant.state !== 'stopped') ant.state = 'approaching';
                    });
                }
            }
            
            if (c.state === 'waiting') {
                const allSettled = c.ants.length > 0 && c.ants.every(ant => ant.state === 'stopped');
                if (allSettled) {
                    // Immediately begin carry — no pause
                    c.state = 'carrying';
                    const dists = [
                        { edge: 'top', d: c.y, vx: 0, vy: -1 },
                        { edge: 'bottom', d: window.innerHeight - c.y, vx: 0, vy: 1 },
                        { edge: 'left', d: c.x, vx: -1, vy: 0 },
                        { edge: 'right', d: window.innerWidth - c.x, vx: 1, vy: 0 }
                    ];
                    const closest = dists.sort((a, b) => a.d - b.d)[0];
                    c.carryVX = closest.vx * 70; // Slow carry speed
                    c.carryVY = closest.vy * 70;
                    c.element.classList.add('carrying'); // Elevation shadow
                    c.ants.forEach(ant => { ant.state = 'carrying'; });
                }
            } else if (c.state === 'carrying') {
                c.x += c.carryVX * dt;
                c.y += c.carryVY * dt;
                c.element.style.left = `${c.x}px`;
                c.element.style.top = `${c.y}px`;
                
                c.ants.forEach(ant => {
                    ant.x += c.carryVX * dt;
                    ant.y += c.carryVY * dt;
                    ant.element.style.left = `${ant.x}px`;
                    ant.element.style.top = `${ant.y}px`;
                });

                const margin = 200;
                if (c.x < -margin || c.x > window.innerWidth + margin || 
                    c.y < -margin || c.y > window.innerHeight + margin) {
                    
                    c.element.remove();
                    c.ants.forEach(ant => {
                        ant.element.remove();
                        const antIdx = activeAnts.indexOf(ant);
                        if (antIdx > -1) activeAnts.splice(antIdx, 1);
                    });
                    activeCandies.splice(i, 1);

                    // Clear stale redirectTarget references for all surviving ants
                    activeAnts.forEach(ant => {
                        if (ant.redirectTarget === c) {
                            ant.redirectTarget = null;
                            if (ant.state !== 'stopped') ant.state = 'approaching';
                        }
                    });
                }
            }
        }

        for (let i = activeAnts.length - 1; i >= 0; i--) {
            activeAnts[i].update();
        }
        requestAnimationFrame(update);
    }
    requestAnimationFrame(update);

    let bgMusic = null;

    const controlPanel = document.getElementById('control-panel');
    const musicBtn = document.getElementById('music-toggle');
    const musicIcon = document.getElementById('music-icon');
    const restartBtn = document.getElementById('restart-btn');

    controlPanel.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevents spawning candy behind the panel
    });

    musicBtn.addEventListener('click', () => {
        if (!bgMusic) {
            bgMusic = new Audio('asset/background.mp3');
            bgMusic.loop = true;
            bgMusic.volume = 0.08;
            // First click on music button means user wants to turn it OFF
            musicIcon.src = 'asset/music_off.svg';
        } else {
            if (bgMusic.paused) {
                bgMusic.play().catch(e => console.log(e));
                musicIcon.src = 'asset/music_on.svg';
            } else {
                bgMusic.pause();
                musicIcon.src = 'asset/music_off.svg';
            }
        }
    });

    restartBtn.addEventListener('click', () => {
        activeCandies.forEach(c => c.element.remove());
        activeAnts.forEach(a => a.element.remove());
        activeCandies.length = 0;
        activeAnts.length = 0;
        
        // Restore onboarding text for a fresh experience
        let onboarding = document.getElementById('onboarding-text');
        if (onboarding) onboarding.remove(); // Remove old if fading out
        
        onboarding = document.createElement('div');
        onboarding.id = 'onboarding-text';
        onboarding.textContent = 'Tap to drop a candy';
        document.getElementById('app-container').appendChild(onboarding);
    });

    function getSafePosition(x, y, w, h) {
        let safeX = x, safeY = y;
        let angle = 0;
        let radius = 0;
        const panelRect = document.getElementById('control-panel').getBoundingClientRect();
        
        function isSafe(cx, cy) {
            // screen bounds (with padding)
            if (cx < w/2 || cx > window.innerWidth - w/2 || cy < h/2 || cy > window.innerHeight - h/2) return false;
            // toolbar safe zone
            if (cx + w/2 > panelRect.left - 20 && cy - h/2 < panelRect.bottom + 20) return false;
            // overlaps other active candies?
            for (const c of activeCandies) {
                // Large padding buffer to ensure ants can orbit without triggering avoidance of the neighbor
                const minSpaceX = (c.w + w)/2 + 75;
                const minSpaceY = (c.h + h)/2 + 75;
                if (Math.abs(cx - c.x) < minSpaceX && Math.abs(cy - c.y) < minSpaceY) return false;
            }
            return true;
        }

        if (isSafe(x, y)) return { x, y };

        // Spiral out if overlap detected
        while (radius < 1000) {
            angle += 0.5;
            radius += 2;
            safeX = x + Math.cos(angle) * radius;
            safeY = y + Math.sin(angle) * radius;
            if (isSafe(safeX, safeY)) return { x: safeX, y: safeY };
        }
        return { x, y };
    }

    container.addEventListener('click', (e) => {
        // Safe Zone: Ignore clicks near the toolbar
        const panelRect = document.getElementById('control-panel').getBoundingClientRect();
        if (e.clientX >= panelRect.left - 20 && e.clientY <= panelRect.bottom + 20) {
            return;
        }

        // Obscure onboarding text on first click
        const onboarding = document.getElementById('onboarding-text');
        if (onboarding) {
            onboarding.classList.add('fade-out');
            setTimeout(() => {
                if (onboarding.parentNode) onboarding.remove();
            }, 300); // Wait for transition
        }

        if (!bgMusic) {
            bgMusic = new Audio('asset/background.mp3');
            bgMusic.loop = true;
            bgMusic.volume = 0.08;
            if (musicIcon.src.includes('music_on.svg')) {
                bgMusic.play().catch(err => console.log('Audio playback failed:', err));
            }
        }

        const candy = document.createElement('img');
        const currentCandy = candies[currentIndex];
        candy.src = `asset/${currentCandy}`;
        candy.className = 'candy';
        currentIndex = (currentIndex + 1) % candies.length;
        
        const targetX = e.clientX;
        const targetY = e.clientY;
        const w = 110; // Extra safe collision width (max-width is 120 in css)
        const h = 110;

        const safePos = getSafePosition(targetX, targetY, w, h);
        const overlapOccurred = (safePos.x !== targetX || safePos.y !== targetY);

        candy.style.left = `${targetX}px`;
        candy.style.top = `${targetY}px`;
        
        const initialRotation = Math.random() > 0.5 ? 45 : -45;
        const finalRotation = overlapOccurred ? initialRotation + (Math.random() > 0.5 ? 90 : -90) : initialRotation;
        
        candy.style.setProperty('--rotation', `${initialRotation}deg`);
        
        container.appendChild(candy);

        if (overlapOccurred) {
            // Wait for reflow, then apply transition to roll aside visually
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    candy.classList.add('sliding');
                    candy.style.left = `${safePos.x}px`;
                    candy.style.top = `${safePos.y}px`;
                    candy.style.setProperty('--rotation', `${finalRotation}deg`);
                    setTimeout(() => candy.classList.remove('sliding'), 350);
                });
            });
        }
        
        setTimeout(() => {
            const candyObj = { 
                element: candy, 
                x: safePos.x, 
                y: safePos.y, 
                w: candy.clientWidth || 60, 
                h: candy.clientHeight || 45,
                rotation: finalRotation,
                ants: [],
                state: 'waiting'
            };
            activeCandies.push(candyObj);
            spawnAnts(container, candyObj);
        }, 10);
    });

    class Ant {
        constructor(container, startX, startY, candyObj, targetXOffset, targetYOffset, targetAngle, delay) {
            this.container = container;
            this.candyObj = candyObj;
            this.x = startX;
            this.y = startY;
            this.targetXOffset = targetXOffset;
            this.targetYOffset = targetYOffset;
            this.targetAngle = targetAngle;
            this.delay = delay;
            this.spawnTime = Date.now();
            this.redirectTarget = null; // When set, ant approaches/orbits this candy instead
            
            this.element = document.createElement('img');
            this.element.src = 'asset/ant.png';
            this.element.className = 'ant';
            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
            this.container.appendChild(this.element);
            
            this.state = 'waiting'; // waiting, approaching, orbiting, settling, stopped, carrying
            this.speed = 220 + Math.random() * 40;
            this.angularSpeed = 4 + Math.random();
            this.lastUpdateTime = Date.now();

            const distToFinal = Math.sqrt(targetXOffset * targetXOffset + targetYOffset * targetYOffset);
            this.orbitRadius = distToFinal + 20 + Math.random() * 10;
        }

        update() {
            const now = Date.now();
            const dt = (now - this.lastUpdateTime) / 1000;
            this.lastUpdateTime = now;

            if (this.state === 'waiting') {
                if (now >= this.spawnTime + this.delay) this.state = 'approaching';
                return;
            }

            if (this.state === 'stopped' || this.state === 'carrying') return;

            let vx = 0, vy = 0;

            // --- Redirect branch: approach + loose orbit the redirect target ---
            if (this.redirectTarget) {
                const rtx = this.redirectTarget.x;
                const rty = this.redirectTarget.y;
                const orbitR = Math.max(this.redirectTarget.w, this.redirectTarget.h) * 0.8 + 40;
                const dx = rtx - this.x;
                const dy = rty - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > orbitR + 5) {
                    // Approach
                    vx = (dx / dist) * this.speed;
                    vy = (dy / dist) * this.speed;
                } else {
                    // Loose orbit — keeps ant moving continuously
                    const angle = Math.atan2(this.y - rty, this.x - rtx);
                    const nextAngle = angle + this.angularSpeed * dt;
                    const nx = rtx + Math.cos(nextAngle) * orbitR;
                    const ny = rty + Math.sin(nextAngle) * orbitR;
                    vx = (nx - this.x) / dt;
                    vy = (ny - this.y) / dt;
                }

                // Clamp speed
                const sv = Math.sqrt(vx * vx + vy * vy);
                if (sv > this.speed) { vx = (vx / sv) * this.speed; vy = (vy / sv) * this.speed; }

                this.x += vx * dt;
                this.y += vy * dt;
                const angle = Math.atan2(vy, vx) * 180 / Math.PI + 90;
                this.element.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
                this.element.style.left = `${this.x}px`;
                this.element.style.top = `${this.y}px`;
                return; // Skip normal state machine
            }

            // --- Normal state machine ---
            const targetX = this.candyObj.x;
            const targetY = this.candyObj.y;

            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (this.state === 'approaching') {
                if (dist <= this.orbitRadius + 2) {
                    this.state = 'orbiting';
                } else {
                    vx = (dx / dist) * this.speed;
                    vy = (dy / dist) * this.speed;
                }
            }

            if (this.state === 'orbiting') {
                const curDX = this.x - targetX;
                const curDY = this.y - targetY;
                const currentAngle = Math.atan2(curDY, curDX);
                
                let angleDiff = this.targetAngle - currentAngle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                if (Math.abs(angleDiff) < 0.05) {
                    this.state = 'settling';
                } else {
                    const step = Math.sign(angleDiff) * this.angularSpeed * dt;
                    const actualStep = Math.abs(step) > Math.abs(angleDiff) ? angleDiff : step;
                    const nextAngle = currentAngle + actualStep;
                    const nextX = targetX + Math.cos(nextAngle) * this.orbitRadius;
                    const nextY = targetY + Math.sin(nextAngle) * this.orbitRadius;
                    vx = (nextX - this.x) / dt;
                    vy = (nextY - this.y) / dt;
                }
            }

            if (this.state === 'settling') {
                const finalX = targetX + this.targetXOffset;
                const finalY = targetY + this.targetYOffset;
                const fDX = finalX - this.x;
                const fDY = finalY - this.y;
                const fDist = Math.sqrt(fDX * fDX + fDY * fDY);

                if (fDist < 1) {
                    this.x = finalX;
                    this.y = finalY;
                    this.state = 'stopped';
                    const angleInward = Math.atan2(targetY - this.y, targetX - this.x) * 180 / Math.PI + 90;
                    this.element.style.transform = `translate(-50%, -50%) rotate(${angleInward}deg)`;
                } else {
                    vx = (fDX / fDist) * this.speed * 0.7;
                    vy = (fDY / fDist) * this.speed * 0.7;
                }
            }

            // Obstacle avoidance
            activeCandies.forEach(c => {
                if (c === this.candyObj || c.state === 'carrying') return;
                const adx = this.x - c.x;
                const ady = this.y - c.y;
                const adist = Math.sqrt(adx * adx + ady * ady);
                const safeW = c.w / 2 + 35;
                const safeH = c.h / 2 + 35;

                if (Math.abs(adx) < safeW && Math.abs(ady) < safeH) {
                    const angleToObstacle = Math.atan2(ady, adx);
                    const repelForce = 250 * (1 - adist / (safeW + safeH));
                    vx += Math.cos(angleToObstacle) * repelForce;
                    vy += Math.sin(angleToObstacle) * repelForce;
                    const perpAngle = angleToObstacle + Math.PI / 2;
                    vx += Math.cos(perpAngle) * 100;
                    vy += Math.sin(perpAngle) * 100;
                }
            });

            if (vx !== 0 || vy !== 0) {
                const currentV = Math.sqrt(vx * vx + vy * vy);
                if (currentV > this.speed * 1.5) {
                    vx = (vx / currentV) * this.speed * 1.5;
                    vy = (vy / currentV) * this.speed * 1.5;
                }
                this.x += vx * dt;
                this.y += vy * dt;
                const angle = Math.atan2(vy, vx) * 180 / Math.PI + 90;
                this.element.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
            }

            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
        }
    }

    function spawnAnts(container, candyObj) {
        const numAnts = Math.floor(Math.random() * 5) + 10;
        const targetX = candyObj.x;
        const targetY = candyObj.y;
        const dists = [
            { edge: 'top', d: targetY },
            { edge: 'bottom', d: window.innerHeight - targetY },
            { edge: 'left', d: targetX },
            { edge: 'right', d: window.innerWidth - targetX }
        ];
        const closestEdge = dists.sort((a, b) => a.d - b.d)[0].edge;
        
        let startX, startY;
        const margin = 100;
        if (closestEdge === 'top') { startX = targetX; startY = -margin; }
        else if (closestEdge === 'bottom') { startX = targetX; startY = window.innerHeight + margin; }
        else if (closestEdge === 'left') { startX = -margin; startY = targetY; }
        else { startX = window.innerWidth + margin; startY = targetY; }

        const trailId = trailCountsPerEdge[closestEdge]++;
        const laneOffset = ((trailId % 4) - 1.5) * 50; 
        if (closestEdge === 'top' || closestEdge === 'bottom') startX += laneOffset;
        else startY += laneOffset;

        const dx = targetX - startX;
        const dy = targetY - startY;
        const distToCenter = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / distToCenter;
        const uy = dy / distToCenter;

        const antSpacing = 22;
        const startDelay = 110;

        const ew = candyObj.w / 2 + 12;
        const eh = candyObj.h / 2 + 12;
        const candyRad = candyObj.rotation * Math.PI / 180;

        for (let i = 0; i < numAnts; i++) {
            const initialX = startX - (i * antSpacing * ux);
            const initialY = startY - (i * antSpacing * uy);
            const surroundAngle = (i / numAnts) * Math.PI * 2;
            const ex = ew * Math.cos(surroundAngle);
            const ey = eh * Math.sin(surroundAngle);
            const rx = ex * Math.cos(candyRad) - ey * Math.sin(candyRad);
            const ry = ex * Math.sin(candyRad) + ey * Math.cos(candyRad);
            const finalAngle = Math.atan2(ry, rx);

            const ant = new Ant(
                container, 
                initialX, initialY, 
                candyObj, rx, ry, finalAngle, 
                i * startDelay
            );
            activeAnts.push(ant);
            candyObj.ants.push(ant);
        }
    }
});
