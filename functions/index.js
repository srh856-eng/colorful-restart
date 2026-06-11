const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.database();

// 1. Master Team Registry Map (Secure Link ID -> Official Name Entry)
const authorizedTeams = {
  "t1_rbl": "ROYAL BLUE",
  "t2_mbz": "MINTY BREEZE",
  "t3_mms": "MOROCCAN MIST",
  "t4_wdk": "WOODSMOKE",
  "t5_mol": "MEDITERRANEAN OLIVE",
  "t6_tcr": "TRAVERTINE CAIRO",
  "t7_tls": "TIMELESS",
  "t8_poc": "PURE OCEAN",
  "t9_fjl": "FOREVER JUNGLE",
  "t10_dds": "DREAMY DESERT",
  "t11_ivt": "IVORY TOAST",
  "t12_sgy": "STONE GREY",
  "t13_pmt": "PASTEL MINT",
  "t14_ums": "URBAN MIST",
  "t15_ppl": "PERSIAN PEARL",
  "t16_dgy": "DOVE GREY",
  "t17_gly": "GOLDEN LILY",
  "t18_esc": "EARTHSCAPE",
  "t19_bsn": "BRIGHT SIENNA",
  "t20_mnl": "MINIMALIST"
};

// 2. Master Game Stages (Clues & Answers Configuration)
const gameStages = {
  1: { answer: "BRIGHTSTART", hint: "Look near the reception desk under the blue frame..." },
  2: { answer: "MAJESTIC", hint: "Where the coffee brews, a secret color lies..." },
  3: { answer: "INNOVATE", hint: "Check behind the main display lounge panel..." },
  4: { answer: "FINALE2026", hint: "The final puzzle rests where the history timeline wall meets the floor..." }
};

const TOTAL_STAGES = Object.keys(gameStages).length;

exports.checkAnswer = functions.https.onRequest(async (req, res) => {
  // Handle CORS Preflight Options Request
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    return res.status(200).send("");
  }

  try {
    const method = req.method;

    // ── HANDLING GET REQUESTS (Initial Load & Login Sync Check) ──
    if (method === "GET") {
      const token = req.query.team;
      if (!token || !authorizedTeams[token]) {
        return res.status(400).json({ success: false, error: "Invalid team token." });
      }

      const officialName = authorizedTeams[token];
      const teamRef = db.ref(`teams/${token}`);
      const snapshot = await teamRef.once("value");
      const data = snapshot.val();

      // If team hasn't logged in yet, tell frontend to show Screen 1 (Login View)
      if (!data || !data.isLoggedIn) {
        return res.json({ success: true, needsLogin: true, officialName: officialName });
      }

      // If already logged in, return current live game state
      const currentStage = data.currentStage || 1;
      return res.json({
        success: true,
        needsLogin: false,
        stage: currentStage,
        hint: gameStages[currentStage] ? gameStages[currentStage].hint : "Congratulations! You have completed the hunt."
      });
    }

    // ── HANDLING POST REQUESTS (Login Form Submissions & Game Code Verifications) ──
    if (method === "POST") {
      const body = req.body;
      const token = body.team;
      const actionType = body.action; // Can be 'login' or 'verifyCode'

      if (!token || !authorizedTeams[token]) {
        return res.status(400).json({ success: false, error: "Invalid team token." });
      }

      const teamRef = db.ref(`teams/${token}`);

      // ACTION A: Handle Team Name Login Verification
      if (actionType === "login") {
        const inputName = body.teamName ? body.teamName.trim().toUpperCase() : "";
        const correctName = authorizedTeams[token];

        if (inputName !== correctName) {
          return res.json({ success: false, correct: false, error: "Wrong team name for this link!" });
        }

        // Initialize team data dynamically inside database on match
        await teamRef.update({
          teamName: correctName,
          isLoggedIn: true,
          currentStage: 1,
          progress: "20%", // Hardcoded 20% baseline progress instantly upon logging in
          lastUpdated: admin.database.ServerValue.TIMESTAMP
        });

        return res.json({
          success: true,
          correct: true,
          needsLogin: false,
          stage: 1,
          hint: gameStages[1].hint
        });
      }

      // ACTION B: Handle Code Submissions (Infinite Attempts, No Elimination)
      if (actionType === "verifyCode") {
        const snapshot = await teamRef.once("value");
        const data = snapshot.val();

        if (!data || !data.isLoggedIn) {
          return res.status(403).json({ success: false, error: "Team must log in first." });
        }

        const currentStage = data.currentStage || 1;
        const playerSubmission = body.submission ? body.submission.trim().toUpperCase() : "";

        // Check if game is already completely finished
        if (!gameStages[currentStage]) {
          return res.json({ correct: false, error: "Game already completed!" });
        }

        const targetAnswer = gameStages[currentStage].answer.toUpperCase();

        if (playerSubmission === targetAnswer) {
          const nextStage = currentStage + 1;
          const isFinished = !gameStages[nextStage];
          
          // Calculate linear dashboard metric scaling up past the 20% mark
          let dynamicProgress = "100%";
          if (!isFinished) {
            const fraction = 0.2 + ((nextStage - 1) / (TOTAL_STAGES)) * 0.8;
            dynamicProgress = `${Math.min(Math.round(fraction * 100), 100)}%`;
          }

          const updates = {
            currentStage: nextStage,
            progress: dynamicProgress,
            lastUpdated: admin.database.ServerValue.TIMESTAMP
          };

          await teamRef.update(updates);

          return res.json({
            correct: true,
            nextStage: nextStage,
            nextHint: isFinished ? "Congratulations! You have completed the hunt." : gameStages[nextStage].hint
          });
        } else {
          // Wrong answers just return correct:false. No strike penalties incrementing!
          return res.json({ correct: false });
        }
      }
    }
  } catch (error) {
    console.error("Global routing exception:", error);
    return res.status(500).json({ success: false, error: "Internal Server Matrix Error." });
  }
});