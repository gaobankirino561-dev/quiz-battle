const socket = io();

let playerName = "";
let roomId = "";
let myPlayerId = null;
let gameState = {
  myHp: 20,
  opponentHp: 20,
  round: 0,
  maxRounds: 10,
};

let currentQuestionId = null;
let answering = false;
let questionStartTime = null;

// DOM elements
const playerNameInput = document.getElementById("playerNameInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomIdInput = document.getElementById("roomIdInput");
const roomInfo = document.getElementById("roomInfo");
const connectionStatus = document.getElementById("connectionStatus");
const gameStatus = document.getElementById("gameStatus");

const nameSection = document.getElementById("name-section");
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
const skipAnswerBtn = document.getElementById("skipAnswerBtn");

const roundResultText = document.getElementById("roundResultText");
const correctAnswerText = document.getElementById("correctAnswerText");
const nextRoundBtn = document.getElementById("nextRoundBtn");

const finalResultTitle = document.getElementById("finalResultTitle");
const finalResultDetail = document.getElementById("finalResultDetail");
const reloadBtn = document.getElementById("reloadBtn");

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
  socket.emit("createRoom", { name: playerName });
});

joinRoomBtn.addEventListener("click", () => {
  playerName = playerNameInput.value.trim() || "Player";
  const inputRoomId = roomIdInput.value.trim();
  if (!inputRoomId) {
    alert("ルームIDを入力してください");
    return;
  }
  socket.emit("joinRoom", { roomId: inputRoomId, name: playerName });
});

socket.on("roomCreated", (data) => {
  roomId = data.roomId;
  myPlayerId = data.playerId;
  roomInfo.textContent = `ルームID: ${roomId}（相手に伝えてください）`;
  gameStatus.textContent = "相手の参加を待っています...";
});

socket.on("roomJoined", (data) => {
  roomId = data.roomId;
  myPlayerId = data.playerId;
  roomInfo.textContent = `ルームID: ${roomId}`;
  gameStatus.textContent = "ルームに参加しました。相手の準備を待っています...";
});

socket.on("roomError", (msg) => {
  alert(msg);
});

socket.on("gameStart", (data) => {
  nameSection.classList.add("hidden");
  hpSection.classList.remove("hidden");
  gameState.myHp = data.initialHp;
  gameState.opponentHp = data.initialHp;
  gameState.round = 0;
  gameState.maxRounds = data.maxRounds;

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

  resultSection.classList.add("hidden");
  finalSection.classList.add("hidden");
  questionSection.classList.remove("hidden");

  roundInfo.textContent = `ラウンド ${data.round} / ${gameState.maxRounds}`;
  questionText.textContent = `[${data.question.difficulty}] ${data.question.question}`;
  timerText.textContent = "回答中...";

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
  questionSection.classList.add("hidden");
  resultSection.classList.remove("hidden");
  nextRoundBtn.classList.toggle("hidden", !data.canContinue);

  gameState.myHp = data.you.hp;
  gameState.opponentHp = data.opponent.hp;
  updateHpBars();

  roundResultText.textContent = data.message;
  correctAnswerText.textContent = `正解: ${data.correctAnswer}`;
  gameStatus.textContent = data.gameStatusText || "";

  if (!data.canContinue && data.gameOverInfo) {
    showFinalResult(data.gameOverInfo);
  }
});

socket.on("gameOver", (data) => {
  questionSection.classList.add("hidden");
  resultSection.classList.add("hidden");
  hpSection.classList.remove("hidden");
  showFinalResult(data);
});

nextRoundBtn.addEventListener("click", () => {
  socket.emit("nextQuestion", { roomId });
});

reloadBtn.addEventListener("click", () => {
  window.location.reload();
});

function updateHpBars() {
  const myPercent = Math.max(0, (gameState.myHp / 20) * 100);
  const oppPercent = Math.max(0, (gameState.opponentHp / 20) * 100);
  myHpBar.style.width = myPercent + "%";
  opponentHpBar.style.width = oppPercent + "%";
  myHpText.textContent = `${gameState.myHp} / 20`;
  opponentHpText.textContent = `${gameState.opponentHp} / 20`;
}

function showFinalResult(info) {
  finalSection.classList.remove("hidden");
  const { winner, reason, yourHp, opponentHp } = info;
  finalResultTitle.textContent = winner === "you" ? "あなたの勝ち！" : winner === "draw" ? "引き分け" : "あなたの負け...";
  finalResultDetail.textContent = `理由: ${reason} / あなたHP=${yourHp}, 相手HP=${opponentHp}`;
}
