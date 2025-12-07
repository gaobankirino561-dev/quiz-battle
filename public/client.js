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
  categories: null,
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

// Time Attack ゲーム状態
const timeAttackState = {
  active: false,
  totalMs: 30000,
  remainingMs: 30000,
  timerIntervalId: null,
  phase: "idle", // idle | loading | countdown | question | result | finished
  selectedGenres: [],
  selectedDifficulties: [],
  currentDifficulty: null,
  roundStartTime: 0,
  currentQuestion: null,
  lastTick: 0,
  countdownId: null,
  // スコア関連
  totalLimitSeconds: 30,
  scoreC: 0,
  totalAnswered: 0,
  totalCorrect: 0,
  history: [],
};

// Speedrun ゲーム状態
const speedrunState = {
  active: false,
  targetCorrect: 10,
  totalAnswered: 0,
  totalCorrect: 0,
  selectedGenres: [],
  selectedDifficulties: [],
  currentDifficulty: null,
  currentQuestion: null,
  phase: "idle", // idle | loading | countdown | question | result | finished
  elapsedMs: 0,
  timerIntervalId: null,
  countdownId: null,
  lastTick: 0,
  roundStartTime: 0,
  history: [],
};

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

// === root セクション参照 ===
const roomRoot = document.getElementById("room-root");
const soloRoot = document.getElementById("solo-root");

const nameSection = document.getElementById("name-section");
const roomSection = document.getElementById("room-section");
const roomSettingsPanel = document.getElementById("room-settings");
const hpSection = document.getElementById("hp-section");
const questionSection = document.getElementById("question-section");
const resultSection = document.getElementById("result-section");
const finalSection = document.getElementById("final-section");
const btnSoloMode = document.getElementById("btn-solo-mode");
const btnSoloBackToOnline = document.getElementById("btn-solo-back-to-online");
// === ソロ：タイムアタック関連 ===
const soloTimeAttackMenuSection = document.getElementById("solo-time-attack-menu");
const soloTimeAttackConfigSection = document.getElementById("solo-time-attack-config");
const soloTimeAttackPlaySection = document.getElementById("solo-time-attack-play");
const btnTimeAttackConfigBack = document.getElementById("btn-time-attack-config-back");
const btnTimeAttackRules = document.getElementById("btn-time-attack-rules");
const btnTimeAttackStart = document.getElementById("btn-time-attack-start");
const btnTimeAttackBegin = document.getElementById("btn-time-attack-begin");
const timeAttackRulesPanel = document.getElementById("solo-time-attack-rules-panel");
const inputTimeAttackLimitSeconds = document.getElementById("time-attack-limit-seconds");
const timeAttackRemainingDisplay = document.getElementById("time-attack-remaining-display");
const timeAttackDifficultyLabel = document.getElementById("time-attack-difficulty-label");
const timeAttackCountdownEl = document.getElementById("time-attack-countdown");
const timeAttackQuestionArea = document.getElementById("time-attack-question-area");
const timeAttackQuestionText = document.getElementById("time-attack-question-text");
const timeAttackAnswerButtonsContainer = document.getElementById("time-attack-answer-buttons");
const timeAttackResult = document.getElementById("time-attack-result");
const timeAttackResultMessage = document.getElementById("time-attack-result-message");
// === Solo: Time Attack Result ===
const soloTimeAttackResultSection = document.getElementById("solo-time-attack-result");
const timeAttackFinalScore = document.getElementById("time-attack-final-score");
const timeAttackCorrectCount = document.getElementById("time-attack-correct-count");
const timeAttackTotalCount = document.getElementById("time-attack-total-count");
const timeAttackHistoryList = document.getElementById("time-attack-history-list");
const btnTimeAttackResultBackConfig = document.getElementById("btn-time-attack-result-back-config");
const btnTimeAttackResultRestart = document.getElementById("btn-time-attack-result-restart");
// === Solo: Time Attack genre ALL & controls ===
const btnTimeAttackGenreAll = document.getElementById("btn-time-attack-genre-all");
const btnTimeAttackPause = document.getElementById("btn-time-attack-pause");
const btnTimeAttackRestart = document.getElementById("btn-time-attack-restart");
// === Solo: Speedrun ===
const soloSpeedrunMenuSection = document.getElementById("solo-speedrun-menu");
const soloSpeedrunRulesPanel = document.getElementById("solo-speedrun-rules-panel");
const btnSpeedrunRules = document.getElementById("btn-speedrun-rules");
const btnSpeedrunStart = document.getElementById("btn-speedrun-start");
const soloSpeedrunConfigSection = document.getElementById("solo-speedrun-config");
const btnSpeedrunConfigBack = document.getElementById("btn-speedrun-config-back");
const inputSpeedrunTargetCorrect = document.getElementById("speedrun-target-correct");
const btnSpeedrunGenreAll = document.getElementById("btn-speedrun-genre-all");
const btnSpeedrunBegin = document.getElementById("btn-speedrun-begin");
const soloSpeedrunPlaySection = document.getElementById("solo-speedrun-play");
const speedrunElapsedDisplay = document.getElementById("speedrun-elapsed-display");
const speedrunProgressDisplay = document.getElementById("speedrun-progress-display");
const speedrunDifficultyLabel = document.getElementById("speedrun-difficulty-label");
const speedrunCountdownEl = document.getElementById("speedrun-countdown");
const speedrunQuestionArea = document.getElementById("speedrun-question-area");
const speedrunQuestionText = document.getElementById("speedrun-question-text");
const speedrunAnswerButtonsContainer = document.getElementById("speedrun-answer-buttons");
const speedrunResult = document.getElementById("speedrun-result");
const speedrunResultMessage = document.getElementById("speedrun-result-message");
const btnSpeedrunPause = document.getElementById("btn-speedrun-pause");
const btnSpeedrunRestart = document.getElementById("btn-speedrun-restart");
const soloSpeedrunResultSection = document.getElementById("solo-speedrun-result");
const speedrunFinalScore = document.getElementById("speedrun-final-score");
const speedrunFinalTime = document.getElementById("speedrun-final-time");
const speedrunCorrectCount = document.getElementById("speedrun-correct-count");
const speedrunTotalCount = document.getElementById("speedrun-total-count");
const speedrunHistoryList = document.getElementById("speedrun-history-list");
const btnSpeedrunResultBackConfig = document.getElementById("btn-speedrun-result-back-config");
const btnSpeedrunResultRestart = document.getElementById("btn-speedrun-result-restart");

const hpStatus = document.getElementById("hp-status");
const roundInfo = document.getElementById("roundInfo");

const questionText = document.getElementById("questionText");
const choicesList = document.getElementById("choicesList");
const timerText = document.getElementById("timerText");
const questionRules = document.getElementById("questionRules");
const skipAnswerBtn = document.getElementById("skipAnswerBtn");
const countdownOverlay = document.getElementById("countdown-overlay");
const countdownNumber = document.getElementById("countdown-number");
const countdownLabel = document.getElementById("countdown-label");

const roundResultText = document.getElementById("roundResultText");
const correctAnswerText = document.getElementById("correctAnswerText");
const roundResultList = document.getElementById("round-result-list");
const nextRoundBtn = document.getElementById("nextRoundBtn");
const nextReadyBtn = document.getElementById("nextReadyBtn");
const nextWaitText = document.getElementById("nextWaitText");
const readyBar = document.querySelector(".ready-bar");

const finalResultTitle = document.getElementById("finalResultTitle");
const finalResultDetail = document.getElementById("finalResultDetail");
const reloadBtn = document.getElementById("reloadBtn");

const genreCheckboxes = document.querySelectorAll('input[name="genre"]');
const genreAllToggle = document.getElementById("genre-all-toggle");
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

/**
 * オンライン対戦画面（roomRoot）を表示し、ソロモード画面（soloRoot）を隠す
 */
function showOnlineModeScreen() {
  if (!roomRoot || !soloRoot) {
    console.warn("showOnlineModeScreen: roomRoot or soloRoot not found");
    return;
  }
  stopTimeAttackLoop();
  timeAttackState.active = false;
  timeAttackState.phase = "idle";
  stopSpeedrunLoop();
  speedrunState.active = false;
  speedrunState.phase = "idle";
  roomRoot.classList.remove("hidden");
  soloRoot.classList.add("hidden");
}

/**
 * ソロモード画面（soloRoot）を表示し、オンライン対戦画面（roomRoot）を隠す
 */
function showSoloModeScreen() {
  if (!roomRoot || !soloRoot) {
    console.warn("showSoloModeScreen: roomRoot or soloRoot not found");
    return;
  }
  roomRoot.classList.add("hidden");
  soloRoot.classList.remove("hidden");
  resetTimeAttackToMenu();
  resetSpeedrunToMenu();
}

function resetTimeAttackToMenu() {
  stopTimeAttackLoop();
  timeAttackState.active = false;
  timeAttackState.phase = "idle";
  const limitMs = getTimeAttackLimitMs();
  timeAttackState.totalMs = limitMs;
  timeAttackState.remainingMs = limitMs;
  timeAttackState.currentQuestion = null;
  timeAttackState.currentDifficulty = null;
  timeAttackState.scoreC = 0;
  timeAttackState.totalAnswered = 0;
  timeAttackState.totalCorrect = 0;
  timeAttackState.history = [];
  updateTimeAttackTimerDisplay();
  updateTimeAttackDifficultyLabel(null);
  applyDifficultyClassesToCountdown(null);
  if (soloTimeAttackMenuSection) soloTimeAttackMenuSection.classList.remove("hidden");
  if (soloTimeAttackConfigSection) soloTimeAttackConfigSection.classList.add("hidden");
  if (soloTimeAttackPlaySection) soloTimeAttackPlaySection.classList.add("hidden");
  if (timeAttackRulesPanel) timeAttackRulesPanel.classList.add("hidden");
  if (timeAttackCountdownEl) timeAttackCountdownEl.classList.add("hidden");
  if (timeAttackResult) timeAttackResult.classList.add("hidden");
  if (timeAttackAnswerButtonsContainer) timeAttackAnswerButtonsContainer.innerHTML = "";
}

function resetSpeedrunToMenu() {
  stopSpeedrunLoop();
  speedrunState.active = false;
  speedrunState.phase = "idle";
  speedrunState.targetCorrect = getSpeedrunTargetCorrect();
  speedrunState.totalCorrect = 0;
  speedrunState.totalAnswered = 0;
  speedrunState.elapsedMs = 0;
  speedrunState.currentQuestion = null;
  speedrunState.currentDifficulty = null;
  speedrunState.history = [];
  updateSpeedrunTimerDisplay();
  updateSpeedrunProgressDisplay();
  updateSpeedrunDifficultyLabel(null);
  if (soloSpeedrunMenuSection) soloSpeedrunMenuSection.classList.remove("hidden");
  if (soloSpeedrunConfigSection) soloSpeedrunConfigSection.classList.add("hidden");
  if (soloSpeedrunPlaySection) soloSpeedrunPlaySection.classList.add("hidden");
  if (soloSpeedrunResultSection) soloSpeedrunResultSection.classList.add("hidden");
  if (soloSpeedrunRulesPanel) soloSpeedrunRulesPanel.classList.add("hidden");
  if (speedrunCountdownEl) speedrunCountdownEl.classList.add("hidden");
  if (speedrunResult) speedrunResult.classList.add("hidden");
  if (speedrunAnswerButtonsContainer) speedrunAnswerButtonsContainer.innerHTML = "";
}

function getTimeAttackSelectedGenres() {
  const genreInputs = document.querySelectorAll('input[name="time-attack-genre"]:checked');
  return Array.from(genreInputs).map((el) => el.value);
}

function getTimeAttackSelectedDifficulties() {
  const diffInputs = document.querySelectorAll('input[name="time-attack-difficulty"]:checked');
  return Array.from(diffInputs).map((el) => el.value);
}

function getTimeAttackLimitMs() {
  if (!inputTimeAttackLimitSeconds) return 30000;
  const sec = Number(inputTimeAttackLimitSeconds.value) || 30;
  const clamped = Math.min(Math.max(sec, 10), 300);
  return clamped * 1000;
}

function updateTimeAttackTimerDisplay() {
  if (!timeAttackRemainingDisplay) return;
  const sec = Math.max(timeAttackState.remainingMs, 0) / 1000;
  timeAttackRemainingDisplay.textContent = sec.toFixed(1);
}

function updateTimeAttackDifficultyLabel(difficulty) {
  if (!timeAttackDifficultyLabel) return;
  timeAttackDifficultyLabel.classList.remove("difficulty-easy", "difficulty-normal", "difficulty-hard");
  let labelText = "難易度: -";
  const normalized = typeof difficulty === "string" ? difficulty.toLowerCase() : "";
  if (normalized === "easy") {
    labelText = "難易度: EASY";
    timeAttackDifficultyLabel.classList.add("difficulty-easy");
  } else if (normalized === "normal") {
    labelText = "難易度: NORMAL";
    timeAttackDifficultyLabel.classList.add("difficulty-normal");
  } else if (normalized === "hard") {
    labelText = "難易度: HARD";
    timeAttackDifficultyLabel.classList.add("difficulty-hard");
  }
  timeAttackDifficultyLabel.textContent = labelText;
}

function applyDifficultyClassesToCountdown(difficulty) {
  if (!timeAttackCountdownEl) return;
  timeAttackCountdownEl.classList.remove("difficulty-easy", "difficulty-normal", "difficulty-hard");
  const normalized = typeof difficulty === "string" ? difficulty.toLowerCase() : "";
  if (normalized === "easy") {
    timeAttackCountdownEl.classList.add("difficulty-easy");
  } else if (normalized === "normal") {
    timeAttackCountdownEl.classList.add("difficulty-normal");
  } else if (normalized === "hard") {
    timeAttackCountdownEl.classList.add("difficulty-hard");
  }
}

// Speedrun helpers
function getSpeedrunTargetCorrect() {
  if (!inputSpeedrunTargetCorrect) return 10;
  const v = Number(inputSpeedrunTargetCorrect.value) || 10;
  return Math.min(Math.max(v, 1), 200);
}

function getSpeedrunSelectedGenres() {
  const nodes = document.querySelectorAll('input[name="speedrun-genre"]:checked');
  return Array.from(nodes).map((el) => el.value);
}

function getSpeedrunSelectedDifficulties() {
  const nodes = document.querySelectorAll('input[name="speedrun-difficulty"]:checked');
  return Array.from(nodes).map((el) => el.value);
}

function updateSpeedrunTimerDisplay() {
  if (!speedrunElapsedDisplay) return;
  const sec = speedrunState.elapsedMs / 1000;
  speedrunElapsedDisplay.textContent = sec.toFixed(1);
}

function updateSpeedrunProgressDisplay() {
  if (!speedrunProgressDisplay) return;
  speedrunProgressDisplay.textContent = `正解数: ${speedrunState.totalCorrect} / ${speedrunState.targetCorrect}`;
}

function updateSpeedrunDifficultyLabel(difficulty) {
  if (!speedrunDifficultyLabel) return;
  speedrunDifficultyLabel.classList.remove("difficulty-easy", "difficulty-normal", "difficulty-hard");
  let labelText = "難易度: -";
  const normalized = typeof difficulty === "string" ? difficulty.toLowerCase() : "";
  if (normalized === "easy") {
    labelText = "難易度: EASY";
    speedrunDifficultyLabel.classList.add("difficulty-easy");
  } else if (normalized === "normal") {
    labelText = "難易度: NORMAL";
    speedrunDifficultyLabel.classList.add("difficulty-normal");
  } else if (normalized === "hard") {
    labelText = "難易度: HARD";
    speedrunDifficultyLabel.classList.add("difficulty-hard");
  }
  speedrunDifficultyLabel.textContent = labelText;
}

function ensureTimeAttackTimerLoop() {
  if (timeAttackState.timerIntervalId != null) return;
  timeAttackState.lastTick = window.performance.now();
  timeAttackState.timerIntervalId = window.setInterval(() => {
    if (!timeAttackState.active) return;
    const now = window.performance.now();
    const delta = now - (timeAttackState.lastTick || now);
    timeAttackState.lastTick = now;
    if (timeAttackState.phase !== "question") {
      return;
    }
    timeAttackState.remainingMs -= delta;
    if (timeAttackState.remainingMs <= 0) {
      timeAttackState.remainingMs = 0;
      updateTimeAttackTimerDisplay();
      finishTimeAttack();
    } else {
      updateTimeAttackTimerDisplay();
    }
  }, 100);
}

function stopTimeAttackLoop() {
  if (timeAttackState.timerIntervalId != null) {
    clearInterval(timeAttackState.timerIntervalId);
    timeAttackState.timerIntervalId = null;
  }
  if (timeAttackState.countdownId != null) {
    clearInterval(timeAttackState.countdownId);
    timeAttackState.countdownId = null;
  }
}

function ensureSpeedrunTimerLoop() {
  if (speedrunState.timerIntervalId != null) return;
  speedrunState.lastTick = window.performance.now();
  speedrunState.timerIntervalId = window.setInterval(() => {
    if (!speedrunState.active) return;
    const now = window.performance.now();
    const delta = now - (speedrunState.lastTick || now);
    speedrunState.lastTick = now;
    if (speedrunState.phase !== "finished") {
      speedrunState.elapsedMs += delta;
      updateSpeedrunTimerDisplay();
    }
  }, 100);
}

function stopSpeedrunLoop() {
  if (speedrunState.timerIntervalId != null) {
    clearInterval(speedrunState.timerIntervalId);
    speedrunState.timerIntervalId = null;
  }
  if (speedrunState.countdownId != null) {
    clearInterval(speedrunState.countdownId);
    speedrunState.countdownId = null;
  }
}

function beginTimeAttackGame() {
  stopTimeAttackLoop();
  const genres = getTimeAttackSelectedGenres();
  const difficulties = getTimeAttackSelectedDifficulties();
  const limitMs = getTimeAttackLimitMs();

  if (genres.length === 0 || difficulties.length === 0) {
    alert("ジャンルと難易度を少なくとも1つずつ選択してください。");
    return;
  }

  timeAttackState.active = true;
  timeAttackState.totalMs = limitMs;
  timeAttackState.remainingMs = limitMs;
  timeAttackState.totalLimitSeconds = limitMs / 1000;
  timeAttackState.phase = "idle";
  timeAttackState.selectedGenres = genres;
  timeAttackState.selectedDifficulties = difficulties;
  timeAttackState.currentDifficulty = null;
  timeAttackState.roundStartTime = 0;
  timeAttackState.lastTick = window.performance.now();
  timeAttackState.currentQuestion = null;
  timeAttackState.scoreC = 0;
  timeAttackState.totalAnswered = 0;
  timeAttackState.totalCorrect = 0;
  timeAttackState.history = [];
  timeAttackResult?.classList.add("hidden");
  timeAttackQuestionArea?.classList.add("hidden");

  updateTimeAttackTimerDisplay();
  updateTimeAttackDifficultyLabel(null);

  if (soloTimeAttackConfigSection && soloTimeAttackPlaySection) {
    soloTimeAttackConfigSection.classList.add("hidden");
    soloTimeAttackPlaySection.classList.remove("hidden");
  }

  ensureTimeAttackTimerLoop();
  startTimeAttackRound();
}

function finishTimeAttack() {
  if (!timeAttackState.active && timeAttackState.phase === "finished") return;
  timeAttackState.active = false;
  timeAttackState.phase = "finished";
  timeAttackState.currentQuestion = null;
  stopTimeAttackLoop();
  if (timeAttackCountdownEl) {
    timeAttackCountdownEl.classList.add("hidden");
  }
  if (timeAttackQuestionArea) {
    timeAttackQuestionArea.classList.add("hidden");
  }
  if (timeAttackResult) {
    timeAttackResult.classList.add("hidden");
  }
  if (soloTimeAttackPlaySection) {
    soloTimeAttackPlaySection.classList.add("hidden");
  }
  if (soloTimeAttackResultSection) {
    soloTimeAttackResultSection.classList.remove("hidden");
  }

  const T =
    timeAttackState.totalLimitSeconds && timeAttackState.totalLimitSeconds > 0
      ? timeAttackState.totalLimitSeconds
      : timeAttackState.totalMs / 1000 || 30;
  const rawScore = (200 * timeAttackState.scoreC) / T;
  const finalScore = Math.round(rawScore);

  if (timeAttackFinalScore) {
    timeAttackFinalScore.textContent = String(finalScore);
  }
  if (timeAttackCorrectCount) {
    timeAttackCorrectCount.textContent = String(timeAttackState.totalCorrect);
  }
  if (timeAttackTotalCount) {
    timeAttackTotalCount.textContent = String(timeAttackState.totalAnswered);
  }

  if (timeAttackHistoryList) {
    timeAttackHistoryList.innerHTML = "";
    timeAttackState.history.forEach((entry, index) => {
      const li = document.createElement("li");

      const qSpan = document.createElement("span");
      qSpan.className = "history-question";
      qSpan.textContent = `${index + 1}. [${(entry.difficulty || "-").toUpperCase()}] ${entry.questionText}`;

      const sSpan = document.createElement("span");
      sSpan.className = "history-status " + (entry.isCorrect ? "correct" : "wrong");
      sSpan.textContent = entry.isCorrect ? "○ 正解" : "× 不正解";

      li.appendChild(qSpan);
      li.appendChild(sSpan);
      timeAttackHistoryList.appendChild(li);
    });
  }
}

function startTimeAttackRound() {
  if (!timeAttackState.active) return;
  if (timeAttackState.remainingMs <= 0) {
    finishTimeAttack();
    return;
  }
  const ds = timeAttackState.selectedDifficulties || [];
  if (!ds.length) {
    console.warn("Time Attack: selectedDifficulties is empty");
    finishTimeAttack();
    return;
  }
  const difficulty = ds[Math.floor(Math.random() * ds.length)];
  timeAttackState.currentDifficulty = difficulty;
  timeAttackState.currentQuestion = null;

  updateTimeAttackDifficultyLabel(difficulty);
  applyDifficultyClassesToCountdown(difficulty);

  timeAttackState.phase = "countdown";
  if (timeAttackCountdownEl) {
    timeAttackCountdownEl.classList.remove("hidden");
  }
  if (timeAttackQuestionArea) {
    timeAttackQuestionArea.classList.add("hidden");
  }
  if (timeAttackResult) {
    timeAttackResult.classList.add("hidden");
  }

  let count = 3;
  if (timeAttackState.countdownId != null) {
    clearInterval(timeAttackState.countdownId);
  }

  const updateCountdownText = () => {
    const diffText =
      typeof difficulty === "string"
        ? (() => {
            const d = difficulty.toLowerCase();
            if (d === "easy") return "EASY";
            if (d === "normal") return "NORMAL";
            if (d === "hard") return "HARD";
            return difficulty;
          })()
        : "-";
    if (timeAttackCountdownEl) {
      timeAttackCountdownEl.textContent = `${diffText} ${count}`;
    }
  };

  updateCountdownText();

  timeAttackState.countdownId = window.setInterval(() => {
    count -= 1;
    if (count > 0) {
      updateCountdownText();
    } else {
      if (timeAttackState.countdownId != null) {
        clearInterval(timeAttackState.countdownId);
        timeAttackState.countdownId = null;
      }
      if (timeAttackCountdownEl) {
        timeAttackCountdownEl.classList.add("hidden");
      }
      showNextTimeAttackQuestion();
    }
  }, 1000);
}

function fetchTimeAttackQuestion() {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error("ソケット未接続のため問題を取得できません"));
      return;
    }
    const diff =
      timeAttackState.currentDifficulty != null
        ? [String(timeAttackState.currentDifficulty).toUpperCase()]
        : (timeAttackState.selectedDifficulties || []).map((d) => String(d).toUpperCase());
    const payload = {
      genres: timeAttackState.selectedGenres,
      difficulties: diff,
    };
    try {
      socket.emit("timeAttackNextQuestion", payload, (res) => {
        if (!res || res.error) {
          reject(new Error(res?.error || "問題取得に失敗しました"));
        } else {
          resolve(res);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function showNextTimeAttackQuestion() {
  if (!timeAttackState.active) return;
  if (timeAttackState.remainingMs <= 0) {
    finishTimeAttack();
    return;
  }

  // 前の問題のハイライトをリセット
  if (timeAttackAnswerButtonsContainer) {
    const prevButtons = Array.from(timeAttackAnswerButtonsContainer.children);
    prevButtons.forEach((btn) => btn.classList.remove("correct-answer"));
  }

  timeAttackState.phase = "loading";
  updateTimeAttackTimerDisplay();

  if (timeAttackQuestionArea) {
    timeAttackQuestionArea.classList.add("hidden");
  }

  let questionData = null;
  try {
    questionData = await fetchTimeAttackQuestion();
  } catch (err) {
    console.error(err);
    finishTimeAttack();
    return;
  }

  if (!questionData || !questionData.question || !Array.isArray(questionData.choices)) {
    console.warn("Time Attack questionData が取得できませんでした");
    finishTimeAttack();
    return;
  }

  timeAttackState.currentQuestion = questionData;
  const qDifficulty = questionData.difficulty || timeAttackState.currentDifficulty;
  timeAttackState.currentDifficulty = qDifficulty;
  updateTimeAttackDifficultyLabel(qDifficulty);
  applyDifficultyClassesToCountdown(qDifficulty);

  if (timeAttackQuestionText) {
    timeAttackQuestionText.textContent = questionData.question;
  }

  if (timeAttackAnswerButtonsContainer) {
    timeAttackAnswerButtonsContainer.innerHTML = "";
    questionData.choices.forEach((choiceText, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "solo-answer-button";
      btn.textContent = choiceText;
      btn.addEventListener("click", () => {
        handleTimeAttackAnswer(index, questionData);
      });
      timeAttackAnswerButtonsContainer.appendChild(btn);
    });
  }

  if (timeAttackQuestionArea) {
    timeAttackQuestionArea.classList.remove("hidden");
  }

  timeAttackState.phase = "question";
  timeAttackState.roundStartTime = window.performance.now();
  timeAttackState.lastTick = timeAttackState.roundStartTime;
}

function handleTimeAttackAnswer(selectedIndex, questionData) {
  if (!timeAttackState.active) return;
  if (timeAttackState.phase !== "question") return;

  const now = window.performance.now();
  const delta = now - (timeAttackState.lastTick || now);
  timeAttackState.lastTick = now;
  timeAttackState.remainingMs -= delta;
  if (timeAttackState.remainingMs < 0) {
    timeAttackState.remainingMs = 0;
  }
  updateTimeAttackTimerDisplay();

  timeAttackState.phase = "result";

  const q = questionData || timeAttackState.currentQuestion;
  const correctIndex = q && typeof q.correctIndex === "number" ? q.correctIndex : null;
  const isCorrect = correctIndex != null && selectedIndex === correctIndex;

  const difficulty = (q && q.difficulty) || timeAttackState.currentDifficulty || "normal";
  let deltaC = 0;
  if (difficulty === "easy") {
    deltaC = isCorrect ? 0.5 : -1.5;
  } else if (difficulty === "hard") {
    deltaC = isCorrect ? 1.5 : -0.5;
  } else {
    deltaC = isCorrect ? 1.0 : -1.0;
  }

  timeAttackState.scoreC += deltaC;
  timeAttackState.totalAnswered += 1;
  if (isCorrect) {
    timeAttackState.totalCorrect += 1;
  }

  const qText = q && q.text ? q.text : "（問題文不明）";
  timeAttackState.history.push({
    questionText: qText,
    difficulty,
    isCorrect,
  });

  // 正解ボタンをハイライト
  if (correctIndex != null && timeAttackAnswerButtonsContainer && timeAttackAnswerButtonsContainer.children.length > 0) {
    const buttons = Array.from(timeAttackAnswerButtonsContainer.children);
    buttons.forEach((btn, index) => {
      btn.classList.remove("correct-answer");
      if (index === correctIndex) {
        btn.classList.add("correct-answer");
      }
    });
  }

  let message = "";
  if (isCorrect) {
    message = "正解！";
  } else {
    const correctText = correctIndex != null && q?.choices ? q.choices[correctIndex] : "（正解不明）";
    message = `不正解… 正解は「${correctText}」でした。`;
  }

  if (timeAttackResult && timeAttackResultMessage) {
    timeAttackResultMessage.textContent = message;
    timeAttackResult.classList.remove("hidden");
  }
  if (timeAttackAnswerButtonsContainer && correctIndex != null) {
    const btns = Array.from(timeAttackAnswerButtonsContainer.querySelectorAll("button"));
    btns.forEach((btn, idx) => {
      if (idx === correctIndex) {
        btn.classList.add("solo-answer-correct");
      }
    });
  }
  if (timeAttackAnswerButtonsContainer) {
    Array.from(timeAttackAnswerButtonsContainer.querySelectorAll("button")).forEach((btn) => {
      btn.disabled = true;
    });
  }

  if (timeAttackState.remainingMs <= 0) {
    finishTimeAttack();
    return;
  }

  window.setTimeout(() => {
    if (!timeAttackState.active) return;
    startTimeAttackRound();
  }, 1500);
}

// Speedrun
function applyDifficultyClassesToSpeedrunCountdown(difficulty) {
  if (!speedrunCountdownEl) return;
  speedrunCountdownEl.classList.remove("difficulty-easy", "difficulty-normal", "difficulty-hard");
  const normalized = typeof difficulty === "string" ? difficulty.toLowerCase() : "";
  if (normalized === "easy") {
    speedrunCountdownEl.classList.add("difficulty-easy");
  } else if (normalized === "normal") {
    speedrunCountdownEl.classList.add("difficulty-normal");
  } else if (normalized === "hard") {
    speedrunCountdownEl.classList.add("difficulty-hard");
  }
}

function beginSpeedrunGame() {
  stopSpeedrunLoop();
  const genres = getSpeedrunSelectedGenres();
  const difficulties = getSpeedrunSelectedDifficulties();
  const target = getSpeedrunTargetCorrect();

  if (genres.length === 0 || difficulties.length === 0) {
    alert("ジャンルと難易度を少なくとも1つずつ選択してください。");
    return;
  }

  speedrunState.active = true;
  speedrunState.phase = "idle";
  speedrunState.selectedGenres = genres;
  speedrunState.selectedDifficulties = difficulties;
  speedrunState.targetCorrect = target;
  speedrunState.totalCorrect = 0;
  speedrunState.totalAnswered = 0;
  speedrunState.elapsedMs = 0;
  speedrunState.currentDifficulty = null;
  speedrunState.currentQuestion = null;
  speedrunState.history = [];
  speedrunState.lastTick = window.performance.now();
  speedrunState.roundStartTime = 0;

  updateSpeedrunTimerDisplay();
  updateSpeedrunProgressDisplay();
  updateSpeedrunDifficultyLabel(null);
  if (speedrunResult) speedrunResult.classList.add("hidden");
  if (speedrunQuestionArea) speedrunQuestionArea.classList.add("hidden");

  if (soloSpeedrunConfigSection && soloSpeedrunPlaySection) {
    soloSpeedrunConfigSection.classList.add("hidden");
    soloSpeedrunPlaySection.classList.remove("hidden");
  }
  if (soloSpeedrunResultSection) {
    soloSpeedrunResultSection.classList.add("hidden");
  }

  ensureSpeedrunTimerLoop();
  startSpeedrunRound();
}

function finishSpeedrun() {
  if (!speedrunState.active && speedrunState.phase === "finished") return;
  speedrunState.active = false;
  speedrunState.phase = "finished";
  stopSpeedrunLoop();

  if (speedrunCountdownEl) speedrunCountdownEl.classList.add("hidden");
  if (speedrunQuestionArea) speedrunQuestionArea.classList.add("hidden");
  if (speedrunResult) speedrunResult.classList.add("hidden");

  if (soloSpeedrunPlaySection) soloSpeedrunPlaySection.classList.add("hidden");
  if (soloSpeedrunResultSection) soloSpeedrunResultSection.classList.remove("hidden");

  const timeSec = Math.max(speedrunState.elapsedMs, 0) / 1000;
  const finalTime = timeSec.toFixed(1);
  const finalScore = (speedrunState.targetCorrect * 12 - timeSec).toFixed(1);

  if (speedrunFinalScore) speedrunFinalScore.textContent = String(finalScore);
  if (speedrunFinalTime) speedrunFinalTime.textContent = finalTime;
  if (speedrunCorrectCount) speedrunCorrectCount.textContent = String(speedrunState.totalCorrect);
  if (speedrunTotalCount) speedrunTotalCount.textContent = String(speedrunState.totalAnswered);

  if (speedrunHistoryList) {
    speedrunHistoryList.innerHTML = "";
    speedrunState.history.forEach((entry, index) => {
      const li = document.createElement("li");
      const qSpan = document.createElement("span");
      qSpan.className = "history-question";
      qSpan.textContent = `${index + 1}. [${(entry.difficulty || "-").toUpperCase()}] ${entry.questionText}`;

      const sSpan = document.createElement("span");
      sSpan.className = "history-status " + (entry.isCorrect ? "correct" : "wrong");
      sSpan.textContent = entry.isCorrect ? "○ 正解" : "× 不正解";

      li.appendChild(qSpan);
      li.appendChild(sSpan);
      speedrunHistoryList.appendChild(li);
    });
  }
}

function startSpeedrunRound() {
  if (!speedrunState.active) return;
  if (speedrunState.totalCorrect >= speedrunState.targetCorrect) {
    finishSpeedrun();
    return;
  }

  const ds = speedrunState.selectedDifficulties || [];
  if (!ds.length) {
    console.warn("Speedrun: selectedDifficulties is empty");
    finishSpeedrun();
    return;
  }
  const difficulty = ds[Math.floor(Math.random() * ds.length)];
  speedrunState.currentDifficulty = difficulty;
  speedrunState.currentQuestion = null;

  updateSpeedrunDifficultyLabel(difficulty);
  applyDifficultyClassesToSpeedrunCountdown(difficulty);

  speedrunState.phase = "countdown";
  if (speedrunCountdownEl) {
    speedrunCountdownEl.classList.remove("hidden");
  }
  if (speedrunQuestionArea) speedrunQuestionArea.classList.add("hidden");
  if (speedrunResult) speedrunResult.classList.add("hidden");

  let count = 3;
  if (speedrunState.countdownId != null) {
    clearInterval(speedrunState.countdownId);
  }

  const updateCountdownText = () => {
    const diffText =
      typeof difficulty === "string"
        ? (() => {
            const d = difficulty.toLowerCase();
            if (d === "easy") return "EASY";
            if (d === "normal") return "NORMAL";
            if (d === "hard") return "HARD";
            return difficulty;
          })()
        : "-";
    if (speedrunCountdownEl) {
      speedrunCountdownEl.textContent = `${diffText} ${count}`;
    }
  };

  updateCountdownText();

  speedrunState.countdownId = window.setInterval(() => {
    count -= 1;
    if (count > 0) {
      updateCountdownText();
    } else {
      if (speedrunState.countdownId != null) {
        clearInterval(speedrunState.countdownId);
        speedrunState.countdownId = null;
      }
      if (speedrunCountdownEl) {
        speedrunCountdownEl.classList.add("hidden");
      }
      showNextSpeedrunQuestion();
    }
  }, 1000);
}

function fetchSpeedrunQuestion() {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error("ソケット未接続のため問題を取得できません"));
      return;
    }
    const diff =
      speedrunState.currentDifficulty != null
        ? [String(speedrunState.currentDifficulty).toUpperCase()]
        : (speedrunState.selectedDifficulties || []).map((d) => String(d).toUpperCase());
    const payload = {
      genres: speedrunState.selectedGenres,
      difficulties: diff,
    };
    try {
      socket.emit("timeAttackNextQuestion", payload, (res) => {
        if (!res || res.error) {
          reject(new Error(res?.error || "問題取得に失敗しました"));
        } else {
          resolve(res);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function showNextSpeedrunQuestion() {
  if (!speedrunState.active) return;
  if (speedrunState.totalCorrect >= speedrunState.targetCorrect) {
    finishSpeedrun();
    return;
  }

  if (speedrunAnswerButtonsContainer) {
    const prevButtons = Array.from(speedrunAnswerButtonsContainer.children);
    prevButtons.forEach((btn) => btn.classList.remove("correct-answer"));
  }

  speedrunState.phase = "loading";
  updateSpeedrunTimerDisplay();
  updateSpeedrunProgressDisplay();
  if (speedrunQuestionArea) {
    speedrunQuestionArea.classList.add("hidden");
  }

  let questionData = null;
  try {
    questionData = await fetchSpeedrunQuestion();
  } catch (err) {
    console.error(err);
    finishSpeedrun();
    return;
  }

  if (!questionData || !questionData.question || !Array.isArray(questionData.choices)) {
    console.warn("Speedrun questionData が取得できませんでした");
    finishSpeedrun();
    return;
  }

  speedrunState.currentQuestion = questionData;
  const qDifficulty = questionData.difficulty || speedrunState.currentDifficulty;
  speedrunState.currentDifficulty = qDifficulty;
  updateSpeedrunDifficultyLabel(qDifficulty);

  if (speedrunQuestionText) {
    speedrunQuestionText.textContent = questionData.question;
  }

  if (speedrunAnswerButtonsContainer) {
    speedrunAnswerButtonsContainer.innerHTML = "";
    questionData.choices.forEach((choiceText, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "solo-answer-button";
      btn.textContent = choiceText;
      btn.addEventListener("click", () => {
        handleSpeedrunAnswer(index, questionData);
      });
      speedrunAnswerButtonsContainer.appendChild(btn);
    });
  }

  if (speedrunQuestionArea) {
    speedrunQuestionArea.classList.remove("hidden");
  }

  speedrunState.phase = "question";
  speedrunState.roundStartTime = window.performance.now();
  speedrunState.lastTick = speedrunState.roundStartTime;
}

function handleSpeedrunAnswer(selectedIndex, questionData) {
  if (!speedrunState.active) return;
  if (speedrunState.phase !== "question") return;

  const now = window.performance.now();
  const delta = now - (speedrunState.lastTick || now);
  speedrunState.lastTick = now;
  speedrunState.elapsedMs += delta;
  updateSpeedrunTimerDisplay();

  speedrunState.phase = "result";

  const q = questionData || speedrunState.currentQuestion;
  const correctIndex = q && typeof q.correctIndex === "number" ? q.correctIndex : null;
  const isCorrect = correctIndex != null && selectedIndex === correctIndex;

  speedrunState.totalAnswered += 1;
  if (isCorrect) {
    speedrunState.totalCorrect += 1;
  }

  const qText = q && q.question ? q.question : q?.text ? q.text : "（問題文不明）";
  const difficulty = (q && q.difficulty) || speedrunState.currentDifficulty || "normal";
  speedrunState.history.push({
    questionText: qText,
    difficulty,
    isCorrect,
  });

  if (correctIndex != null && speedrunAnswerButtonsContainer && speedrunAnswerButtonsContainer.children.length > 0) {
    const buttons = Array.from(speedrunAnswerButtonsContainer.children);
    buttons.forEach((btn, index) => {
      btn.classList.remove("correct-answer");
      if (index === correctIndex) {
        btn.classList.add("correct-answer");
      }
      btn.disabled = true;
    });
  }

  const correctText = correctIndex != null && q?.choices ? q.choices[correctIndex] : "（正解不明）";
  let message = "";
  if (isCorrect) {
    message = "正解！";
  } else {
    message = `不正解… 正解は「${correctText}」でした。`;
  }
  if (speedrunResult && speedrunResultMessage) {
    speedrunResultMessage.textContent = message;
    speedrunResult.classList.remove("hidden");
  }

  updateSpeedrunProgressDisplay();

  if (speedrunState.totalCorrect >= speedrunState.targetCorrect) {
    finishSpeedrun();
    return;
  }

  window.setTimeout(() => {
    if (!speedrunState.active) return;
    startSpeedrunRound();
  }, 1500);
}

function getSelectedGenres() {
  const nodes = genreCheckboxes && genreCheckboxes.length ? genreCheckboxes : document.querySelectorAll('input[name="genre"]');
  const checked = Array.from(nodes).filter((el) => el.checked);
  return checked.map((el) => el.value);
}

function formatGenresForDisplay(categories) {
  if (!categories || categories.length === 0) {
    return "ALL";
  }
  return categories.join(" / ");
}

if (genreAllToggle) {
  genreAllToggle.addEventListener("click", () => {
    const boxes = genreCheckboxes && genreCheckboxes.length ? genreCheckboxes : document.querySelectorAll('input[name="genre"]');
    const allChecked = Array.from(boxes).every((cb) => cb.checked);
    boxes.forEach((cb) => {
      cb.checked = !allChecked;
    });
  });
}

function renderRoundStats(stats) {
  if (!roundResultList) return;
  roundResultList.innerHTML = "";
  const list = Array.isArray(stats) ? [...stats] : [];
  list.sort((a, b) => {
    const d = (a?.damage || 0) - (b?.damage || 0);
    if (d !== 0) return d;
    const ta = a && a.elapsedMs != null ? a.elapsedMs : Infinity;
    const tb = b && b.elapsedMs != null ? b.elapsedMs : Infinity;
    return ta - tb;
  });

  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "ラウンド結果のデータがありません";
    roundResultList.appendChild(li);
    return;
  }

  list.forEach((s, index) => {
    const li = document.createElement("li");
    const dmg = s?.damage ?? 0;
    const correctText = s?.isCorrect ? "正解" : "不正解";
    let timeText = "未回答";
    if (s && s.elapsedMs != null) {
      timeText = (s.elapsedMs / 1000).toFixed(2) + " 秒";
    }
    li.textContent = `${index + 1}. ${s?.name || "プレイヤー"} ： ${dmg} ダメージ ／ ${correctText} ／ 回答時間 ${timeText}`;
    roundResultList.appendChild(li);
  });
}

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
  const selectedGenres = getSelectedGenres();
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
    categories: selectedGenres.length > 0 ? selectedGenres : null,
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
  if (readyBar) {
    readyBar.classList.add("hidden");
  }
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
  if (questionRules) {
    questionRules.textContent = "";
  }

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

  if (countdownLabel) {
    let labelText = "次の問題：";
    if (diff === "EASY") {
      labelText += "EASY";
    } else if (diff === "NORMAL") {
      labelText += "NORMAL";
    } else if (diff === "HARD") {
      labelText += "HARD";
    } else {
      labelText += "???";
    }
    countdownLabel.textContent = labelText;
  }

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
  renderRoundStats(data.roundStats);

  if (data.canContinue) {
    nextReadyBtn.classList.remove("hidden");
    if (readyBar) {
      readyBar.classList.remove("hidden");
      readyBar.style.display = "flex";
    }
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
    if (readyBar) {
      readyBar.classList.add("hidden");
    }
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
  if (readyBar) {
    readyBar.classList.add("hidden");
  }
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

document.addEventListener("DOMContentLoaded", () => {
  // --- ソロモード切り替えボタンの初期化 ---
  if (btnSoloMode) {
    btnSoloMode.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("ソロモードボタンがクリックされました");
      showSoloModeScreen();
    });
  } else {
    console.warn("btnSoloMode not found");
  }

  if (btnSoloBackToOnline) {
    btnSoloBackToOnline.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("ソロモードからオンライン対戦に戻るボタンがクリックされました");
      showOnlineModeScreen();
    });
  } else {
    console.warn("btnSoloBackToOnline not found");
  }

  // --- ソロモード：タイムアタック 詳細ルールボタン ---
  if (btnTimeAttackRules && timeAttackRulesPanel) {
    btnTimeAttackRules.addEventListener("click", (e) => {
      e.preventDefault();
      const isHidden = timeAttackRulesPanel.classList.contains("hidden");
      if (isHidden) {
        console.log("タイムアタック詳細ルールを表示");
        timeAttackRulesPanel.classList.remove("hidden");
      } else {
        console.log("タイムアタック詳細ルールを非表示");
        timeAttackRulesPanel.classList.add("hidden");
      }
    });
  } else {
    console.warn("タイムアタックのルールボタンまたはパネルが見つかりません");
  }

  // --- ソロモード：タイムアタック このモードで遊ぶボタン ---
  if (btnTimeAttackStart && soloTimeAttackMenuSection && soloTimeAttackConfigSection) {
    btnTimeAttackStart.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("タイムアタックのルール設定画面へ遷移");
      soloTimeAttackMenuSection.classList.add("hidden");
      soloTimeAttackConfigSection.classList.remove("hidden");
    });
  } else {
    console.warn("タイムアタック開始ボタンまたはセクションが見つかりません");
  }

  // ジャンル ALL トグル
  if (btnTimeAttackGenreAll) {
    btnTimeAttackGenreAll.addEventListener("click", (e) => {
      e.preventDefault();
      const genreInputs = document.querySelectorAll('input[name="time-attack-genre"]');
      if (!genreInputs.length) return;
      const allChecked = Array.from(genreInputs).every((el) => el.checked);
      const newChecked = !allChecked;
      Array.from(genreInputs).forEach((el) => {
        el.checked = newChecked;
      });
      console.log("Time Attack genre ALL toggled, newChecked =", newChecked);
    });
  }

  // タイムアタック中断 → 設定画面へ
  if (btnTimeAttackPause && soloTimeAttackPlaySection && soloTimeAttackConfigSection) {
    btnTimeAttackPause.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Time Attack 中断 → 設定画面に戻る");
      timeAttackState.active = false;
      timeAttackState.phase = "idle";
      stopTimeAttackLoop();
      soloTimeAttackPlaySection.classList.add("hidden");
      soloTimeAttackConfigSection.classList.remove("hidden");
      if (timeAttackCountdownEl) timeAttackCountdownEl.classList.add("hidden");
      if (timeAttackResult) timeAttackResult.classList.add("hidden");
    });
  }

  // タイムアタック リスタート
  if (btnTimeAttackRestart) {
    btnTimeAttackRestart.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Time Attack リスタート");
      beginTimeAttackGame();
    });
  }

  if (btnTimeAttackConfigBack && soloTimeAttackConfigSection && soloTimeAttackMenuSection) {
    btnTimeAttackConfigBack.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Time Attack config → ソロメニューに戻る");
      resetTimeAttackToMenu();
    });
  }

  if (btnTimeAttackBegin) {
    btnTimeAttackBegin.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Time Attack 開始");
      beginTimeAttackGame();
    });
  }

  // リザルト → ルール設定に戻る
  if (btnTimeAttackResultBackConfig && soloTimeAttackResultSection && soloTimeAttackConfigSection) {
    btnTimeAttackResultBackConfig.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Time Attack リザルト → ルール設定に戻る");
      timeAttackState.active = false;
      timeAttackState.phase = "idle";
      soloTimeAttackResultSection.classList.add("hidden");
      soloTimeAttackConfigSection.classList.remove("hidden");
    });
  }

  // リザルト → リスタート
  if (btnTimeAttackResultRestart) {
    btnTimeAttackResultRestart.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Time Attack リザルトからリスタート");
      beginTimeAttackGame();
    });
  }

  // --- スピードラン：詳細ルールボタン ---
  if (btnSpeedrunRules && soloSpeedrunRulesPanel) {
    btnSpeedrunRules.addEventListener("click", (e) => {
      e.preventDefault();
      const isHidden = soloSpeedrunRulesPanel.classList.contains("hidden");
      if (isHidden) {
        console.log("スピードラン詳細ルールを表示");
        soloSpeedrunRulesPanel.classList.remove("hidden");
      } else {
        console.log("スピードラン詳細ルールを非表示");
        soloSpeedrunRulesPanel.classList.add("hidden");
      }
    });
  }

  // スピードラン開始（メニュー→設定）
  if (btnSpeedrunStart && soloSpeedrunMenuSection && soloSpeedrunConfigSection) {
    btnSpeedrunStart.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("スピードランのルール設定画面へ遷移");
      soloSpeedrunMenuSection.classList.add("hidden");
      soloSpeedrunConfigSection.classList.remove("hidden");
    });
  }

  // スピードラン ジャンルALL
  if (btnSpeedrunGenreAll) {
    btnSpeedrunGenreAll.addEventListener("click", (e) => {
      e.preventDefault();
      const genreInputs = document.querySelectorAll('input[name="speedrun-genre"]');
      if (!genreInputs.length) return;
      const allChecked = Array.from(genreInputs).every((el) => el.checked);
      const newChecked = !allChecked;
      Array.from(genreInputs).forEach((el) => {
        el.checked = newChecked;
      });
      console.log("Speedrun genre ALL toggled, newChecked =", newChecked);
    });
  }

  // スピードラン中断 → 設定
  if (btnSpeedrunPause && soloSpeedrunPlaySection && soloSpeedrunConfigSection) {
    btnSpeedrunPause.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Speedrun 中断 → 設定画面に戻る");
      speedrunState.active = false;
      speedrunState.phase = "idle";
      stopSpeedrunLoop();
      soloSpeedrunPlaySection.classList.add("hidden");
      soloSpeedrunConfigSection.classList.remove("hidden");
      if (speedrunCountdownEl) speedrunCountdownEl.classList.add("hidden");
      if (speedrunResult) speedrunResult.classList.add("hidden");
    });
  }

  // スピードラン リスタート
  if (btnSpeedrunRestart) {
    btnSpeedrunRestart.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Speedrun リスタート");
      beginSpeedrunGame();
    });
  }

  // スピードラン設定へ戻る
  if (btnSpeedrunConfigBack && soloSpeedrunConfigSection && soloSpeedrunMenuSection) {
    btnSpeedrunConfigBack.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Speedrun config → ソロメニューに戻る");
      resetSpeedrunToMenu();
    });
  }

  // スピードラン開始
  if (btnSpeedrunBegin) {
    btnSpeedrunBegin.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Speedrun 開始");
      beginSpeedrunGame();
    });
  }

  // スピードラン リザルト → 設定
  if (btnSpeedrunResultBackConfig && soloSpeedrunResultSection && soloSpeedrunConfigSection) {
    btnSpeedrunResultBackConfig.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Speedrun リザルト → ルール設定に戻る");
      speedrunState.active = false;
      speedrunState.phase = "idle";
      soloSpeedrunResultSection.classList.add("hidden");
      soloSpeedrunConfigSection.classList.remove("hidden");
    });
  }

  // スピードラン リザルト → リスタート
  if (btnSpeedrunResultRestart) {
    btnSpeedrunResultRestart.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Speedrun リザルトからリスタート");
      beginSpeedrunGame();
    });
  }
});
