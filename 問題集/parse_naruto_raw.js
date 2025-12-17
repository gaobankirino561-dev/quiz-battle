const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'ナルト_utf8.txt');
const content = fs.readFileSync(inputFile, 'utf-8');

const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');

const questions = [];
let currentDifficulty = 'EASY';

lines.forEach((line, index) => {
    // Basic header detection
    if (line.toLowerCase().includes('easy')) { currentDifficulty = 'EASY'; }
    else if (line.toLowerCase().includes('normal')) { currentDifficulty = 'NORMAL'; }
    else if (line.toLowerCase().includes('hard')) { currentDifficulty = 'HARD'; }
    // Note: Don't return here because the line might ALSO contain a question, e.g. "Easy1. Question..."

    // Normalize spaces and convert full-width chars if necessary (though utf8.txt should be standard)
    let normalized = line.replace(/\s+/g, ' ').trim();

    // Regex explanation:
    // ^(?:.+?[\d\.]+)? : Optional prefix like "1." or "Easy1."
    // (.+?) : Question text (lazy)
    // [AＡ][\.\．]\s* : Option A marker (A or full-width A, mandatory dot or full-width dot, optional space)
    // ...
    const regex = /^(?:.*?[\d]+\.\s*)?(.+?)\s*[AＡ][\.\．]\s*(.+?)\s*[BＢ][\.\．]\s*(.+?)\s*[CＣ][\.\．]\s*(.+?)\s*[DＤ][\.\．]\s*(.+)$/i;

    const match = normalized.match(regex);

    if (match) {
        // Filter out header text if it got captured in the question
        let qText = match[1].trim();
        // Remove "Naruto Quiz QuestionsEasy" garbage if present
        qText = qText.replace(/Naruto Quiz Questions/i, '').replace(/Easy|Normal|Hard/i, '').trim();

        questions.push({
            difficulty: currentDifficulty,
            question: qText,
            choices: [match[2].trim(), match[3].trim(), match[4].trim(), match[5].trim()]
        });
    } else {
        if (index < 5 && line.length > 20) console.error(`No match line ${index}:`, normalized);
    }
});

console.log(JSON.stringify(questions, null, 2));
