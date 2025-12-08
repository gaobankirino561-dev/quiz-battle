const fs = require('fs');
const path = require('path');

const QUESTIONS_PATH = path.join(__dirname, 'questions.json');
const JAPAN_HISTORY_PATH = path.join(__dirname, '問題集', '日本史A.txt');
const WORLD_HISTORY_PATH = path.join(__dirname, '問題集', '世界史A.txt');

function parseQuestions(filePath, category) {
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const questions = [];

    let currentQuestion = null;
    let state = 'IDLE'; // IDLE, QUESTION, CHOICES

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Detect Difficulty and start of question
        const headerMatch = line.match(/^(EASY|NORMAL|HARD)\s*Q\d+/i);
        if (headerMatch) {
            if (currentQuestion) {
                // Push previous question if complete
                if (currentQuestion.question && currentQuestion.choices.length === 4 && currentQuestion.answerIndex !== -1) {
                    questions.push(currentQuestion);
                }
            }
            currentQuestion = {
                category: category,
                difficulty: headerMatch[1].toUpperCase(),
                type: 'choice',
                question: '',
                choices: [],
                answerIndex: -1
            };
            state = 'QUESTION';
            continue;
        }

        if (!currentQuestion) continue;

        if (line.startsWith('A. ')) {
            state = 'CHOICES';
            let choiceBlock = line;
            let j = i + 1;
            // Stop if we see "正解：" (any format)
            // Use regex to detecting answer line start
            while (j < lines.length && !lines[j].match(/正解：/)) {
                choiceBlock += ' ' + lines[j].trim();
                j++;
            }
            i = j - 1; // Advance main loop

            choiceBlock = choiceBlock.replace(/　/g, ' ');

            const choiceA_idx = choiceBlock.indexOf('A.');
            const choiceB_idx = choiceBlock.indexOf('B.');
            const choiceC_idx = choiceBlock.indexOf('C.');
            const choiceD_idx = choiceBlock.indexOf('D.');

            if (choiceA_idx !== -1 && choiceB_idx !== -1 && choiceC_idx !== -1 && choiceD_idx !== -1) {
                const cA = choiceBlock.substring(choiceA_idx + 2, choiceB_idx).trim();
                const cB = choiceBlock.substring(choiceB_idx + 2, choiceC_idx).trim();
                const cC = choiceBlock.substring(choiceC_idx + 2, choiceD_idx).trim();
                const cD = choiceBlock.substring(choiceD_idx + 2).trim();
                currentQuestion.choices = [cA, cB, cC, cD];
            }

            continue;
        }

        // Check for Answer line
        // Supports: "正解：B", "**正解：B】", "正解：C（...）"
        // Regex look for "正解：" followed by A-D
        const answerMatch = line.match(/正解：\s*([A-D])/i);
        if (answerMatch) {
            const ansChar = answerMatch[1].toUpperCase();
            const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
            if (map[ansChar] !== undefined) {
                currentQuestion.answerIndex = map[ansChar];
            }
            continue;
        }

        if (state === 'QUESTION') {
            currentQuestion.question += (currentQuestion.question ? '\n' : '') + line;
        }
    }

    // Push last question
    if (currentQuestion && currentQuestion.question && currentQuestion.choices.length === 4 && currentQuestion.answerIndex !== -1) {
        questions.push(currentQuestion);
    }

    return questions;
}

function main() {
    // 1. Read existing questions
    let questionsData = [];
    if (fs.existsSync(QUESTIONS_PATH)) {
        questionsData = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));
    }

    // 1.5. Clean existing History questions to avoid partial duplicates
    // Filter out 'japanese_history' and 'world_history'
    const initialCount = questionsData.length;
    questionsData = questionsData.filter(q => q.category !== 'japanese_history' && q.category !== 'world_history');
    const removedCount = initialCount - questionsData.length;
    if (removedCount > 0) {
        console.log(`Removed ${removedCount} existing history questions to ensure clean import.`);
    }

    // 2. Find Max ID (re-calculate after filter)
    let maxId = 0;
    questionsData.forEach(q => {
        if (q.id > maxId) maxId = q.id;
    });
    console.log(`Current Max ID: ${maxId}`);

    // 3. Parse new files
    const japanHistoryQuestions = parseQuestions(JAPAN_HISTORY_PATH, 'japanese_history');
    console.log(`Parsed ${japanHistoryQuestions.length} Japanese History questions.`);

    const worldHistoryQuestions = parseQuestions(WORLD_HISTORY_PATH, 'world_history');
    console.log(`Parsed ${worldHistoryQuestions.length} World History questions.`);

    // 4. Assign IDs and Append
    let currentId = maxId + 1;
    let addedCount = 0;

    japanHistoryQuestions.forEach(q => {
        q.id = currentId++;
        questionsData.push(q);
        addedCount++;
    });

    worldHistoryQuestions.forEach(q => {
        q.id = currentId++;
        questionsData.push(q);
        addedCount++;
    });

    // 5. Write back
    fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(questionsData, null, 2), 'utf-8');
    console.log(`Successfully added ${addedCount} questions.`);
    console.log(`New Max ID: ${currentId - 1}`);
}

main();
