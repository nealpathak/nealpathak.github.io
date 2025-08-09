class SnakeGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gridSize = 20;
        this.tileCount = this.canvas.width / this.gridSize;
        
        this.snake = [{ x: 10, y: 10 }];
        this.food = this.generateFood();
        this.dx = 0;
        this.dy = 0;
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
        this.speed = 1;
        this.gameRunning = false;
        this.gamePaused = false;
        
        this.scoreElement = document.getElementById('score');
        this.highScoreElement = document.getElementById('highScore');
        this.speedElement = document.getElementById('speed');
        this.finalScoreElement = document.getElementById('finalScore');
        this.highScoreMessageElement = document.getElementById('highScoreMessage');
        this.gameOverScreen = document.getElementById('gameOverScreen');
        this.startScreen = document.getElementById('startScreen');
        this.pausedOverlay = null;
        
        this.updateDisplay();
        this.setupEventListeners();
        this.draw();
    }
    
    setupEventListeners() {
        document.getElementById('startBtn').addEventListener('click', () => this.startGame());
        document.getElementById('restartBtn').addEventListener('click', () => this.restartGame());
        document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetGame());
        
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        const controlButtons = document.querySelectorAll('.control-btn');
        controlButtons.forEach(button => {
            button.addEventListener('click', () => {
                const direction = button.getAttribute('data-direction');
                this.changeDirection(direction);
            });
            
            button.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const direction = button.getAttribute('data-direction');
                this.changeDirection(direction);
            });
        });
        
        let touchStartX = 0;
        let touchStartY = 0;
        
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (!touchStartX || !touchStartY) return;
            
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            
            const diffX = touchStartX - touchEndX;
            const diffY = touchStartY - touchEndY;
            
            if (Math.abs(diffX) > Math.abs(diffY)) {
                if (diffX > 0) {
                    this.changeDirection('left');
                } else {
                    this.changeDirection('right');
                }
            } else {
                if (diffY > 0) {
                    this.changeDirection('up');
                } else {
                    this.changeDirection('down');
                }
            }
            
            touchStartX = 0;
            touchStartY = 0;
        });
    }
    
    handleKeyPress(e) {
        if (!this.gameRunning && e.code === 'Space') {
            this.startGame();
            return;
        }
        
        if (e.code === 'Space') {
            this.togglePause();
            return;
        }
        
        const key = e.key.toLowerCase();
        switch (key) {
            case 'arrowup':
            case 'w':
                this.changeDirection('up');
                break;
            case 'arrowdown':
            case 's':
                this.changeDirection('down');
                break;
            case 'arrowleft':
            case 'a':
                this.changeDirection('left');
                break;
            case 'arrowright':
            case 'd':
                this.changeDirection('right');
                break;
        }
    }
    
    changeDirection(direction) {
        if (!this.gameRunning || this.gamePaused) return;
        
        switch (direction) {
            case 'up':
                if (this.dy !== 1) { this.dx = 0; this.dy = -1; }
                break;
            case 'down':
                if (this.dy !== -1) { this.dx = 0; this.dy = 1; }
                break;
            case 'left':
                if (this.dx !== 1) { this.dx = -1; this.dy = 0; }
                break;
            case 'right':
                if (this.dx !== -1) { this.dx = 1; this.dy = 0; }
                break;
        }
    }
    
    startGame() {
        this.gameRunning = true;
        this.gamePaused = false;
        this.startScreen.classList.add('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.removePausedOverlay();
        this.gameLoop();
    }
    
    restartGame() {
        this.resetGameState();
        this.startGame();
    }
    
    resetGame() {
        this.gameRunning = false;
        this.gamePaused = false;
        this.resetGameState();
        this.startScreen.classList.remove('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.removePausedOverlay();
        this.draw();
    }
    
    resetGameState() {
        this.snake = [{ x: 10, y: 10 }];
        this.food = this.generateFood();
        this.dx = 0;
        this.dy = 0;
        this.score = 0;
        this.speed = 1;
        this.updateDisplay();
    }
    
    togglePause() {
        if (!this.gameRunning) return;
        
        this.gamePaused = !this.gamePaused;
        const pauseBtn = document.getElementById('pauseBtn');
        
        if (this.gamePaused) {
            pauseBtn.textContent = 'Resume';
            this.showPausedOverlay();
        } else {
            pauseBtn.textContent = 'Pause';
            this.removePausedOverlay();
            this.gameLoop();
        }
    }
    
    showPausedOverlay() {
        if (!this.pausedOverlay) {
            this.pausedOverlay = document.createElement('div');
            this.pausedOverlay.className = 'paused-overlay';
            this.pausedOverlay.innerHTML = 'PAUSED<br><small style="font-size: 1rem;">Press Space or click Resume</small>';
            this.canvas.parentElement.style.position = 'relative';
            this.canvas.parentElement.appendChild(this.pausedOverlay);
        }
    }
    
    removePausedOverlay() {
        if (this.pausedOverlay) {
            this.pausedOverlay.remove();
            this.pausedOverlay = null;
        }
    }
    
    generateFood() {
        let foodPosition;
        do {
            foodPosition = {
                x: Math.floor(Math.random() * this.tileCount),
                y: Math.floor(Math.random() * this.tileCount)
            };
        } while (this.snake.some(segment => segment.x === foodPosition.x && segment.y === foodPosition.y));
        
        return foodPosition;
    }
    
    update() {
        if (!this.gameRunning || this.gamePaused) return;
        
        // Don't update if no direction has been set yet
        if (this.dx === 0 && this.dy === 0) return;
        
        const head = { x: this.snake[0].x + this.dx, y: this.snake[0].y + this.dy };
        
        if (head.x < 0 || head.x >= this.tileCount || head.y < 0 || head.y >= this.tileCount) {
            this.gameOver();
            return;
        }
        
        if (this.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
            this.gameOver();
            return;
        }
        
        this.snake.unshift(head);
        
        if (head.x === this.food.x && head.y === this.food.y) {
            this.score += 10;
            this.speed = Math.min(10, Math.floor(this.score / 50) + 1);
            this.food = this.generateFood();
            this.updateDisplay();
            this.playEatSound();
        } else {
            this.snake.pop();
        }
    }
    
    gameOver() {
        this.gameRunning = false;
        this.gamePaused = false;
        
        let isNewHighScore = false;
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('snakeHighScore', this.highScore.toString());
            isNewHighScore = true;
        }
        
        this.finalScoreElement.textContent = this.score;
        this.highScoreMessageElement.textContent = isNewHighScore 
            ? '🎉 New High Score! 🎉' 
            : `High Score: ${this.highScore}`;
        
        if (isNewHighScore) {
            this.highScoreMessageElement.className = 'new-high-score';
        } else {
            this.highScoreMessageElement.className = '';
        }
        
        this.updateDisplay();
        this.gameOverScreen.classList.remove('hidden');
        this.removePausedOverlay();
    }
    
    playEatSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (error) {
            console.log('Audio not supported');
        }
    }
    
    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        for (let i = 0; i <= this.tileCount; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(i * this.gridSize, 0);
            this.ctx.lineTo(i * this.gridSize, this.canvas.height);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * this.gridSize);
            this.ctx.lineTo(this.canvas.width, i * this.gridSize);
            this.ctx.stroke();
        }
    }
    
    draw() {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.drawGrid();
        
        this.ctx.shadowBlur = 0;
        this.snake.forEach((segment, index) => {
            if (index === 0) {
                this.ctx.fillStyle = '#2ecc71';
            } else {
                this.ctx.fillStyle = '#27ae60';
            }
            
            const x = segment.x * this.gridSize + 2;
            const y = segment.y * this.gridSize + 2;
            const size = this.gridSize - 4;
            
            this.ctx.fillRect(x, y, size, size);
            
            if (index === 0) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(x + size/3, y + size/4, 2, 2);
                this.ctx.fillRect(x + 2*size/3, y + size/4, 2, 2);
            }
        });
        
        this.ctx.fillStyle = '#e74c3c';
        const foodX = this.food.x * this.gridSize + 2;
        const foodY = this.food.y * this.gridSize + 2;
        const foodSize = this.gridSize - 4;
        
        this.ctx.fillRect(foodX, foodY, foodSize, foodSize);
        
        this.ctx.fillStyle = '#ffffff';
        const centerX = foodX + foodSize / 2;
        const centerY = foodY + foodSize / 2;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    updateDisplay() {
        this.scoreElement.textContent = this.score;
        this.highScoreElement.textContent = this.highScore;
        this.speedElement.textContent = this.speed;
    }
    
    gameLoop() {
        if (!this.gameRunning || this.gamePaused) return;
        
        this.update();
        this.draw();
        
        const gameSpeed = Math.max(100, 200 - (this.speed - 1) * 15);
        setTimeout(() => this.gameLoop(), gameSpeed);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SnakeGame();
});