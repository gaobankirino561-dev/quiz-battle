const fs = require('fs');
const path = require('path');

const questionsPath = path.join(__dirname, '..', 'questions.json');
const newInazumaPath = path.join(__dirname, 'inazuma_revised.json');

// Read files
const existingQuestions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
const newInazumaQuestions = JSON.parse(fs.readFileSync(newInazumaPath, 'utf8'));

console.log(`Original total: ${existingQuestions.length}`);

// 1. Remove existing Inazuma Eleven questions
let updatedQuestions = existingQuestions.filter(q => q.category !== 'inazuma_eleven');
console.log(`After removing Inazuma: ${updatedQuestions.length}`);

// Helper to clean choices
function cleanChoiceDetails(text) {
    if (typeof text !== 'string') return text;
    // Remove (text) or （text）
    // Also trim whitespace
    return text.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();
}

// 2. Clean 'heroaca' choices
let heroacaCount = 0;
updatedQuestions.forEach(q => {
    if (q.category === 'heroaca') {
        q.choices = q.choices.map(c => cleanChoiceDetails(c));
        heroacaCount++;
    }
});
console.log(`Cleaned choices for ${heroacaCount} HeroAca questions.`);

// 3. Prepare new Inazuma questions
// Determine max ID
let maxId = 0;
updatedQuestions.forEach(q => {
    if (q.id > maxId) maxId = q.id;
});
console.log(`Max ID so far: ${maxId}`);

newInazumaQuestions.forEach((q, index) => {
    q.id = maxId + 1 + index;
    // Ensure choices are cleaned (parser did it, but safe to double check)
    q.choices = q.choices.map(c => cleanChoiceDetails(c));
    updatedQuestions.push(q);
});

console.log(`New Inazuma questions added: ${newInazumaQuestions.length}`);
console.log(`Final total: ${updatedQuestions.length}`);

// 4. Save
fs.writeFileSync(questionsPath, JSON.stringify(updatedQuestions, null, 2), 'utf8');
console.log('Migration completed successfully.');
