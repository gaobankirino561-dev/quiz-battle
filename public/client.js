const socket = io();

let playerName = "";
let roomId = "";
let myPlayerId = null;
let gameState = {
  myHp: 20,
  opponentHp: 20,
  round: 0,
  maxRounds: 10,
  initialMyHp: 20,
  initialOpponentHp: 20,
};

let isRoomOwner = false;
let roomSettings = {
  category: "all",
  difficulties: ["EASY", "NORMAL", "HARD"],
  maxRounds: 10,
  infiniteMode: false,
  timeLimitSeconds: 30,
  maxPlayers: 2,
};

let hpConfig = {
  player1Id: null,
  player2Id: null,
};

let currentQuestionId = null;
let answering = false;
let questionStartTime = null;
let timeLimitSeconds = 30;
let timerIntervalId = null;

// DOM elements
const playerNameInput = document.getElementById("playerNameInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomIdInput = document.getElementById("roomIdInput");
const roomInfo = document.getElementById("roomInfo");
const connectionStatus = document.getElementById("connectionStatus");
const gameStatus = document.getElementById("gameStatus");

const nameSection = document.getElementById("name-section");
const roomSection = document.getElementById("room-section");
const roomSettingsPanel = document.getElementById("room-settings");
const hpSection = document.getElementById("hp-section");
const questionSection = document.getElementById("question-section");
const resultSection = document.getElementById("result-section");
const finalSection = document.getElementById("final-section");

const myNameLabel = document.getElementById("myNameLabel");
const opponentNameLabel = document.getElementById("opponentNameLabel");
const myHpBar = document.getElementById("myHpBar");
const opponentHpBar = document.getElementById("opponentHpBar");
const myHpText = document.getElementById("myHpText");
const opponentHpText = document.getElementById("opponentHpText");
const roundInfo = document.getElementById("roundInfo");

const questionText = document.getElementById("questionText");
const choicesList = document.getElementById("choicesList");
const timerText = document.getElementById("timerText");
const questionRules = document.getElementById("questionRules");
const skipAnswerBtn = document.getElementById("skipAnswerBtn");

const roundResultText = document.getElementById("roundResultText");
const correctAnswerText = document.getElementById("correctAnswerText");
const nextRoundBtn = document.getElementById("nextRoundBtn");
const nextReadyBtn = document.getElementById("nextReadyBtn");
const nextWaitText = document.getElementById("nextWaitText");

const finalResultTitle = document.getElementById("finalResultTitle");
const finalResultDetail = document.getElementById("finalResultDetail");
const reloadBtn = document.getElementById("reloadBtn");

const categorySelect = document.getElementById("categorySelect");
const difficultyCheckboxes = document.querySelectorAll(".difficultyCheckbox");
const maxRoundsInput = document.getElementById("maxRoundsInput");
const infiniteModeCheckbox = document.getElementById("infiniteModeCheckbox");
const timeLimitInput = document.getElementById("timeLimitInput");
const playerCountSelect = document.getElementById("player-count");

const hpConfigSection = document.getElementById("hp-config-section");
const hpConfigInfo = document.getElementById("hpConfigInfo");
const hpPlayer1Label = document.getElementById("hpPlayer1Label");
const hpPlayer2Label = document.getElementById("hpPlayer2Label");
const hpPlayer1Input = document.getElementById("hpPlayer1Input");
const hpPlayer2Input = document.getElementById("hpPlayer2Input");
const startGameWithHpBtn = document.getElementById("startGameWithHpBtn");
const hpConfigStatus = document.getElementById("hpConfigStatus");

// Connection
socket.on("connect", () => {
  connectionStatus.textContent = "サーバーに接続しました";
});

socket.on("disconnect", () => {
  connectionStatus.textContent = "サーバーから切断されました";
});

// Room events
createRoomBtn.addEventListener("click", () => {
  playerName = playerNameInput.value.trim() || "Player";

  // ルーム設定をUIから取得
  const category = categorySelect.value || "all";
  const selectedDifficulties = Array.from(difficultyCheckboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);

  if (selectedDifficulties.length === 0) {
    alert("少なくとも1つの難易度を選択してください。");
    return;
  }

  const maxRoundsValue = parseInt(maxRoundsInput.value, 10) || 10;
  const infiniteMode = infiniteModeCheckbox.checked;
  const timeLimitValue = parseInt(timeLimitInput.value, 10) || 30;
  let maxPlayers = parseInt(playerCountSelect?.value, 10);
  maxPlayers = maxPlayers === 3 ? 3 : 2;

  roomSettings = {
    category,
    difficulties: selectedDifficulties,
    maxRounds: maxRoundsValue,
    infiniteMode,
    timeLimitSeconds: timeLimitValue,
    maxPlayers,
  };

  socket.emit("createRoom", {
    name: playerName,
    settings: roomSettings,
  });
});

joinRoomBtn.addEventListener("click", () => {
  playerName = playerNameInput.value.trim() || "Player";
  const inputRoomId = roomIdInput.value.trim();
  if (!inputRoomId) {
    alert("ルームIDを入力してください");
    return;
  }
  isRoomOwner = false;
  socket.emit("joinRoom", { roomId: inputRoomId, name: playerName });
});

socket.on("roomCreated", (data) => {
  roomId = data.roomId;
  myPlayerId = data.playerId;
  isRoomOwner = true;
  roomSettings = data.settings || roomSettings;
  if (roomSection) {
    roomSection.classList.remove("hidden");
  }
  if (roomSettingsPanel) {
    roomSettingsPanel.classList.remove("hidden");
  }
  roomInfo.textContent = `ルームID: ${roomId}（相手に伝えてください）`;
  gameStatus.textContent = "相手の参加を待っています...";
});

socket.on("roomJoined", (data) => {
  roomId = data.roomId;
  myPlayerId = data.playerId;
  if (roomSection) {
    roomSection.classList.remove("hidden");
  }
  if (roomSettingsPanel) {
    roomSettingsPanel.classList.remove("hidden");
  }
  roomInfo.textContent = `ルームID: ${roomId}`;
  gameStatus.textContent = "ルームに参加しました。相手の準備を待っています...";
});

socket.on("roomError", (msg) => {
  alert(msg);
});

socket.on("roomReadyForHpConfig", (data) => {
  roomSettings = data.settings || roomSettings;
  timeLimitSeconds = roomSettings.timeLimitSeconds;

  hpConfig.player1Id = data.players[0].id;
  hpConfig.player2Id = data.players[1].id;

  hpSection.classList.remove("hidden");
  roundInfo.textContent = "初期HP設定を待機中";

  if (isRoomOwner) {
    hpConfigSection.classList.remove("hidden");
    hpConfigInfo.textContent = "あなたがホストです。両プレイヤーの初期HPを設定してください。";
    hpPlayer1Label.textContent = `${data.players[0].name} のHP:`;
    hpPlayer2Label.textContent = `${data.players[1].name} のHP:`;
    hpPlayer1Input.value = 20;
    hpPlayer2Input.value = 20;
    hpConfigStatus.textContent = "";
  } else {
    hpConfigSection.classList.add("hidden");
    hpConfigInfo.textContent = "ホストが初期HPを設定しています...";
  }
});

socket.on("gameStart", (data) => {
  // data: { initialHpMap, maxRounds, settings, you, opponent }
  nameSection.classList.add("hidden");
  hpSection.classList.remove("hidden");
  hpConfigSection.classList.add("hidden");
  if (roomSection) {
    roomSection.classList.add("hidden");
  }
  if (roomSettingsPanel) {
    roomSettingsPanel.classList.add("hidden");
  }
  if (questionSection) {
    questionSection.classList.remove("hidden");
    try {
      questionSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      // ignore
    }
  }
  roomSettings = data.settings || roomSettings;

  const myInitial = data.initialHpMap[data.you.id] ?? data.initialHp;
  const opponentInitial = data.initialHpMap[data.opponent.id] ?? data.initialHp;

  gameState.myHp = myInitial;
  gameState.opponentHp = opponentInitial;
  gameState.initialMyHp = myInitial;
  gameState.initialOpponentHp = opponentInitial;
  gameState.round = 0;
  gameState.maxRounds = data.settings?.infiniteMode ? null : data.maxRounds;
  timeLimitSeconds = data.settings?.timeLimitSeconds ?? 30;

  updateHpBars();
  myNameLabel.textContent = data.you.name;
  opponentNameLabel.textContent = data.opponent.name;

  gameStatus.textContent = "ゲーム開始！";
});

socket.on("question", (data) => {
  gameState.round = data.round;
  currentQuestionId = data.question.id;
  answering = true;
  questionStartTime = Date.now();
  timeLimitSeconds = data.timeLimitSeconds ?? timeLimitSeconds;
  nextReadyBtn.classList.add("hidden");
  nextWaitText.textContent = "";

  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }

  resultSection.classList.add("hidden");
  finalSection.classList.add("hidden");
  questionSection.classList.remove("hidden");

  roundInfo.textContent = `ラウンド ${data.round} / ${gameState.maxRounds || "∞"}`;
  questionText.textContent = `[${data.question.difficulty}] ${data.question.question}`;
  const ruleText = roomSettings
    ? `ルール/設定: ジャンル=${roomSettings.category || "all"}, 難易度=${(roomSettings.difficulties || []).join(", ") || "全て"}, 制限時間=${timeLimitSeconds}秒, 出題数=${roomSettings.infiniteMode ? "∞" : roomSettings.maxRounds}`
    : "";
  questionRules.textContent = ruleText;

  let remaining = timeLimitSeconds;
  timerText.textContent = `制限時間: ${remaining} 秒`;

  timerIntervalId = setInterval(() => {
    if (!answering) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
      return;
    }
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
      if (answering) {
        answering = false;
        const elapsedSec = (Date.now() - questionStartTime) / 1000;
        socket.emit("submitAnswer", {
          roomId,
          questionId: currentQuestionId,
          choiceIndex: null,
          elapsedSeconds: elapsedSec,
        });
        timerText.textContent = "時間切れ！未回答として処理されました。";
      }
    } else {
      timerText.textContent = `制限時間: ${remaining} 秒`;
    }
  }, 1000);

  // 選択肢表示
  choicesList.innerHTML = "";
  data.question.choices.forEach((choice, index) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.textContent = choice;
    btn.className = "choice-btn";
    btn.addEventListener("click", () => {
      if (!answering) return;
      answering = false;
      if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
      }
      const elapsedSec = (Date.now() - questionStartTime) / 1000;
      socket.emit("submitAnswer", {
        roomId,
        questionId: currentQuestionId,
        choiceIndex: index,
        elapsedSeconds: elapsedSec,
      });
      timerText.textContent = `回答送信済み（${elapsedSec.toFixed(1)} 秒）`;
    });
    li.appendChild(btn);
    choicesList.appendChild(li);
  });
});

socket.on("roundResult", (data) => {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  questionSection.classList.add("hidden");
  resultSection.classList.remove("hidden");
  nextRoundBtn.classList.add("hidden");

  gameState.myHp = data.you.hp;
  gameState.opponentHp = data.opponent.hp;
  updateHpBars();

  roundResultText.textContent = data.message;
  correctAnswerText.textContent = `正解: ${data.correctAnswer}`;
  gameStatus.textContent = data.gameStatusText || "";

  if (data.canContinue) {
    nextReadyBtn.classList.remove("hidden");
    nextReadyBtn.disabled = false;
    nextReadyBtn.textContent = "次の問題へ（準備完了）";
    nextWaitText.textContent = "";
    nextReadyBtn.onclick = () => {
      nextReadyBtn.disabled = true;
      nextWaitText.textContent = "相手の準備を待っています...";
      socket.emit("readyForNext", { roomId });
    };
  } else {
    nextReadyBtn.classList.add("hidden");
    nextWaitText.textContent = "";
  }

  if (!data.canContinue && data.gameOverInfo) {
    showFinalResult(data.gameOverInfo);
  }
});

socket.on("gameOver", (data) => {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  answering = false;
  questionSection.classList.add("hidden");
  resultSection.classList.add("hidden");
  hpSection.classList.remove("hidden");
  nextReadyBtn.classList.add("hidden");
  nextWaitText.textContent = "";
  showFinalResult(data);
});

startGameWithHpBtn.addEventListener("click", () => {
  if (!isRoomOwner) return;

  const hp1 = parseInt(hpPlayer1Input.value, 10) || 20;
  const hp2 = parseInt(hpPlayer2Input.value, 10) || 20;

  if (hp1 <= 0 || hp2 <= 0) {
    alert("HPは1以上の数値を指定してください。");
    return;
  }

  hpConfigStatus.textContent = "サーバーへHP設定を送信中...";

  socket.emit("configureRoomAndStart", {
    roomId,
    initialHp: {
      [hpConfig.player1Id]: hp1,
      [hpConfig.player2Id]: hp2,
    },
  });
});

nextRoundBtn.addEventListener("click", () => {
  socket.emit("nextQuestion", { roomId });
});

reloadBtn.addEventListener("click", () => {
  window.location.reload();
});

function updateHpBars() {
  const myBase = gameState.initialMyHp || gameState.myHp || 1;
  const oppBase = gameState.initialOpponentHp || gameState.opponentHp || 1;
  const myPercent = Math.max(0, Math.min(100, (gameState.myHp / myBase) * 100));
  const oppPercent = Math.max(0, Math.min(100, (gameState.opponentHp / oppBase) * 100));
  myHpBar.style.width = myPercent + "%";
  opponentHpBar.style.width = oppPercent + "%";
  myHpText.textContent = `${gameState.myHp} / ${myBase}`;
  opponentHpText.textContent = `${gameState.opponentHp} / ${oppBase}`;
}

function showFinalResult(info) {
  finalSection.classList.remove("hidden");
  const { winner, reason, yourHp, opponentHp } = info;
  finalResultTitle.textContent = winner === "you" ? "あなたの勝ち！" : winner === "draw" ? "引き分け" : "あなたの負け...";
  finalResultDetail.textContent = `理由: ${reason} / あなたHP=${yourHp}, 相手HP=${opponentHp}`;
}
