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
const TOTAL_STAGES = 7;
const MAX_HINTS    = 2;

const PUZZLE_DATA = {
  CW: { heading: "Quest CW", description: "Solve the crossword clues to find your path forward.", prompt: "Did you solve the crossword? What is the unscrambled word?", answer: "BEAUTIFUL", lettersDropped: 2 },
  BP: { heading: "Quest BP", description: "Are you good at additions? Find the marked locations — but watch out for decoys.", prompt: "What is the total of the numbers you found?", answer: "5698", lettersDropped: 2 },
  MR: { heading: "Quest MR", description: "Pablo the penguin is missing. Find where every other office member was, and Pablo will be in the last remaining cell. Pablo left a passcode hidden in that room.", prompt: "Enter Pablo's passcode", answer: "PABLOLOVESYOU", lettersDropped: 2 },
  LR: { heading: "Quest LR", description: "Sam is the new intern at the Protective department. He walked to HR, then was sent to IT. His route traced a letter — can you find it?", prompt: "What letter did Sam's route trace?", answer: "L", lettersDropped: 1 },
  FR: { heading: "Quest FR", description: "Head to the pantries and read the facts. Some have something odd hidden inside — be careful, not all of them do.", prompt: "Unscramble the odd letters you found", answer: "EARTH", lettersDropped: 2 }
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
  FR:       "Look carefully — only facts with an odd number have odd letters hidden inside them.",
  FINALE:   "The Vigenère cipher is solved using a key. The key can be more than one word — spaces are ignored."
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
  1: ["CW", "BP", "MR", "LR", "FR"],
  2: ["BP", "CW", "LR", "FR", "MR"],
  3: ["FR", "MR", "CW", "BP", "LR"],
  4: ["MR", "LR", "FR", "CW", "BP"],
  5: ["LR", "FR", "BP", "MR", "CW"]
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
          teamName:     teamInfo.name,
          currentStage: 1,
          hintsUsed:    0,
          letters:      "",
          isCompleted:  false,
          lastActive:   Date.now()
        };
        await teamRef.set(state);
      } else {
        await teamRef.update({ lastActive: Date.now() });
        state.lastActive = Date.now();
      }

      const result = {
        teamName:     state.teamName,
        currentStage: state.currentStage,
        hintsUsed:    state.hintsUsed,
        letters:      state.letters  || "",
        isCompleted:  state.isCompleted || false,
        totalStages:  TOTAL_STAGES
      };

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

      const puzzle = getPuzzleForStage(teamInfo.cohort, state.currentStage);
      if (!puzzle) return res.status(500).json({ error: { message: "Puzzle configuration error." } });

      if (normalise(answer) !== puzzle.answer) {
        return res.status(200).json({ result: { correct: false } });
      }

      const droppedLetters = puzzle.answer.substring(0, puzzle.lettersDropped).toUpperCase();
      const updatedLetters = (state.letters || "") + droppedLetters;
      const nextStage = state.currentStage + 1;

      await teamRef.update({
        currentStage: nextStage,
        letters: updatedLetters,
        lastActive: Date.now()
      });

      const ANIMATIONS = { CW: "Brilliant", BP: "Smart", MR: "Marvellous", LR: "Beautiful", FR: "Colourful" };
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
      const teamInfo = resolveTeam(token);

      if (!teamInfo) return res.status(401).json({ error: { message: "Access denied." } });

      const teamRef = db.ref(`gameData/teams/${token}`);
      let hintText = "";
      let finalHintCount = 0;

      // 🛑 FIXED: Uses an atomic database transaction block to eliminate race conditions
      const transactionResult = await teamRef.transaction((currentState) => {
        if (!currentState) return currentState; // Let it abort if path does not exist
        
        // Block processing if the locked value has hit or exceeded the ceiling metrics
        if ((currentState.hintsUsed || 0) >= MAX_HINTS) {
          return; // Abort transaction cleanly without writing data
        }
        
        // Execute isolated arithmetic inside the locked database memory ring
        currentState.hintsUsed = (currentState.hintsUsed || 0) + 1;
        currentState.lastActive = Date.now();
        return currentState;
      });

      // If the transaction returns clear (meaning it was aborted because hints were filled)
      if (!transactionResult.committed) {
        return res.status(200).json({ result: { success: false, message: "Out of hints." } });
      }

      // Re-read safe metrics calculated inside the synchronized tracking block
      const updatedState = transactionResult.snapshot.val();
      finalHintCount = updatedState.hintsUsed;

      if (updatedState.currentStage === 1) {
        hintText = HINTS.IDENTITY;
      } else if (updatedState.currentStage === TOTAL_STAGES) {
        hintText = HINTS.FINALE;
      } else {
        const puzzle = getPuzzleForStage(teamInfo.cohort, updatedState.currentStage);
        hintText = puzzle ? HINTS[puzzle.key] : "No hint available.";
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
      if (state.isCompleted) return res.status(200).json({ result: { correct: true, alreadyCompleted: true } });

      if (normalise(finalWord) !== "JOTUNUNITE") {
        return res.status(200).json({ result: { correct: false } });
      }

      await teamRef.update({
        isCompleted: true,
        lastActive: Date.now()
      });

      return res.status(200).json({ result: { correct: true } });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});