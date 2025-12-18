const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'naruto_revised.txt');
const outputFile = path.join(__dirname, 'naruto_revised.json');

const rawData = fs.readFileSync(inputFile, 'utf-8');
const lines = rawData.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');

const questions = [];
let currentDifficulty = 'EASY'; // Default
let currentQuestion = null;
let mode = 'IDLE'; // IDLE, QUESTION, CHOICE_A, CHOICE_B, CHOICE_C, CHOICE_D, ANSWER, EXPLANATION

// Helper to clean choice text (remove "(正解)" etc if present, though extracted text looks clean)
function cleanChoice(text) {
    return text.replace(/\s*\(正解\)/, '').replace(/\s*\(誤り\)/, '').trim();
}

function getAnswerIndex(letter) {
    const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
    return map[letter.toUpperCase()] || 0;
}

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect Difficulty Header
    if (line.match(/第I+部.*(Easy|下忍級)/i)) {
        currentDifficulty = 'EASY';
        continue;
    } else if (line.match(/第I+部.*(Normal|中忍級)/i)) {
        currentDifficulty = 'NORMAL';
        continue;
    } else if (line.match(/第I+部.*(Hard|上忍)/i)) {
        currentDifficulty = 'HARD';
        continue;
    }

    // Detect Start of Question (Number)
    // Ignore lines that are just "No." or table headers
    if (/^\d+$/.test(line)) {
        // If we were parsing a previous question, push it (unless it's null)
        if (currentQuestion) {
            questions.push(currentQuestion);
        }

        // Initialize new question
        currentQuestion = {
            id: parseInt(line), // Temporary ID, will be re-assigned in migration
            category: 'naruto',
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

    // Skip table headers and other non-relevant lines
    if (['No.', '問題文', '選択肢A', '選択肢B', '選択肢C', '選択肢D', '正解', '解説・出典', '引用文献'].includes(line)) {
        continue;
    }

    if (!currentQuestion) continue;

    switch (mode) {
        case 'QUESTION':
            currentQuestion.question = line;
            mode = 'CHOICE_A';
            break;
        case 'CHOICE_A':
            currentQuestion.choices.push(cleanChoice(line));
            mode = 'CHOICE_B';
            break;
        case 'CHOICE_B':
            currentQuestion.choices.push(cleanChoice(line));
            mode = 'CHOICE_C';
            break;
        case 'CHOICE_C':
            currentQuestion.choices.push(cleanChoice(line));
            mode = 'CHOICE_D';
            break;
        case 'CHOICE_D':
            currentQuestion.choices.push(cleanChoice(line));
            mode = 'ANSWER';
            break;
        case 'ANSWER':
            // Expecting A, B, C, D
            if (/^[ABCD]$/.test(line)) {
                currentQuestion.answerIndex = getAnswerIndex(line);
                mode = 'EXPLANATION';
            } else {
                // Fallback if formatting is weird? matching "正解 C" etc
                const match = line.match(/^([ABCD])/);
                if (match) {
                    currentQuestion.answerIndex = getAnswerIndex(match[1]);
                    mode = 'EXPLANATION';
                }
            }
            break;
        case 'EXPLANATION':
            // Capture explanation until next number or end of section
            // But usually explanation is one line or until the next number hits.
            // Since we check for number at the start of loop, here we just append or set.
            if (currentQuestion.explanation === '') {
                currentQuestion.explanation = line;
            } else {
                currentQuestion.explanation += '\n' + line;
            }
            break;
    }
}

// Push the last question
if (currentQuestion) {
    questions.push(currentQuestion);
}

console.log(`Parsed ${questions.length} questions.`);
fs.writeFileSync(outputFile, JSON.stringify(questions, null, 2));
