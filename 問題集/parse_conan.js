const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'conan_revised.txt');
const content = fs.readFileSync(inputFile, 'utf-8');

// Helper to clean parenthetical text from choices
function cleanChoice(text) {
    if (!text) return "";
    // Remove A. B. C. D. prefixes if they exist in the text already (parser might strip them)
    // But here we want to remove (text) or （text） markers
    // Also remove "A. " prefix if it was captured in the line
    let cleaned = text.replace(/^[A-D]\.\s*/, '');
    return cleaned.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();
}

const lines = content.split(/\r?\n/).map(line => line.trim());

const questions = [];
let currentQuestion = null;
let currentDifficulty = 'EASY'; // Default start
let mode = 'IDLE'; // IDLE, QUESTION, CHOICE_COLLECTION, EXPLANATION
let choiceBuffer = [];

// Format analysis:
// Section: ...（Level: Easy）
// Question: 【Q1】 ...
// Choices: A. ...
// Answer: 【解答】 B
// Explanation: 【解説】 or 【論証】 ...

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Difficulty Detection by Section Headers
    if (line.includes('Level: Easy') || line.includes('初級')) { currentDifficulty = 'EASY'; continue; }
    if (line.includes('Level: Normal') || line.includes('中級')) { currentDifficulty = 'NORMAL'; continue; }
    if (line.includes('Level: Hard') || line.includes('上級')) { currentDifficulty = 'HARD'; continue; }

    // Start of Question
    const qMatch = line.match(/^【Q(\d+)】/); // Match start of line
    if (qMatch) {
        // Save previous
        if (currentQuestion) {
            questions.push(currentQuestion);
        }

        // Initialize new question
        currentQuestion = {
            id: parseInt(qMatch[1]), // Temp ID based on Q number
            category: 'detective_conan', // Valid category
            difficulty: currentDifficulty,
            type: 'choice',
            question: line.replace(/^【Q\d+】\s*/, '').trim(), // Remove Q header from text
            choices: [],
            answerIndex: 0,
            explanation: ''
        };
        mode = 'CHOICE_COLLECTION'; // Conan text has question on one line usually
        choiceBuffer = [];
        continue;
    }

    if (!currentQuestion) continue;

    // In Conan text, Q is one line. So we go straight to looking for choices or answer.

    // Check for Answer line first (it ends choice collection)
    if (line.startsWith('【解答】')) {
        const ansChar = line.replace('【解答】', '').trim().charAt(0);
        // Map A->0, B->1, C->2, D->3
        const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
        if (map.hasOwnProperty(ansChar)) {
            currentQuestion.answerIndex = map[ansChar];
        }

        // Finalize choices
        currentQuestion.choices = choiceBuffer.map(c => cleanChoice(c));
        mode = 'EXPLANATION';
        continue;
    }

    if (mode === 'CHOICE_COLLECTION') {
        // Assume lines starting with A. B. C. D. are choices
        if (line.match(/^[A-D]\.\s/)) {
            choiceBuffer.push(line);
        } else if (choiceBuffer.length > 0 && !line.startsWith('【')) {
            // Multi-line choice? Or garbage? 
            // If we already have some choices, maybe this is continuation of previous choice
            // But simpler to just ignore or append. 
            // Let's assume one line per choice for now based on file view.
        }
        continue;
    }

    if (mode === 'EXPLANATION') {
        // Detect difficulty headers inside explanation mode (just in case)
        if (line.includes('Level: Easy') || line.includes('Level: Normal') || line.includes('Level: Hard')) {
            if (line.includes('Level: Easy')) currentDifficulty = 'EASY';
            if (line.includes('Level: Normal')) currentDifficulty = 'NORMAL';
            if (line.includes('Level: Hard')) currentDifficulty = 'HARD';
            mode = 'IDLE';
            continue;
        }

        if (line.startsWith('【解説】') || line.startsWith('【論証】')) {
            currentQuestion.explanation = line.replace(/【解説】|【論証】/, '').trim();
        } else {
            // Append to explanation until next question
            if (line.match(/^【Q\d+】/)) {
                // Next loop iteration will handle this
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

console.log(JSON.stringify(questions, null, 2));
