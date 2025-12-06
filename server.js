const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 静的ファイル配信
app.use(express.static(path.join(__dirname, "public")));

// 問題データの読み込み
const questionsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "questions.json"), "utf-8")
);

// ゲーム設定
const INITIAL_HP = 20;
const MAX_ROUNDS = 10;

const BASE_DAMAGE = {
  EASY: 2,
  NORMAL: 4,
  HARD: 7,
};

function calcSpeedBonus(elapsedSeconds) {
  if (elapsedSeconds <= 10) return 2;
  if (elapsedSeconds <= 20) return 1;
  return 0;
}

// ルーム管理
/**
 * rooms[roomId] = {
 *   id: string,
 *   players: {
 *     [socketId]: {
 *       id: string,
 *       name: string,
 *       hp: number,
 *     }
 *   },
 *   order: string[], // socketId の順番
 *   round: number,
 *   currentQuestion: { ... },
 *   answers: {
 *     [socketId]: {
 *       choiceIndex: number,
 *       elapsedSeconds: number,
 *       correct: boolean
 *     }
 *   },
 *   finished: boolean
 * }
 */
const rooms = {};

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function pickRandomQuestion() {
  const idx = Math.floor(Math.random() * questionsData.length);
  return questionsData[idx];
}

io.on("connection", (socket) => {
  console.log("a user connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("user disconnected:", socket.id);
    // ルームからの退出処理
    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        room.order = room.order.filter((id) => id !== socket.id);
        io.to(roomId).emit("roomError", "相手が切断しました。");
        room.finished = true;
        break;
      }
    }
  });

  socket.on("createRoom", ({ name }) => {
    let roomId;
    do {
      roomId = generateRoomId();
    } while (rooms[roomId]);

    rooms[roomId] = {
      id: roomId,
      players: {},
      order: [],
      round: 0,
      currentQuestion: null,
      answers: {},
      finished: false,
    };

    rooms[roomId].players[socket.id] = {
      id: socket.id,
      name: name || "Player",
      hp: INITIAL_HP,
    };
    rooms[roomId].order.push(socket.id);

    socket.join(roomId);
    socket.emit("roomCreated", { roomId, playerId: socket.id });
  });

  socket.on("joinRoom", ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("roomError", "そのルームIDは存在しません。");
      return;
    }
    if (Object.keys(room.players).length >= 2) {
      socket.emit("roomError", "このルームは満員です。");
      return;
    }

    room.players[socket.id] = {
      id: socket.id,
      name: name || "Player",
      hp: INITIAL_HP,
    };
    room.order.push(socket.id);

    socket.join(roomId);
    socket.emit("roomJoined", { roomId, playerId: socket.id });

    if (Object.keys(room.players).length === 2) {
      startGame(roomId);
    }
  });

  socket.on("submitAnswer", ({ roomId, questionId, choiceIndex, elapsedSeconds }) => {
    const room = rooms[roomId];
    if (!room || room.finished) return;
    if (!room.currentQuestion || room.currentQuestion.id !== questionId) return;

    room.answers[socket.id] = {
      choiceIndex,
      elapsedSeconds: typeof elapsedSeconds === "number" ? elapsedSeconds : 9999,
    };

    const playerCount = Object.keys(room.players).length;
    if (Object.keys(room.answers).length === playerCount) {
      // 2人分揃ったら採点
      resolveRound(roomId);
    }
  });

  socket.on("nextQuestion", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.finished) return;
    if (room.round >= MAX_ROUNDS) return;
    if (!room.currentQuestion) return;

    // すでに次の問題が出ているかどうかのチェックは簡略化
    startNextQuestion(roomId);
  });
});

function startGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.round = 0;
  room.finished = false;

  const [p1Id, p2Id] = room.order;
  const p1 = room.players[p1Id];
  const p2 = room.players[p2Id];

  io.to(roomId).emit("gameStart", {
    initialHp: INITIAL_HP,
    maxRounds: MAX_ROUNDS,
    you: {}, // クライアント側で自分/相手を判定するのでここはダミー
    opponent: {},
  });

  // ただし player 名は question 送信前に個別に送ってもよい
  io.to(p1Id).emit("gameStart", {
    initialHp: INITIAL_HP,
    maxRounds: MAX_ROUNDS,
    you: p1,
    opponent: p2,
  });
  io.to(p2Id).emit("gameStart", {
    initialHp: INITIAL_HP,
    maxRounds: MAX_ROUNDS,
    you: p2,
    opponent: p1,
  });

  startNextQuestion(roomId);
}

function startNextQuestion(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  if (room.finished) return;

  room.round += 1;
  room.answers = {};

  const question = pickRandomQuestion();
  room.currentQuestion = question;

  io.to(roomId).emit("question", {
    round: room.round,
    question,
  });
}

function resolveRound(roomId) {
  const room = rooms[roomId];
  if (!room || room.finished) return;

  const question = room.currentQuestion;
  if (!question) return;

  const [p1Id, p2Id] = room.order;
  const p1 = room.players[p1Id];
  const p2 = room.players[p2Id];
  const a1 = room.answers[p1Id];
  const a2 = room.answers[p2Id];

  const correctIndex = question.answerIndex;
  const difficulty = question.difficulty || "EASY";

  function evaluate(player, answer) {
    if (!answer) {
      return { correct: false, damagePotential: 0, elapsedSeconds: 9999 };
    }
    const correct = answer.choiceIndex === correctIndex;
    if (!correct) {
      return { correct: false, damagePotential: 0, elapsedSeconds: answer.elapsedSeconds };
    }
    const base = BASE_DAMAGE[difficulty] || 2;
    const bonus = calcSpeedBonus(answer.elapsedSeconds);
    return {
      correct: true,
      damagePotential: base + bonus,
      elapsedSeconds: answer.elapsedSeconds,
    };
  }

  const r1 = evaluate(p1, a1);
  const r2 = evaluate(p2, a2);

  let damageToP1 = 0;
  let damageToP2 = 0;
  let resultMessage = "";

  if (r1.correct && r2.correct) {
    // 両方正解 → 速い方だけダメージ
    if (r1.elapsedSeconds < r2.elapsedSeconds) {
      damageToP2 = r1.damagePotential;
      resultMessage = `${p1.name} と ${p2.name} は両方正解！しかし ${p1.name} のほうが速く、${damageToP2} ダメージを与えた。`;
    } else if (r2.elapsedSeconds < r1.elapsedSeconds) {
      damageToP1 = r2.damagePotential;
      resultMessage = `${p1.name} と ${p2.name} は両方正解！しかし ${p2.name} のほうが速く、${damageToP1} ダメージを与えた。`;
    } else {
      // 完全同時ならダメージなし
      resultMessage = "両者とも正解かつほぼ同時！このラウンドはダメージなし。";
    }
  } else if (r1.correct && !r2.correct) {
    damageToP2 = r1.damagePotential;
    resultMessage = `${p1.name} が正解し、${p2.name} に ${damageToP2} ダメージ！`;
  } else if (!r1.correct && r2.correct) {
    damageToP1 = r2.damagePotential;
    resultMessage = `${p2.name} が正解し、${p1.name} に ${damageToP1} ダメージ！`;
  } else {
    resultMessage = "両者とも不正解。このラウンドはダメージなし。";
  }

  p1.hp = Math.max(0, p1.hp - damageToP1);
  p2.hp = Math.max(0, p2.hp - damageToP2);

  let finished = false;
  let winner = null;
  let reason = "";
  if (p1.hp <= 0 && p2.hp <= 0) {
    finished = true;
    winner = "draw";
    reason = "両者ともHPが0になった";
  } else if (p1.hp <= 0) {
    finished = true;
    winner = "player2";
    reason = `${p1.name} のHPが0になった`;
  } else if (p2.hp <= 0) {
    finished = true;
    winner = "player1";
    reason = `${p2.name} のHPが0になった`;
  } else if (room.round >= MAX_ROUNDS) {
    finished = true;
    if (p1.hp > p2.hp) {
      winner = "player1";
      reason = `最大ラウンド到達時に ${p1.name} のHPが高かった`;
    } else if (p2.hp > p1.hp) {
      winner = "player2";
      reason = `最大ラウンド到達時に ${p2.name} のHPが高かった`;
    } else {
      winner = "draw";
      reason = "最大ラウンド到達時にHPが同じだった";
    }
  }

  room.finished = finished;

  const correctAnswerText = question.choices[correctIndex];

  const commonPayload = {
    correctAnswer: correctAnswerText,
    canContinue: !finished && room.round < MAX_ROUNDS,
    gameStatusText: finished ? "ゲーム終了" : `次の問題へ進みます`,
    gameOverInfo: finished
      ? {
          winner: winner === "draw" ? "draw" : null, // 個別メッセージは下で送る
          reason,
          yourHp: null,
          opponentHp: null,
        }
      : null,
  };

  io.to(p1.id).emit("roundResult", {
    ...commonPayload,
    you: { hp: p1.hp },
    opponent: { hp: p2.hp },
    message: resultMessage,
  });

  io.to(p2.id).emit("roundResult", {
    ...commonPayload,
    you: { hp: p2.hp },
    opponent: { hp: p1.hp },
    message: resultMessage,
  });

  if (finished) {
    const payload1 = {
      winner: winner === "player1" ? "you" : winner === "player2" ? "opponent" : "draw",
      reason,
      yourHp: p1.hp,
      opponentHp: p2.hp,
    };
    const payload2 = {
      winner: winner === "player2" ? "you" : winner === "player1" ? "opponent" : "draw",
      reason,
      yourHp: p2.hp,
      opponentHp: p1.hp,
    };

    io.to(p1.id).emit("gameOver", payload1);
    io.to(p2.id).emit("gameOver", payload2);
  }
}

// サーバー起動
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
