const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp({
  databaseURL: "https://jotunhunt2026-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = admin.database();

const AUTHORIZED_TEAMS = {
  "j7x2": "ROYAL BLUE",
  "m3kw": "MINTY BREEZE",
  "r9nt": "MOROCCAN MIST",
  "w4qb": "WOODSMOKE",
  "v6lp": "MEDITERRANEAN OLIVE",
  "t8cz": "TRAVERTINE CAIRO",
  "e2ys": "TIMELESS",
  "u5fh": "PURE OCEAN",
  "n1gd": "FOREVER JUNGLE",
  "d0rv": "DREAMY DESERT",
  "i4mo": "IVORY TOAST",
  "s6jt": "STONE GREY",
  "p2xn": "PASTEL MINT",
  "b9ae": "URBAN MIST",
  "q3wk": "PERSIAN PEARL",
  "f7cv": "DOVE GREY",
  "g5rl": "GOLDEN LILY",
  "h8uz": "EARTHSCAPE",
  "c1mb": "BRIGHT SIENNA",
  "k0yd": "MINIMALIST"
};

const TOTAL_STAGES = 5;
const MAX_HINTS = 2;

const CLUES = {
  1: "Welcome to the hunt! Your first destination is where the global corporate history began. Find the founding year on the commemorative plaque.",
  2: "Look closely at the premium finish gallery. The answer is hidden beneath the brightest spotlight.",
  3: "Find the laboratory mixing station. Your clue is the exact chemical code for our signature primary blue.",
  4: "Search near the main presentation auditorium. Count the total number of glass panels on the entryway door.",
  5: "The final checkpoint. Present your journey log to the coordinator at the front registration counter to claim victory."
};

const HINTS = {
  1: "The plaque is mounted on the wall near the main entrance lobby. Look for a brass frame.",
  2: "The spotlight is in the far-right corner of the gallery. Check the pedestal beneath it.",
  3: "The chemical code is displayed on the large mixing tank. It starts with the letter B.",
  4: "Count only the fixed glass panels — do not include the doors themselves.",
  5: "The registration counter is staffed and located directly opposite the main entrance."
};

const MASTER_ANSWERS = {
  1: "1926",
  2: "MATTE",
  3: "B12",
  4: "8",
  5: "JOTUNUNITE"
};

exports.checkAnswer = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).send("");
  }

  try {
    if (req.method === "GET") {
      const token = req.query.team;
      const checkName = req.query.checkName ? req.query.checkName.trim().toUpperCase() : null;

      if (!token || !AUTHORIZED_TEAMS[token]) {
        return res.status(400).json({ success: false, message: "Invalid token value." });
      }

      const expectedName = AUTHORIZED_TEAMS[token];
      const teamRef = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.once("value");
      const teamData = snapshot.val();

      if (checkName) {
        if (checkName !== expectedName) {
          return res.json({ success: true, validTeam: false });
        }

        let currentStage = 1;
        let hintsUsed = 0;

        if (teamData && teamData.stage) {
          currentStage = teamData.stage;
          hintsUsed = teamData.hintsUsed || 0;
        } else {
          await teamRef.set({
            teamName: expectedName,
            stage: 1,
            progress: "20%",
            hintsUsed: 0,
            finished: false,
            lastActive: admin.database.ServerValue.TIMESTAMP
          });
        }

        return res.json({
          success: true,
          validTeam: true,
          stage: currentStage,
          hint: CLUES[currentStage],
          hintsUsed
        });
      }

      if (teamData && teamData.stage) {
        return res.json({
          success: true,
          registered: true,
          stage: teamData.stage,
          hint: CLUES[teamData.stage],
          hintsUsed: teamData.hintsUsed || 0,
          finished: teamData.finished || false
        });
      } else {
        return res.json({ success: true, registered: false });
      }
    }

    if (req.method === "POST") {
      const { team: token, stage, submission, requestHint } = req.body;

      if (!token || !AUTHORIZED_TEAMS[token]) {
        return res.status(400).json({ success: false });
      }

      const teamRef = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.once("value");
      const teamData = snapshot.val();
      const currentHintsUsed = teamData ? (teamData.hintsUsed || 0) : 0;

      if (requestHint) {
        if (currentHintsUsed >= MAX_HINTS) {
          return res.json({ success: false, hintLimitReached: true });
        }
        const stageNum = parseInt(stage);
        const newHintsUsed = currentHintsUsed + 1;
        await teamRef.update({
          hintsUsed: newHintsUsed,
          lastActive: admin.database.ServerValue.TIMESTAMP
        });
        return res.json({
          success: true,
          hint: HINTS[stageNum],
          hintsUsed: newHintsUsed
        });
      }

      const cleanSubmission = submission.trim().toUpperCase();
      const currentStageNum = parseInt(stage);

      if (cleanSubmission === MASTER_ANSWERS[currentStageNum]) {
        const nextStage = currentStageNum + 1;
        const isGameFinished = nextStage > TOTAL_STAGES;
        const progressPercent = isGameFinished ? 100 : Math.floor((nextStage / TOTAL_STAGES) * 100);
        const progressDisplay = isGameFinished ? "100%" : `${progressPercent}%`;

        const updateData = {
          lastActive: admin.database.ServerValue.TIMESTAMP,
          progress: progressDisplay
        };

        if (!isGameFinished) {
          updateData.stage = nextStage;
        } else {
          updateData.finished = true;
          updateData.finishedAt = admin.database.ServerValue.TIMESTAMP;
        }

        await teamRef.update(updateData);

        return res.json({
          correct: true,
          nextStage: isGameFinished ? currentStageNum : nextStage,
          nextHint: isGameFinished ? "🏆 Victory!" : CLUES[nextStage],
          finished: isGameFinished
        });
      } else {
        return res.json({ correct: false });
      }
    }
  } catch (error) {
    return res.status(500).json({ success: false });
  }
});