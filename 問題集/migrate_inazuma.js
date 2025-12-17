const fs = require('fs');
const path = require('path');

const questionsPath = path.join(__dirname, '..', 'questions.json');
const rawPath = path.join(__dirname, 'inazuma_raw.json');

const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
const newQuestions = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));

// Get max ID
let maxId = 0;
questions.forEach(q => {
    if (q.id > maxId) maxId = q.id;
});

const GENRE = 'inazuma_eleven'; // Matching the requested genre ID

let addedCount = 0;

newQuestions.forEach(q => {
    // Check duplicate by question text
    const exists = questions.some(existing => existing.question === q.question);
    if (!exists) {
        maxId++;
        questions.push({
            id: maxId,
            category: GENRE,
            difficulty: q.difficulty,
            type: 'choice',
            question: q.question,
            choices: q.choices,
            answerIndex: q.answerIndex
        });
        addedCount++;
    }
});

fs.writeFileSync(questionsPath, JSON.stringify(questions, null, 2));
console.log(`Added ${addedCount} questions.`);
