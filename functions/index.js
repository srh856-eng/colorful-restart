const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp({
  databaseURL: "https://jotunhunt2026.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

const TOTAL_STAGES = 7;
const MAX_HINTS = 2;

const PUZZLE_DATA = {
  "CW": { heading: "Quest CW", description: "Solve the crossword clues to find your path forward.", prompt: "Did you solve the crossword? Now what ?", answer: "BEAUTIFUL", lettersDropped: 2 },
  "BP": { heading: "Quest BP", description: "Are you good at additions? Probably not very good at guessing the places you shouldn’t go now ?", prompt: "What is the total of the numbers you got ?", answer: "5698", lettersDropped: 2 },
  "MR": { heading: "Quest – MR", description: "Pablo the penguin is missing in the office. To find Pablo, find exactly where other members of the office were present. Pablo will be in the last remaining cell. Pablo left the room with a passcode hidden somewhere.", prompt: "Enter Pablo’s passcode", answer: "PABLOLOVESYOU", lettersDropped: 2 },
  "LR": { heading: "Quest LR", description: "Sam is the new Intern for the Protective department. He went from his desk to meet the HR. HR sent him to the IT department to fix his access. Suddenly Sam realized his route made a specific alphabet. Can you find it?", prompt: "What is the letter?", answer: "L", lettersDropped: 1 },
  "FR": { heading: "Quest FR", description: "Like reading facts ? Head to the pantries and find something odd in the facts. Be careful few has nothing odd", prompt: "Unscramble the odds", answer: "EARTH", lettersDropped: 2 }
};

const CROSSWORD_CLUES = {
  across: { 3: "Spread the Word", 5: "Protectors of the ship", 6: "Think Tank #3", 9: "Looks for good pitch but doesn’t play baseball, Always try to hit the target but not shooter. Who are we?" },
  down: { 1: "Selection committee", 2: "People of the money", 4: "Report to the captain penguin", 7: "Backbone of digital Era", 8: "Room is bored or people are bored?" }
};

const HINTS = {
  "IDENTITY": "jersey number 1-10 play in the ground floor and Jersey number 11-20 play in the first floor",
  "CW": "You need to find the physical location through the clue and solve the riddle found there. Then pick the circled letters and unscramble for the answer.",
  "BP": "Go to the marked location on the blueprint. Look for the number. 2 out of 4 locations are decoys.",
  "MR": "The person in the tub occupies that column. Find the last not occupied cell and go to that department to get Pablo's passcode.",
  "LR": "This one is easy, Sam goes 20M straight from protective, turn left from HR and walked another 15M. What letter is it ?",
  "FR": "Didn't get the odd in the fact ? Look for any small letters or is it ? I think only odd number of facts have odd letters.",
  "FINALE": "Vignere Cipher is solved using a key. Key can be more than 1 word with spaces ignored!"
};

const TEAM_ROSTER = {
  "j7x2": { name: "ROYAL BLUE", cohort: 1 },
  "m3kw": { name: "MINTY BREEZE", cohort: 1 },
  "r9nt": { name: "MOROCCAN MIST", cohort: 1 },
  "w4qb": { name: "WOODSMOKE", cohort: 1 },
  "v6lp": { name: "MEDITERRANEAN OLIVE", cohort: 2 },
  "t8cz": { name: "TRAVERTINE CAIRO", cohort: 2 },
  "e2ys": { name: "TIMELESS", cohort: 2 },
  "u5fh": { name: "PURE OCEAN", cohort: 2 },
  "n1gd": { name: "FOREVER JUNGLE", cohort: 3 },
  "d0rv": { name: "DREAMY DESERT", cohort: 3 },
  "i4mo": { name: "IVORY TOAST", cohort: 3 },
  "s6jt": { name: "STONE GREY", cohort: 3 },
  "p2xn": { name: "PASTEL MINT", cohort: 4 },
  "b9ae": { name: "URBAN MIST", cohort: 4 },
  "q3wk": { name: "PERSIAN PEARL", cohort: 4 },
  "f7cv": { name: "DOVE GREY", cohort: 4 },
  "g5rl": { name: "GOLDEN LILY", cohort: 5 },
  "h8uz": { name: "EARTHSCAPE", cohort: 5 },
  "c1mb": { name: "BRIGHT SIENNA", cohort: 5 },
  "k0yd": { name: "MINIMALIST", cohort: 5 }
};

const COHORTS = {
  1: ["CW", "BP", "MR", "LR", "FR"],
  2: ["BP", "CW", "LR", "FR", "MR"],
  3: ["FR", "MR", "CW", "BP", "LR"],
  4: ["MR", "LR", "FR", "CW", "BP"],
  5: ["LR", "FR", "BP", "MR", "CW"]
};

function getPuzzleForStage(cohortNum, stage) {
  if (stage <= 1 || stage >= 7) return null;
  const sequence = COHORTS[cohortNum];
  const puzzleKey = sequence[stage - 2];
  return { key: puzzleKey, ...PUZZLE_DATA[puzzleKey] };
}

exports.getGameState = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data = req.body.data || {};
      const token = data.token;
      
      if (!token || !TEAM_ROSTER[token]) {
        return res.status(404).json({ error: { message: "Invalid authorization parameters." } });
      }

      const teamInfo = TEAM_ROSTER[token];
      const teamRef = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.get();
      let state = snapshot.val();
      
      if (!state) {
        state = {
          teamName: teamInfo.name,
          currentStage: 1,
          hintsUsed: 0,
          letters: "",
          isCompleted: false,
          lastActive: Date.now()
        };
        await teamRef.set(state);
      }

      const result = {
        teamName: state.teamName,
        currentStage: state.currentStage,
        hintsUsed: state.hintsUsed,
        letters: state.letters,
        isCompleted: state.isCompleted,
        totalStages: TOTAL_STAGES
      };

      if (state.currentStage === 1) {
        result.viewType = "IDENTITY";
      } else if (state.currentStage === 7) {
        result.viewType = "FINALE";
      } else {
        const activePuzzle = getPuzzleForStage(teamInfo.cohort, state.currentStage);
        result.viewType = activePuzzle.key;
        result.heading = activePuzzle.heading;
        result.description = activePuzzle.description;
        result.prompt = activePuzzle.prompt;
        if (activePuzzle.key === "CW") {
          result.crosswordClues = CROSSWORD_CLUES;
        }
      }
      return res.status(200).json({ result });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});

exports.verifyIdentity = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data = req.body.data || {};
      const { token, inputName } = data;
      if (!token || !TEAM_ROSTER[token]) return res.status(400).json({ error: { message: "Access Denied." } });
      
      const registeredName = TEAM_ROSTER[token].name;
      if (inputName.trim().toUpperCase() !== registeredName) {
        return res.status(400).json({ error: { message: "Mismatched Team Identification." } });
      }

      const teamRef = db.ref(`gameData/teams/${token}`);
      await teamRef.update({ currentStage: 2, lastActive: Date.now() });
      return res.status(200).json({ result: { success: true } });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});

exports.submitStageAnswer = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data = req.body.data || {};
      const { token, answer } = data;
      if (!token || !TEAM_ROSTER[token]) return res.status(400).json({ error: { message: "Access Denied." } });

      const teamInfo = TEAM_ROSTER[token];
      const teamRef = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.get();
      const state = snapshot.val();

      if (state.currentStage < 2 || state.currentStage >= 7) {
        return res.status(400).json({ error: { message: "Action out of sync." } });
      }

      const currentPuzzle = getPuzzleForStage(teamInfo.cohort, state.currentStage);
      if (answer.trim().toUpperCase() !== currentPuzzle.answer) {
        return res.status(200).json({ result: { correct: false } });
      }

      let updatedLetters = state.letters || "";
      updatedLetters += currentPuzzle.answer.substring(0, currentPuzzle.lettersDropped).toUpperCase();

      const nextStage = state.currentStage + 1;
      await teamRef.update({
        currentStage: nextStage,
        letters: updatedLetters,
        lastActive: Date.now()
      });

      return res.status(200).json({ result: { correct: true, nextStage: nextStage } });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});

exports.requestHint = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data = req.body.data || {};
      const token = data.token;
      if (!token || !TEAM_ROSTER[token]) return res.status(400).json({ error: { message: "Access Denied." } });

      const teamInfo = TEAM_ROSTER[token];
      const teamRef = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.get();
      const state = snapshot.val();

      if (state.hintsUsed >= MAX_HINTS) {
        return res.status(200).json({ result: { success: false, msg: "Out of Hints" } });
      }

      let hintText = "";
      if (state.currentStage === 1) hintText = HINTS["IDENTITY"];
      else if (state.currentStage === 7) hintText = HINTS["FINALE"];
      else {
        const activePuzzle = getPuzzleForStage(teamInfo.cohort, state.currentStage);
        hintText = HINTS[activePuzzle.key];
      }

      const newHintCount = state.hintsUsed + 1;
      await teamRef.update({ hintsUsed: newHintCount });

      return res.status(200).json({ result: { success: true, hint: hintText, remaining: MAX_HINTS - newHintCount } });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});

exports.submitFinale = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const data = req.body.data || {};
      const { token, finalWord } = data;
      if (!token || !TEAM_ROSTER[token]) return res.status(400).json({ error: { message: "Access Denied." } });

      if (finalWord.trim().toUpperCase() !== "JOTUNUNITE") {
        return res.status(200).json({ result: { correct: false } });
      }

      const teamRef = db.ref(`gameData/teams/${token}`);
      await teamRef.update({
        currentStage: 7,
        isCompleted: true,
        lastActive: Date.now()
      });

      return res.status(200).json({ result: { correct: true } });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });
});