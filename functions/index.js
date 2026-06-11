const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.database();

// 🔒 THE MASTER AUTHORIZED TEAM LIST
// Maps the secret URL token to your official Jotun team names
const AUTHORIZED_TEAMS = {
  "1fgx": "MAJESTIC BLUE",
  "2tkz": "ROYAL MATTE",
  "3wqp": "GLOSS SUPREME",
  "4vby": "LADY DESIGN"
};

// Total stages in your scavenger hunt (used to calculate progress after Stage 1)
const TOTAL_STAGES = 5; 

// Secure Clue Matrix
const CLUES = {
  1: "Welcome to the hunt! Your first destination is where the global corporate history began. Find the founding year on the commemorative plaque.",
  2: "Look closely at the premium finish gallery. The answer is hidden beneath the brightest spotlight.",
  3: "Find the laboratory mixing station. Your clue is the exact chemical code for our signature primary blue.",
  4: "Search near the main presentation auditorium. Count the total number of glass panels on the entryway door.",
  5: "The final checkpoint. Present your journey log to the coordinator at the front registration counter to claim victory."
};

exports.checkAnswer = functions.https.onRequest(async (req, res) => {
  // Enable CORS so your GitHub Pages frontend can talk to this backend safely
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).send("");
  }

  try {
    // 🔍 HANDLE GET REQUEST: (When the page first loads or runs registration checks)
    if (req.method === "GET") {
      const token = req.query.team;
      const checkName = req.query.checkName ? req.query.checkName.trim().toUpperCase() : null;

      if (!token || !AUTHORIZED_TEAMS[token]) {
        return res.status(400).json({ success: false, message: "Invalid or missing team link token." });
      }

      const expectedName = AUTHORIZED_TEAMS[token];
      const teamRef = db.ref(`teams/${token}`);
      const snapshot = await teamRef.once("value");
      const teamData = snapshot.val();

      // If checking a name submission during login/registration
      if (checkName) {
        if (checkName !== expectedName) {
          return res.json({ success: true, validTeam: false, message: "Wrong team name entered for this access link." });
        }

        // Name matches! Initialize or fetch team tracking node in database
        let currentStage = 1;
        if (teamData && teamData.stage) {
          currentStage = teamData.stage;
        } else {
          // New login registration: Force database initialization parameters
          await teamRef.set({
            teamName: expectedName,
            stage: 1,
            progress: "20%", // Hardcoded 20% entry baseline achieved on name verification
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

      // Standard page reload status fetch
      if (teamData && teamData.stage) {
        return res.json({ success: true, registered: true, stage: teamData.stage, hint: CLUES[teamData.stage] });
      } else {
        return res.json({ success: true, registered: false });
      }
    }

    // 📥 HANDLE POST REQUEST: (When verifying a stage challenge code)
    if (req.method === "POST") {
      const { team: token, stage, submission } = req.body;

      if (!token || !AUTHORIZED_TEAMS[token]) {
        return res.status(400).json({ success: false, message: "Unauthorized token access." });
      }

      const cleanSubmission = submission.trim().toUpperCase();
      const currentStageNum = parseInt(stage);

      // Simple answers dictionary mapped to your stages
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
        
        // Calculate progress percentage dynamically for higher levels
        // Stage 1 correct moves them forward, scaling gracefully up to 100%
        let nextProgress = isGameFinished ? "100%" : `${Math.floor((nextStage / TOTAL_STAGES) * 100)}%`;
        if (currentStageNum === 1) nextProgress = "40%"; // Custom incremental step up from baseline 20%

        const updateData = {
          lastActive: admin.database.ServerValue.TIMESTAMP
        };

        if (!isGameFinished) {
          updateData.stage = nextStage;
          updateData.progress = nextProgress;
        } else {
          updateData.progress = "100% - FINISHED";
        }

        await db.ref(`teams/${token}`).update(updateData);

        return res.json({
          correct: true,
          nextStage: isGameFinished ? currentStageNum : nextStage,
          nextHint: isGameFinished ? "CONGRATULATIONS! You have successfully completed the Jotun Hunt!" : CLUES[nextStage]
        });
      } else {
        // WRONG ANSWER: Returns incorrect without applying penalties or tracking strikes
        return res.json({ correct: false });
      }
    }

  } catch (error) {
    console.error("Core engine failure:", error);
    return res.status(500).json({ success: false, message: "Internal server matrix error." });
  }
});