// src/input.js
// Handles Mobile Touch Drag-to-move, Mouse dragging, and Desktop Keyboard (WASD/Arrows)

const Input = {
  moveVector: { x: 0, y: 0 },
  keys: {},
  paused: false,
  isDragging: false,
  activeTouchId: null,
  startPos: { x: 0, y: 0 },
  maxDragRadius: 46, // Fixed touchdown anchor radius
  deadzone: 4,
  joystickBase: null,
  joystickStick: null,

  init(canvas) {
    this.joystickBase = document.getElementById('joystickBase');
    this.joystickStick = document.getElementById('joystickStick');
    
    // Touch Events (single-finger tracked, fixed touchdown anchor)
    canvas.addEventListener('touchstart', (e) => {
      if (this.paused) return;
      e.preventDefault();
      if (this.isDragging && this.activeTouchId !== null) return;
      const touch = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
      if (!touch) return;
      this.isDragging = true;
      this.activeTouchId = touch.identifier;
      this.startPos = { x: touch.clientX, y: touch.clientY };
      if (this.joystickBase && this.joystickBase.classList) {
          this.joystickBase.classList.remove('hidden');
          this.joystickBase.style.left = touch.clientX + 'px';
          this.joystickBase.style.top = touch.clientY + 'px';
          if (this.joystickStick) {
            this.joystickStick.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;
          }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (this.paused) return;
      e.preventDefault();
      if (!this.isDragging) return;
      let touch = null;
      if (e.touches) {
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === this.activeTouchId) {
            touch = e.touches[i];
            break;
          }
        }
        if (!touch && e.touches.length > 0) touch = e.touches[0];
      }
      if (!touch) return;
      this.calculateVector(touch.clientX, touch.clientY);
    }, { passive: false });

    const endDrag = () => {
      this.isDragging = false;
      this.activeTouchId = null;
      if (this.joystickBase && this.joystickBase.classList) {
          this.joystickBase.classList.add('hidden');
      }
      this.updateKeyboardVector();
    };

    canvas.addEventListener('touchend', (e) => {
      if (this.paused) return;
      e.preventDefault();
      if (this.activeTouchId !== null && e.changedTouches) {
        let endedActive = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.activeTouchId) {
            endedActive = true;
            break;
          }
        }
        if (!endedActive && e.touches && e.touches.length > 0) return;
      }
      endDrag();
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => {
      this.reset();
    });

    // Mouse Events (for testing in browser)
    canvas.addEventListener('mousedown', (e) => {
      if (this.paused) return;
      this.isDragging = true;
      this.startPos = { x: e.clientX, y: e.clientY };
      if (this.joystickBase && this.joystickBase.classList) {
          this.joystickBase.classList.remove('hidden');
          this.joystickBase.style.left = e.clientX + 'px';
          this.joystickBase.style.top = e.clientY + 'px';
          if (this.joystickStick) {
            this.joystickStick.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;
          }
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.paused) return;
      if (!this.isDragging) return;
      this.calculateVector(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        endDrag();
      }
    });

    // Desktop Keyboard (WASD + Arrow Keys)
    const movementCodes = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    window.addEventListener('keydown', (e) => {
      if (movementCodes.has(e.code)) {
        if (this.paused) return;
        if (e.code.startsWith('Arrow') && typeof currentState !== 'undefined' && typeof STATE !== 'undefined' && currentState === STATE.PLAYING) {
          e.preventDefault();
        }
        this.keys[e.code] = true;
        this.updateKeyboardVector();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (movementCodes.has(e.code)) {
        this.keys[e.code] = false;
        this.updateKeyboardVector();
      }
    });

    window.addEventListener('blur', () => {
      this.reset();
    });
  },

  reset() {
    this.isDragging = false;
    this.activeTouchId = null;
    this.keys = {};
    this.moveVector = { x: 0, y: 0 };
    if (this.joystickBase && this.joystickBase.classList) {
      this.joystickBase.classList.add('hidden');
    }
  },

  updateKeyboardVector() {
    if (this.isDragging) return;
    let dx = 0;
    let dy = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dy -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dy += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;

    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      dx /= dist;
      dy /= dist;
    }
    this.moveVector = { x: dx, y: dy };
  },

  calculateVector(currentX, currentY) {
    let dx = currentX - this.startPos.x;
    let dy = currentY - this.startPos.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= this.deadzone) {
      this.moveVector = { x: 0, y: 0 };
      if (this.joystickStick) {
        this.joystickStick.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;
      }
      return;
    }

    // Fixed Touchdown Anchor: ring stays locked where the finger initially touched down
    if (dist > this.maxDragRadius) {
      const ux = dx / dist;
      const uy = dy / dist;
      dx = ux * this.maxDragRadius;
      dy = uy * this.maxDragRadius;
    }

    const clampedDist = Math.min(dist, this.maxDragRadius);
    const norm = Math.max(0, Math.min(1, (clampedDist - this.deadzone) / Math.max(1, this.maxDragRadius - this.deadzone)));
    const shaped = Math.pow(norm, 0.72);
    const inv = clampedDist > 0 ? 1 / clampedDist : 0;
    this.moveVector.x = (dx * inv) * shaped;
    this.moveVector.y = (dy * inv) * shaped;

    if (this.joystickStick) {
      this.joystickStick.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
    }
  }
};
