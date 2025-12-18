const fs = require('fs');
const path = require('path');

const questionsFile = path.join(__dirname, '../questions.json');
const newQuestionsFile = path.join(__dirname, 'naruto_revised.json');

// Read existing questions
let questions = JSON.parse(fs.readFileSync(questionsFile, 'utf-8'));

// Read new Naruto questions
const newNarutoQuestions = JSON.parse(fs.readFileSync(newQuestionsFile, 'utf-8'));

// Filter out existing Naruto questions (Old Category might be 'naruto' or 'NARUTO')
console.log(`Original total questions: ${questions.length}`);
questions = questions.filter(q => q.category !== 'naruto');
console.log(`Questions after removing 'naruto': ${questions.length}`);

// Get the last ID to continue numbering
let lastId = questions.length > 0 ? Math.max(...questions.map(q => q.id)) : 0;
console.log(`Last ID was: ${lastId}`);

// Assign new IDs and append
newNarutoQuestions.forEach((q, index) => {
    q.id = lastId + 1 + index;
    questions.push(q);
});

console.log(`Added ${newNarutoQuestions.length} new Naruto questions.`);
console.log(`New total questions: ${questions.length}`);

// Write back to questions.json
fs.writeFileSync(questionsFile, JSON.stringify(questions, null, 2));
console.log('Migration completed successfully.');
