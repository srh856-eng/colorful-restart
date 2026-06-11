const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp({
  databaseURL: "https://jotunhunt2026-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const P_A_HINT = "Booklet Clue: Find the missing phrase hidden at CSD First Floor, Row 5.";
const P_B_HINT = "Office Floor Investigation: Follow the logical employee movements to discover the hidden route sequence.";
const P_C_HINT = "Find a team huddle space. Solve the Corporate Murder Mystery logic grid in your booklet.";
const P_D_HINT = "Run to the Server Room window on the Ground Floor and check the active network logs.";
const P_E_HINT = "Final Sprint! Solve the Shipping Container logistics routing grid at your desks.";

const TEAM_MAP = {
  "1fgx":  { hints: [P_A_HINT, P_B_HINT, P_C_HINT, P_D_HINT, P_E_HINT] },
  "2jkv":  { hints: [P_B_HINT, P_C_HINT, P_D_HINT, P_E_HINT, P_A_HINT] },
  "3bnd":  { hints: [P_C_HINT, P_D_HINT, P_E_HINT, P_A_HINT, P_B_HINT] },
  "4qws":  { hints: [P_D_HINT, P_E_HINT, P_A_HINT, P_B_HINT, P_C_HINT] },
  "5zxt":  { hints: [P_E_HINT, P_A_HINT, P_B_HINT, P_C_HINT, P_D_HINT] },
  "6mpl":  { hints: [P_A_HINT, P_B_HINT, P_C_HINT, P_D_HINT, P_E_HINT] },
  "7tyu":  { hints: [P_B_HINT, P_C_HINT, P_D_HINT, P_E_HINT, P_A_HINT] },
  "8vfr":  { hints: [P_C_HINT, P_D_HINT, P_E_HINT, P_A_HINT, P_B_HINT] },
  "9lkj":  { hints: [P_D_HINT, P_E_HINT, P_A_HINT, P_B_HINT, P_C_HINT] },
  "10pob": { hints: [P_E_HINT, P_A_HINT, P_B_HINT, P_C_HINT, P_D_HINT] },
  "11hgf": { hints: [P_A_HINT, P_B_HINT, P_C_HINT, P_D_HINT, P_E_HINT] },
  "12mnb": { hints: [P_B_HINT, P_C_HINT, P_D_HINT, P_E_HINT, P_A_HINT] },
  "13cxz": { hints: [P_C_HINT, P_D_HINT, P_E_HINT, P_A_HINT, P_B_HINT] },
  "14oiu": { hints: [P_D_HINT, P_E_HINT, P_A_HINT, P_B_HINT, P_C_HINT] },
  "15ytg": { hints: [P_E_HINT, P_A_HINT, P_B_HINT, P_C_HINT, P_D_HINT] }
};

exports.checkAnswer = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const db = admin.database();
    const team = String(req.body.team || req.query.team || "").trim();
    const action = String(req.body.action || req.query.action || "check");
    const rawAnswer = String(req.body.answer || req.query.answer || "").trim().toUpperCase();

    if (!TEAM_MAP[team]) {
      return res.status(400).json({ error: "Access Denied: Invalid team identity." });
    }

    const ref = db.ref(`gameData/teams/${team}`);
    const snap = await ref.get();
    const state = snap.val() || { stage: 0, strikes: 0 };
    let stage = parseInt(state.stage) || 0;
    let strikes = parseInt(state.strikes) || 0;

    if (action === "getClue") {
      if (strikes >= 5) return res.json({ status: "ELIMINATED", hint: "" });
      if (stage >= 5) return res.json({ status: "VICTORY", hint: "" });
      return res.json({ status: "RUNNING", stage, strikes, hint: TEAM_MAP[team].hints[stage] });
    }

    if (strikes >= 5) return res.json({ success: false, message: "ELIMINATED" });
    if (stage >= 5) return res.json({ success: true, message: "VICTORY" });

    const answersOrder = ["FENOMASTIC", "7", "MARKETING", "4582", "JOTASHIELD"];
    let isCorrect = false;

    if (team === "1fgx" || team === "6mpl" || team === "11hgf") {
      isCorrect = (rawAnswer === answersOrder[stage]);
    } else if (team === "2jkv" || team === "7tyu" || team === "12mnb") {
      const rotationalAnswers = ["7", "MARKETING", "4582", "JOTASHIELD", "FENOMASTIC"];
      isCorrect = (rawAnswer === rotationalAnswers[stage]);
    } else if (team === "3bnd" || team === "8vfr" || team === "13cxz") {
      const rotationalAnswers = ["MARKETING", "4582", "JOTASHIELD", "FENOMASTIC", "7"];
      isCorrect = (rawAnswer === rotationalAnswers[stage]);
    } else if (team === "4qws" || team === "9lkj" || team === "14oiu") {
      const rotationalAnswers = ["4582", "JOTASHIELD", "FENOMASTIC", "7", "MARKETING"];
      isCorrect = (rawAnswer === rotationalAnswers[stage]);
    } else {
      const rotationalAnswers = ["JOTASHIELD", "FENOMASTIC", "7", "MARKETING", "4582"];
      isCorrect = (rawAnswer === rotationalAnswers[stage]);
    }

    if (isCorrect) {
      stage++;
      await ref.update({ stage });
      if (stage >= 5) await db.ref("gameData/winner").set(team);
      return res.json({ success: true, stage, strikes, hint: TEAM_MAP[team].hints[stage] || "" });
    }

    strikes++;
    await ref.update({ strikes });
    return res.json({ success: false, stage, strikes, hint: TEAM_MAP[team].hints[stage] });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Error" });
  }
});