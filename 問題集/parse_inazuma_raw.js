const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'inazuma_utf8.txt');
const content = fs.readFileSync(inputFile, 'utf-8');

const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');

const questions = [];
let currentDifficulty = 'EASY';

lines.forEach(line => {
    // Detect difficulty
    if (line.includes('初級') || line.includes('easy')) { currentDifficulty = 'EASY'; return; }
    if (line.includes('中級') || line.includes('normal')) { currentDifficulty = 'NORMAL'; return; }
    if (line.includes('上級') || line.includes('hard')) { currentDifficulty = 'HARD'; return; }

    // Normalize
    const normalized = line.replace(/\s+/g, ' ').trim();

    // Regex to capture Question, Options, and Answer.
    // Format: "問題：Question A. Op1 B. Op2 C. Op3 D. Op4正解：X"
    // Note: spaces might be varied.
    // "正解：A" might be at the very end.

    // Regex breakdown:
    // ^(?:.+?[\d\.]+)? : Optional numbering
    // 問題：(.+?) : Question text
    // A\. (.+?) : Option A
    // B\. (.+?) : Option B
    // C\. (.+?) : Option C
    // D\. (.+?) : Option D
    // 正解：([ABCD]) : Correct Answer
    const regex = /問題：(.+?)\s*[AＡ]\.?\s*(.+?)\s*[BＢ]\.?\s*(.+?)\s*[CＣ]\.?\s*(.+?)\s*[DＤ]\.?\s*(.+?)正解：\s*([A-DＡ-Ｄ])/i;

    const match = normalized.match(regex);

    if (match) {
        const questionText = match[1].trim();
        const choices = [match[2].trim(), match[3].trim(), match[4].trim(), match[5].trim()];
        const answerChar = match[6].toUpperCase().replace(/[Ａ-Ｄ]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
        const answerIndex = answerChar.charCodeAt(0) - 'A'.charCodeAt(0);

        questions.push({
            difficulty: currentDifficulty,
            question: questionText,
            choices: choices,
            answerIndex: answerIndex
        });
    }
});

console.log(JSON.stringify(questions, null, 2));
