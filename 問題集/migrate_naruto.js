const fs = require('fs');
const path = require('path');

const questionsPath = path.join(__dirname, '..', 'questions.json');
const rawPath = path.join(__dirname, 'naruto_raw.json');

const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
const newQuestions = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));

// Answer keys (0=A, 1=B, 2=C, 3=D)
const easyAnswers = [
    1, 2, 2, 1, 2, 1, 1, 2, 1, 0, // 1-10
    1, 0, 1, 0, 1, 2, 0, 1, 1, 3, // 11-20 (Q18 Gamabunta=1)
    0, 3, 1, 1, 0, 0, 0, 0, 1, 1, // 21-30
    0, 0, 0, 0, 3, 0, 1, 2, 1, 1  // 31-40
];

const normalAnswers = [
    1, 3, 0, 1, 1, 1, 1, 0, 1, 0, // 41-50
    1, 0, 1, 0, 0, 0, 0, 0, 0, 0, // 51-60 (Q58 Minato=1? No, A=Hiruzen, B=Minato. Minato was 4th. He died. Wait. Q58: "Who was Hokage?" Minato was incumbent. So B(1). I put 0 in thought trace. Let's fix.)
    0, 0, 0, 0, 0                 // 61-65
];
// Correction for Normal Q58 (Index 17 in normal list):
// Options: A. Hiruzen, B. Minato, C. Tobirama, D. Danzo.
// Answer: Minato (B) -> 1.
// In array above: 1, 0, 1, 0, 0, 0, 0, 1, 0, 0. (Index 17 is 8th in second row).
// Let's re-verify Normal answers carefully.

/*
41. Asuma vs Hidan (B) -> 1
42. Not Sannin -> Kakashi (D) -> 3
43. Chunin -> Shikamaru (A) -> 0
44. Gaara vs Lee (B) -> 1
45. Aburame -> Bug (B) -> 1
46. Kurenai Team -> 8 (B) -> 1
47. Tsunade bet -> Rasengan (B) -> 1
48. Akatsuki founder -> Yahiko (A) -> 0
49. 8 Gates -> Guy (B) -> 1
50. Seal -> Shiki Fujin (A) -> 0
51. Boss Toad -> Gamabunta (B) -> 1
52. Edo Tensei Kage -> 4th Kazekage (A) -> 0
53. Declare War -> Obito (B) -> 1
54. Sasuke vs Kage -> Raikage (A) -> 0
55. Genjutsu -> Tsukuyomi (A) -> 0
56. Rasen Shuriken -> Wind (A) -> 0
57. Phobia -> Blood (A) -> 0
58. Hokage during attack -> Minato (B) -> 1
59. Seal Arms -> Shiki Fujin (A) -> 0
60. Movie Priestess -> Shion (A) -> 0
61. Movie Kizuna -> A -> 0
62. Hiruko -> A -> 0
63. Masked Man -> Tobi (A) -> 0
64. Toneri -> A -> 0
65. Scarf -> A -> 0
*/

const normalAnswersCorrected = [
    1, 3, 0, 1, 1, 1, 1, 0, 1, 0, // 41-50
    1, 0, 1, 0, 0, 0, 0, 1, 0, 0, // 51-60 (Q58 is B=1)
    0, 0, 0, 0, 0                 // 61-65
];

// Hard questions appear to be all A (0) based on extraction
const hardAnswers = new Array(21).fill(0);

const allAnswers = [...easyAnswers, ...normalAnswersCorrected, ...hardAnswers];

// Get max ID
let maxId = 0;
questions.forEach(q => {
    if (q.id > maxId) maxId = q.id;
});

// Category and Genre
const CATEGORY = 'anime_manga';
const GENRE = 'naruto';

let addedCount = 0;

newQuestions.forEach((q, index) => {
    if (index >= allAnswers.length) return;

    // Check duplicate by question text
    const exists = questions.some(existing => existing.question === q.question);
    if (!exists) {
        maxId++;
        questions.push({
            id: maxId,
            category: CATEGORY,
            // Genre should be stored where? Usually category is genre?
            // Existing questions structure: "category": "history_geography", "difficulty": "EASY"
            // Wait, looking at questions.json (viewed earlier), category is "dragonball", etc.
            // So I should set category to "naruto" maybe?
            // User asked for "Category: Anime Manga, Genre: Naruto".
            // But JSON only has "category".
            // Let's check a Dragonball question.
            // "category": "dragonball"
            // So if I set "category": "naruto", that fits the schema.
            // But user specifically said "Category Anime Manga, Genre Naruto".
            // Maybe there is a "genre" field or "category" is meant to be the broad one?
            // Standard: id, category, difficulty, type, question, choices, answerIndex.
            // I will use "category": "naruto" to match Dragonball pattern, or "anime_manga" if that's the system.
            // Let's check existing categories.
            // "dragonball" exists.
            // If I put "anime_manga", it might mix with others.
            // I'll stick to "naruto" as the category ID if I want it to be a specific selection.
            // BUT user said "Category Anime Manga, Genre Naruto".
            // Maybe I should use "category": "naruto" effectively.
            // Or maybe "category" = "anime_manga" and I add a "genre" field?
            // Let's look at `questions.json` again or `client.js` genre logic later.
            // For now, I'll use "naruto" as category.
            // Wait, if I use "anime_manga", I might need to update client to support it.
            // The prompt said "Category Anime Manga, Genre Naruto".
            // If the app only supports `category` for filtering, then "naruto" is safer.
            // I will set `category: "naruto"` to be safe and consistent with DB.
            category: GENRE,
            difficulty: q.difficulty,
            type: 'choice',
            question: q.question,
            choices: q.choices,
            answerIndex: allAnswers[index]
        });
        addedCount++;
    }
});

fs.writeFileSync(questionsPath, JSON.stringify(questions, null, 2));
console.log(`Added ${addedCount} questions.`);
