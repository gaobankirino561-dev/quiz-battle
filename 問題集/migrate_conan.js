const fs = require('fs');
const path = require('path');

const questionFile = path.join(__dirname, '../questions.json');
const newConanFile = path.join(__dirname, 'conan_revised.json');

// Read files
const existingQuestions = JSON.parse(fs.readFileSync(questionFile, 'utf-8'));
const newConanQuestions = JSON.parse(fs.readFileSync(newConanFile, 'utf-8'));

console.log(`Total questions before: ${existingQuestions.length}`);

// Filter out old Conan questions
// Category assumed to be 'detective_conan' or 'conan'. 
// We will look for anything looking like Conan.
// Let's assume the previous ID usage or category name.
// Current parser sets category to 'detective_conan'.
// We should check what the old category was. 
// However, if we filter by 'detective_conan', and the old ones were named differently, we might duplicate.
// But the user asked to "replace".
// Let's check if there are existing 'detective_conan' or similar. 
// Safest is to remove 'detective_conan' AND 'conan' AND 'meitantei_conan' if they exist.

const remainingQuestions = existingQuestions.filter(q =>
    q.category !== 'detective_conan' &&
    q.category !== 'conan' &&
    q.category !== 'meitantei_conan'
);

console.log(`Questions after removing old Conan: ${remainingQuestions.length}`);
console.log(`Removed: ${existingQuestions.length - remainingQuestions.length}`);

// Find max ID logic
let maxId = 0;
if (remainingQuestions.length > 0) {
    maxId = Math.max(...remainingQuestions.map(q => q.id));
}

console.log(`Max ID found: ${maxId}`);

// Prepare new questions
const questionsToAdd = newConanQuestions.map((q, index) => {
    return {
        ...q,
        id: maxId + 1 + index,
        category: 'detective_conan' // Normalize category name
    };
});

console.log(`Adding ${questionsToAdd.length} new Conan questions.`);

// Combine
const finalQuestions = remainingQuestions.concat(questionsToAdd);

console.log(`Final total questions: ${finalQuestions.length}`);

// Write back
fs.writeFileSync(questionFile, JSON.stringify(finalQuestions, null, 2));
console.log('Migration completed successfully.');
