// server.js
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;
const wss = new WebSocket.Server({ port: PORT });

console.log(`🎮 Serveur Pong démarré sur le port ${PORT}`);

// État du jeu
let gameState = {
  paddle1: { x: 10, y: 150, width: 10, height: 100, speed: 5 },
  paddle2: { x: 780, y: 150, width: 10, height: 100, speed: 5 },
  ball: { x: 400, y: 200, radius: 8, dx: 4, dy: 4 },
  score: { player1: 0, player2: 0 },
  canvasWidth: 800,
  canvasHeight: 400
};

let players = {
  player1: null,
  player2: null
};

let gameInterval = null;

function resetBall() {
  gameState.ball.x = gameState.canvasWidth / 2;
  gameState.ball.y = gameState.canvasHeight / 2;
  gameState.ball.dx = (Math.random() > 0.5 ? 4 : -4);
  gameState.ball.dy = (Math.random() * 4 - 2);
}

function updateGame() {
  // Mouvement de la balle
  gameState.ball.x += gameState.ball.dx;
  gameState.ball.y += gameState.ball.dy;

  // Collision haut/bas
  if (gameState.ball.y - gameState.ball.radius <= 0 || 
      gameState.ball.y + gameState.ball.radius >= gameState.canvasHeight) {
    gameState.ball.dy *= -1;
  }

  // Collision paddle 1
  if (gameState.ball.x - gameState.ball.radius <= gameState.paddle1.x + gameState.paddle1.width &&
      gameState.ball.y >= gameState.paddle1.y &&
      gameState.ball.y <= gameState.paddle1.y + gameState.paddle1.height) {
    gameState.ball.dx = Math.abs(gameState.ball.dx);
    let hitPos = (gameState.ball.y - gameState.paddle1.y) / gameState.paddle1.height;
    gameState.ball.dy = (hitPos - 0.5) * 10;
  }

  // Collision paddle 2
  if (gameState.ball.x + gameState.ball.radius >= gameState.paddle2.x &&
      gameState.ball.y >= gameState.paddle2.y &&
      gameState.ball.y <= gameState.paddle2.y + gameState.paddle2.height) {
    gameState.ball.dx = -Math.abs(gameState.ball.dx);
    let hitPos = (gameState.ball.y - gameState.paddle2.y) / gameState.paddle2.height;
    gameState.ball.dy = (hitPos - 0.5) * 10;
  }

  // Point marqué
  if (gameState.ball.x - gameState.ball.radius <= 0) {
    gameState.score.player2++;
    resetBall();
  } else if (gameState.ball.x + gameState.ball.radius >= gameState.canvasWidth) {
    gameState.score.player1++;
    resetBall();
  }

  // Envoyer l'état à tous les joueurs
  broadcastGameState();
}

function startGame() {
  if (gameInterval) clearInterval(gameInterval);
  gameInterval = setInterval(updateGame, 1000 / 60); // 60 FPS
  console.log('🎮 Partie démarrée !');
}

function stopGame() {
  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = null;
  }
  console.log('⏸️  Partie arrêtée');
}

function broadcastGameState() {
  const message = JSON.stringify({
    type: 'gameState',
    state: gameState
  });

  if (players.player1 && players.player1.readyState === WebSocket.OPEN) {
    players.player1.send(message);
  }
  if (players.player2 && players.player2.readyState === WebSocket.OPEN) {
    players.player2.send(message);
  }
}

wss.on('connection', (ws) => {
  console.log('👤 Nouvelle connexion');

  // Assigner un rôle
  if (!players.player1) {
    players.player1 = ws;
    ws.role = 'player1';
    ws.send(JSON.stringify({ type: 'role', role: 'player1' }));
    console.log('✅ Joueur 1 connecté');
    
    if (!players.player2) {
      ws.send(JSON.stringify({ type: 'waiting' }));
    }
  } else if (!players.player2) {
    players.player2 = ws;
    ws.role = 'player2';
    ws.send(JSON.stringify({ type: 'role', role: 'player2' }));
    console.log('✅ Joueur 2 connecté');
    
    // Les deux joueurs sont là, démarrer la partie
    gameState.score = { player1: 0, player2: 0 };
    resetBall();
    startGame();
  } else {
    // Trop de joueurs
    ws.send(JSON.stringify({ type: 'error', message: 'Partie pleine' }));
    ws.close();
    return;
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'move') {
        if (ws.role === 'player1') {
          if (data.direction === 'up' && gameState.paddle1.y > 0) {
            gameState.paddle1.y -= gameState.paddle1.speed;
          } else if (data.direction === 'down' && 
                     gameState.paddle1.y < gameState.canvasHeight - gameState.paddle1.height) {
            gameState.paddle1.y += gameState.paddle1.speed;
          }
        } else if (ws.role === 'player2') {
          if (data.direction === 'up' && gameState.paddle2.y > 0) {
            gameState.paddle2.y -= gameState.paddle2.speed;
          } else if (data.direction === 'down' && 
                     gameState.paddle2.y < gameState.canvasHeight - gameState.paddle2.height) {
            gameState.paddle2.y += gameState.paddle2.speed;
          }
        }
      }
    } catch (error) {
      console.error('Erreur parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('👋 Joueur déconnecté:', ws.role);
    
    if (ws.role === 'player1') {
      players.player1 = null;
    } else if (ws.role === 'player2') {
      players.player2 = null;
    }
    
    stopGame();
    
    // Notifier l'autre joueur
    if (players.player1) {
      players.player1.send(JSON.stringify({ type: 'playerLeft' }));
    }
    if (players.player2) {
      players.player2.send(JSON.stringify({ type: 'playerLeft' }));
    }
  });
});

console.log('✅ Serveur prêt à accepter des connexions');