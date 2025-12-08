const fs = require('fs');
const path = require('path');

const QUESTIONS_PATH = path.join(__dirname, 'questions.json');
const JAPAN_GEO_PATH = path.join(__dirname, '問題集', '日本地理A.txt');
const WORLD_GEO_PATH = path.join(__dirname, '問題集', '世界地理A.txt');

function parseQuestions(filePath, category) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const questions = [];

    let currentQuestion = null;
    let state = 'IDLE'; // IDLE, QUESTION, CHOICES

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Detect Difficulty and start of question
        // e.g., "EASY Q1", "NORMAL Q1", "HARD Q1"
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
            // Parse choices. Sometimes they are on one line, sometimes multiple?
            // "A. ローマ　B. パリ　C. ベルリン　D. マドリード" style or separate lines
            // Let's handle both.

            // If the line contains multiple choices (A. ... B. ...)
            // We'll simplistic split, but risk if answer text contains " B. "
            // The file viewer showed: 
            // "A. ローマ　B. パリ　C. ベルリン　D. マドリード" (spaces/tabs)

            // Check if line contains all A, B, C, D
            // Or look for patterns.

            // Strategy: First, assume standard multiline or single line.
            // Let's try to extract all A., B., C., D. from this and subsequent lines until "正解"
            // The example usage in "世界地理A.txt": 
            // "A. ローマ　B. パリ　C. ベルリン　D. マドリード"

            const choiceRegex = /[A-D]\.\s*[^A-D]+/g;
            // This regex is too simple if multiple on one line.

            // Better strategy:
            // 1. Accumulate lines until "正解："
            // 2. Parse the accumulated block for A., B., C., D.

            // Actually, let's keep it simple. If line starts with "A.", it's the start of choices.
            // We will read lines until "正解：" lines.

            let choiceBlock = line;
            let j = i + 1;
            while (j < lines.length && !lines[j].startsWith('正解：')) {
                choiceBlock += ' ' + lines[j].trim();
                j++;
            }
            i = j - 1; // Advance main loop

            // Now parse choiceBlock
            // Replace full width spaces with half width
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

        if (line.startsWith('正解：')) {
            // e.g. "正解：B" or "正解：B（ナイル川は...）"
            const ansChar = line.substring(3, 4).toUpperCase(); // index 3 char
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

    // 2. Find Max ID
    let maxId = 0;
    questionsData.forEach(q => {
        if (q.id > maxId) maxId = q.id;
    });
    console.log(`Current Max ID: ${maxId}`);

    // 3. Parse new files
    const japanGeoQuestions = parseQuestions(JAPAN_GEO_PATH, 'japanese_geography');
    console.log(`Parsed ${japanGeoQuestions.length} Japanese Geography questions.`);

    const worldGeoQuestions = parseQuestions(WORLD_GEO_PATH, 'world_geography');
    console.log(`Parsed ${worldGeoQuestions.length} World Geography questions.`);

    // 4. Assign IDs and Append
    let currentId = maxId + 1;

    japanGeoQuestions.forEach(q => {
        q.id = currentId++;
        questionsData.push(q);
    });

    worldGeoQuestions.forEach(q => {
        q.id = currentId++;
        questionsData.push(q);
    });

    // 5. Write back
    fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(questionsData, null, 2), 'utf-8');
    console.log(`Successfully added ${japanGeoQuestions.length + worldGeoQuestions.length} questions.`);
    console.log(`New Max ID: ${currentId - 1}`);
}

main();
