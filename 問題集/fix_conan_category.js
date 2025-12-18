const fs = require('fs');
const path = require('path');

const questionFile = path.join(__dirname, '../questions.json');
const questions = JSON.parse(fs.readFileSync(questionFile, 'utf-8'));

let matchCount = 0;
const updatedQuestions = questions.map(q => {
    if (q.category === 'detective_conan') {
        matchCount++;
        return { ...q, category: 'conan' }; // Normalize to what client expects
    }
    return q;
});

console.log(`Found and updated ${matchCount} questions from 'detective_conan' to 'conan'.`);

if (matchCount > 0) {
    fs.writeFileSync(questionFile, JSON.stringify(updatedQuestions, null, 2));
    console.log('questions.json updated successfully.');
} else {
    console.log('No questions found needing update.');
}
