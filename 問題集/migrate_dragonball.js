const fs = require('fs');
const path = require('path');

const questionFile = path.join(__dirname, '../questions.json');
const newDragonBallFile = path.join(__dirname, 'dragonball_revised.json');

// Read files
const existingQuestions = JSON.parse(fs.readFileSync(questionFile, 'utf-8'));
const newDragonBallQuestions = JSON.parse(fs.readFileSync(newDragonBallFile, 'utf-8'));

console.log(`Total questions before: ${existingQuestions.length}`);

// Filter out old Dragon Ball questions
// Category logic: 'dragonball' seems to be the one in use.
// We will remove any that match 'dragonball' or 'dragon_ball' just in case.
const remainingQuestions = existingQuestions.filter(q => q.category !== 'dragonball' && q.category !== 'dragon_ball');

console.log(`Questions after removing old Dragon Ball: ${remainingQuestions.length}`);
console.log(`Removed: ${existingQuestions.length - remainingQuestions.length}`);

// Find max ID logic
let maxId = 0;
if (remainingQuestions.length > 0) {
    maxId = Math.max(...remainingQuestions.map(q => q.id));
}

console.log(`Max ID found: ${maxId}`);

// Prepare new questions
const questionsToAdd = newDragonBallQuestions.map((q, index) => {
    return {
        ...q,
        id: maxId + 1 + index,
        category: 'dragonball' // Normalize category name
    };
});

console.log(`Adding ${questionsToAdd.length} new Dragon Ball questions.`);

// Combine
const finalQuestions = remainingQuestions.concat(questionsToAdd);

console.log(`Final total questions: ${finalQuestions.length}`);

// Write back
fs.writeFileSync(questionFile, JSON.stringify(finalQuestions, null, 2));
console.log('Migration completed successfully.');
