const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'inazuma_revised.txt');
const content = fs.readFileSync(inputFile, 'utf-8');

// Helper to clean parenthetical text from choices
function cleanChoice(text) {
    // Remove (text) or （text）
    return text.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();
}

const lines = content.split(/\r?\n/).map(line => line.trim());

const questions = [];
let currentQuestion = null;
let currentDifficulty = 'EASY'; // Default start
let mode = 'IDLE'; // IDLE, QUESTION, CHOICES, EXPLANATION

// Markers
// "第1章：基礎編 (EASY)" -> Switch difficulty
// "Q[Number]" -> Start new question
// "A. ", "B. ", "C. ", "D. " -> Choices
// "解答" -> Next line is answer char
// "解説・考察" -> Next lines are explanation

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Difficulty Detection
    if (line.includes('基礎編 (EASY)')) { currentDifficulty = 'EASY'; continue; }
    if (line.includes('応用編 (NORMAL)')) { currentDifficulty = 'NORMAL'; continue; }
    if (line.includes('専門編 (HARD)')) { currentDifficulty = 'HARD'; continue; }

    // Start of Question
    // Match exactly Q1, Q2... or Q150
    const qMatch = line.match(/^Q(\d+)$/);
    if (qMatch) {
        // Save previous if exists
        if (currentQuestion) {
            questions.push(currentQuestion);
        }
        currentQuestion = {
            id: parseInt(qMatch[1]), // Temp ID
            category: 'inazuma_eleven',
            difficulty: currentDifficulty,
            type: 'choice',
            question: '',
            choices: [],
            answerIndex: 0,
            explanation: ''
        };
        mode = 'QUESTION';
        continue;
    }

    if (!currentQuestion) continue;

    if (mode === 'QUESTION') {
        // Next line after Qx is usually question text.
        // But formatting might have headers like "問題文"
        if (line === '問題文' || line === '選択肢' || line === '解答' || line === '解説・考察' || line === 'No.') continue;

        // Skip Section Headers and Subheaders
        if (line.match(/^\d+\.\d+/)) continue; // 2.1, 2.2 etc
        if (line.includes('クイズデータベース')) continue;
        if (line.startsWith('第') && line.includes('章')) continue;

        // If it starts with A. it's likely we missed the switch to choices or formatting is tight
        if (line.match(/^[A]\.\s/)) {
            mode = 'CHOICES';
            // fallthrough to handle A
        } else {
            // Append to question text (allow multi-line)
            if (!currentQuestion.question) currentQuestion.question = line;
            else currentQuestion.question += " " + line;
            continue;
        }
    }

    if (line.startsWith('A.') || line.startsWith('A．')) {
        mode = 'CHOICES';
        currentQuestion.choices[0] = cleanChoice(line.substring(2).trim());
        continue;
    }
    if (line.startsWith('B.') || line.startsWith('B．')) {
        currentQuestion.choices[1] = cleanChoice(line.substring(2).trim());
        continue;
    }
    if (line.startsWith('C.') || line.startsWith('C．')) {
        currentQuestion.choices[2] = cleanChoice(line.substring(2).trim());
        continue;
    }
    if (line.startsWith('D.') || line.startsWith('D．')) {
        currentQuestion.choices[3] = cleanChoice(line.substring(2).trim());
        continue;
    }

    // Answer Key (Single char)
    // Only accept if we are in choices mode or transition
    if (['A', 'B', 'C', 'D'].includes(line) && line.length === 1) {
        const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
        currentQuestion.answerIndex = map[line];
        mode = 'ANSWER_DETAIL';
        continue;
    }

    if (line.startsWith('【正解：')) {
        mode = 'EXPLANATION';
        continue;
        // We could verify answer text here but trusting index is safer for now
    }

    if (line === '解説・考察') {
        mode = 'EXPLANATION';
        continue;
    }

    if (mode === 'EXPLANATION') {
        // Check if line looks like a header or transition text
        if (line.match(/^\d+\.\d+/) ||
            (line.startsWith('第') && (line.includes('章') || line.includes('期'))) ||
            line.includes('クイズデータベース') ||
            line === 'No.' || line === '問題文' || line === '選択肢' || line === '解答') {
            mode = 'IDLE';
            continue;
        }

        // Accumulate explanation
        // If we hit next Q, valid check happens at top
        if (currentQuestion.explanation) currentQuestion.explanation += "\n" + line;
        else currentQuestion.explanation = line;
    }
}

// Push last
if (currentQuestion) {
    questions.push(currentQuestion);
}

console.log(JSON.stringify(questions, null, 2));
