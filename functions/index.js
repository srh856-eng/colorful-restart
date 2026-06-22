/**
 * Jotun Hunt 2026 — Firebase Cloud Functions Backend (v2 Compatible)
 * Region: asia-southeast1
 */

"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

// Explicitly configure v2 deployment region globally
setGlobalOptions({ region: "asia-southeast1" });

// Initialize application pointing to the exact region database URL
admin.initializeApp({
  databaseURL: "https://jotunhunt2026-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const TOTAL_STAGES = 6;
const MAX_HINTS    = 2;
const WRONG_ANSWER_PENALTY_MS = 30 * 1000;

const PUZZLE_DATA = {
  CW: { heading: "Quest CW", description: "Solve the crossword clues to find your path forward.", prompt: "Did you solve the crossword? What is the unscrambled word?", answer: "BEAUTIFUL" },
  BP: { heading: "Quest BP", description: "Are you good at additions? Find the marked locations — but watch out for decoys.", prompt: "What is the total of the numbers you found?", answer: "5698" },
  MR: { heading: "Quest MR", description: "Pablo the penguin is missing. Find where every other office member was, and Pablo will be in the last remaining cell. Pablo left a passcode hidden in that room.", prompt: "Enter Pablo's passcode", answer: "PABLOLOVESYOU" },
  LR: { heading: "Quest LR", description: "Sam is the new intern at the Protective department. He walked to HR, then was sent to IT. His route traced a letter — can you find it?", prompt: "What letter did Sam's route trace?", answer: "L" },
};

// ─────────────────────────────────────────────
//  FIXED LETTER DROPS PER QUEST PRAGHEL
//  Final canonical order in vault: P R A G H E L
//  These letters are always inserted into their
//  fixed slot positions regardless of quest order.
// ─────────────────────────────────────────────
const CANONICAL_LETTERS = "PRAGHEL"; // The final vault word, always in this order

// Letters each quest contributes, keyed by puzzle code
const QUEST_LETTERS = {
  CW: "HA",  // positions 4,2 in canonical 
  BP: "GE",   // position 3,5
  MR: "PR",  // positions 0,1
  LR: "L"    // position 6
};

// Each quest maps to specific slot indices in the canonical 7-letter string "VSCKIKC"
// V=0, S=1, C=2, K=3, I=4, K=5, C=6
const QUEST_SLOT_MAP = {
  MR: [0, 1],  // P, R
  LR: [6],     // L
  BP: [3, 5],  // G, E
  CW: [2, 4],  // H, A  (slots 4 and 6)
  
};

const CROSSWORD_CLUES = {
  across: { 3: "Spread the Word", 5: "Protectors of the ship", 6: "Think Tank #3", 9: "Looks for good pitch but doesn't play baseball. Always tries to hit the target but isn't a shooter. Who are we?" },
  down: { 1: "Selection committee", 2: "People of the money", 4: "Report to the captain penguin", 7: "Backbone of the digital era", 8: "Room is bored or people are bored?" }
};

const HINTS = {
  IDENTITY: "Jersey numbers 1–10 play on the ground floor and jersey numbers 11–20 play on the first floor.",
  CW:       "Find the physical location through the clue and solve the riddle there. Pick the circled letters and unscramble them for the answer.",
  BP:       "Go to the marked location on the blueprint. Look for the number. 2 out of 4 locations are decoys.",
  MR:       "The person in the tub occupies that column. Find the last unoccupied cell and go to that department to get Pablo's passcode.",
  LR:       "Sam goes 20 m straight from Protective, turns left at HR, and walks another 15 m. What letter does that path form?",
  
  FINALE:   "ROT13 is a simple substitution cipher that rotates each letter by 13 positions in the alphabet (A ↔ N, B ↔ O, etc.)."
};

const TEAM_ROSTER = {
  "j7x2": { name: "ROYAL BLUE",          cohort: 1 },
  "m3kw": { name: "MINTY BREEZE",         cohort: 1 },
  "r9nt": { name: "MOROCCAN MIST",        cohort: 1 },
  "w4qb": { name: "WOODSMOKE",            cohort: 1 },
  "v6lp": { name: "MEDITERRANEAN OLIVE",  cohort: 2 },
  "t8cz": { name: "TRAVERTINE CAIRO",     cohort: 2 },
  "e2ys": { name: "TIMELESS",             cohort: 2 },
  "u5fh": { name: "PURE OCEAN",           cohort: 2 },
  "n1gd": { name: "FOREVER JUNGLE",       cohort: 3 },
  "d0rv": { name: "DREAMY DESERT",        cohort: 3 },
  "i4mo": { name: "IVORY TOAST",          cohort: 3 },
  "s6jt": { name: "STONE GREY",           cohort: 3 },
  "p2xn": { name: "PASTEL MINT",          cohort: 4 },
  "b9ae": { name: "URBAN MIST",           cohort: 4 },
  "q3wk": { name: "PERSIAN PEARL",        cohort: 4 },
  "f7cv": { name: "DOVE GREY",            cohort: 4 },
  "g5rl": { name: "GOLDEN LILY",          cohort: 5 },
  "h8uz": { name: "EARTHSCAPE",           cohort: 5 },
  "c1mb": { name: "BRIGHT SIENNA",        cohort: 5 },
  "k0yd": { name: "MINIMALIST",           cohort: 5 }
};

const COHORTS = {
  1: ["CW", "BP", "MR", "LR"],
  2: ["BP", "CW", "LR", "MR"],
  3: ["MR", "CW", "BP", "LR"],
  4: ["MR", "LR", "CW", "BP"],
  5: ["LR", "BP", "MR", "CW"]
};

function getPuzzleForStage(cohortNum, stage) {
  if (stage < 2 || stage > 6) return null;
  const puzzleKey = COHORTS[cohortNum][stage - 2];
  return { key: puzzleKey, ...PUZZLE_DATA[puzzleKey] };
}

function resolveTeam(token) {
  if (!token || typeof token !== "string") return null;
  return TEAM_ROSTER[token.trim()] || null;
}

function normalise(str) {
  return (str || "").trim().toUpperCase();
}

function getPenaltyRemainingSeconds(state) {
  const penaltyUntil = Number(state && state.penaltyUntil) || 0;
  return Math.max(0, Math.ceil((penaltyUntil - Date.now()) / 1000));
}

function applyWrongAnswerPenalty(currentState) {
  const now = Date.now();
  const currentPenaltyUntil = Number(currentState && currentState.penaltyUntil) || 0;
  return Math.max(now, currentPenaltyUntil) + WRONG_ANSWER_PENALTY_MS;
}

// ─────────────────────────────────────────────
//  LETTER VAULT BUILDER
//  Rebuilds the canonical 7-slot string from the
//  set of completed quest keys, filling slots in
//  their fixed positions regardless of quest order.
// ─────────────────────────────────────────────
function buildVaultLetters(completedQuestKeys) {
  // Start with 7 empty slots
  const slots = Array(7).fill("");

  for (const questKey of completedQuestKeys) {
    const slotIndices = QUEST_SLOT_MAP[questKey];
    if (!slotIndices) continue;
    const letters = CANONICAL_LETTERS;
    for (const idx of slotIndices) {
      slots[idx] = letters[idx];
    }
  }

  // Return the vault as a string of filled letters only (blanks kept as space for slot rendering)
  return slots.join("");
}

// ─────────────────────────────────────────────
//  HTTP ENDPOINTS
// ─────────────────────────────────────────────

exports.getGameState = onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data  = req.body.data || {};
      const token = data.token;
      const teamInfo = resolveTeam(token);

      if (!teamInfo) {
        return res.status(401).json({ error: { message: "Invalid team token." } });
      }

      const teamRef  = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.get();
      let state      = snapshot.val();

      if (!state) {
        state = {
          teamName:          teamInfo.name,
          currentStage:      1,
          hintsUsed:         0,
          letters:           "       ", // 7 empty slots
          completedQuests:   [],
          isCompleted:       false,
          lastActive:        Date.now(),
          penaltyUntil:      0
        };
        await teamRef.set(state);
      } else {
        await teamRef.update({ lastActive: Date.now() });
        state.lastActive = Date.now();
      }

      // Check if another team has already won
      const winnerSnap = await db.ref("gameData/winner").get();
      const winnerData = winnerSnap.val();
      const gameWon = !!winnerData;
      const thisTeamWon = gameWon && winnerData.token === token;

      const penaltyRemainingSeconds = getPenaltyRemainingSeconds(state);

      const result = {
        teamName:      state.teamName,
        currentStage:  state.currentStage,
        hintsUsed:     state.hintsUsed,
        letters:       state.letters || "       ",
        isCompleted:   state.isCompleted || false,
        totalStages:   TOTAL_STAGES,
        gameWon:       gameWon,
        winnerName:    winnerData ? winnerData.name : null,
        thisTeamWon:   thisTeamWon,
        penaltyUntil:  state.penaltyUntil || 0,
        penaltyRemainingSeconds
      };

      // ── PROGRESS MATRIX FOR THE 4 ACTIVE QUESTS ──
      let playerProgress = 10; 
      if (state.isCompleted) {
        playerProgress = 100;
      } else if (state.currentStage === 1) {
        playerProgress = 0;
      } else {
        const stageWeights = { "CW": 25, "BP": 20, "MR": 20, "LR": 25 };
        const cohortSequence = COHORTS[teamInfo.cohort];
        if (cohortSequence) {
          const completedPuzzlesCount = Math.min(state.currentStage - 2, cohortSequence.length);
          for (let i = 0; i < completedPuzzlesCount; i++) {
            const puzzleKey = cohortSequence[i];
            if (stageWeights[puzzleKey]) {
              playerProgress += stageWeights[puzzleKey];
            }
          }
        }
      }
      result.progress = playerProgress; 
      // ──────────────────────────────────────────────

      if (state.currentStage === 1) {
        result.viewType = "IDENTITY";
      } else if (state.currentStage === TOTAL_STAGES) {
        result.viewType = "FINALE";
      } else {
        const puzzle = getPuzzleForStage(teamInfo.cohort, state.currentStage);
        if (!puzzle) return res.status(500).json({ error: { message: "Puzzle setup mismatch." } });

        result.viewType    = puzzle.key;
        result.heading     = puzzle.heading;
        result.description = puzzle.description;
        result.prompt      = puzzle.prompt;

        if (puzzle.key === "CW") result.crosswordClues = CROSSWORD_CLUES;
      }
      return res.status(200).json({ result });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});

exports.verifyIdentity = onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data = req.body.data || {};
      const { token, inputName } = data;
      const teamInfo = resolveTeam(token);

      if (!teamInfo) return res.status(401).json({ error: { message: "Access denied." } });
      if (normalise(inputName) !== teamInfo.name) {
        return res.status(400).json({ error: { message: "Team name does not match." } });
      }

      const teamRef  = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.get();
      const state    = snapshot.val();

      if (!state || state.currentStage !== 1) {
        return res.status(409).json({ error: { message: "Identity already verified." } });
      }

      await teamRef.update({ currentStage: 2, lastActive: Date.now() });
      return res.status(200).json({ result: { success: true } });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});

exports.submitStageAnswer = onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data = req.body.data || {};
      const { token, answer } = data;
      const teamInfo = resolveTeam(token);

      if (!teamInfo) return res.status(401).json({ error: { message: "Access denied." } });

      const teamRef  = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.get();
      const state    = snapshot.val();

      if (!state) return res.status(404).json({ error: { message: "State not found." } });
      if (state.isCompleted) return res.status(409).json({ error: { message: "Hunt completed." } });

      const penaltyRemainingSeconds = getPenaltyRemainingSeconds(state);
      if (penaltyRemainingSeconds > 0) {
        return res.status(200).json({
          result: {
            correct: false,
            penaltyActive: true,
            penaltyRemainingSeconds
          }
        });
      }

      const puzzle = getPuzzleForStage(teamInfo.cohort, state.currentStage);
      if (!puzzle) return res.status(500).json({ error: { message: "Puzzle configuration error." } });

      if (normalise(answer) !== puzzle.answer) {
        const penaltyUntil = applyWrongAnswerPenalty(state);
        await teamRef.update({ penaltyUntil, lastActive: Date.now() });
        return res.status(200).json({
          result: {
            correct: false,
            penaltyApplied: true,
            penaltyUntil,
            penaltyRemainingSeconds: Math.ceil((penaltyUntil - Date.now()) / 1000)
          }
        });
      }

      // Record this quest as completed and rebuild vault letters canonically
      const completedQuests = Array.isArray(state.completedQuests) ? [...state.completedQuests] : [];
      if (!completedQuests.includes(puzzle.key)) {
        completedQuests.push(puzzle.key);
      }
      const updatedLetters = buildVaultLetters(completedQuests);
      const nextStage = state.currentStage + 1;

      await teamRef.update({
        currentStage:    nextStage,
        letters:         updatedLetters,
        completedQuests: completedQuests,
        lastActive:      Date.now(),
        penaltyUntil:    0
      });

      const ANIMATIONS = { CW: "Vibrant", BP: "Flawless Finish", MR: "True Colour", LR: "Premium Coat", FR: "Pure Pigment" };
      return res.status(200).json({ result: { correct: true, nextStage, animationType: ANIMATIONS[puzzle.key] || "Great" } });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});

exports.requestHint = onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data = req.body.data || {};
      const token = data.token;
      
      // 1. CAPTURE THE SPECIFIC CLUE SELECTOR SENT FROM THE PHONE
      const crosswordClueId = data.crosswordClueId || req.body.crosswordClueId;
      
      const teamInfo = resolveTeam(token);

      if (!teamInfo) return res.status(401).json({ error: { message: "Access denied." } });

      const teamRef = db.ref(`gameData/teams/${token}`);
      let hintText = "";
      let finalHintCount = 0;

      // Uses an atomic database transaction block to eliminate race conditions
      const transactionResult = await teamRef.transaction((currentState) => {
        if (!currentState) return currentState;

        if ((currentState.hintsUsed || 0) >= MAX_HINTS) {
          return; // Abort transaction cleanly
        }

        currentState.hintsUsed = (currentState.hintsUsed || 0) + 1;
        currentState.lastActive = Date.now();
        return currentState;
      });

      if (!transactionResult.committed) {
        return res.status(200).json({ result: { success: false, message: "Out of hints." } });
      }

      const updatedState = transactionResult.snapshot.val();
      finalHintCount = updatedState.hintsUsed;

      // 2. NEW CONTEXTUAL HINT BRANCHING BASED ON STAGE PUZZLE TYPE
      
      // First, figure out exactly which puzzle they are currently looking at based on their stage and cohort
      let activePuzzleKey = "";
      if (updatedState.currentStage === 1) {
        activePuzzleKey = "IDENTITY";
      } else if (updatedState.currentStage === TOTAL_STAGES) {
        activePuzzleKey = "FINALE";
      } else {
        const activePuzzleObj = getPuzzleForStage(teamInfo.cohort, updatedState.currentStage);
        if (activePuzzleObj) {
          activePuzzleKey = activePuzzleObj.key; // This will correctly evaluate to "CW", "MR", or "BP"
        }
      }

      // Now, route the hint text correctly using our activePuzzleKey
      if (activePuzzleKey === "CW") {
        if (crosswordClueId) {
          // Provide customized hints depending on which crossword button they clicked
          if (crosswordClueId === 'across_3') {
            hintText = "Across 3 : Without us, our best products will be a secret.";
          } else if (crosswordClueId === 'across_5') {
            hintText = "Across 5 : We sell items that protect the seafarers.";
          } else if (crosswordClueId === 'across_6') { 
            hintText = "Across 6 : An area to Brainstorm.";
          } else if (crosswordClueId === 'across_9') {
            hintText = "Across 9 : We are also called as Frontline as we are the revenue generators.";
          } else if (crosswordClueId === 'down_1') {
            hintText = "Down 1 : Source, Onboard, Retain, Repeat.";
          } else if (crosswordClueId === 'down_2') {
            hintText = "Down 2 : Revenue, Profit, Budget, Variance.";
          } else if (crosswordClueId === 'down_3') {
            hintText = "Down 3 : Write your custom down 3 clue instruction here.";
          } else if (crosswordClueId === 'down_4') {
            hintText = "Down 4 : The most respected person in this office.";
          } else if (crosswordClueId === 'down_7') {
            hintText = "Down 7 : System down ? Call us!";
          } else if (crosswordClueId === 'down_8') {
            hintText = "Down 8 : People are very board.";
          } else {
            // Safe fallback trap if an unmapped button is clicked
            hintText = "Crossword Helper: Focus on the primary overlapping cells.";
          }
        } else {
          hintText = "Please select a specific clue number from the interface.";
        }
      } else if (activePuzzleKey === "MR") {
        hintText = "The person on the carpet occupies that row and the person in the tub occupies that colomn. Now find the last remaining cell. Pablo left the passcode in that room ?";
      } else if (activePuzzleKey === "BP") {
        hintText = "Can you identify the departments market 'x' in the blueprint ? Try to find Quest BP items there!";
      } else if (activePuzzleKey === "LR") {
        hintText = "Sam walked 20M straight and then 15M to his left. Can you identify the letter formed now ?";
      } else {
        // 3. FALLBACK TO STAGE-BASED HINTS FOR IDENTITY AND FINALE STAGES
        if (updatedState.currentStage === 1) {
          hintText = HINTS.IDENTITY;
        } else if (updatedState.currentStage === TOTAL_STAGES) {
          hintText = HINTS.FINALE;
        } else {
          hintText = "No hint available.";
        }
      }

      return res.status(200).json({
        result: {
          success: true,
          hint: hintText,
          remaining: Math.max(0, MAX_HINTS - finalHintCount)
        }
      });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});

exports.submitFinale = onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data = req.body.data || {};
      const { token, finalWord } = data;
      const teamInfo = resolveTeam(token);

      if (!teamInfo) return res.status(401).json({ error: { message: "Access denied." } });

      const teamRef  = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.get();
      const state    = snapshot.val();

      if (!state) return res.status(404).json({ error: { message: "State not found." } });
      if (state.currentStage !== TOTAL_STAGES) {
        return res.status(403).json({ error: { message: "Final vault is locked." } });
      }
      if (state.isCompleted) return res.status(200).json({ result: { correct: true, alreadyCompleted: true } });

      const penaltyRemainingSeconds = getPenaltyRemainingSeconds(state);
      if (penaltyRemainingSeconds > 0) {
        return res.status(200).json({
          result: {
            correct: false,
            penaltyActive: true,
            penaltyRemainingSeconds
          }
        });
      }

      if (normalise(finalWord) !== "CENTURY") {
        const penaltyUntil = applyWrongAnswerPenalty(state);
        await teamRef.update({ penaltyUntil, lastActive: Date.now() });
        return res.status(200).json({
          result: {
            correct: false,
            penaltyApplied: true,
            penaltyUntil,
            penaltyRemainingSeconds: Math.ceil((penaltyUntil - Date.now()) / 1000)
          }
        });
      }

      // Check atomically whether a winner already exists
      const winnerRef = db.ref("gameData/winner");
      const winnerSnap = await winnerRef.get();

      if (winnerSnap.exists()) {
        // Someone else already won — mark this team complete but don't overwrite winner
        await teamRef.update({ isCompleted: true, lastActive: Date.now(), penaltyUntil: 0 });
        return res.status(200).json({ result: { correct: true, alreadyCompleted: false, winnerExists: true } });
      }

      // This team is the FIRST to finish — declare them winner
      await winnerRef.set({
        token:     token,
        name:      teamInfo.name,
        timestamp: Date.now()
      });

      await teamRef.update({
        isCompleted: true,
        lastActive:  Date.now(),
        penaltyUntil: 0
      });

      return res.status(200).json({ result: { correct: true, isWinner: true } });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});