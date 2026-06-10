const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.database();

const ANSWERS = [
  "FENOMASTIC",
  "7",
  "MARKETING",
  "4582",
  "JOTASHIELD"
];

const TEAM_MAP = {
  "1": [0,1,2,3,4],
  "2": [1,2,3,4,0],
  "3": [2,3,4,0,1],
  "4": [3,4,0,1,2],
  "5": [4,0,1,2,3]
};

exports.checkAnswer = functions.https.onRequest((req, res) => {

  cors(req, res, async () => {

    try {

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }

      const team = String(req.body.team || "");
      const answer = String(req.body.answer || "").trim().toUpperCase();

      if (!TEAM_MAP[team]) {
        return res.status(400).json({ success: false, error: "Invalid team" });
      }

      const ref = db.ref(`gameData/teams/${team}`);
      const snap = await ref.get();

      const state = snap.val() || { stage: 0, strikes: 0 };

      let stage = state.stage;
      let strikes = state.strikes;

      if (strikes >= 5) {
        return res.json({ success: false, message: "ELIMINATED" });
      }

      const correctIndex = TEAM_MAP[team][stage];
      const correctAnswer = ANSWERS[correctIndex];

      if (answer === correctAnswer) {

        stage++;

        await ref.update({ stage });

        let winner = null;

        if (stage >= 5) {
          winner = team;
          await db.ref("gameData/winner").set(team);
        }

        return res.json({
          success: true,
          stage,
          winner
        });
      }

      strikes++;

      await ref.update({ strikes });

      return res.json({
        success: false,
        strikes
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: "Server error" });
    }

  });

});