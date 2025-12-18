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
let soloCountdownId = null;

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
  correctCount: 0,
  totalQuestions: 0,
  startTimeMs: 0,
  endTimeMs: 0,
  history: [],
  selectedGenres: [],
  selectedDifficulties: [],
  currentDifficulty: null,
  currentQuestion: null,
  timerIntervalId: null,
  countdownId: null,
  lastTick: 0,
};

// Endless ゲーム状態
const endlessState = {
  active: false,
  livesMax: 3,
  livesCurrent: 3,
  score: 0,
  correctCount: 0,
  totalQuestions: 0,
  comboCount: 0,
  startTimeMs: 0,
  endTimeMs: 0,
  history: [],
  availableQuestions: [],
  selectedGenres: [],
  selectedDifficulties: [],
  currentQuestion: null,
  timerIntervalId: null,
  countdownId: null,
};

let lastEndlessConfig = null;

// === Genre Management ===
const GENRE_HIERARCHY = [
  {
    id: "anime",
    label: "アニメ・漫画",
    genres: [
      { id: "conan", label: "名探偵コナン" },
      { id: "dragonball", label: "ドラゴンボール" },
      { id: "naruto", label: "ナルト" },
      { id: "inazuma_eleven", label: "イナズマイレブン" },
      { id: "heroaca", label: "僕のヒーローアカデミア" }
    ]
  }
];
let GENRE_COUNTS = {};

socket.on("genre_counts", (counts) => {
  GENRE_COUNTS = counts;
  console.log("Received genre counts:", GENRE_COUNTS);
  refreshAllGenreSelectors();
});

function renderGenreSelector(containerId, inputName) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  container.classList.add('genre-selector-root');

  GENRE_HIERARCHY.forEach(cat => {
    // Calculate category totals
    let catTotal = 0;
    cat.genres.forEach(g => {
      catTotal += (GENRE_COUNTS[g.id] || 0);
    });

    // HTML Structure
    const catDiv = document.createElement("div");
    catDiv.className = "genre-category-group";

    const header = document.createElement("div");
    header.className = "genre-category-header";

    // Category Checkbox (Select All for this category)
    const catCheck = document.createElement("input");
    catCheck.type = "checkbox";
    catCheck.className = "category-checkbox";

    // Category Toggle Button (Accordion)
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "category-toggle-btn genre-category-btn"; // Added genre-category-btn for style targeting
    toggleBtn.innerText = `${cat.label} (${catTotal}問)`;

    // Header Layout: [checkbox] [toggle_button]
    header.appendChild(catCheck);
    header.appendChild(toggleBtn);
    catDiv.appendChild(header);

    // Sub-container
    const subContainer = document.createElement("div");
    subContainer.className = "genre-sub-container hidden"; // Hidden by default

    // Helper functions for sync logic
    const getAllChildCheckboxes = () => subContainer.querySelectorAll('input[type="checkbox"]');

    // Update visual state of the category button (Highlight) AND Category Checkbox state
    const updateCategoryState = () => {
      const inputs = getAllChildCheckboxes();
      if (inputs.length === 0) return;

      const total = inputs.length;
      const checkedCount = Array.from(inputs).filter(i => i.checked).length;

      // Highlight Logic: If at least one is selected
      if (checkedCount > 0) {
        toggleBtn.classList.add('category-has-selection');
      } else {
        toggleBtn.classList.remove('category-has-selection');
      }

      // Sync Logic: 
      // User Logic: "全選択されているとチェックが入り、一つでもカテゴリの中のチェックが外れるとカテゴリ全体のチェックも外れる"
      // User Logic: "チェックを手動で外すと全解除できるように設定" (If category checked is unchecked -> uncheck all)

      if (checkedCount === total) {
        catCheck.checked = true;
        catCheck.indeterminate = false;
      } else {
        catCheck.checked = false;
        // Optional: showing indeterminate state if some but not all are checked
        if (checkedCount > 0) {
          catCheck.indeterminate = true;
        } else {
          catCheck.indeterminate = false;
        }
      }
    };

    cat.genres.forEach(g => {
      const gCount = GENRE_COUNTS[g.id] || 0;
      const label = document.createElement("label");
      label.className = "genre-label";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = inputName;
      input.value = g.id;
      input.className = "genre-child-checkbox";

      // Default selection logic (simplified for now)
      if (g.id === 'common_knowledge') {
        input.checked = true;
      }

      input.addEventListener('change', () => {
        updateCategoryState();
      });

      label.appendChild(input);
      label.appendChild(document.createTextNode(` ${g.label} (${gCount}問)`));
      subContainer.appendChild(label);
    });

    catDiv.appendChild(subContainer);
    container.appendChild(catDiv);

    // Initial state check
    updateCategoryState();

    // Events
    toggleBtn.addEventListener('click', () => {
      subContainer.classList.toggle('hidden');
    });

    catCheck.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const inputs = getAllChildCheckboxes();
      inputs.forEach(inp => {
        inp.checked = isChecked;
      });
      // Removing indeterminate state on explicit check/uncheck
      catCheck.indeterminate = false;
      updateCategoryState();
    });
  });
}

function refreshAllGenreSelectors() {
  renderGenreSelector("online-genre-selector", "genre");
  renderGenreSelector("time-attack-genre-selector", "time-attack-genre");
  renderGenreSelector("speedrun-genre-selector", "speedrun-genre");
  renderGenreSelector("endless-genre-selector", "endless-genre");
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function prepareShuffledChoices(questionData) {
  if (!questionData || !Array.isArray(questionData.choices)) {
    return { shuffled: [], correctDisplayIndex: null };
  }
  const withFlags = questionData.choices.map((text, index) => ({
    text,
    originalIndex: index,
    isCorrect: (typeof questionData.correctIndex === "number" ? questionData.correctIndex : questionData.answerIndex) === index,
  }));
  const shuffled = shuffleArray([...withFlags]);
  const correctDisplayIndex = shuffled.findIndex((c) => c.isCorrect);
  questionData.shuffledChoices = shuffled;
  questionData.shuffledCorrectIndex = correctDisplayIndex >= 0 ? correctDisplayIndex : null;
  return { shuffled, correctDisplayIndex: questionData.shuffledCorrectIndex };
}

// User State (Global)
let myUserId = null;
let myStats = { wins: 0, lose: 0 };

socket.on("connect", () => {
  if (myUserId) {
    socket.emit("registerUser", { userId: myUserId });
  }
});

async function fetchFriends() {
  if (!myUserId) return [];
  try {
    const res = await fetch(`/api/friends?userId=${myUserId}`);
    const data = await res.json();
    if (data.success) {
      return data.friends;
    }
  } catch (e) {
    console.error("Fetch friends error:", e);
  }
  return [];
}

async function addFriend(targetId) {
  if (!myUserId) return { success: false, message: "ログインしていません" };
  try {
    const res = await fetch("/api/friends/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: myUserId, targetId }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: "通信エラー" };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // === Auth Elements ===
  const authSection = document.getElementById("auth-section");
  const appSection = document.getElementById("app");
  const loginFormContainer = document.getElementById("login-form-container");
  const registerFormContainer = document.getElementById("register-form-container");
  const linkToRegister = document.getElementById("linkToRegister");
  const linkToLogin = document.getElementById("linkToLogin");
  const authMessage = document.getElementById("authMessage");

  const loginUsernameInput = document.getElementById("loginUsername");
  const loginPasswordInput = document.getElementById("loginPassword");
  const btnLogin = document.getElementById("btnLogin");

  const registerUsernameInput = document.getElementById("registerUsername");
  const registerPasswordInput = document.getElementById("registerPassword");
  const btnRegister = document.getElementById("btnRegister");

  const btnGuest = document.getElementById("btnGuest");

  // Account Elements
  const btnAccountMenu = document.getElementById("btn-account-menu");
  const accountModal = document.getElementById("account-modal");
  const btnCloseAccount = document.getElementById("btn-close-account");
  const accountNameEl = document.getElementById("account-name");
  const accountIdEl = document.getElementById("account-id");
  const accountWinsEl = document.getElementById("account-wins");
  const accountLoseEl = document.getElementById("account-lose");
  const btnCopyId = document.getElementById("btn-copy-id");
  const btnLogout = document.getElementById("btnLogout");

  // Tabs
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  // Friends
  const friendIdInput = document.getElementById("friend-id-input");
  const btnAddFriend = document.getElementById("btn-add-friend");
  const friendListEl = document.getElementById("friend-list");
  const friendMsg = document.getElementById("friend-msg");

  // Account Modal Logic
  if (btnAccountMenu) {
    btnAccountMenu.addEventListener("click", async () => {
      if (!myUserId) {
        alert("ログインしていません"); // Should not happen given UI flow
        return;
      }
      // Update Profile Info
      accountNameEl.textContent = playerNameInput.value || "名無し";
      accountIdEl.textContent = myUserId;
      accountWinsEl.textContent = myStats.wins;
      accountLoseEl.textContent = myStats.lose;

      // Update Friends
      await updateFriendListUI();

      accountModal.classList.remove("hidden");
    });
  }

  if (btnCloseAccount) {
    btnCloseAccount.addEventListener("click", () => {
      accountModal.classList.add("hidden");
    });
  }

  if (accountModal) {
    accountModal.addEventListener("click", (e) => {
      if (e.target === accountModal) accountModal.classList.add("hidden");
    });
  }

  // Tabs
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      // UI Update
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      tabContents.forEach(c => {
        if (c.id === `tab-${target}`) {
          c.classList.remove("hidden");
          c.classList.add("active");
        } else {
          c.classList.add("hidden");
          c.classList.remove("active");
        }
      });
    });
  });

  // Copy ID
  if (btnCopyId) {
    btnCopyId.addEventListener("click", () => {
      if (myUserId) {
        navigator.clipboard.writeText(myUserId).then(() => {
          const original = btnCopyId.innerText;
          btnCopyId.innerText = "✅";
          setTimeout(() => btnCopyId.innerText = original, 1000);
        });
      }
    });
  }

  // Logout
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      location.reload();
    });
  }

  // Add Friend
  if (btnAddFriend) {
    btnAddFriend.addEventListener("click", async () => {
      const targetId = friendIdInput.value.trim();
      if (!targetId) return;

      friendMsg.textContent = "送信中...";
      friendMsg.style.color = "#ccc";

      const res = await addFriend(targetId);
      friendMsg.textContent = res.message;
      if (res.success) {
        friendMsg.style.color = "#4ade80"; // green
        friendIdInput.value = "";
        await updateFriendListUI();
      } else {
        friendMsg.style.color = "#ef4444"; // red
      }
    });
  }

  async function updateFriendListUI() {
    if (!friendListEl) return;
    const friends = await fetchFriends();
    friendListEl.innerHTML = "";
    if (friends.length === 0) {
      friendListEl.innerHTML = '<li class="info-text">フレンドはいません</li>';
      return;
    }

    friends.forEach(f => {
      const li = document.createElement("li");
      li.className = "friend-item";

      const onlineBadge = f.isOnline
        ? '<span style="color:#4ade80; font-size:0.8em; margin-left:6px;">● Online</span>'
        : '<span style="color:#666; font-size:0.8em; margin-left:6px;">● Offline</span>';

      li.innerHTML = `
        <div class="friend-info">
          <span class="friend-name">${f.username} ${onlineBadge}</span>
          <span class="friend-id">ID: ${f.id}</span>
        </div>
        <div class="friend-stats" style="font-size:0.85em; color:#ccc;">
           WIN: ${f.wins} / LOSE: ${f.lose}
        </div>
      `;
      friendListEl.appendChild(li);
    });
  }

  // Initialize UI
  if (linkToRegister) {
    linkToRegister.addEventListener("click", (e) => {
      e.preventDefault();
      loginFormContainer.classList.add("hidden");
      registerFormContainer.classList.remove("hidden");
      authMessage.textContent = "";
    });
  }
  if (linkToLogin) {
    linkToLogin.addEventListener("click", (e) => {
      e.preventDefault();
      registerFormContainer.classList.add("hidden");
      loginFormContainer.classList.remove("hidden");
      authMessage.textContent = "";
    });
  }

  // Login
  if (btnLogin) {
    btnLogin.addEventListener("click", async () => {
      const username = loginUsernameInput.value.trim();
      const password = loginPasswordInput.value.trim();
      if (!username || !password) {
        authMessage.textContent = "ユーザー名とパスワードを入力してください";
        return;
      }
      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (data.success) {
          myUserId = data.userId;
          myStats = data.stats || { wins: 0, lose: 0 }; // Save stats
          socket.emit("registerUser", { userId: myUserId }); // Register socket
          startGameApp(data.username);
        } else {
          authMessage.textContent = data.message || "ログイン失敗";
        }
      } catch (e) {
        authMessage.textContent = "通信エラーが発生しました";
      }
    });
  }

  // Register
  if (btnRegister) {
    btnRegister.addEventListener("click", async () => {
      const username = registerUsernameInput.value.trim();
      const password = registerPasswordInput.value.trim();
      if (!username || !password) {
        authMessage.textContent = "ユーザー名とパスワードを入力してください";
        return;
      }
      try {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (data.success) {
          myUserId = data.userId;
          myStats = data.stats || { wins: 0, lose: 0 }; // Save stats
          socket.emit("registerUser", { userId: myUserId }); // Register socket
          startGameApp(data.username);
        } else {
          authMessage.textContent = data.message || "登録失敗";
        }
      } catch (e) {
        authMessage.textContent = "通信エラーが発生しました";
      }
    });
  }

  // Guest
  if (btnGuest) {
    btnGuest.addEventListener("click", () => {
      myUserId = null;
      startGameApp("");
    });
  }

  function startGameApp(username) {
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    // DOM elements are not defined yet inside this callback if we are strictly sequential,
    // but they will be available when functions run.
    // However, we need to access 'playerNameInput' which is defined below.
    // Ideally, we should move DOM definitions to top or inside this block.
    // For now, let's just use document.getElementById inside here to be safe.
    const pInput = document.getElementById("playerNameInput");
    if (username && pInput) {
      pInput.value = username;
    }
  }
});

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
const soloHomeMenuSection = document.getElementById("solo-home-menu");

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
const btnTimeAttackToggleList = document.getElementById("btn-time-attack-toggle-list");
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
const speedrunCountdownText = document.getElementById("speedrun-countdown-text");
const speedrunQuestionArea = document.getElementById("speedrun-question-area");
const speedrunQuestionText = document.getElementById("speedrun-question-text");
const speedrunAnswerButtonsContainer = document.getElementById("speedrun-answer-buttons");
const speedrunLastResult = document.getElementById("speedrun-last-result");
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
// === ソロ：エンドレス ===
const soloEndlessMenuSection = document.getElementById("solo-endless-menu");
const soloEndlessConfigSection = document.getElementById("solo-endless-config");
const soloEndlessPlaySection = document.getElementById("solo-endless-play");
const btnSoloEndless = document.getElementById("btn-solo-endless");
const btnEndlessConfigBack = document.getElementById("btn-endless-config-back");
const inputEndlessLife = document.getElementById("endless-life-input");
const endlessScoreValue = document.getElementById("endless-score-value");
const endlessLifeDisplay = document.getElementById("endless-life-display");
const endlessTimeElapsed = document.getElementById("endless-time-elapsed");
const endlessCountdownEl = document.getElementById("endless-countdown");
const endlessCountdownText = document.getElementById("endless-countdown-text");
const endlessQuestionArea = document.getElementById("endless-question-area");
const endlessQuestionText = document.getElementById("endless-question-text");
const endlessOptionsContainer = document.getElementById("endless-options-container");
const endlessAnswerFeedback = document.getElementById("endless-answer-feedback");
const endlessScoreGain = document.getElementById("endless-score-gain");
const endlessProgressDisplay = document.getElementById("endless-progress-display");
const endlessDifficultyLabel = document.getElementById("endless-difficulty-label");
const btnEndlessNext = document.getElementById("btn-endless-next");
const btnEndlessStart = document.getElementById("btn-endless-start");
const btnEndlessPause = document.getElementById("btn-endless-pause");
const btnEndlessRestart = document.getElementById("btn-endless-restart");
const btnEndlessRules = document.getElementById("btn-endless-rules");
const endlessRulesPanel = document.getElementById("solo-endless-rules-panel");
const btnEndlessGenreAllToggle = document.getElementById("endless-genre-all-toggle");
const endlessGenreCheckboxes = document.querySelectorAll(".endless-genre");
// === ソロ：共通リザルト（エンドレス用） ===
const soloResultSection = document.getElementById("solo-result");
const soloResultModeName = document.getElementById("solo-result-mode-name");
const soloResultScore = document.getElementById("solo-result-score");
const soloResultCorrect = document.getElementById("solo-result-correct");
const soloResultTotal = document.getElementById("solo-result-total");
const soloResultTime = document.getElementById("solo-result-time");
const soloResultQuestionList = document.getElementById("solo-result-question-list");
const btnToggleQuestionList = document.getElementById("btn-toggle-question-list");
const btnSoloReturnMenu = document.getElementById("btn-solo-return-menu");

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

// ソロモード共通のセクション管理
const soloSections = {
  home: soloHomeMenuSection,
  timeAttackConfig: soloTimeAttackConfigSection,
  timeAttackPlay: soloTimeAttackPlaySection,
  timeAttackResult: soloTimeAttackResultSection,
  speedrunConfig: soloSpeedrunConfigSection,
  speedrunPlay: soloSpeedrunPlaySection,
  speedrunResult: soloSpeedrunResultSection,
  endlessConfig: soloEndlessConfigSection,
  endlessPlay: soloEndlessPlaySection,
  soloResult: soloResultSection,
};

function soloShowOnly(sectionKey) {
  Object.values(soloSections).forEach((el) => {
    if (!el) return;
    el.classList.add("hidden");
  });
  const target = soloSections[sectionKey];
  if (target) {
    target.classList.remove("hidden");
  }
}

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
  roomRoot.classList.remove("hidden");
  soloRoot.classList.add("hidden");
  stopEndlessLoop();
  endlessState.active = false;
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
  resetEndlessToMenu();
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
  soloShowOnly("home");
  if (timeAttackRulesPanel) timeAttackRulesPanel.classList.add("hidden");
  if (timeAttackCountdownEl) timeAttackCountdownEl.classList.add("hidden");
  if (timeAttackResult) timeAttackResult.classList.add("hidden");
  if (timeAttackAnswerButtonsContainer) timeAttackAnswerButtonsContainer.innerHTML = "";
  if (timeAttackHistoryList) {
    timeAttackHistoryList.innerHTML = "";
    timeAttackHistoryList.classList.add("hidden");
  }
  if (btnTimeAttackToggleList) btnTimeAttackToggleList.textContent = "問題一覧を開く";
}

function resetSpeedrunToMenu() {
  stopSpeedrunLoop();
  speedrunState.active = false;
  speedrunState.targetCorrect = getSpeedrunTargetCorrect();
  speedrunState.correctCount = 0;
  speedrunState.totalQuestions = 0;
  speedrunState.startTimeMs = 0;
  speedrunState.endTimeMs = 0;
  speedrunState.currentQuestion = null;
  speedrunState.currentDifficulty = null;
  speedrunState.history = [];
  updateSpeedrunTimerDisplay();
  updateSpeedrunProgressDisplay();
  updateSpeedrunDifficultyLabel(null);
  soloShowOnly("home");
  if (soloSpeedrunResultSection) soloSpeedrunResultSection.classList.add("hidden");
  if (soloSpeedrunRulesPanel) soloSpeedrunRulesPanel.classList.add("hidden");
  if (speedrunCountdownEl) speedrunCountdownEl.classList.add("hidden");
  if (speedrunLastResult) speedrunLastResult.classList.add("hidden");
  if (speedrunLastResult) speedrunLastResult.textContent = "";
  if (speedrunAnswerButtonsContainer) speedrunAnswerButtonsContainer.innerHTML = "";
}

function resetEndlessToMenu() {
  stopEndlessLoop();
  endlessState.active = false;
  endlessState.livesMax = 3;
  endlessState.livesCurrent = 3;
  endlessState.score = 0;
  endlessState.correctCount = 0;
  endlessState.totalQuestions = 0;
  endlessState.comboCount = 0;
  endlessState.startTimeMs = 0;
  endlessState.endTimeMs = 0;
  endlessState.history = [];
  endlessState.availableQuestions = [];
  endlessState.currentQuestion = null;
  endlessState.selectedGenres = [];
  endlessState.selectedDifficulties = [];
  updateEndlessLifeDisplay();
  updateEndlessScoreDisplay();
  updateEndlessTimerDisplay();
  if (endlessAnswerFeedback) endlessAnswerFeedback.classList.add("hidden");
  if (endlessScoreGain) endlessScoreGain.classList.add("hidden");
  if (btnEndlessNext) btnEndlessNext.disabled = true;
  if (endlessCountdownEl) endlessCountdownEl.classList.add("hidden");
  if (endlessOptionsContainer) endlessOptionsContainer.innerHTML = "";
  if (endlessOptionsContainer) endlessOptionsContainer.classList.add("hidden");
  if (endlessQuestionArea) endlessQuestionArea.classList.add("hidden");
  if (endlessProgressDisplay) endlessProgressDisplay.textContent = "正解数: 0 / 0";
  updateEndlessDifficultyLabel(null);
  lastEndlessConfig = null;
  soloShowOnly("home");
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

// Endless helpers
function getEndlessSelectedGenres() {
  const nodes = document.querySelectorAll('input[name="endless-genre"]:checked');
  return Array.from(nodes).map((el) => el.value);
}

function getEndlessSelectedDifficulties() {
  const nodes = document.querySelectorAll('input[name="endless-difficulty"]:checked');
  return Array.from(nodes).map((el) => el.value);
}

function updateSpeedrunTimerDisplay() {
  if (!speedrunElapsedDisplay) return;
  let elapsedMs = 0;
  if (speedrunState.startTimeMs > 0 && speedrunState.endTimeMs > 0) {
    elapsedMs = speedrunState.endTimeMs - speedrunState.startTimeMs;
  } else if (speedrunState.startTimeMs > 0) {
    elapsedMs = window.performance.now() - speedrunState.startTimeMs;
  }
  const sec = elapsedMs / 1000;
  speedrunElapsedDisplay.textContent = sec.toFixed(1);
}

function updateSpeedrunProgressDisplay() {
  if (!speedrunProgressDisplay) return;
  speedrunProgressDisplay.textContent = `正解数: ${speedrunState.correctCount} / ${speedrunState.targetCorrect}`;
}

function updateEndlessTimerDisplay() {
  if (!endlessTimeElapsed) return;
  let elapsedMs = 0;
  if (endlessState.startTimeMs > 0 && endlessState.endTimeMs > 0) {
    elapsedMs = endlessState.endTimeMs - endlessState.startTimeMs;
  } else if (endlessState.startTimeMs > 0) {
    elapsedMs = window.performance.now() - endlessState.startTimeMs;
  }
  endlessTimeElapsed.textContent = (elapsedMs / 1000).toFixed(1);
}

function updateEndlessScoreDisplay() {
  if (endlessScoreValue) {
    endlessScoreValue.textContent = String(endlessState.score);
  }
}

function updateEndlessLifeDisplay() {
  if (!endlessLifeDisplay) return;
  const hearts = "♥".repeat(Math.max(0, endlessState.livesCurrent));
  const empty = "♡".repeat(Math.max(0, endlessState.livesMax - endlessState.livesCurrent));
  endlessLifeDisplay.textContent = hearts + empty;
}

function updateEndlessProgressDisplay() {
  if (!endlessProgressDisplay) return;
  endlessProgressDisplay.textContent = `正解数: ${endlessState.correctCount} / ${endlessState.totalQuestions}`;
}

function updateEndlessDifficultyLabel(difficulty) {
  if (!endlessDifficultyLabel) return;
  endlessDifficultyLabel.classList.remove("difficulty-easy", "difficulty-normal", "difficulty-hard");
  let labelText = "難易度: -";
  const normalized = typeof difficulty === "string" ? difficulty.toLowerCase() : "";
  if (normalized === "easy") {
    labelText = "難易度: EASY";
    endlessDifficultyLabel.classList.add("difficulty-easy");
  } else if (normalized === "normal") {
    labelText = "難易度: NORMAL";
    endlessDifficultyLabel.classList.add("difficulty-normal");
  } else if (normalized === "hard") {
    labelText = "難易度: HARD";
    endlessDifficultyLabel.classList.add("difficulty-hard");
  }
  endlessDifficultyLabel.textContent = labelText;
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
  speedrunState.timerIntervalId = window.setInterval(() => {
    if (!speedrunState.active) return;
    updateSpeedrunTimerDisplay();
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
  clearSoloCountdown();
}

function ensureEndlessTimerLoop() {
  if (!endlessTimeElapsed) return;
  if (endlessState.timerIntervalId != null) return;
  endlessState.timerIntervalId = window.setInterval(() => {
    if (!endlessState.active) return;
    updateEndlessTimerDisplay();
  }, 100);
}

function stopEndlessLoop() {
  if (endlessState.timerIntervalId != null) {
    clearInterval(endlessState.timerIntervalId);
    endlessState.timerIntervalId = null;
  }
  if (endlessState.countdownId != null) {
    clearInterval(endlessState.countdownId);
    endlessState.countdownId = null;
  }
  clearSoloCountdown();
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

  soloShowOnly("timeAttackPlay");

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
  soloShowOnly("timeAttackResult");

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

  if (timeAttackTotalCount) {
    timeAttackTotalCount.textContent = String(timeAttackState.totalAnswered);
  }

  if (timeAttackHistoryList) {
    renderSoloResultQuestionList(timeAttackState.history, timeAttackHistoryList);
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
    const { shuffled } = prepareShuffledChoices(questionData);
    timeAttackAnswerButtonsContainer.innerHTML = "";
    (shuffled || questionData.choices).forEach((choice, index) => {
      const choiceText = typeof choice === "string" ? choice : choice.text;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "solo-answer-button";
      btn.textContent = choiceText;
      btn.dataset.isCorrect = choice.isCorrect ? "1" : "0";
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
  const choiceList =
    (q && q.shuffledChoices) ||
    (q?.choices || []).map((text, index) => ({ text, originalIndex: index, isCorrect: index === correctIndex }));
  const choiceEntry = typeof selectedIndex === "number" ? choiceList[selectedIndex] : null;
  const correctChoice = choiceList.find((c) => c.isCorrect);
  const correctDisplayIndex =
    (q && q.shuffledCorrectIndex != null ? q.shuffledCorrectIndex : null) ??
    (correctChoice ? choiceList.indexOf(correctChoice) : correctIndex);
  const isCorrect =
    choiceEntry && typeof choiceEntry.isCorrect === "boolean"
      ? choiceEntry.isCorrect
      : correctIndex != null && selectedIndex === correctIndex;

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

  const qText = q?.question || q?.text || "（問題文不明）";
  timeAttackState.history.push({
    questionText: qText,
    difficulty,
    isCorrect,
  });

  // 正解ボタンをハイライト
  if (correctDisplayIndex != null && timeAttackAnswerButtonsContainer && timeAttackAnswerButtonsContainer.children.length > 0) {
    const buttons = Array.from(timeAttackAnswerButtonsContainer.children);
    buttons.forEach((btn, index) => {
      btn.classList.remove("correct-answer");
      if (index === correctDisplayIndex) {
        btn.classList.add("correct-answer");
      }
    });
  }

  let message = "";
  if (isCorrect) {
    message = "正解！";
  } else {
    const correctText =
      correctChoice?.text || (correctIndex != null && q?.choices ? q.choices[correctIndex] : "（正解不明）");
    message = `不正解… 正解は「${correctText}」でした。`;
  }

  if (timeAttackResult && timeAttackResultMessage) {
    timeAttackResultMessage.textContent = message;
    timeAttackResult.classList.remove("hidden");
  }
  if (timeAttackAnswerButtonsContainer && correctDisplayIndex != null) {
    const btns = Array.from(timeAttackAnswerButtonsContainer.querySelectorAll("button"));
    btns.forEach((btn, idx) => {
      if (idx === correctDisplayIndex) {
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
function beginSpeedrunGame() {
  stopSpeedrunLoop();
  if (speedrunState.countdownId != null) {
    clearInterval(speedrunState.countdownId);
    speedrunState.countdownId = null;
  }
  const genres = getSpeedrunSelectedGenres();
  const difficulties = getSpeedrunSelectedDifficulties();
  const target = getSpeedrunTargetCorrect();

  if (genres.length === 0 || difficulties.length === 0) {
    alert("ジャンルと難易度を少なくとも1つずつ選択してください。");
    return;
  }

  speedrunState.active = true;
  speedrunState.selectedGenres = genres;
  speedrunState.selectedDifficulties = difficulties;
  speedrunState.targetCorrect = target;
  speedrunState.correctCount = 0;
  speedrunState.totalQuestions = 0;
  speedrunState.startTimeMs = 0;
  speedrunState.endTimeMs = 0;
  speedrunState.currentDifficulty = null;
  speedrunState.currentQuestion = null;
  speedrunState.history = [];

  updateSpeedrunTimerDisplay();
  updateSpeedrunProgressDisplay();
  updateSpeedrunDifficultyLabel(null);
  if (speedrunLastResult) speedrunLastResult.classList.add("hidden");
  if (speedrunLastResult) speedrunLastResult.textContent = "";
  if (speedrunQuestionArea) speedrunQuestionArea.classList.add("hidden");
  if (speedrunCountdownEl) speedrunCountdownEl.classList.remove("hidden");
  if (speedrunCountdownText) speedrunCountdownText.textContent = "3";

  soloShowOnly("speedrunPlay");

  ensureSpeedrunTimerLoop();
  startSoloCountdown({
    countdownEl: speedrunCountdownEl,
    textEl: speedrunCountdownText,
    durationSec: 3,
  }).then(() => {
    if (!speedrunState.active) return;
    speedrunState.startTimeMs = window.performance.now();
    updateSpeedrunTimerDisplay();
    showNextSpeedrunQuestion(null);
  });
}

function beginEndlessGame(configOverride) {
  stopEndlessLoop();
  clearSoloCountdown();

  const config =
    configOverride ||
    (() => {
      const genres = getEndlessSelectedGenres();
      const difficulties = getEndlessSelectedDifficulties();
      const life = Math.min(Math.max(Number(inputEndlessLife?.value) || 3, 1), 9);
      if (genres.length === 0 || difficulties.length === 0) {
        alert("ジャンルと難易度を少なくとも1つずつ選択してください。");
        return null;
      }
      return { genres, difficulties, life };
    })();

  if (!config) return;

  endlessState.active = true;
  endlessState.livesMax = config.life;
  endlessState.livesCurrent = config.life;
  endlessState.score = 0;
  endlessState.correctCount = 0;
  endlessState.totalQuestions = 0;
  endlessState.comboCount = 0;
  endlessState.startTimeMs = 0;
  endlessState.endTimeMs = 0;
  endlessState.history = [];
  endlessState.availableQuestions = [];
  endlessState.selectedGenres = config.genres;
  endlessState.selectedDifficulties = config.difficulties;
  endlessState.currentQuestion = null;
  lastEndlessConfig = config;

  updateEndlessLifeDisplay();
  updateEndlessScoreDisplay();
  updateEndlessProgressDisplay();
  updateEndlessDifficultyLabel(null);
  updateEndlessTimerDisplay();
  if (endlessAnswerFeedback) endlessAnswerFeedback.classList.add("hidden");
  if (endlessScoreGain) endlessScoreGain.classList.add("hidden");
  if (btnEndlessNext) btnEndlessNext.disabled = true;
  if (endlessOptionsContainer) endlessOptionsContainer.innerHTML = "";
  if (endlessOptionsContainer) endlessOptionsContainer.classList.add("hidden");
  if (endlessQuestionArea) endlessQuestionArea.classList.add("hidden");
  if (endlessCountdownEl) endlessCountdownEl.classList.remove("hidden");
  if (endlessCountdownText) endlessCountdownText.textContent = "3";

  soloShowOnly("endlessPlay");

  startSoloCountdown({
    countdownEl: endlessCountdownEl,
    textEl: endlessCountdownText,
    durationSec: 3,
  }).then(() => {
    if (!endlessState.active) return;
    endlessState.startTimeMs = window.performance.now();
    updateEndlessTimerDisplay();
    ensureEndlessTimerLoop();
    endlessShowNextQuestion();
  });
}

function startSoloCountdown({ countdownEl, textEl, durationSec = 3 }) {
  if (!countdownEl || !textEl) {
    return Promise.resolve();
  }
  clearSoloCountdown();
  let count = durationSec;
  textEl.textContent = String(count);
  countdownEl.classList.remove("hidden");
  return new Promise((resolve) => {
    soloCountdownId = window.setInterval(() => {
      count -= 1;
      if (count > 0) {
        textEl.textContent = String(count);
      } else {
        textEl.textContent = "0";
        clearSoloCountdown();
        if (countdownEl) countdownEl.classList.add("hidden");
        resolve();
      }
    }, 1000);
  });
}

function clearSoloCountdown() {
  if (soloCountdownId != null) {
    clearInterval(soloCountdownId);
    soloCountdownId = null;
  }
}

function difficultyToBaseScore(difficulty) {
  const d = typeof difficulty === "string" ? difficulty.toLowerCase() : "";
  if (d === "hard") return 15;
  if (d === "easy") return 5;
  return 10;
}

function fetchEndlessQuestion() {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error("ソケット未接続のため問題を取得できません"));
      return;
    }
    const difficulties =
      endlessState.selectedDifficulties && endlessState.selectedDifficulties.length
        ? endlessState.selectedDifficulties.map((d) => String(d).toUpperCase())
        : ["EASY", "NORMAL", "HARD"];
    const payload = {
      genres: endlessState.selectedGenres,
      difficulties,
      exhaustible: true,
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

function renderEndlessOptions(questionData) {
  if (!endlessOptionsContainer) return;
  endlessOptionsContainer.innerHTML = "";
  const existingShuffled = questionData?.shuffledChoices;
  const { shuffled } =
    existingShuffled && existingShuffled.length
      ? { shuffled: existingShuffled }
      : prepareShuffledChoices(questionData);
  const choices =
    (shuffled && shuffled.length
      ? shuffled
      : (questionData?.choices || []).map((text, index) => ({
        text,
        originalIndex: index,
        isCorrect: typeof questionData?.correctIndex === "number" ? questionData.correctIndex === index : false,
      }))) || [];
  choices.forEach((choice, index) => {
    const choiceText = typeof choice === "string" ? choice : choice.text;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "solo-answer-button";
    btn.textContent = choiceText;
    btn.dataset.isCorrect = choice.isCorrect ? "1" : "0";
    btn.addEventListener("click", () => {
      handleEndlessAnswer(choice, index);
    });
    endlessOptionsContainer.appendChild(btn);
  });
}

function showEndlessAnswerFeedback({ isCorrect, question, correctText, gain, comboBonus }) {
  if (endlessAnswerFeedback) {
    endlessAnswerFeedback.textContent = isCorrect
      ? "正解！"
      : `不正解… 正解は「${correctText || "（正解不明）"}」`;
    endlessAnswerFeedback.classList.remove("hidden");
  }
  if (endlessScoreGain) {
    if (gain > 0) {
      endlessScoreGain.textContent =
        comboBonus && comboBonus > 0 ? `+${gain}（基本＋コンボボーナス）` : `+${gain}`;
      endlessScoreGain.classList.remove("hidden");
    } else {
      endlessScoreGain.classList.add("hidden");
    }
  }
}

async function endlessShowNextQuestion() {
  if (!endlessState.active) return;
  if (endlessState.livesCurrent <= 0) {
    finishEndless();
    return;
  }

  if (btnEndlessNext) btnEndlessNext.disabled = true;
  if (endlessAnswerFeedback) endlessAnswerFeedback.classList.add("hidden");
  if (endlessScoreGain) endlessScoreGain.classList.add("hidden");
  if (endlessQuestionArea) endlessQuestionArea.classList.add("hidden");
  if (endlessOptionsContainer) endlessOptionsContainer.classList.add("hidden");

  if (!endlessState.availableQuestions.length) {
    let q = null;
    try {
      q = await fetchEndlessQuestion();
    } catch (e) {
      console.error(e);
      finishEndless();
      return;
    }
    if (q) endlessState.availableQuestions.push(q);
  }

  if (!endlessState.availableQuestions.length) {
    finishEndless();
    return;
  }

  const question = endlessState.availableQuestions.shift();
  endlessState.currentQuestion = question;

  const difficulty = question?.difficulty || (endlessState.selectedDifficulties || [])[0] || "NORMAL";
  if (endlessQuestionText) {
    endlessQuestionText.textContent = question?.question || question?.text || "";
  }
  updateEndlessDifficultyLabel(difficulty);
  updateEndlessProgressDisplay();
  prepareShuffledChoices(question);
  renderEndlessOptions(question);
  if (endlessQuestionArea) endlessQuestionArea.classList.remove("hidden");
  if (endlessOptionsContainer) endlessOptionsContainer.classList.remove("hidden");
}

function handleEndlessAnswer(selectedChoice, displayIndex) {
  if (!endlessState.active) return;
  const q = endlessState.currentQuestion;
  if (!q || !Array.isArray(q.choices)) return;
  const correctIndex = typeof q.correctIndex === "number" ? q.correctIndex : null;
  const choices =
    (q && q.shuffledChoices) ||
    (q?.choices || []).map((text, index) => ({
      text,
      originalIndex: index,
      isCorrect: correctIndex != null ? correctIndex === index : false,
    }));
  const entryFromIndex =
    typeof displayIndex === "number" && choices[displayIndex] ? choices[displayIndex] : null;
  const choiceEntry = selectedChoice || entryFromIndex;
  const correctChoice = choices.find((c) => c.isCorrect);
  const correctDisplayIndex =
    (q && q.shuffledCorrectIndex != null ? q.shuffledCorrectIndex : null) ??
    (correctChoice ? choices.indexOf(correctChoice) : correctIndex);
  const isCorrect =
    choiceEntry && typeof choiceEntry.isCorrect === "boolean"
      ? choiceEntry.isCorrect
      : correctIndex != null && displayIndex === correctIndex;

  endlessState.totalQuestions += 1;
  if (isCorrect) {
    endlessState.correctCount += 1;
    endlessState.comboCount += 1;
  } else {
    endlessState.comboCount = 0;
    endlessState.livesCurrent = Math.max(0, endlessState.livesCurrent - 1);
  }

  const base = difficultyToBaseScore(q.difficulty);
  let comboBonus = 0;
  if (isCorrect && endlessState.comboCount > 0 && endlessState.comboCount % 5 === 0) {
    comboBonus = endlessState.comboCount * 5;
  }
  const gain = isCorrect ? base + comboBonus : 0;
  endlessState.score += gain;

  updateEndlessLifeDisplay();
  updateEndlessScoreDisplay();
  showEndlessAnswerFeedback({
    isCorrect,
    question: q,
    correctText:
      correctChoice?.text || (correctIndex != null ? q.choices[correctIndex] : "（正解不明）"),
    gain,
    comboBonus,
  });

  if (correctDisplayIndex != null && endlessOptionsContainer) {
    const buttons = Array.from(endlessOptionsContainer.querySelectorAll("button"));
    buttons.forEach((btn, idx) => {
      if (idx === correctDisplayIndex) {
        btn.classList.add("solo-answer-correct");
      }
      btn.disabled = true;
    });
  }

  endlessState.history.push({
    question: q,
    chosen: choiceEntry?.originalIndex ?? displayIndex,
    chosenText:
      choiceEntry?.text ||
      (q?.choices && typeof displayIndex === "number" ? q.choices[displayIndex] : "（選択なし）"),
    correctText:
      correctChoice?.text || (correctIndex != null && q?.choices ? q.choices[correctIndex] : "（正解不明）"),
    questionText: q?.question || q?.text || "（問題文不明）",
    correct: correctIndex,
    isCorrect,
    difficulty: q.difficulty,
    scoreGain: gain,
    comboBonus,
  });

  if (endlessState.livesCurrent <= 0) {
    finishEndless();
    return;
  }

  updateEndlessProgressDisplay();

  if (btnEndlessNext) btnEndlessNext.disabled = false;
}

function finishEndless() {
  if (!endlessState.active) return;
  endlessState.active = false;
  endlessState.endTimeMs = window.performance.now();
  stopEndlessLoop();
  if (btnEndlessNext) btnEndlessNext.disabled = true;
  if (endlessCountdownEl) endlessCountdownEl.classList.add("hidden");
  if (soloResultQuestionList) {
    soloResultQuestionList.innerHTML = "";
    soloResultQuestionList.classList.add("hidden");
  }
  if (btnToggleQuestionList) btnToggleQuestionList.textContent = "問題一覧を開く";
  const elapsedSec =
    endlessState.startTimeMs > 0 && endlessState.endTimeMs > 0
      ? (endlessState.endTimeMs - endlessState.startTimeMs) / 1000
      : 0;
  showSoloResult({
    modeName: "エンドレス",
    score: endlessState.score,
    correct: endlessState.correctCount,
    total: endlessState.totalQuestions,
    timeSec: elapsedSec,
    history: endlessState.history,
  });
}

function renderEndlessResultQuestionList() {
  renderSoloResultQuestionList(endlessState.history, soloResultQuestionList);
}

function showSoloResult({ modeName, score, correct, total, timeSec, history }) {
  if (soloResultQuestionList) {
    soloResultQuestionList.innerHTML = "";
    soloResultQuestionList.classList.add("hidden");
  }
  if (btnToggleQuestionList) btnToggleQuestionList.textContent = "問題一覧を開く";
  if (soloResultModeName) soloResultModeName.textContent = modeName || "";
  if (soloResultScore) soloResultScore.textContent = String(score ?? 0);
  if (soloResultCorrect) soloResultCorrect.textContent = String(correct ?? 0);
  if (soloResultTotal) soloResultTotal.textContent = String(total ?? 0);
  if (soloResultTime) soloResultTime.textContent = (timeSec ?? 0).toFixed(1);
  renderSoloResultQuestionList(history || [], soloResultQuestionList);
  soloShowOnly("soloResult");
}

function renderSoloResultQuestionList(history, targetElement) {
  if (!targetElement) return;
  targetElement.innerHTML = "";
  (history || []).forEach((h, index) => {
    const li = document.createElement("div");
    li.className = "solo-result-question-item";
    const diff = h?.difficulty ? String(h.difficulty).toUpperCase() : "-";
    const questionText = h?.questionText || "（問題文不明）";
    const correctText = h?.correctText || "（正解不明）";
    const chosenText = h?.chosenText || "—";
    const gainText =
      h?.scoreGain != null
        ? h.scoreGain > 0
          ? `+${h.scoreGain} pt`
          : `${h.scoreGain} pt`
        : "";
    li.innerHTML = `
      <div class="solo-result-question-header">
        <span class="solo-result-question-number">Q${index + 1}</span>
        <span class="solo-result-question-difficulty">${diff}</span>
        <span class="solo-result-question-correctness ${h?.isCorrect ? "correct" : "incorrect"}">
          ${h?.isCorrect ? "○" : "×"}
        </span>
      </div>
      <div class="solo-result-question-body">
        <div class="solo-result-question-text">${questionText}</div>
        <div class="solo-result-question-answer">
          あなたの解答: ${chosenText}<br>
          正解: ${correctText}
        </div>
        ${gainText ? `<div class="solo-result-question-score">${gainText}</div>` : ""}
      </div>
    `;
    targetElement.appendChild(li);
  });
}
function finishSpeedrun() {
  if (!speedrunState.active) return;
  speedrunState.active = false;
  speedrunState.endTimeMs = window.performance.now();
  stopSpeedrunLoop();

  if (speedrunCountdownEl) speedrunCountdownEl.classList.add("hidden");
  if (speedrunQuestionArea) speedrunQuestionArea.classList.add("hidden");

  const elapsedMs =
    speedrunState.startTimeMs > 0 && speedrunState.endTimeMs > 0
      ? speedrunState.endTimeMs - speedrunState.startTimeMs
      : 0;
  const timeSec = elapsedMs / 1000;
  const finalTime = timeSec.toFixed(1);
  const finalScore = (100 + (speedrunState.targetCorrect * 2 - timeSec)).toFixed(1);

  showSoloResult({
    modeName: "スピードラン",
    score: Number(finalScore),
    correct: speedrunState.correctCount,
    total: speedrunState.totalQuestions,
    timeSec: timeSec,
    history: speedrunState.history,
  });
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

async function askSpeedrunQuestion(previousResult) {
  if (!speedrunState.active) return Promise.reject(new Error("Speedrun inactive"));

  if (speedrunLastResult && previousResult) {
    const msg = previousResult.isCorrect
      ? "前回：○ 正解！"
      : `前回：× 不正解（正解：${previousResult.correctText || "（正解不明）"}）`;
    speedrunLastResult.textContent = msg;
    speedrunLastResult.classList.remove("hidden");
  } else if (speedrunLastResult) {
    speedrunLastResult.textContent = "";
    speedrunLastResult.classList.add("hidden");
  }

  if (speedrunAnswerButtonsContainer) {
    const prevButtons = Array.from(speedrunAnswerButtonsContainer.children);
    prevButtons.forEach((btn) => btn.classList.remove("correct-answer"));
  }

  updateSpeedrunTimerDisplay();
  updateSpeedrunProgressDisplay();
  if (speedrunQuestionArea) {
    speedrunQuestionArea.classList.add("hidden");
  }

  const ds = speedrunState.selectedDifficulties || [];
  if (!ds.length) {
    console.warn("Speedrun: selectedDifficulties is empty");
    finishSpeedrun();
    return Promise.reject(new Error("no difficulties"));
  }
  const difficulty = ds[Math.floor(Math.random() * ds.length)];
  speedrunState.currentDifficulty = difficulty;
  updateSpeedrunDifficultyLabel(difficulty);

  let questionData = null;
  try {
    questionData = await fetchSpeedrunQuestion();
  } catch (err) {
    console.error(err);
    finishSpeedrun();
    return Promise.reject(err);
  }

  if (!questionData || !questionData.question || !Array.isArray(questionData.choices)) {
    console.warn("Speedrun questionData が取得できませんでした");
    finishSpeedrun();
    return Promise.reject(new Error("question data missing"));
  }

  speedrunState.currentQuestion = questionData;
  const qDifficulty = questionData.difficulty || speedrunState.currentDifficulty;
  speedrunState.currentDifficulty = qDifficulty;
  updateSpeedrunDifficultyLabel(qDifficulty);

  if (speedrunQuestionText) {
    speedrunQuestionText.textContent = questionData.question;
  }

  return new Promise((resolve) => {
    let resolved = false;
    const { shuffled } = prepareShuffledChoices(questionData);
    const renderChoices =
      shuffled && shuffled.length
        ? shuffled
        : (questionData.choices || []).map((text, index) => ({
          text,
          originalIndex: index,
          isCorrect: typeof questionData.correctIndex === "number" ? questionData.correctIndex === index : false,
        }));
    if (speedrunAnswerButtonsContainer) {
      speedrunAnswerButtonsContainer.innerHTML = "";
      renderChoices.forEach((choice, index) => {
        const choiceText = typeof choice === "string" ? choice : choice.text;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "solo-answer-button";
        btn.textContent = choiceText;
        btn.dataset.isCorrect = choice.isCorrect ? "1" : "0";
        btn.addEventListener("click", () => {
          if (resolved) return;
          resolved = true;
          Array.from(speedrunAnswerButtonsContainer.querySelectorAll("button")).forEach((b) => (b.disabled = true));
          resolve({ question: questionData, selectedIndex: index, selectedChoice: choice });
        });
        speedrunAnswerButtonsContainer.appendChild(btn);
      });
    }
    if (speedrunQuestionArea) {
      speedrunQuestionArea.classList.remove("hidden");
    }
  });
}

function showNextSpeedrunQuestion(previousResult) {
  if (!speedrunState.active) return;
  if (speedrunState.correctCount >= speedrunState.targetCorrect) {
    finishSpeedrun();
    return;
  }

  askSpeedrunQuestion(previousResult)
    .then((answerInfo) => {
      if (!speedrunState.active) return;
      const { question, selectedIndex, selectedChoice } = answerInfo || {};
      if (!question || typeof selectedIndex !== "number") {
        finishSpeedrun();
        return;
      }

      const correctIndex = typeof question.correctIndex === "number" ? question.correctIndex : null;
      const choiceList =
        (question && question.shuffledChoices) ||
        (question?.choices || []).map((text, index) => ({
          text,
          originalIndex: index,
          isCorrect: correctIndex != null ? correctIndex === index : false,
        }));
      const choiceEntry =
        selectedChoice ||
        (typeof selectedIndex === "number" && question?.shuffledChoices
          ? question.shuffledChoices[selectedIndex]
          : null);
      const correctChoice = choiceList.find((c) => c.isCorrect);
      const correctDisplayIndex =
        (question && question.shuffledCorrectIndex != null ? question.shuffledCorrectIndex : null) ??
        (correctChoice ? choiceList.indexOf(correctChoice) : correctIndex);
      const isCorrect =
        choiceEntry && typeof choiceEntry.isCorrect === "boolean"
          ? choiceEntry.isCorrect
          : correctIndex != null && selectedIndex === correctIndex;
      speedrunState.totalQuestions += 1;
      if (isCorrect) speedrunState.correctCount += 1;

      const correctText =
        correctChoice?.text ||
        (correctIndex != null && question?.choices ? question.choices[correctIndex] : "（正解不明）");
      const chosenText =
        choiceEntry?.text ||
        (question?.choices && typeof selectedIndex === "number" ? question.choices[selectedIndex] : "（選択なし）");
      const qText = question && question.question ? question.question : question?.text || "（問題文不明）";
      const difficulty = (question && question.difficulty) || speedrunState.currentDifficulty || "normal";

      speedrunState.history.push({
        questionText: qText,
        difficulty,
        isCorrect,
        correctText,
        chosenText,
        scoreGain: null,
      });

      if (correctDisplayIndex != null && speedrunAnswerButtonsContainer && speedrunAnswerButtonsContainer.children.length > 0) {
        const buttons = Array.from(speedrunAnswerButtonsContainer.children);
        buttons.forEach((btn, index) => {
          btn.classList.remove("correct-answer");
          if (index === correctDisplayIndex) {
            btn.classList.add("correct-answer");
          }
          btn.disabled = true;
        });
      }

      updateSpeedrunProgressDisplay();

      if (speedrunState.correctCount >= speedrunState.targetCorrect) {
        finishSpeedrun();
        return;
      }

      const resultForNext = {
        isCorrect,
        correctText,
      };
      showNextSpeedrunQuestion(resultForNext);
    })
    .catch((err) => {
      console.error(err);
      finishSpeedrun();
    });
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

// Legacy All toggle removed

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
  socket.emit("request_genre_counts");
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

  // Enforce Infinite Mode defaults
  const maxRoundsValue = null;
  const infiniteMode = true;
  const timeLimitValue = parseInt(timeLimitInput.value, 10) || 10;
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
    userId: myUserId,
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
  socket.emit("joinRoom", { roomId: inputRoomId, name: playerName, userId: myUserId });
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
  // timerText.textContent = ... (Removed)
  const countdownTimerEl = document.getElementById("countdown-timer");
  if (countdownTimerEl) {
    countdownTimerEl.textContent = `残り時間: ${remaining}`;
    countdownTimerEl.classList.remove("hidden");
  }

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
        const countdownTimerEl = document.getElementById("countdown-timer");
        if (countdownTimerEl) {
          countdownTimerEl.textContent = "時間切れ！";
        }
      }
    } else {
      // timerText.textContent = `制限時間: ${remaining} 秒`;
      const countdownTimerEl = document.getElementById("countdown-timer");
      if (countdownTimerEl) {
        countdownTimerEl.textContent = `残り時間: ${remaining}`;
      }
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

  // --- ソロモード：エンドレス ホーム遷移 ---
  if (btnSoloEndless) {
    btnSoloEndless.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("エンドレスモード選択");
      soloShowOnly("endlessConfig");
    });
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
  if (btnTimeAttackStart) {
    btnTimeAttackStart.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("タイムアタックのルール設定画面へ遷移");
      soloShowOnly("timeAttackConfig");
    });
  } else {
    console.warn("タイムアタック開始ボタンまたはセクションが見つかりません");
  }

  // ジャンル ALL トグル
  // Time Attack All toggle removed

  // タイムアタック中断 → 設定画面へ
  if (btnTimeAttackPause) {
    btnTimeAttackPause.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Time Attack 中断 → 設定画面に戻る");
      timeAttackState.active = false;
      timeAttackState.phase = "idle";
      stopTimeAttackLoop();
      soloShowOnly("timeAttackConfig");
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

  if (btnTimeAttackConfigBack) {
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
  if (btnTimeAttackResultBackConfig) {
    btnTimeAttackResultBackConfig.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Time Attack リザルト → ルール設定に戻る");
      timeAttackState.active = false;
      timeAttackState.phase = "idle";
      soloShowOnly("timeAttackConfig");
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
  if (btnSpeedrunStart) {
    btnSpeedrunStart.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("スピードランのルール設定画面へ遷移");
      soloShowOnly("speedrunConfig");
    });
  }

  // スピードラン ジャンルALL
  // Speedrun All toggle removed

  // スピードラン中断 → 設定
  if (btnSpeedrunPause) {
    btnSpeedrunPause.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Speedrun 中断 → 設定画面に戻る");
      speedrunState.active = false;
      stopSpeedrunLoop();
      soloShowOnly("speedrunConfig");
      if (speedrunCountdownEl) speedrunCountdownEl.classList.add("hidden");
      if (speedrunQuestionArea) speedrunQuestionArea.classList.add("hidden");
      if (speedrunLastResult) speedrunLastResult.classList.add("hidden");
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
  if (btnSpeedrunConfigBack) {
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
  if (btnSpeedrunResultBackConfig) {
    btnSpeedrunResultBackConfig.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Speedrun リザルト → ルール設定に戻る");
      speedrunState.active = false;
      stopSpeedrunLoop();
      soloShowOnly("speedrunConfig");
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

  // エンドレス：詳細ルール
  if (btnEndlessRules && endlessRulesPanel) {
    btnEndlessRules.addEventListener("click", (e) => {
      e.preventDefault();
      const isHidden = endlessRulesPanel.classList.contains("hidden");
      if (isHidden) {
        endlessRulesPanel.classList.remove("hidden");
      } else {
        endlessRulesPanel.classList.add("hidden");
      }
    });
  }

  // エンドレス ジャンルALL
  // Endless All toggle removed

  // エンドレス設定へ戻る
  if (btnEndlessConfigBack) {
    btnEndlessConfigBack.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Endless config → ソロメニューに戻る");
      resetEndlessToMenu();
    });
  }

  // エンドレス開始
  if (btnEndlessStart) {
    btnEndlessStart.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Endless 開始");
      beginEndlessGame();
    });
  }

  // エンドレス 次の問題へ
  if (btnEndlessNext) {
    btnEndlessNext.addEventListener("click", (e) => {
      e.preventDefault();
      endlessShowNextQuestion();
    });
  }

  // エンドレス 中断
  if (btnEndlessPause) {
    btnEndlessPause.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Endless 一時停止 → 設定へ");
      endlessState.active = false;
      stopEndlessLoop();
      soloShowOnly("endlessConfig");
    });
  }

  // エンドレス リスタート
  if (btnEndlessRestart) {
    btnEndlessRestart.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Endless リスタート");
      if (!lastEndlessConfig) {
        soloShowOnly("endlessConfig");
        return;
      }
      stopEndlessLoop();
      if (endlessQuestionArea) endlessQuestionArea.classList.add("hidden");
      if (endlessOptionsContainer) endlessOptionsContainer.classList.add("hidden");
      const genres = lastEndlessConfig.genres || [];
      const diffs = lastEndlessConfig.difficulties || [];
      const currentEndlessInputs = document.querySelectorAll('input[name="endless-genre"]');
      Array.from(currentEndlessInputs).forEach((cb) => {
        cb.checked = genres.includes(cb.value);
      });
      const diffBoxes = document.querySelectorAll('input[name="endless-difficulty"]');
      Array.from(diffBoxes).forEach((cb) => {
        cb.checked = diffs.includes(cb.value);
      });
      if (inputEndlessLife) inputEndlessLife.value = String(lastEndlessConfig.life || 3);
      beginEndlessGame(lastEndlessConfig);
    });
  }

  // 共通リザルト：問題一覧トグル
  if (btnToggleQuestionList && soloResultQuestionList) {
    btnToggleQuestionList.addEventListener("click", () => {
      const isHidden = soloResultQuestionList.classList.toggle("hidden");
      btnToggleQuestionList.textContent = isHidden ? "問題一覧を開く" : "問題一覧を閉じる";
    });
  }

  // 共通リザルト：ホームへ戻る
  if (btnSoloReturnMenu) {
    btnSoloReturnMenu.addEventListener("click", (e) => {
      e.preventDefault();
      resetSpeedrunToMenu();
      resetEndlessToMenu();
    });
  }

  // Time Attack リザルト：問題一覧トグル
  if (btnTimeAttackToggleList && timeAttackHistoryList) {
    btnTimeAttackToggleList.addEventListener("click", () => {
      const isHidden = timeAttackHistoryList.classList.toggle("hidden");
      btnTimeAttackToggleList.textContent = isHidden ? "問題一覧を開く" : "問題一覧を閉じる";
    });
  }
  // オンライン対戦ルール
  const btnOnlineRules = document.getElementById("btn-online-rules");
  const onlineRulesModal = document.getElementById("online-rules-modal");
  const btnCloseOnlineRules = document.getElementById("btn-close-online-rules");
  const btnCloseOnlineRulesFooter = document.getElementById("btn-close-online-rules-footer");

  if (btnOnlineRules && onlineRulesModal) {
    btnOnlineRules.addEventListener("click", (e) => {
      e.preventDefault();
      onlineRulesModal.classList.remove("hidden");
    });
  }

  const closeRules = (e) => {
    e.preventDefault();
    if (onlineRulesModal) onlineRulesModal.classList.add("hidden");
  };

  if (btnCloseOnlineRules) {
    btnCloseOnlineRules.addEventListener("click", closeRules);
  }
  if (btnCloseOnlineRulesFooter) {
    btnCloseOnlineRulesFooter.addEventListener("click", closeRules);
  }

  if (onlineRulesModal) {
    onlineRulesModal.addEventListener("click", (e) => {
      if (e.target === onlineRulesModal) {
        onlineRulesModal.classList.add("hidden");
      }
    });
  }
});
// === Friend Invitation Logic ===
const btnOpenInvite = document.getElementById("btn-open-invite");
const inviteFriendModal = document.getElementById("invite-friend-modal");
const btnCloseInviteModal = document.getElementById("btn-close-invite-modal");
const inviteFriendListEl = document.getElementById("invite-friend-list");

const invitationReceivedModal = document.getElementById("invitation-received-modal");
const invitationFromName = document.getElementById("invitation-from-name");
const invitationRoomName = document.getElementById("invitation-room-name");
const btnAcceptInvite = document.getElementById("btn-accept-invite");
const btnDeclineInvite = document.getElementById("btn-decline-invite");

let currentInvitation = null; // { roomId, roomName, fromName }

if (btnOpenInvite) {
  btnOpenInvite.addEventListener("click", async () => {
    if (!myUserId) {
      alert("ゲストモードでは招待できません。");
      return;
    }
    inviteFriendModal.classList.remove("hidden");
    // Load friends
    inviteFriendListEl.innerHTML = '<p style="text-align:center;color:#888;">読み込み中...</p>';
    const friends = await fetchFriends();

    inviteFriendListEl.innerHTML = "";
    if (friends.length === 0) {
      inviteFriendListEl.innerHTML = '<p class="info-text">フレンドがいません。</p>';
      return;
    }

    friends.forEach(f => {
      // 自分が作ったルームにいるはずなので、roomIdはグローバル変数にあるはず
      // しかし、waitingRoomContentなどを作るときにRoomIDを取得する必要がある。
      // 現在のアーキテクチャでは、createRoom後にroomIdがセットされる。

      const div = document.createElement("div");
      div.className = `friend-invite-item ${f.isOnline ? "online" : ""}`;

      const onlineDot = `<span class="invite-status-dot ${f.isOnline ? "online" : ""}"></span>`;

      div.innerHTML = `
        <div class="friend-invite-name">
          ${onlineDot} ${f.username} <span style="font-size:0.8em; opacity:0.7;">(ID:${f.id})</span>
        </div>
        <button class="btn-invite-action" data-id="${f.id}" ${!f.isOnline ? "disabled" : ""}>
          ${f.isOnline ? "招待" : "オフライン"}
        </button>
      `;

      const btn = div.querySelector("button");
      if (f.isOnline) {
        btn.addEventListener("click", () => {
          // Invite logic
          // roomId is globally available?
          // The roomId is in 'roomId' variable if 'roomCreated' or 'roomJoined' logic set it.
          // In 'roomCreated', we set 'roomId = data.roomId'. But 'roomCreated' is inside socket listener.
          // We need to ensure 'roomId' is updated in global scope.
          // Let's check 'roomCreated' listener.

          if (!roomId) {
            alert("ルームが見つかりません。");
            return;
          }

          socket.emit("inviteFriend", {
            targetUserId: f.id,
            roomId: roomId,
            fromName: playerName || "名無し",
            roomName: "クイズバトル" // 今はルーム名機能がないので固定
          });

          btn.textContent = "送信済";
          btn.disabled = true;
          btn.style.background = "#555";
        });
      }

      inviteFriendListEl.appendChild(div);
    });
  });
}

if (btnCloseInviteModal) {
  btnCloseInviteModal.addEventListener("click", () => {
    inviteFriendModal.classList.add("hidden");
  });
}

// Socket Listener for Invitation Received
socket.on("invitationReceived", (data) => {
  // data: { fromName, roomId, roomName }
  // Show Modal
  if (isInGame() && !isGameFinished()) {
    // ゲーム中は邪魔しない、あるいはToastにする？
    // 今回は簡易実装なので、ゲーム中だったら無視するか、あるいは表示する。
    // 表示して「参加する」を押すと退出扱いになる。
    // ひとまず表示する。
  }

  // 自分自身からの招待は来ないはずだが念のため
  if (data.roomId === roomId) return;

  currentInvitation = data;
  invitationFromName.textContent = data.fromName;
  invitationRoomName.textContent = data.roomName;
  invitationReceivedModal.classList.remove("hidden");
});

socket.on("invitationError", (msg) => {
  alert(msg);
});

socket.on("invitationSent", (msg) => {
  // Toast or something?
  // invite button turns to "Sent".
});

if (btnAcceptInvite) {
  btnAcceptInvite.addEventListener("click", () => {
    if (currentInvitation) {
      // Leave current room handled by server usually, but client state reset might be needed
      // Simulating Leave Room
      if (roomId) {
        // disconnect logic or refresh?
        // Simply emit joinRoom. Server should handle moving player.
        // Client state reset:
        resetGameClientState();
      }

      socket.emit("joinRoom", {
        roomId: currentInvitation.roomId,
        name: playerNameInput.value || "Guest",
        userId: myUserId
      });

      invitationReceivedModal.classList.add("hidden");
      currentInvitation = null;
    }
  });
}

if (btnDeclineInvite) {
  btnDeclineInvite.addEventListener("click", () => {
    invitationReceivedModal.classList.add("hidden");
    currentInvitation = null;
  });
}

function resetGameClientState() {
  // Reset essential game logic variables
  gameState = { round: 0, maxRounds: 10 };
  isEliminatedSelf = false;
  // Hide all screens
  waitRoomModal.classList.add("hidden");
  roomSettingsPanel.classList.add("hidden");
  hpSection.classList.add("hidden");
  questionSection.classList.add("hidden");
  resultSection.classList.add("hidden");
  finalSection.classList.add("hidden");
  // Show connecting/room section if needed
  roomSection.classList.remove("hidden");
  statusSection.classList.remove("hidden");
}

function isInGame() {
  return roomId && !isGameFinished();
}
function isGameFinished() {
  // check logic
  return false; // placeholder
}
