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
const PENALTY_DURATION_MS = 30000; // 30 seconds lock penalty

const PUZZLE_DATA = {
  CW: { heading: "Quest CW", description: "Solve the crossword clues to find your path forward.", prompt: "Did you solve the crossword? What is the unscrambled word?", answer: "BEAUTIFUL" },
  BP: { heading: "Quest BP", description: "Are you good at additions? Find the marked locations — but watch out for decoys.", prompt: "What is the total of the numbers you found?", answer: "5698" },
  MR: { heading: "Quest MR", description: "Pablo is stuck in the control room. Find the room number he is trapped in.", prompt: "Enter the 3-digit room number:", answer: "404" },
  LR: { heading: "Quest LR", description: "A secret path reveals a hidden keyword inside the logistics center layout.", prompt: "What word does the pathway spell out?", answer: "JOTUN" }
};

const COHORTS = {
  ALPHA: [ { key: "CW", stg: 2 }, { key: "BP", stg: 3 }, { key: "MR", stg: 4 }, { key: "LR", stg: 5 } ],
  BETA:  [ { key: "BP", stg: 2 }, { key: "MR", stg: 3 }, { key: "LR", stg: 4 }, { key: "CW", stg: 5 } ],
  GAMMA: [ { key: "MR", stg: 2 }, { key: "LR", stg: 3 }, { key: "CW", stg: 4 }, { key: "BP", stg: 5 } ],
  DELTA: [ { key: "LR", stg: 2 }, { key: "CW", stg: 3 }, { key: "BP", stg: 4 }, { key: "MR", stg: 5 } ]
};

const HINTS = {
  IDENTITY: "Jersey numbers 1–10 play on the ground floor and jersey numbers 11–20 play on the first floor.",
  FINALE:   "Combine the first letters of all your previously unlocked answers to discover the final location word."
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function normalise(str) {
  return String(str || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function resolveTeam(token) {
  if (!token) return null;
  const t = String(token).trim().toUpperCase();
  
  // Cohort Alpha
  if (t === "RED74")  return { name: "Team Crimson", cohort: "ALPHA" };
  if (t === "BLU21")  return { name: "Team Azure",   cohort: "ALPHA" };
  if (t === "GRN89")  return { name: "Team Emerald", cohort: "ALPHA" };
  
  // Cohort Beta
  if (t === "YLW55")  return { name: "Team Amber",   cohort: "BETA" };
  if (t === "ORG33")  return { name: "Team Tiger",   cohort: "BETA" };
  if (t === "PRP12")  return { name: "Team Orchid",  cohort: "BETA" };
  
  // Cohort Gamma
  if (t === "BLK99")  return { name: "Team Shadow",  cohort: "GAMMA" };
  if (t === "WHT44")  return { name: "Team Frost",   cohort: "GAMMA" };
  if (t === "SLV66")  return { name: "Team Mercury", cohort: "GAMMA" };
  
  // Cohort Delta
  if (t === "GOL77")  return { name: "Team Gold",    cohort: "DELTA" };
  if (t === "BRZ22")  return { name: "Team Bronze",  cohort: "DELTA" };
  if (t === "COP88")  return { name: "Team Copper",  cohort: "DELTA" };

  return null;
}

function getPuzzleForStage(cohortName, stageNumber) {
  const roadmap = COHORTS[cohortName];
  if (!roadmap) return null;
  const match = roadmap.find(item => item.stg === stageNumber);
  return match ? PUZZLE_DATA[match.key] : null;
}

// ─────────────────────────────────────────────
//  ENDPOINTS
// ─────────────────────────────────────────────

exports.getGameState = onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data  = req.body.data || {};
      const token = data.token;
      const teamInfo = resolveTeam(token);

      if (!teamInfo) {
        return res.status(401).json({ error: { message: "Access denied. Invalid group code token." } });
      }

      const teamRef = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.get();
      let state = snapshot.val();

      // Setup initialization defaults safely if group doesn't exist yet
      if (!state) {
        state = {
          currentStage: 1,
          hintsUsed: 0,
          isCompleted: false,
          lastActive: Date.now(),
          penaltyUntil: 0
        };
        await teamRef.set(state);
      }

      // Check final winner context status
      const winnerSnapshot = await db.ref("gameData/winner").get();
      const globalWinner = winnerSnapshot.exists() ? winnerSnapshot.val() : null;

      // Stage 1 configuration context injection
      if (state.currentStage === 1) {
        return res.status(200).json({
          result: {
            teamName:     teamInfo.name,
            currentStage: 1,
            viewType:     "ID",
            heading:      "Identity Verification",
            description:  "Enter your official crew identity configuration passphrase to kick off the assignment tracking sequence.",
            prompt:       "Provide your assigned security identity phrase:",
            hintsUsed:    state.hintsUsed,
            isCompleted:  false,
            globalWinner: globalWinner,
            penaltyUntil: state.penaltyUntil || 0
          }
        });
      }

      // Stage 6 final calculation context configuration layout parsing
      if (state.currentStage === TOTAL_STAGES) {
        return res.status(200).json({
          result: {
            teamName:     teamInfo.name,
            currentStage: TOTAL_STAGES,
            viewType:     "FI",
            heading:      "Ultimate Extraction",
            description:  "This is it. The end of the road. Unscramble the grand cipher key array using all puzzle keys decoded so far.",
            prompt:       "Enter the final validation passcode location sequence:",
            hintsUsed:    state.hintsUsed,
            isCompleted:  state.isCompleted || false,
            globalWinner: globalWinner,
            penaltyUntil: state.penaltyUntil || 0
          }
        });
      }

      // Handle structural programmatic mapping variants inside intermediate configurations
      const currentPuzzle = getPuzzleForStage(teamInfo.cohort, state.currentStage);
      const crossmapping = COHORTS[teamInfo.cohort].find(item => item.stg === state.currentStage);

      if (!currentPuzzle) {
        return res.status(500).json({ error: { message: "Puzzle matching roadmap processing failed internally." } });
      }

      const payload = {
        teamName:     teamInfo.name,
        currentStage: state.currentStage,
        viewType:     crossmapping.key,
        heading:      currentPuzzle.heading,
        description:  currentPuzzle.description,
        prompt:       currentPuzzle.prompt,
        hintsUsed:    state.hintsUsed,
        isCompleted:  false,
        globalWinner: globalWinner,
        penaltyUntil: state.penaltyUntil || 0
      };

      // Add structural assets safely specifically if they require dynamic crossword elements
      if (crossmapping.key === "CW") {
        payload.crosswordClues = {
          across: {
            3: "Without us, our best products will be a secret.",
            5: "We sell items that protect the seafarers.",
            6: "An area to Brainstorm.",
            9: "We are also called as Frontline as we are the revenue generators."
          },
          down: {
            1: "Source, Onboard, Retain, Repeat.",
            2: "Revenue, Profit, Budget, Variance.",
            4: "The most respected person in this office.",
            7: "System down ? Call us!",
            8: "People are very board."
          }
        };
      }

      return res.status(200).json({ result: payload });

    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});

exports.submitAnswer = onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data      = req.body.data || {};
      const token     = data.token;
      const inputWord = data.answer;

      const teamInfo = resolveTeam(token);
      if (!teamInfo) return res.status(401).json({ error: { message: "Access denied." } });

      const teamRef = db.ref(`gameData/teams/${token}`);
      let serverResponse = null;

      await teamRef.transaction((currentState) => {
        if (!currentState) return currentState;

        const now = Date.now();
        // Check if the team is currently under a penalty lockout block
        if (currentState.penaltyUntil && now < currentState.penaltyUntil) {
          serverResponse = { success: false, penaltyActive: true, penaltyUntil: currentState.penaltyUntil, message: "Your team is locked out. Wait for the countdown." };
          return; // Abort transaction cleanly
        }

        let targetCorrectAnswer = "";

        if (currentState.currentStage === 1) {
          targetCorrectAnswer = "JOTUN";
        } else if (currentState.currentStage === TOTAL_STAGES) {
          targetCorrectAnswer = "CENTURY";
        } else {
          const matchedPuzzle = getPuzzleForStage(teamInfo.cohort, currentState.currentStage);
          if (matchedPuzzle) targetCorrectAnswer = matchedPuzzle.answer;
        }

        const isCorrect = (normalise(inputWord) === normalise(targetCorrectAnswer));

        if (isCorrect) {
          currentState.currentStage = currentState.currentStage + 1;
          currentState.lastActive = now;
          currentState.penaltyUntil = 0; // Clear any leftover structural timestamp logs
          serverResponse = { success: true, correct: true };
        } else {
          // Wrong answer penalty application block
          const newPenaltyUntil = now + PENALTY_DURATION_MS;
          currentState.penaltyUntil = newPenaltyUntil;
          currentState.lastActive = now;
          serverResponse = { success: true, correct: false, penaltyUntil: newPenaltyUntil };
        }

        return currentState;
      });

      if (serverResponse) {
        return res.status(200).json({ result: serverResponse });
      } else {
        return res.status(200).json({ result: { success: false, message: "Request verification collided, please resubmit your answer." } });
      }

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
      const crosswordClueId = data.crosswordClueId || req.body.crosswordClueId; 
      
      const teamInfo = resolveTeam(token);
      if (!teamInfo) return res.status(401).json({ error: { message: "Access denied." } });

      const teamRef = db.ref(`gameData/teams/${token}`);
      let hintText = "";
      let finalHintCount = 0;

      const transactionResult = await teamRef.transaction((currentState) => {
        if (!currentState) return currentState;

        if ((currentState.hintsUsed || 0) >= MAX_HINTS) {
          return; 
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

      let activePuzzleKey = "";
      if (updatedState.currentStage === 1) {
        activePuzzleKey = "IDENTITY";
      } else if (updatedState.currentStage === TOTAL_STAGES) {
        activePuzzleKey = "FINALE";
      } else {
        const activePuzzleObj = getPuzzleForStage(teamInfo.cohort, updatedState.currentStage);
        if (activePuzzleObj) {
          activePuzzleKey = activePuzzleObj.key; 
        }
      }

      if (activePuzzleKey === "CW") {
        if (crosswordClueId) {
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
            hintText = "Crossword Helper: Focus on the primary overlapping cells.";
          }
        } else {
          hintText = "Please select a specific clue number from the interface.";
        }
      } else if (activePuzzleKey === "MR") {
        hintText = "The person on the carpet occupies that row and the person in the tub occupies that column. Now find the last remaining cell and visit the room in this to get Pablo's passcode.";
      } else if (activePuzzleKey === "BP") {
        hintText = "Can you identify the departments marked 'x' in the blueprint? Try to find Quest BP items there!";
      } else if (activePuzzleKey === "LR") {
        hintText = "Sam walked 20M straight and then 15M to his left. Can you identify the letter formed now?";
      } else {
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

exports.checkFinalDeclarationStatus = onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data     = req.body.data || {};
      const token    = data.token;
      const finalWord = data.finalWord;

      const teamInfo = resolveTeam(token);
      if (!teamInfo) return res.status(401).json({ error: { message: "Access denied." } });

      const teamRef  = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.get();
      const state    = snapshot.val();

      if (!state) return res.status(404).json({ error: { message: "State not found." } });
      if (state.isCompleted) return res.status(200).json({ result: { correct: true, alreadyCompleted: true } });

      if (normalise(finalWord) !== "CENTURY") {
        return res.status(200).json({ result: { correct: false } });
      }

      // Check atomically whether a winner already exists
      const winnerRef = db.ref("gameData/winner");
      const winnerSnap = await winnerRef.get();

      if (winnerSnap.exists()) {
        await teamRef.update({ isCompleted: true, lastActive: Date.now() });
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
        lastActive:  Date.now()
      });

      return res.status(200).json({ result: { correct: true, alreadyCompleted: false, winnerExists: false } });

    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});