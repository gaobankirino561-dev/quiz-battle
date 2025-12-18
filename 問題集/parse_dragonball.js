const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'dragonball_revised.txt');
const content = fs.readFileSync(inputFile, 'utf-8');

// Helper to clean parenthetical text from choices
function cleanChoice(text) {
    if (!text) return "";
    // Remove (text) or （text）
    return text.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();
}

const lines = content.split(/\r?\n/).map(line => line.trim());

const questions = [];
let currentQuestion = null;
let currentDifficulty = 'EASY'; // Default start
let mode = 'IDLE'; // IDLE, QUESTION, CHOICE_COLLECTION
let choiceBuffer = [];

// Format:
// 【第1問】
// 問題文: ...
// Choice 1
// Choice 2
// Choice 3
// Choice 4
// 正解: 2
// 解説: ...

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Difficulty Detection by Section Headers
    if (line.match(/第\d+部/)) {
        if (line.includes('Easy') || line.includes('初級')) { currentDifficulty = 'EASY'; }
        if (line.includes('Normal') || line.includes('中級')) { currentDifficulty = 'NORMAL'; }
        if (line.includes('Hard') || line.includes('上級')) { currentDifficulty = 'HARD'; }
        continue;
    }

    // Start of Question
    const qMatch = line.match(/^【第(\d+)問】$/);
    if (qMatch) {
        // Save previous
        if (currentQuestion) {
            questions.push(currentQuestion);
        }

        currentQuestion = {
            id: parseInt(qMatch[1]), // Temp ID
            category: 'dragon_ball',
            difficulty: currentDifficulty,
            type: 'choice',
            question: '',
            choices: [],
            answerIndex: 0,
            explanation: ''
        };
        mode = 'QUESTION_TEXT';
        choiceBuffer = [];
        continue;
    }

    if (!currentQuestion) continue;

    if (mode === 'QUESTION_TEXT') {
        if (line.startsWith('問題文:')) {
            currentQuestion.question = line.replace('問題文:', '').trim();
            mode = 'CHOICE_COLLECTION';
        } else if (line.startsWith('問題文：')) { // Handle full-width colon just in case
            currentQuestion.question = line.replace('問題文：', '').trim();
            mode = 'CHOICE_COLLECTION';
        }
        continue;
    }

    if (mode === 'CHOICE_COLLECTION') {
        // We expect 4 choices, then "正解:"
        if (line.startsWith('正解:') || line.startsWith('正解：')) {
            // Process Answer
            const ansStr = line.replace(/正解[:：]/, '').trim();
            // Answer is 1-based index
            const ansNum = parseInt(ansStr);
            if (!isNaN(ansNum)) {
                currentQuestion.answerIndex = ansNum - 1; // Convert to 0-based
            }
            // Assign buffered choices
            currentQuestion.choices = choiceBuffer.map(c => cleanChoice(c));
            mode = 'EXPLANATION';
        } else {
            // Collect choices
            // Sometimes choices might have prefix? No, based on file view it is just text.
            // But we should be careful not to consume empty lines or weird stuff.
            // Assuming the next 4 non-empty lines are choices.
            if (choiceBuffer.length < 4) {
                choiceBuffer.push(line);
            }
        }
        continue;
    }

    if (mode === 'EXPLANATION') {
        // Detect difficulty headers inside explanation mode
        if (line.match(/第\d+部/)) {
            if (line.includes('Easy') || line.includes('初級')) { currentDifficulty = 'EASY'; console.error('Switched to EASY expl'); }
            if (line.includes('Normal') || line.includes('中級')) { currentDifficulty = 'NORMAL'; console.error('Switched to NORMAL expl'); }
            if (line.includes('Hard') || line.includes('上級')) { currentDifficulty = 'HARD'; console.error('Switched to HARD expl'); }
            mode = 'IDLE';
            continue;
        }

        if (line.startsWith('解説:') || line.startsWith('解説：')) {
            currentQuestion.explanation = line.replace(/解説[:：]/, '').trim();
        } else {
            // Append multi-line explanation
            // Stop if we hit next question (handled at top) or new section (handled at top)
            // But we might hit transition lines like numbers or descriptions
            if (line.match(/^【第\d+問】$/)) {
                // Should correspond to next loop iteration, but we are inside loop.
                // Actually this case is handled by top `if (qMatch)` check? 
                // No, that check is at start of loop.
                // Use continue to let top check handle it? 
                // Yes, but we need to ensure we don't consume it here.
                // This `else` block is for "following lines".
                // Since we check `qMatch` at start of loop, we don't need to do anything special here unless we want to filter garbage.
            } else {
                if (currentQuestion.explanation) {
                    currentQuestion.explanation += "\n" + line;
                }
            }
        }
    }
}

// Push last
if (currentQuestion) {
    questions.push(currentQuestion);
}

// Post-processing: Assign final clean IDs or just keep as is?
// We will let migration script handle ID assignment to avoid conflicts.
// This parser just outputs the structure.

console.log(JSON.stringify(questions, null, 2));
