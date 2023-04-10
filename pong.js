// Define global variables
var ball = document.querySelector('.ball');
var leftPaddle = document.querySelector('.paddle-left');
var rightPaddle = document.querySelector('.paddle-right');
var gameContainer = document.querySelector('.game-container');
var ballSpeed = {x: 5, y: 5};
var ballPosition = {x: 290, y: 190};

// Move the ball and check for collisions
function moveBall() {
  // Move the ball
  ballPosition.x += ballSpeed.x;
  ballPosition.y += ballSpeed.y;
  ball.style.left = ballPosition.x + 'px';
  ball.style.top = ballPosition.y + 'px';

  // Check for collisions with walls
  if (ballPosition.y <= 0 || ballPosition.y >= gameContainer.offsetHeight - ball.offsetHeight) {
    ballSpeed.y *= -1;
  }

  // Check for collisions with paddles
  if (ballPosition.x <= leftPaddle.offsetLeft + leftPaddle.offsetWidth &&
      ballPosition.y >= leftPaddle.offsetTop &&
      ballPosition.y <= leftPaddle.offsetTop + leftPaddle.offsetHeight) {
    ballSpeed.x *= -1;
  }

  if (ballPosition.x >= rightPaddle.offsetLeft - ball.offsetWidth &&
      ballPosition.y >= rightPaddle.offsetTop &&
      ballPosition.y <= rightPaddle.offsetTop + rightPaddle.offsetHeight) {
    ballSpeed.x *= -1;
  }
}

// Move the left paddle up or down
function moveLeftPaddle(direction) {
  var top = leftPaddle.offsetTop;
  if (direction === 'up') {
    top -= 10;
  } else {
    top += 10;
  }
  leftPaddle.style.top = top + 'px';
}

// Move the right paddle up or down
function moveRightPaddle(direction) {
  var top = rightPaddle.offsetTop;
  if (direction === 'up') {
    top -= 10;
  } else {
    top += 10;
  }
  rightPaddle.style.top = top + 'px';
}

// Listen for key presses to move paddles
document.addEventListener('keydown', function(event) {
  if (event.code === 'KeyW') {
    moveLeftPaddle('up');
  } else if (event.code === 'KeyS') {
    moveLeftPaddle('down');
  } else if (event.code === 'ArrowUp') {
    moveRightPaddle('up');
  } else if (event.code === 'ArrowDown') {
    moveRightPaddle('down');
  }
});

// Move the ball every 30 milliseconds
setInterval(moveBall, 30);
