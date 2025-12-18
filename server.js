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
app.use(express.json());

// Database Connection
const { Pool } = require("pg");
const isProduction = process.env.NODE_ENV === "production";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("CRITICAL ERROR: DATABASE_URL environment variable is not set!");
  console.error("Please create a PostgreSQL database in Render and link it to this service.");
  // アプリをクラッシュさせずに、DB機能が無効であることを示すフラグを立てる等の対応も可能だが、
  // 今回はログを出してそのまま進む（pgが接続エラーを出す）
}

// ローカル開発用など、DATABASE_URLがない場合のフォールバック（必要に応じて）
const pool = new Pool({
  connectionString: connectionString,
  ssl: isProduction || (connectionString && connectionString.includes("render"))
    ? { rejectUnauthorized: false }
    : false,
});

// テーブル作成 (起動時)
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    wins INTEGER DEFAULT 0,
    lose INTEGER DEFAULT 0,
    friends JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => {
  console.log("Users table verified/created.");
}).catch(err => {
  console.error("Error creating users table:", err);
});

// パスワードハッシュ化 (簡易版: SHA-256)
const crypto = require("crypto");
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// API: ユーザー登録
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, message: "ユーザー名とパスワードを入力してください。" });
  }

  try {
    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(password);

    await pool.query(
      "INSERT INTO users (id, username, password_hash, wins, lose, friends) VALUES ($1, $2, $3, 0, 0, '[]')",
      [userId, username, passwordHash]
    );

    res.json({ success: true, userId, username });
  } catch (err) {
    console.error("Register error:", err);
    if (err.code === '23505') { // Unique violation
      return res.json({ success: false, message: "そのユーザー名は既に使用されています。" });
    }
    res.json({ success: false, message: "登録中にエラーが発生しました。" });
  }
});

// API: ログイン
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND password_hash = $2",
      [username, hashPassword(password)]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      res.json({
        success: true,
        userId: user.id,
        username: user.username,
        stats: { wins: user.wins, lose: user.lose },
        friends: user.friends || []
      });
    } else {
      res.json({ success: false, message: "ユーザー名またはパスワードが間違っています。" });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.json({ success: false, message: "ログイン処理中にエラーが発生しました。" });
  }
});

// 戦績更新ヘルパー
async function updateUserStats(userId, isWin) {
  if (!userId) return;
  try {
    if (isWin) {
      await pool.query("UPDATE users SET wins = wins + 1 WHERE id = $1", [userId]);
    } else {
      await pool.query("UPDATE users SET lose = lose + 1 WHERE id = $1", [userId]);
    }
  } catch (err) {
    console.error("Error updating stats:", err);
  }
}


// 問題データの読み込み
const questionsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "questions.json"), "utf-8")
);

// Calculate genre counts
const genreCounts = {};
questionsData.forEach(q => {
  const g = q.category;
  genreCounts[g] = (genreCounts[g] || 0) + 1;
});
console.log("Genre counts calculated:", genreCounts);

// ゲーム設定
const DEFAULT_INITIAL_HP = 20;
const DEFAULT_MAX_ROUNDS = 10;
const DEFAULT_TIME_LIMIT_SECONDS = 10;

const BASE_DAMAGE = {
  EASY: 2,
  NORMAL: 4,
  HARD: 7,
};

function calcSpeedBonus(elapsedSeconds) {
  if (elapsedSeconds <= 2) return 3;
  if (elapsedSeconds <= 3) return 1;
  return 0;
}

function sortRoundStats(stats) {
  return stats.sort((a, b) => {
    const d = (a.damage || 0) - (b.damage || 0);
    if (d !== 0) return d;
    const ta = a.elapsedMs == null ? Infinity : a.elapsedMs;
    const tb = b.elapsedMs == null ? Infinity : b.elapsedMs;
    return ta - tb;
  });
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
 *     categories: string[] | null,
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
const timeAttackSessions = {};
// userId -> Set<socketId>
const connectedUsers = new Map();

// Helper: Check online status
function isUserOnline(userId) {
  const sockets = connectedUsers.get(userId);
  return sockets && sockets.size > 0;
}

// API: フレンド追加 (相互登録)
app.post("/api/friends/add", async (req, res) => {
  const { userId, targetId } = req.body;
  if (!userId || !targetId) {
    return res.json({ success: false, message: "IDが不足しています。" });
  }
  if (userId === targetId) {
    return res.json({ success: false, message: "自分自身をフレンドに追加することはできません。" });
  }

  try {
    // 1. 相手が存在するか確認
    const targetRes = await pool.query("SELECT * FROM users WHERE id = $1", [targetId]);
    if (targetRes.rows.length === 0) {
      return res.json({ success: false, message: "指定されたIDのユーザーは見つかりません。" });
    }

    // 2. 自分のフレンドリストを取得
    const myRes = await pool.query("SELECT friends FROM users WHERE id = $1", [userId]);
    let myFriends = myRes.rows[0]?.friends || [];
    // 既に登録済みかチェック
    if (myFriends.includes(targetId)) {
      return res.json({ success: false, message: "既にフレンド登録されています。" });
    }

    // 3. 相手のフレンドリストを取得
    let targetFriends = targetRes.rows[0].friends || [];

    // 4. 配列更新 (相互に追加)
    if (!myFriends.includes(targetId)) myFriends.push(targetId);
    if (!targetFriends.includes(userId)) targetFriends.push(userId);

    // 5. DB更新 (トランザクションが好ましいが簡易実装)
    await pool.query("UPDATE users SET friends = $1 WHERE id = $2", [JSON.stringify(myFriends), userId]);
    await pool.query("UPDATE users SET friends = $1 WHERE id = $2", [JSON.stringify(targetFriends), targetId]);

    res.json({ success: true, message: "フレンドに追加しました！" });
  } catch (err) {
    console.error("Friend Add Error:", err);
    res.json({ success: false, message: "エラーが発生しました。" });
  }
});

// API: フレンドリスト取得
app.get("/api/friends", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.json({ success: false, friends: [] });

  try {
    const userRes = await pool.query("SELECT friends FROM users WHERE id = $1", [userId]);
    const friendIds = userRes.rows[0]?.friends || [];

    if (friendIds.length === 0) {
      return res.json({ success: true, friends: [] });
    }

    // フレンドの詳細情報を取得
    // 配列を $1, $2... に展開するのは面倒なので ANY($1) を使う
    const friendsRes = await pool.query(
      `SELECT id, username, wins, lose FROM users WHERE id = ANY($1::text[])`,
      [friendIds]
    );

    const friendList = friendsRes.rows.map(f => ({
      id: f.id,
      username: f.username,
      wins: f.wins,
      lose: f.lose,
      isOnline: isUserOnline(f.id)
    }));

    res.json({ success: true, friends: friendList });
  } catch (err) {
    console.error("Get Friends Error:", err);
    res.json({ success: false, message: "取得エラー" });
  }
});

function broadcastRoomState(room) {
  io.to(room.id).emit("roomState", serializeRoom(room));
}

function getPlayers(room) {
  return room.order.map((id) => room.players[id]).filter(Boolean);
}

function serializeRoom(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers || room.settings?.maxPlayers || 2,
    players: getPlayers(room).map((p) => ({
      id: p.id,
      name: p.name,
      hp: p.hp,
      isEliminated: !!p.isEliminated,
      replayReady: !!p.replayReady,
      initialHp: room.initialHpMap?.[p.id] ?? DEFAULT_INITIAL_HP,
    })),
  };
}

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function findRoomBySocketId(socketId) {
  return Object.values(rooms).find((r) => r.players[socketId]);
}

function pickRandomQuestion(room) {
  let pool = questionsData;
  const exhaustible = room?.settings?.exhaustible === true;

  if (room && room.settings) {
    const { categories, category, difficulties } = room.settings;
    const used = room.usedQuestionIds || new Set();
    const categoryFilter =
      Array.isArray(categories) && categories.length > 0
        ? new Set(categories)
        : category && category !== "all"
          ? new Set([category])
          : null;

    pool = questionsData.filter((q) => {
      const questionCategory = q.category || null;
      const categoryOk = !categoryFilter
        ? true
        : questionCategory && categoryFilter.has(questionCategory);
      const diffOk =
        !difficulties || difficulties.length === 0
          ? true
          : difficulties.includes(q.difficulty || "EASY");
      const unusedOk = !used.has(q.id);
      return categoryOk && diffOk && unusedOk;
    });

    if (pool.length === 0 && !exhaustible) {
      if (room.usedQuestionIds) {
        room.usedQuestionIds.clear();
      }
      pool = questionsData.filter((q) => {
        const questionCategory = q.category || null;
        const categoryOk = !categoryFilter
          ? true
          : questionCategory && categoryFilter.has(questionCategory);
        const diffOk =
          !difficulties || difficulties.length === 0
            ? true
            : difficulties.includes(q.difficulty || "EASY");
        return categoryOk && diffOk;
      });
    }
  }

  if (pool.length === 0) {
    return null;
  }

  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

function getTimeAttackQuestion(socketId, settings) {
  const session = timeAttackSessions[socketId] || { usedQuestionIds: new Set() };
  const pseudoRoom = {
    settings,
    usedQuestionIds: session.usedQuestionIds,
  };
  const question = pickRandomQuestion(pseudoRoom);
  if (question) {
    session.usedQuestionIds.add(question.id);
  }
  timeAttackSessions[socketId] = session;
  return question;
}

io.on("connection", (socket) => {
  socket.on("request_genre_counts", () => {
    socket.emit("genre_counts", genreCounts);
  });

  socket.on("registerUser", ({ userId }) => {
    if (!userId) return;
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId).add(socket.id);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected:", socket.id);

    // connectedUsers から削除
    for (const [uid, sockets] of connectedUsers.entries()) {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          connectedUsers.delete(uid);
        }
        break;
      }
    }

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
    delete timeAttackSessions[socket.id];
  });

  socket.on("inviteFriend", ({ targetUserId, roomId, fromName, roomName }) => {
    if (!targetUserId || !connectedUsers.has(targetUserId)) {
      // オフラインまたは存在しない
      socket.emit("invitationError", "ユーザーが見つからないか、オフラインです。");
      return;
    }

    const targetSockets = connectedUsers.get(targetUserId);
    if (!targetSockets || targetSockets.size === 0) {
      socket.emit("invitationError", "ユーザーはオフラインです。");
      return;
    }

    // すべての接続済みソケットに送信（複数タブ開いている場合など）
    targetSockets.forEach(targetSocketId => {
      io.to(targetSocketId).emit("invitationReceived", {
        fromName,
        roomId,
        roomName
      });
    });

    socket.emit("invitationSent", "招待を送りました！");
  });


  socket.on("timeAttackNextQuestion", (payload, callback) => {
    const categories = Array.isArray(payload?.genres) ? payload.genres : null;
    const difficultiesRaw = Array.isArray(payload?.difficulties) ? payload.difficulties : null;
    const difficulties = difficultiesRaw
      ? difficultiesRaw.map((d) => String(d || "").toUpperCase())
      : ["EASY", "NORMAL", "HARD"];

    const settings = {
      categories: categories && categories.length > 0 ? categories : null,
      difficulties: difficulties && difficulties.length > 0 ? difficulties : ["EASY", "NORMAL", "HARD"],
      exhaustible: !!payload?.exhaustible,
    };

    const question = getTimeAttackQuestion(socket.id, settings);
    if (!question) {
      if (typeof callback === "function") {
        callback({ error: "問題が見つかりませんでした" });
      }
      return;
    }

    if (typeof callback === "function") {
      callback({
        id: question.id,
        question: question.question,
        choices: question.choices || [],
        correctIndex: typeof question.answerIndex === "number" ? question.answerIndex : 0,
        difficulty: question.difficulty || "EASY",
      });
    }
  });

  socket.on("createRoom", ({ name, settings }) => {
    let roomId;
    do {
      roomId = generateRoomId();
    } while (rooms[roomId]);

    const defaultSettings = {
      categories: null,
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
      initialHp: DEFAULT_INITIAL_HP,
      isEliminated: false,
      replayReady: false,
    };
    rooms[roomId].order.push(socket.id);

    socket.join(roomId);
    socket.emit("roomCreated", {
      roomId,
      playerId: socket.id,
      settings: mergedSettings,
    });
  });

  socket.on("joinRoom", ({ roomId, name, userId }) => {
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
      userId: userId || null, // アカウントIDを保持
      name: name || "Player",
      hp: DEFAULT_INITIAL_HP,
      initialHp: DEFAULT_INITIAL_HP,
      isEliminated: false,
      replayReady: false,
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
      const rawHp =
        initialHp && typeof initialHp[playerId] !== "undefined"
          ? Number(initialHp[playerId])
          : DEFAULT_INITIAL_HP;
      const hp = Number.isFinite(rawHp) ? rawHp : DEFAULT_INITIAL_HP;
      room.initialHpMap[playerId] = Math.max(1, hp);
      room.players[playerId].hp = room.initialHpMap[playerId];
      room.players[playerId].isEliminated = false;
      room.players[playerId].replayReady = false;
      room.players[playerId].initialHp = room.initialHpMap[playerId];
    }

    room.waitingForHpConfig = false;

    startGame(roomId);
  });

  socket.on("submitAnswer", ({ roomId, questionId, choiceIndex, elapsedSeconds }) => {
    const room = rooms[roomId];
    if (!room || room.finished) return;
    if (!room.currentQuestion || room.currentQuestion.id !== questionId) return;
    const player = room.players[socket.id];
    if (!player || player.isEliminated || player.hp <= 0) return;

    room.answers[socket.id] = {
      choiceIndex,
      elapsedSeconds: typeof elapsedSeconds === "number" ? elapsedSeconds : 9999,
    };

    const activeCount = getPlayers(room).filter((p) => !p.isEliminated && p.hp > 0).length;
    if (Object.keys(room.answers).length >= activeCount) {
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
      const totalPlayers = getPlayers(room).filter((p) => !p.isEliminated && p.hp > 0).length;
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

    const totalPlayers = getPlayers(room).filter((p) => !p.isEliminated && p.hp > 0).length;
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
    broadcastRoomState(room);
  });

  socket.on("replayReady", ({ roomId }) => {
    const room = roomId ? rooms[roomId] : findRoomBySocketId(socket.id);
    if (!room) return;
    const player = room.players[socket.id];
    if (!player) return;
    player.replayReady = true;
    broadcastRoomState(room);
  });

  socket.on("startReplay", ({ roomId }) => {
    const room = roomId ? rooms[roomId] : findRoomBySocketId(socket.id);
    if (!room || room.hostId !== socket.id || !room.finished) return;
    const othersReady = getPlayers(room).every(
      (p) => p.id === room.hostId || p.replayReady
    );
    if (!othersReady) return;

    // reset state
    room.finished = false;
    room.round = 0;
    room.answers = {};
    room.waitingNext = false;
    room.readyForNext = {};
    room.currentQuestion = null;
    room.usedQuestionIds?.clear();
    getPlayers(room).forEach((p) => {
      const initHp = room.initialHpMap?.[p.id] ?? DEFAULT_INITIAL_HP;
      p.hp = initHp;
      p.isEliminated = false;
      p.replayReady = false;
    });
    broadcastRoomState(room);
    startGame(room.id);
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
  playerIds.forEach((pid) => {
    const p = room.players[pid];
    if (p) {
      p.isEliminated = false;
      p.replayReady = false;
      const initHp = room.initialHpMap?.[pid] ?? DEFAULT_INITIAL_HP;
      p.hp = initHp;
      p.initialHp = initHp;
    }
  });

  const maxRounds =
    room.settings && !room.settings.infiniteMode
      ? room.settings.maxRounds || DEFAULT_MAX_ROUNDS
      : null;

  const settingsForClient = {
    categories: room.settings.categories ?? null,
    difficulties: room.settings.difficulties,
    maxRounds,
    infiniteMode: !!room.settings.infiniteMode,
    timeLimitSeconds: room.settings.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS,
    maxPlayers: room.maxPlayers || room.settings.maxPlayers || playerIds.length,
  };

  const playersPayload = playerIds.map((id) => {
    const p = room.players[id];
    return {
      id: p.id,
      name: p.name,
      hp: p.hp,
      initialHp: room.initialHpMap?.[p.id] ?? DEFAULT_INITIAL_HP,
      isEliminated: !!p.isEliminated,
      replayReady: !!p.replayReady,
    };
  });

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
      players: playersPayload,
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
  const diff = (question?.difficulty || "EASY");
  io.to(roomId).emit("countdownStart", {
    seconds: 3,
    difficulty: diff,
  });

  setTimeout(() => {
    // 途中で終了した場合は送信しない
    const latestRoom = rooms[roomId];
    if (!latestRoom || latestRoom.finished) return;
    io.to(roomId).emit("question", {
      round: room.round,
      question,
      timeLimitSeconds,
    });
  }, 3000);
}

function applyDamageForThreePlayers(entries, baseDamage) {
  const D = baseDamage;
  const alive = entries.filter((e) => !e.player.isEliminated);

  alive.forEach((e) => {
    e.damage = 0;
  });

  const correct = alive.filter((e) => e.correct);
  const wrong = alive.filter((e) => !e.correct);
  const sortedCorrect = [...correct].sort((a, b) => a.answerTime - b.answerTime);

  if (correct.length === 3) {
    if (sortedCorrect[1]) {
      sortedCorrect[1].damage = Math.ceil(D / 2);
    }
    if (sortedCorrect[2]) {
      sortedCorrect[2].damage = Math.ceil(D);
    }
  } else if (correct.length === 2) {
    if (sortedCorrect[1]) {
      sortedCorrect[1].damage = Math.ceil(D / 2);
    }
    wrong.forEach((e) => {
      e.damage = Math.ceil((3 * D) / 2);
    });
  } else if (correct.length === 1) {
    wrong.forEach((e) => {
      e.damage = Math.ceil((3 * D) / 2);
    });
  } else {
    // 全員不正解 → damageは0のまま
  }

  return entries;
}

function resolveRoundThree(room, players, question, correctIndex, baseDamage) {
  const entries = players.map((p) => {
    const ans = room.answers[p.id];
    const correct = ans ? ans.choiceIndex === correctIndex : false;
    return {
      player: p,
      correct,
      answered: !!ans,
      answerTime: ans ? ans.elapsedSeconds : Infinity,
      damage: 0,
    };
  });

  applyDamageForThreePlayers(entries, baseDamage);

  // ダメージ適用
  entries.forEach((e) => {
    e.player.hp = Math.max(0, e.player.hp - (e.damage || 0));
  });

  // 脱落判定
  players.forEach((p) => {
    if (p.hp <= 0) {
      p.hp = 0;
      p.isEliminated = true;
    }
  });

  const correctEntries = entries.filter((e) => e.correct);
  const settings = room.settings || {};
  const correctAnswerText = question.choices[correctIndex];
  let resultMessage = "";

  if (correctEntries.length === 0) {
    resultMessage = "全員不正解。このラウンドはダメージなし。";
  } else {
    const fastest = [...correctEntries].sort((a, b) => a.answerTime - b.answerTime)[0];
    resultMessage = `${fastest.player.name} が最速正解！`;
  }

  let finished = false;
  let winnerCode = null;
  let reason = "";
  const alive = players.filter((p) => p.hp > 0 && !p.isEliminated);
  if (alive.length === 0) {
    finished = true;
    winnerCode = "draw";
    reason = "全員のHPが0になった";
  } else if (alive.length === 1) {
    finished = true;
    winnerCode = alive[0].id;
    reason = `${alive[0].name} だけHPが残った`;
  }

  room.finished = finished;
  if (!finished) {
    room.waitingNext = true;
    room.readyForNext = {};
  }
  if (finished) {
    players.forEach((p) => {
      p.replayReady = false;
    });
  }

  const playersPayload = players.map((p) => ({
    id: p.id,
    name: p.name,
    hp: p.hp,
    initialHp: room.initialHpMap?.[p.id] ?? DEFAULT_INITIAL_HP,
    isEliminated: !!p.isEliminated,
    replayReady: !!p.replayReady,
  }));

  const roundStats = sortRoundStats(
    entries.map((e) => ({
      id: e.player.id,
      name: e.player.name,
      damage: e.damage || 0,
      isCorrect: !!e.correct,
      elapsedMs: Number.isFinite(e.answerTime) ? Math.round(e.answerTime * 1000) : null,
    }))
  );

  players.forEach((p) => {
    const opponent = players.find((x) => x.id !== p.id) || p;
    const payload = {
      round: room.round,
      correctAnswer: correctAnswerText,
      canContinue: !finished,
      gameStatusText: finished ? "ゲーム終了" : `次の問題へ進みます`,
      players: playersPayload,
      roundStats,
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
      opponent: { id: opponent.id, hp: opponent.hp },
      message: resultMessage,
      questionText: question.question,
      choices: question.choices,
      correctIndex: correctIndex,
      myAnswerIndex: room.answers[p.id]?.choiceIndex ?? null,
    };

    io.to(p.id).emit("roundResult", payload);
  });

  if (finished) {
    // 戦績更新
    if (winnerCode && winnerCode !== "draw") {
      const winner = players.find(p => p.id === winnerCode);
      if (winner && winner.userId) {
        updateUserStats(winner.userId, true);
      }
      players.forEach(p => {
        if (p.id !== winnerCode && p.userId) {
          updateUserStats(p.userId, false);
        }
      });
    } else if (winnerCode === "draw") {
      // 引き分け時の扱いは未定義だが、とりあえず負けにはしない
    }

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
    broadcastRoomState(room);
  }
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

  if (playerCount === 3) {
    return resolveRoundThree(room, players, question, correctIndex, baseDamage);
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
  const damageMap = {};

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

  damageMap[p1.id] = damageToP1;
  damageMap[p2.id] = damageToP2;

  p1.hp = Math.max(0, p1.hp - damageToP1);
  p2.hp = Math.max(0, p2.hp - damageToP2);
  if (p1.hp <= 0) {
    p1.hp = 0;
    p1.isEliminated = true;
  }
  if (p2.hp <= 0) {
    p2.hp = 0;
    p2.isEliminated = true;
  }

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
  if (finished) {
    [p1, p2].forEach((p) => (p.replayReady = false));
  }

  const correctAnswerText = question.choices[correctIndex];

  const settings = room.settings || {};
  const maxRounds =
    settings && !settings.infiniteMode
      ? settings.maxRounds || DEFAULT_MAX_ROUNDS
      : null;
  const playersPayload = [p1, p2].map((p) => ({
    id: p.id,
    name: p.name,
    hp: p.hp,
    initialHp: room.initialHpMap?.[p.id] ?? DEFAULT_INITIAL_HP,
    isEliminated: !!p.isEliminated,
    replayReady: !!p.replayReady,
  }));

  const roundStats = sortRoundStats(
    [p1, p2].map((p) => {
      const ans = room.answers[p.id];
      const elapsedMs =
        ans && Number.isFinite(ans.elapsedSeconds)
          ? Math.round(ans.elapsedSeconds * 1000)
          : null;
      const isCorrect = ans ? ans.choiceIndex === correctIndex : false;
      return {
        id: p.id,
        name: p.name,
        damage: damageMap[p.id] || 0,
        isCorrect,
        elapsedMs,
      };
    })
  );

  const commonPayload = {
    round: room.round,
    correctAnswer: correctAnswerText,
    canContinue: !finished && (!maxRounds || room.round < maxRounds),
    gameStatusText: finished ? "ゲーム終了" : `次の問題へ進みます`,
    roundStats,
    gameOverInfo: finished
      ? {
        winner: winner === "draw" ? "draw" : null, // 個別メッセージは下で送る
        reason,
        yourHp: null,
        opponentHp: null,
      }
      : null,
    questionText: question.question,
    choices: question.choices,
    correctIndex: correctIndex,
  };

  io.to(p1.id).emit("roundResult", {
    ...commonPayload,
    players: playersPayload,
    you: { id: p1.id, hp: p1.hp },
    opponent: { id: p2.id, hp: p2.hp },
    myAnswerIndex: room.answers[p1.id]?.choiceIndex ?? null,
    message: resultMessage,
  });

  io.to(p2.id).emit("roundResult", {
    ...commonPayload,
    players: playersPayload,
    you: { id: p2.id, hp: p2.hp },
    opponent: { id: p1.id, hp: p1.hp },
    myAnswerIndex: room.answers[p2.id]?.choiceIndex ?? null,
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
    broadcastRoomState(room);
  }
}

// サーバー起動
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
