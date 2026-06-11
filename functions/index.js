const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.database();

// 🔒 THE MASTER AUTHORIZED TEAM LIST
// Supports both your explicit tokens and legacy tracking codes dynamically
const AUTHORIZED_TEAMS = {
  "1fgx": "MAJESTIC BLUE",
  "2tkz": "ROYAL MATTE",
  "3wqp": "GLOSS SUPREME",
  "4vby": "LADY DESIGN",
  "t1_rbl": "TEAM RUBY", 
  "t2_sapp": "TEAM SAPPHIRE"
};

const TOTAL_STAGES = 5; 

const CLUES = {
  1: "Welcome to the hunt! Your first destination is where the global corporate history began. Find the founding year on the commemorative plaque.",
  2: "Look closely at the premium finish gallery. The answer is hidden beneath the brightest spotlight.",
  3: "Find the laboratory mixing station. Your clue is the exact chemical code for our signature primary blue.",
  4: "Search near the main presentation auditorium. Count the total number of glass panels on the entryway door.",
  5: "The final checkpoint. Present your journey log to the coordinator at the front registration counter to claim victory."
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
        return res.status(400).json({ success: false, message: "Invalid or missing team link token." });
      }

      const expectedName = AUTHORIZED_TEAMS[token];
      // 🔥 FIXED: Writing inside the secure gameData layout path to align with rules
      const teamRef = db.ref(`gameData/teams/${token}`);
      const snapshot = await teamRef.once("value");
      const teamData = snapshot.val();

      if (checkName) {
        if (checkName !== expectedName) {
          return res.json({ success: true, validTeam: false, message: "Wrong team name entered for this access link." });
        }

        let currentStage = 1;
        if (teamData && teamData.stage) {
          currentStage = teamData.stage;
        } else {
          await teamRef.set({
            teamName: expectedName,
            stage: 1,
            progress: "20%", 
            lastActive: admin.database.ServerValue.TIMESTAMP
          });
        }

        return res.json({ 
          success: true, 
          validTeam: true, 
          stage: currentStage, 
          hint: CLUES[currentStage] 
        });
      }

      if (teamData && teamData.stage) {
        return res.json({ success: true, registered: true, stage: teamData.stage, hint: CLUES[teamData.stage] });
      } else {
        return res.json({ success: true, registered: false });
      }
    }

    if (req.method === "POST") {
      const { team: token, stage, submission } = req.body;

      if (!token || !AUTHORIZED_TEAMS[token]) {
        return res.status(400).json({ success: false, message: "Unauthorized token access." });
      }

      const cleanSubmission = submission.trim().toUpperCase();
      const currentStageNum = parseInt(stage);

      const MASTER_ANSWERS = {
        1: "1926",
        2: "MATTE",
        3: "B12",
        4: "8",
        5: "JOTUNUNITE"
      };

      if (cleanSubmission === MASTER_ANSWERS[currentStageNum]) {
        const nextStage = currentStageNum + 1;
        const isGameFinished = nextStage > TOTAL_STAGES;
        
        let nextProgress = isGameFinished ? "100%" : `${Math.floor((nextStage / TOTAL_STAGES) * 100)}%`;
        if (currentStageNum === 1) nextProgress = "40%"; 

        const updateData = {
          lastActive: admin.database.ServerValue.TIMESTAMP
        };

        if (!isGameFinished) {
          updateData.stage = nextStage;
          updateData.progress = nextProgress;
        } else {
          updateData.progress = "100% - FINISHED";
        }

        // 🔥 FIXED: Updating metrics cleanly inside the structural parent block
        await db.ref(`gameData/teams/${token}`).update(updateData);

        return res.json({
          correct: true,
          nextStage: isGameFinished ? currentStageNum : nextStage,
          nextHint: isGameFinished ? "CONGRATULATIONS! You have successfully completed the Jotun Hunt!" : CLUES[nextStage]
        });
      } else {
        return res.json({ correct: false });
      }
    }

  } catch (error) {
    console.error("Core engine failure:", error);
    return res.status(500).json({ success: false, message: "Internal server matrix error." });
  }
});