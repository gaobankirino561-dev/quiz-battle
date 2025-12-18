const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'heroaca_extracted.txt');
const outputFile = path.join(__dirname, 'heroaca_parsed.json');

const rawText = fs.readFileSync(inputFile, 'utf-8');
const lines = rawText.split(/\r?\n/);

const questions = [];
let currentDifficulty = null;
let currentQuestion = null;
/*
  structure:
  {
    id_suffix: number,
    difficulty: string,
    question: string,
    options: {A: str, B: str, C: str, D: str},
    correctLetter: char,
    explanation: string,
    raw_options: [] // temp storage
  }
*/

/* Helper to save current question */
function saveCurrentQuestion() {
    if (!currentQuestion) return;

    // Validate we have what we need
    if (!currentQuestion.correctLetter || Object.keys(currentQuestion.options).length < 4) {
        console.warn(`Skipping incomplete question Q${currentQuestion.id_suffix}:`, currentQuestion);
        return;
    }

    // Format for final output (intermediate format, close to final)
    const qObj = {
        question: currentQuestion.question,
        options: [
            currentQuestion.options.A,
            currentQuestion.options.B,
            currentQuestion.options.C,
            currentQuestion.options.D
        ],
        correctAnswer: currentQuestion.options[currentQuestion.correctLetter], // Store the text value
        difficulty: currentQuestion.difficulty,
        explanation: currentQuestion.explanation.trim()
    };
    questions.push(qObj);
}

for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    // 1. Detect Difficulty
    if (line.includes('難易度：EASY')) {
        currentDifficulty = 'EASY';
        continue;
    } else if (line.includes('難易度：NORMAL')) {
        currentDifficulty = 'NORMAL';
        continue;
    } else if (line.includes('難易度：HARD')) {
        currentDifficulty = 'HARD';
        continue;
    }

    // 2. Detect Question Start "Q1. ", "Q10. "
    const qMatch = line.match(/^Q(\d+)\.\s+(.*)/);
    if (qMatch) {
        saveCurrentQuestion(); // Save previous
        currentQuestion = {
            id_suffix: parseInt(qMatch[1]),
            difficulty: currentDifficulty,
            question: qMatch[2],
            options: {},
            correctLetter: null,
            explanation: ""
        };
        continue;
    }

    if (!currentQuestion) continue; // Skip intro text

    // 3. Detect Options "A. ", "B. ", "C. ", "D. "
    // Note: The answer block is usually on D, but could technically be anywhere? 
    // The previous patterns showed it on D.
    const optMatch = line.match(/^([A-D])\.\s+(.*)/);
    if (optMatch) {
        const letter = optMatch[1];
        let text = optMatch[2];

        // Check for Answer/Explanation block in this line
        // Pattern: ...text...【正解：B】【詳細解説】...
        const ansMatch = text.match(/(.*)【正解：([A-D])】【詳細解説】(.*)/);

        // Sometimes explanation might be omitted or formatted differently? 
        // Based on file view, it seems consistent.

        if (ansMatch) {
            // Found answer and explanation start
            currentQuestion.options[letter] = ansMatch[1].trim();
            currentQuestion.correctLetter = ansMatch[2];
            currentQuestion.explanation = ansMatch[3];
        } else {
            // Check if just Answer tag exists (fallback)
            const ansOnlyMatch = text.match(/(.*)【正解：([A-D])】(.*)/);
            if (ansOnlyMatch) {
                currentQuestion.options[letter] = ansOnlyMatch[1].trim();
                currentQuestion.correctLetter = ansOnlyMatch[2];
                currentQuestion.explanation = ansOnlyMatch[3] || "";
            } else {
                // Just an option
                currentQuestion.options[letter] = text.trim();
            }
        }
        continue;
    }

    // 4. Continuation (Explanation or Question Text)
    // If we already have the answer/explanation started, append to explanation
    if (currentQuestion.correctLetter) {
        currentQuestion.explanation += "\n" + line;
    } else if (Object.keys(currentQuestion.options).length === 0) {
        // If no options yet, append to question text
        currentQuestion.question += "\n" + line;
    } else {
        // Between options? or inside an option?
        // Assume single line options for now based on file view. 
        // If an option spans multiple lines, this logic might be weak.
        // But the previous file view showed option D containing the answer block, so usually options are short.
        // Let's assume it belongs to the last seen option if any?
        // Actually, looking at the text, lines like "Aのプレゼント・マイクは..." appear AFTER Option D line (which has the answer block).
        // So they fall into the "If we already have the answer/explanation started" block above.
    }
}

// Save last question
saveCurrentQuestion();

console.log(`Parsed ${questions.length} questions.`);
fs.writeFileSync(outputFile, JSON.stringify(questions, null, 2));
