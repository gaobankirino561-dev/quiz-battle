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
const DEFAULT_INITIAL_HP = 20;
const DEFAULT_MAX_ROUNDS = 10;
const DEFAULT_TIME_LIMIT_SECONDS = 30;

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
 *   finished: boolean,
 *   settings: {
 *     category: string,
 *     difficulties: string[],
 *     maxRounds: number | null,
 *     infiniteMode: boolean,
 *     timeLimitSeconds: number,
 *   },
 *   maxPlayers: number,
 *   initialHpMap: { [socketId]: number },
 *   waitingForHpConfig: boolean,
 *   usedQuestionIds: Set<number>,
 *   readyForNext: { [socketId]: true },
 *   waitingNext: boolean
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

function pickRandomQuestion(room) {
  let pool = questionsData;

  if (room && room.settings) {
    const { category, difficulties } = room.settings;
    const used = room.usedQuestionIds || new Set();

    pool = questionsData.filter((q) => {
      const categoryOk =
        category === "all" || !q.category || q.category === category;
      const diffOk =
        !difficulties || difficulties.length === 0
          ? true
          : difficulties.includes(q.difficulty || "EASY");
      const unusedOk = !used.has(q.id);
      return categoryOk && diffOk && unusedOk;
    });

    if (pool.length === 0) {
      if (room.usedQuestionIds) {
        room.usedQuestionIds.clear();
      }
      pool = questionsData.filter((q) => {
        const categoryOk =
          category === "all" || !q.category || q.category === category;
        const diffOk =
          !difficulties || difficulties.length === 0
            ? true
            : difficulties.includes(q.difficulty || "EASY");
        return categoryOk && diffOk;
      });
    }
  }

  if (pool.length === 0) {
    pool = questionsData;
  }

  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
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

  socket.on("createRoom", ({ name, settings }) => {
    let roomId;
    do {
      roomId = generateRoomId();
    } while (rooms[roomId]);

    const defaultSettings = {
      category: "all",
      difficulties: ["EASY", "NORMAL", "HARD"],
      maxRounds: DEFAULT_MAX_ROUNDS,
      infiniteMode: false,
      timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
    };

    let reqMaxPlayers = settings?.maxPlayers;
    let maxPlayers = Number(reqMaxPlayers) || 2;
    if (maxPlayers !== 2 && maxPlayers !== 3) {
      maxPlayers = 2;
    }

    const mergedSettings = {
      ...defaultSettings,
      ...(settings || {}),
      maxPlayers,
    };

    rooms[roomId] = {
      id: roomId,
      hostId: socket.id,
      players: {},
      order: [],
      round: 0,
      currentQuestion: null,
      answers: {},
      finished: false,
      settings: mergedSettings,
      maxPlayers,
      initialHpMap: {},
      waitingForHpConfig: false,
      usedQuestionIds: new Set(),
      readyForNext: {},
      waitingNext: false,
    };

    rooms[roomId].players[socket.id] = {
      id: socket.id,
      name: name || "Player",
      hp: DEFAULT_INITIAL_HP,
    };
    rooms[roomId].order.push(socket.id);

    socket.join(roomId);
    socket.emit("roomCreated", {
      roomId,
      playerId: socket.id,
      settings: mergedSettings,
    });
  });

  socket.on("joinRoom", ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("roomError", "そのルームIDは存在しません。");
      return;
    }
    const maxPlayers = room.maxPlayers || room.settings?.maxPlayers || 2;
    if (Object.keys(room.players).length >= maxPlayers) {
      socket.emit("roomError", "このルームは満員です。");
      return;
    }

    room.players[socket.id] = {
      id: socket.id,
      name: name || "Player",
      hp: DEFAULT_INITIAL_HP,
    };
    room.order.push(socket.id);

    socket.join(roomId);
    socket.emit("roomJoined", { roomId, playerId: socket.id });

    if (Object.keys(room.players).length === maxPlayers) {
      room.waitingForHpConfig = true;

      const playersArray = room.order.map((id) => ({
        id,
        name: room.players[id].name,
      }));

      io.to(roomId).emit("roomReadyForHpConfig", {
        players: playersArray,
        settings: room.settings,
      });
    }
  });

  socket.on("configureRoomAndStart", ({ roomId, initialHp }) => {
    const room = rooms[roomId];
    if (!room || room.finished) return;
    if (!room.waitingForHpConfig) return;

    if (room.order[0] !== socket.id) {
      socket.emit("roomError", "ホストのみ初期HPを設定できます。");
      return;
    }

    room.initialHpMap = {};
    for (const playerId of room.order) {
      const hp =
        initialHp && typeof initialHp[playerId] === "number"
          ? initialHp[playerId]
          : DEFAULT_INITIAL_HP;
      room.initialHpMap[playerId] = Math.max(1, hp);
      room.players[playerId].hp = room.initialHpMap[playerId];
    }

    room.waitingForHpConfig = false;

    startGame(roomId);
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
    const settings = room.settings || {};
    const maxRounds =
      settings && !settings.infiniteMode
        ? settings.maxRounds || DEFAULT_MAX_ROUNDS
        : null;
    if (maxRounds && room.round >= maxRounds) return;
    if (room.waitingNext) {
      room.readyForNext[socket.id] = true;
      const totalPlayers = Object.keys(room.players).length;
      const readyCount = Object.keys(room.readyForNext).length;
      if (readyCount >= totalPlayers) {
        room.waitingNext = false;
        room.readyForNext = {};
        startNextQuestion(roomId);
      }
      return;
    }
    if (!room.currentQuestion) return;

    // すでに次の問題が出ているかどうかのチェックは簡略化
    startNextQuestion(roomId);
  });

  socket.on("readyForNext", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.finished) return;
    if (!room.waitingNext) return;

    room.readyForNext[socket.id] = true;

    const totalPlayers = Object.keys(room.players).length;
    const readyCount = Object.keys(room.readyForNext).length;

    if (readyCount >= totalPlayers) {
      room.waitingNext = false;
      room.readyForNext = {};
      startNextQuestion(roomId);
    }
  });

  socket.on("abortGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.finished) return;
    if (room.hostId !== socket.id) return;

    room.finished = true;
    room.waitingNext = false;
    room.readyForNext = {};
    room.state = "aborted";

    io.to(roomId).emit("gameAborted", {
      roomId,
      reason: "abortedByHost",
    });
  });
});

function startGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.round = 0;
  room.finished = false;
  room.readyForNext = {};
  room.waitingNext = false;
  if (!room.usedQuestionIds) {
    room.usedQuestionIds = new Set();
  } else {
    room.usedQuestionIds.clear();
  }

  const playerIds = room.order;
  const maxRounds =
    room.settings && !room.settings.infiniteMode
      ? room.settings.maxRounds || DEFAULT_MAX_ROUNDS
      : null;

  const settingsForClient = {
    category: room.settings.category,
    difficulties: room.settings.difficulties,
    maxRounds,
    infiniteMode: !!room.settings.infiniteMode,
    timeLimitSeconds: room.settings.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS,
    maxPlayers: room.maxPlayers || room.settings.maxPlayers || playerIds.length,
  };

  playerIds.forEach((pid) => {
    const you = room.players[pid];
    const opponentId = playerIds.find((id) => id !== pid) || pid;
    const opponent = room.players[opponentId];
    io.to(pid).emit("gameStart", {
      initialHp: DEFAULT_INITIAL_HP,
      initialHpMap: room.initialHpMap,
      maxRounds: maxRounds || 0,
      settings: settingsForClient,
      you,
      opponent,
      players: playerIds.map((id) => room.players[id]),
    });
  });

  startNextQuestion(roomId);
}

function startNextQuestion(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  if (room.finished) return;
  if (!room.usedQuestionIds) {
    room.usedQuestionIds = new Set();
  }
  room.waitingNext = false;
  room.readyForNext = {};

  room.round += 1;
  room.answers = {};

  const question = pickRandomQuestion(room);
  room.currentQuestion = question;
  if (question && typeof question.id !== "undefined" && room.usedQuestionIds) {
    room.usedQuestionIds.add(question.id);
  }

  const timeLimitSeconds =
    room.settings.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS;

  io.to(roomId).emit("question", {
    round: room.round,
    question,
    timeLimitSeconds,
  });
}

function resolveRound(roomId) {
  const room = rooms[roomId];
  if (!room || room.finished) return;

  const question = room.currentQuestion;
  if (!question) return;

  const correctIndex = question.answerIndex;
  const difficulty = (question.difficulty || "EASY").toUpperCase();
  const players = room.order.map((id) => room.players[id]).filter(Boolean);
  const playerCount = players.length;

  const baseDamage = BASE_DAMAGE[difficulty] || 2;

  // 3人モードロジック
  if (playerCount === 3) {
    const entries = players.map((p) => {
      const ans = room.answers[p.id];
      const correct = ans ? ans.choiceIndex === correctIndex : false;
      return {
        player: p,
        correct,
        answered: !!ans,
        answerTime: ans ? ans.elapsedSeconds : Infinity,
      };
    });

    const correctEntries = entries.filter((e) => e.correct);
    let resultMessage = "";

    if (correctEntries.length === 0) {
      resultMessage = "全員不正解。このラウンドはダメージなし。";
    } else {
      correctEntries.sort((a, b) => a.answerTime - b.answerTime);
      const winner = correctEntries[0];
      const losers = entries.filter((e) => e.player.id !== winner.player.id);

      if (losers.length === 1) {
        const dmg = baseDamage;
        losers[0].player.hp = Math.max(0, losers[0].player.hp - dmg);
        resultMessage = `${winner.player.name} が最速正解！${losers[0].player.name} に ${dmg} ダメージ。`;
      } else if (losers.length === 2) {
        const dmg = Math.ceil(baseDamage / 2);
        losers.forEach((e) => {
          e.player.hp = Math.max(0, e.player.hp - dmg);
        });
        resultMessage = `${winner.player.name} が最速正解！${losers[0].player.name} と ${losers[1].player.name} に ${dmg} ダメージ。`;
      } else {
        resultMessage = `${winner.player.name} が最速正解！`;
      }
    }

    const maxRoundsSetting =
      room.settings && !room.settings.infiniteMode
        ? room.settings.maxRounds || DEFAULT_MAX_ROUNDS
        : null;

    let finished = false;
    let winnerCode = null;
    let reason = "";
    const alive = players.filter((p) => p.hp > 0);
    if (alive.length === 0) {
      finished = true;
      winnerCode = "draw";
      reason = "全員のHPが0になった";
    } else if (alive.length === 1) {
      finished = true;
      winnerCode = alive[0].id;
      reason = `${alive[0].name} だけHPが残った`;
    } else if (maxRoundsSetting && room.round >= maxRoundsSetting) {
      finished = true;
      const sorted = [...players].sort((a, b) => b.hp - a.hp);
      if (sorted[0].hp === sorted[1].hp) {
        winnerCode = "draw";
        reason = "最大ラウンド到達時にHPが同じだった";
      } else {
        winnerCode = sorted[0].id;
        reason = `最大ラウンド到達時に ${sorted[0].name} のHPが最も高かった`;
      }
    }

    room.finished = finished;
    if (!finished) {
      room.waitingNext = true;
      room.readyForNext = {};
    }

    const correctAnswerText = question.choices[correctIndex];
    const settings = room.settings || {};
    const maxRounds =
      settings && !settings.infiniteMode
        ? settings.maxRounds || DEFAULT_MAX_ROUNDS
        : null;

    players.forEach((p) => {
      const opponent = players.find((x) => x.id !== p.id) || p;
      const payload = {
        correctAnswer: correctAnswerText,
        canContinue: !finished && (!maxRounds || room.round < maxRounds),
        gameStatusText: finished ? "ゲーム終了" : `次の問題へ進みます`,
        gameOverInfo: finished
          ? {
              winner:
                winnerCode === "draw"
                  ? "draw"
                  : winnerCode === p.id
                  ? "you"
                  : winnerCode
                  ? "opponent"
                  : null,
              reason,
              yourHp: p.hp,
              opponentHp: opponent.hp,
            }
          : null,
        you: { hp: p.hp },
        opponent: { hp: opponent.hp },
        message: resultMessage,
      };

      io.to(p.id).emit("roundResult", payload);
    });

    if (finished) {
      players.forEach((p) => {
        const opponent = players.find((x) => x.id !== p.id) || p;
        const payload = {
          winner:
            winnerCode === "draw"
              ? "draw"
              : winnerCode === p.id
              ? "you"
              : "opponent",
          reason,
          yourHp: p.hp,
          opponentHp: opponent.hp,
        };
        io.to(p.id).emit("gameOver", payload);
      });
    }

    return;
  }

  // === 2人モード（従来処理） ===
  const [p1Id, p2Id] = room.order;
  const p1 = room.players[p1Id];
  const p2 = room.players[p2Id];
  const a1 = room.answers[p1Id];
  const a2 = room.answers[p2Id];

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
  } else {
    const settings = room.settings || {};
    const maxRounds =
      settings && !settings.infiniteMode
        ? settings.maxRounds || DEFAULT_MAX_ROUNDS
        : null;

    if (maxRounds && room.round >= maxRounds) {
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
  }

  room.finished = finished;
  if (!finished) {
    room.waitingNext = true;
    room.readyForNext = {};
  }

  const correctAnswerText = question.choices[correctIndex];

  const settings = room.settings || {};
  const maxRounds =
    settings && !settings.infiniteMode
      ? settings.maxRounds || DEFAULT_MAX_ROUNDS
      : null;

  const commonPayload = {
    correctAnswer: correctAnswerText,
    canContinue: !finished && (!maxRounds || room.round < maxRounds),
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
