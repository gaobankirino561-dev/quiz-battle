const socket = io();

let playerName = "";
let roomId = "";
let myPlayerId = null;
let gameState = {
  round: 0,
  maxRounds: 10,
};
let playersState = [];
let currentChoiceOrder = [];

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
  players: [],
};

let currentQuestionId = null;
let answering = false;
let questionStartTime = null;
let timeLimitSeconds = 30;
let timerIntervalId = null;
let isEliminatedSelf = false;
let countdownTimerId = null;

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

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

const hpStatus = document.getElementById("hp-status");
const roundInfo = document.getElementById("roundInfo");

const questionText = document.getElementById("questionText");
const choicesList = document.getElementById("choicesList");
const timerText = document.getElementById("timerText");
const questionRules = document.getElementById("questionRules");
const skipAnswerBtn = document.getElementById("skipAnswerBtn");
const countdownOverlay = document.getElementById("countdown-overlay");
const countdownNumber = document.getElementById("countdown-number");

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
const hpInputsContainer = document.getElementById("hpInputsContainer");
const startGameWithHpBtn = document.getElementById("startGameWithHpBtn");
const hpConfigStatus = document.getElementById("hpConfigStatus");
const replayReadyBtn = document.getElementById("replay-ready-button");
const replayStartBtn = document.getElementById("replay-start-button");

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

socket.on("roomState", (room) => {
  if (!room) return;
  if (Array.isArray(room.players)) {
    playersState = room.players;
    isEliminatedSelf = isPlayerEliminated(myPlayerId);
    renderHpStatus(playersState, myPlayerId);
    setChoiceButtonsDisabled(isEliminatedSelf);
  }
  if (replayStartBtn) {
    const isHost = room.hostId === myPlayerId;
    const allReady = (room.players || []).filter(Boolean).every((p) => p.id === room.hostId || p.replayReady);
    replayStartBtn.disabled = !(isHost && allReady);
  }
});

socket.on("roomReadyForHpConfig", (data) => {
  roomSettings = data.settings || roomSettings;
  timeLimitSeconds = roomSettings.timeLimitSeconds;

  hpConfig.players = data.players || [];

  hpSection.classList.remove("hidden");
  roundInfo.textContent = "初期HP設定を待機中";

  if (isRoomOwner) {
    hpConfigSection.classList.remove("hidden");
    hpConfigInfo.textContent = "あなたがホストです。全プレイヤーの初期HPを設定してください。";
    renderHpInputs(hpConfig.players);
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

  playersState = (data.players || []).map((p) => ({
    ...p,
    initialHp: data.initialHpMap?.[p.id] ?? data.initialHp ?? p.hp,
  }));
  isEliminatedSelf = isPlayerEliminated(myPlayerId);
  gameState.round = 0;
  gameState.maxRounds = data.settings?.infiniteMode ? null : data.maxRounds;
  timeLimitSeconds = data.settings?.timeLimitSeconds ?? 30;

  renderHpStatus(playersState, myPlayerId);

  gameStatus.textContent = "ゲーム開始！";
  if (replayReadyBtn) {
    replayReadyBtn.classList.add("hidden");
    replayReadyBtn.disabled = false;
  }
  if (replayStartBtn) {
    replayStartBtn.classList.add("hidden");
    replayStartBtn.disabled = true;
  }
});

socket.on("question", (data) => {
  gameState.round = data.round;
  currentQuestionId = data.question.id;
  answering = true;
  questionStartTime = Date.now();
  timeLimitSeconds = data.timeLimitSeconds ?? timeLimitSeconds;
  isEliminatedSelf = isPlayerEliminated(myPlayerId);
  if (isEliminatedSelf) {
    answering = false;
  }
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
  const indexedChoices = (data.question.choices || []).map((text, idx) => ({
    originalIndex: idx,
    text,
  }));
  shuffleArray(indexedChoices);
  currentChoiceOrder = indexedChoices.map((c) => c.originalIndex);

  indexedChoices.forEach((choice, displayIndex) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.textContent = choice.text;
    btn.className = "choice-btn";
    btn.disabled = isEliminatedSelf;
    btn.addEventListener("click", () => {
      handleChoiceSelected(displayIndex);
    });
    li.appendChild(btn);
    choicesList.appendChild(li);
  });
  setChoiceButtonsDisabled(isEliminatedSelf);
});

socket.on("countdownStart", ({ seconds, difficulty }) => {
  if (!countdownOverlay || !countdownNumber) return;
  if (countdownTimerId !== null) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
  countdownOverlay.classList.remove("easy", "normal", "hard");
  const diff = (difficulty || "").toUpperCase();
  if (diff === "EASY") countdownOverlay.classList.add("easy");
  else if (diff === "NORMAL") countdownOverlay.classList.add("normal");
  else if (diff === "HARD") countdownOverlay.classList.add("hard");

  let remaining = seconds || 3;
  countdownNumber.textContent = remaining;
  countdownOverlay.classList.remove("hidden");

  countdownTimerId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
      countdownOverlay.classList.add("hidden");
    } else {
      countdownNumber.textContent = remaining;
    }
  }, 1000);
});

socket.on("roundResult", (data) => {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  resultSection.classList.remove("hidden");
  nextRoundBtn.classList.add("hidden");

  if (data.players && Array.isArray(data.players)) {
    playersState = data.players;
  } else {
    playersState = mergeHpUpdate(playersState, data);
  }
  isEliminatedSelf = isPlayerEliminated(myPlayerId);
  renderHpStatus(playersState, myPlayerId);
  setChoiceButtonsDisabled(isEliminatedSelf);

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

  // 結果用に問題と選択肢を再描画（ハイライト付き）
  renderResultQuestion(data);
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
  setChoiceButtonsDisabled(true);
  showFinalResult(data);
});

startGameWithHpBtn.addEventListener("click", () => {
  if (!isRoomOwner) return;

  const hpInputs = hpInputsContainer?.querySelectorAll("input[data-player-id]") || [];
  const hpMap = {};
  let invalid = false;
  hpInputs.forEach((input) => {
    const pid = input.dataset.playerId;
    const val = parseInt(input.value, 10) || 20;
    if (val <= 0) {
      invalid = true;
    }
    if (pid) {
      hpMap[pid] = val;
    }
  });

  if (invalid) {
    alert("HPは1以上の数値を指定してください。");
    return;
  }

  hpConfigStatus.textContent = "サーバーへHP設定を送信中...";

  socket.emit("configureRoomAndStart", {
    roomId,
    initialHp: hpMap,
  });
});

nextRoundBtn.addEventListener("click", () => {
  socket.emit("nextQuestion", { roomId });
});

reloadBtn.addEventListener("click", () => {
  window.location.reload();
});

if (replayReadyBtn) {
  replayReadyBtn.addEventListener("click", () => {
    replayReadyBtn.disabled = true;
    socket.emit("replayReady", { roomId });
  });
}

if (replayStartBtn) {
  replayStartBtn.addEventListener("click", () => {
    replayStartBtn.disabled = true;
    socket.emit("startReplay", { roomId });
  });
}

function updateHpBars() {
  // deprecated
}

function showFinalResult(info) {
  finalSection.classList.remove("hidden");
  const { winner, reason, yourHp, opponentHp } = info;
  finalResultTitle.textContent = winner === "you" ? "あなたの勝ち！" : winner === "draw" ? "引き分け" : "あなたの負け...";
  finalResultDetail.textContent = `理由: ${reason} / あなたHP=${yourHp}, 相手HP=${opponentHp}`;
  if (replayReadyBtn) replayReadyBtn.classList.remove("hidden");
  if (replayReadyBtn) replayReadyBtn.disabled = false;
  if (replayStartBtn) {
    replayStartBtn.classList.remove("hidden");
    replayStartBtn.disabled = true;
    if (!isRoomOwner) {
      replayStartBtn.classList.add("hidden");
    }
  }
}

function renderHpInputs(players) {
  if (!hpInputsContainer) return;
  hpInputsContainer.innerHTML = "";
  const list = players && Array.isArray(players) ? players : [];
  list.forEach((player, idx) => {
    const row = document.createElement("div");
    row.className = "field-row";

    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = `${player.name || `プレイヤー${idx + 1}`} のHP:`;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "200";
    input.value = 20;
    input.dataset.playerId = player.id;

    label.appendChild(span);
    label.appendChild(input);
    row.appendChild(label);
    hpInputsContainer.appendChild(row);
  });
}

function renderHpStatus(players, myId) {
  if (!hpStatus) return;
  hpStatus.innerHTML = "";
  const list = Array.isArray(players) ? players : [];
  list.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "hp-row";
    const nameSpan = document.createElement("span");
    nameSpan.className = "hp-name";
    nameSpan.textContent = `${p.id === myId ? "★ " : ""}${p.name || `プレイヤー${idx + 1}`}`;

    const hpBarWrapper = document.createElement("div");
    hpBarWrapper.className = "hp-bar";
    const hpFill = document.createElement("div");
    hpFill.className = "hp-fill";
    const base = p.initialHp || p.hp || 1;
    const percent = Math.max(0, Math.min(100, (p.hp / base) * 100));
    hpFill.style.width = `${percent}%`;
    hpBarWrapper.appendChild(hpFill);

    const hpText = document.createElement("span");
    hpText.className = "hp-value";
    hpText.textContent = `${p.hp} / ${base}`;

    row.appendChild(nameSpan);
    row.appendChild(hpBarWrapper);
    row.appendChild(hpText);
    if (p.isEliminated || p.hp <= 0) {
      row.classList.add("eliminated");
    }
    hpStatus.appendChild(row);
  });
}

function mergeHpUpdate(current, data) {
  const list = Array.isArray(current) ? [...current] : [];
  if (data.you && data.opponent) {
    const updates = [
      { id: data.you.id || myPlayerId, hp: data.you.hp },
      { id: data.opponent.id, hp: data.opponent.hp },
    ];
    updates.forEach((u) => {
      if (!u.id) return;
      const idx = list.findIndex((p) => p.id === u.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], hp: u.hp, isEliminated: u.isEliminated ?? list[idx].isEliminated };
      } else {
        list.push({ id: u.id, name: "", hp: u.hp, initialHp: u.hp, isEliminated: u.isEliminated ?? false });
      }
    });
  }
  return list;
}

function isPlayerEliminated(playerId) {
  const me = playersState.find((p) => p.id === playerId);
  return !me ? false : me.hp <= 0 || me.isEliminated;
}

function setChoiceButtonsDisabled(disabled) {
  const buttons = document.querySelectorAll(".choice-btn, .choice-button");
  buttons.forEach((btn) => {
    btn.disabled = disabled;
  });
}

function handleChoiceSelected(displayIndex) {
  if (!answering) return;
  if (isEliminatedSelf) return;
  if (!currentQuestionId) return;
  answering = false;
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  const originalIndex =
    currentChoiceOrder && currentChoiceOrder[displayIndex] != null
      ? currentChoiceOrder[displayIndex]
      : displayIndex;
  const elapsedSec = (Date.now() - questionStartTime) / 1000;
  socket.emit("submitAnswer", {
    roomId,
    questionId: currentQuestionId,
    choiceIndex: originalIndex,
    elapsedSeconds: elapsedSec,
  });
  timerText.textContent = `回答送信済み（${elapsedSec.toFixed(1)} 秒）`;
}

function renderResultQuestion(data) {
  if (!data || !questionText || !choicesList) return;
  questionText.textContent = data.questionText || "";
  questionRules.textContent = "";
  choicesList.innerHTML = "";
  const choices = data.choices || [];
  const correctIdx = data.correctIndex;
  const myIdx = data.myAnswerIndex;

  choices.forEach((choice, idx) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.textContent = choice;
    btn.className = "choice-btn";
    btn.disabled = true;
    if (idx === correctIdx) {
      btn.classList.add("choice-correct");
    }
    if (myIdx != null && idx === myIdx) {
      btn.classList.add("choice-my-answer");
    }
    li.appendChild(btn);
    choicesList.appendChild(li);
  });
}
