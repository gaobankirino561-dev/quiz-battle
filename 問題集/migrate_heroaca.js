const fs = require('fs');
const path = require('path');

// Logic to find questions.json. 
// If run from '問題集', it's in parent.
// If run from root, it's ./questions.json
// We assume execution from '問題集' directory as per previous runs.
const questionsPath = path.resolve(__dirname, '..', 'questions.json');
const heroacaFile = path.join(__dirname, 'heroaca_parsed.json');

console.log(`Reading questions from ${questionsPath}`);
let questions = [];

if (fs.existsSync(questionsPath)) {
    questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
} else {
    console.error("questions.json not found!");
    process.exit(1);
}

const heroacaRaw = JSON.parse(fs.readFileSync(heroacaFile, 'utf-8'));

// Find max ID
let maxId = 0;
questions.forEach(q => {
    if (q.id && q.id > maxId) maxId = q.id;
});

console.log(`Current Max ID: ${maxId}`);
let currentId = maxId + 1;

// Process new questions
const newQuestions = heroacaRaw.map((raw) => {
    const choices = raw.options; // Already clean
    const answerIndex = choices.indexOf(raw.correctAnswer);

    if (answerIndex === -1) {
        console.warn(`Warning: Answer "${raw.correctAnswer}" not found in choices for question: ${raw.question}`);
    }

    // Assign new ID
    const qObj = {
        id: currentId++,
        category: "heroaca", // Matches genre config
        difficulty: raw.difficulty,
        type: "choice",
        question: raw.question,
        choices: choices,
        answerIndex: answerIndex,
        // Optional fields
        explanation: raw.explanation
    };
    return qObj;
});

console.log(`Adding ${newQuestions.length} new questions.`);

// Append
const updatedQuestions = questions.concat(newQuestions);

// Write back
fs.writeFileSync(questionsPath, JSON.stringify(updatedQuestions, null, 2));
console.log("Migration complete.");
