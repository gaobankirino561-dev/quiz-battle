const fs = require('fs');
const path = require('path');

const questionsPath = path.join(__dirname, 'questions.json');
const lifestylePath = path.join(__dirname, '問題集', '生活A.txt');

// Read existing questions
const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

// 1. Rename 'general' to 'common_knowledge'
let renameCount = 0;
questions.forEach(q => {
    if (q.category === 'general') {
        q.category = 'common_knowledge';
        renameCount++;
    }
});
console.log(`Renamed ${renameCount} questions from 'general' to 'common_knowledge'.`);

// 2. Parse Lifestyle Questions
// Find max ID
let maxId = 0;
questions.forEach(q => {
    if (q.id > maxId) maxId = q.id;
});
let currentId = maxId + 1;

const rawText = fs.readFileSync(lifestylePath, 'utf8');
const lines = rawText.split(/\r?\n/).map(l => l.trim());

const newQuestions = [];
let i = 0;

console.log("Parsing Lifestyle questions...");

while (i < lines.length) {
    const line = lines[i];

    // Header format: "EASY Q1" or "EASY（生活）20問" (skip file header)
    // We look for "DIFFICULTY Q#"
    const headerMatch = line.match(/^(EASY|NORMAL|HARD)\s+Q(\d+)/);

    if (headerMatch) {
        const difficulty = headerMatch[1];
        i++; // Move to next line (Question text)

        if (i >= lines.length) break;

        // Skip empty lines to find question text
        while (i < lines.length && lines[i] === "") i++;
        const qText = lines[i];
        i++;

        // Collect choice lines until "正解："
        let choiceTextBuffer = "";
        while (i < lines.length && !lines[i].startsWith("正解：")) {
            if (lines[i] !== "") {
                choiceTextBuffer += " " + lines[i];
            }
            i++;
        }

        // Parse Answer
        let answerIndex = 0;
        if (i < lines.length && lines[i].startsWith("正解：")) {
            const ansMatch = lines[i].match(/^正解：([A-D])/);
            if (ansMatch) {
                const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
                answerIndex = map[ansMatch[1]];
            }
            i++;
        }

        // Parse Choices
        const fullText = choiceTextBuffer.trim();
        let cA = "", cB = "", cC = "", cD = "";
        const idxA = fullText.indexOf("A.");
        const idxB = fullText.indexOf("B.");
        const idxC = fullText.indexOf("C.");
        const idxD = fullText.indexOf("D.");

        if (idxA !== -1 && idxB !== -1 && idxC !== -1 && idxD !== -1) {
            cA = fullText.substring(idxA + 2, idxB).trim();
            cB = fullText.substring(idxB + 2, idxC).trim();
            cC = fullText.substring(idxC + 2, idxD).trim();
            cD = fullText.substring(idxD + 2).trim();

            newQuestions.push({
                id: currentId++,
                category: 'lifestyle',
                difficulty: difficulty,
                type: 'choice',
                question: qText,
                choices: [cA, cB, cC, cD],
                answerIndex: answerIndex
            });
        } else {
            console.warn(`Skipping Lifestyle Q (parse error): ${qText}`);
        }
    } else {
        i++;
    }
}

console.log(`Parsed ${newQuestions.length} Lifestyle questions.`);

// Merge
const finalQuestions = [...questions, ...newQuestions];

// Backup
fs.copyFileSync(questionsPath, questionsPath + '.bak_migration');

// Save
fs.writeFileSync(questionsPath, JSON.stringify(finalQuestions, null, 2));
console.log(`Updated questions.json with ${finalQuestions.length} total questions.`);
