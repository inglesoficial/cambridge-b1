const express = require("express");
const path = require("path");
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname)));

app.post("/api/correct", async (req, res) => {
  try {
    const email = req.body.email;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        error: "No se ha recibido ningún email."
      });
    }

    if (email.trim().length < 40) {
      return res.status(400).json({
        error: "El email es demasiado corto."
      });
    }

    const prompt = `
You are an experienced Cambridge English teacher.

You are correcting a Cambridge B1 Preliminary Writing Part 1 email.

The student is a B1 English learner. Your job is to give useful, accurate and encouraging feedback that helps the student improve.

IMPORTANT PRINCIPLES:
- Be encouraging, but honest.
- Do not invent mistakes.
- Do not penalise the student for using a different correct answer.
- Do not assume that a more advanced expression is better.
- Focus on accuracy, clarity, natural English and successful communication.
- Do not rewrite the student's email completely.
- Keep the student's ideas whenever possible.
- Explain things in simple language suitable for a B1 learner.
- If something is already correct, do not present it as a mistake.
- Distinguish between real errors and optional improvements.

TASK:

The student had to reply to this email:

From: Charles
Subject: Friendly soccer match

Hello Jane,

I’m writing because, as you know, our team is training hard and the coming season is starting in a couple of weeks. I thought we could organise a friendly match against the St Peter’s High School team in London. Do you think it’s a good idea? (Give your opinion.)

If so, can you think of a good place to hold the match? (Suggest a place.)

Would it be best to hold it on a weekday or at the weekend? (Choose one and say why.)

Also, I’m thinking of having lunch in London after the game. What kind of restaurant do you think our teammates would like to go to? (Give your opinion and a reason.)

Email me soon!

Charles

STUDENT'S EMAIL:

${email}

TASK ACHIEVEMENT:

Check the student's answer against the FOUR required task points:

1. Give an opinion about organising the friendly match.
2. Suggest a place to hold the match.
3. Choose a weekday or the weekend and give a reason.
4. Give an opinion about what kind of restaurant the teammates should go to AND give a reason.

TASK ACHIEVEMENT FORMAT:

Return "taskAchievement" as an array containing exactly four objects.

Each object must have:
- "point"
- "completed"

Use these four points exactly:

1. "Opinión sobre el partido"
2. "Lugar para el partido"
3. "Día elegido y razón"
4. "Restaurante y razón"

For "completed":
- Use true if the student clearly answered the point.
- Use false if the student did not answer the point.
- Use false if the student only partially answered the point.

Example:

"taskAchievement": [
  {
    "point": "Opinión sobre el partido",
    "completed": true
  },
  {
    "point": "Lugar para el partido",
    "completed": true
  },
  {
    "point": "Día elegido y razón",
    "completed": true
  },
  {
    "point": "Restaurante y razón",
    "completed": false
  }
]

GRAMMAR:

Identify only genuine grammar, punctuation or sentence-structure errors.

For every genuine error, provide:
- original
- correction
- explanation

If there are no important grammar errors, return an empty array.

VOCABULARY:

Identify useful vocabulary improvements only when they genuinely help the student's English become more natural, precise or appropriate for B1.

For every suggestion, provide:
- original
- suggestion
- explanation

Do NOT criticise correct vocabulary simply because it is simple.
Do NOT praise vocabulary just because it sounds advanced.
If there are no useful vocabulary suggestions, return an empty array.

ORGANISATION:

Comment briefly on:
- paragraphing
- logical order
- linking words
- clarity

Mention only things that are relevant to the student's actual email.

WORD COUNT:

Count the words in the student's original email.

Use the following as a useful target:
- Cambridge B1 Preliminary Writing Part 1 normally expects around 100 words.
- For this exercise, consider approximately 100–120 words a useful target.
- If the student's email is below 100 words, clearly tell them that they should develop their ideas more.
- Do not treat the word count as the only measure of quality.

GENERAL FEEDBACK:

Give a short, encouraging and useful summary.

If the student has missed a task point, mention it clearly.

If the email is too short, mention that they need to develop their ideas.

Give one or two practical suggestions for improving the next email.

IMPROVED VERSION:

Correct the student's email while keeping the student's original ideas and style wherever possible.

IMPORTANT:
- Do not completely rewrite the email.
- Do not add completely new ideas unless necessary to complete a missing task point.
- Correct genuine grammar, punctuation and vocabulary problems.
- Improve organisation where necessary.
- If a task point is missing, add a short natural sentence that answers it.
- Keep the improved version approximately 100–120 words when possible.
- Keep the language appropriate for a B1 learner.
- Do not make the improved version unnecessarily advanced.

RETURN FORMAT:

Return ONLY valid JSON with exactly these fields:

{
  "taskAchievement": "",
  "grammar": [],
  "vocabulary": [],
  "organisation": "",
  "wordCount": 0,
  "generalFeedback": "",
  "improvedVersion": ""
}

For grammar, use objects with:
- original
- correction
- explanation

For vocabulary, use objects with:
- original
- suggestion
- explanation

Do not include markdown.
Do not include comments outside the JSON.
`;

            const models = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-flash-latest"
  
];

    let response;
let lastError;

for (const model of models) {
  console.log(`Probando modelo: ${model}`);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`Intento ${attempt} con ${model}`);

      response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      console.log(`Respuesta recibida de: ${model}`);
      break;

    } catch (error) {
      lastError = error;

      const status = error.status || error.code;

      console.log(
        `Error con ${model} (intento ${attempt}): ${status}`
      );

      // Si es un error temporal 503 o 429,
      // esperamos y volvemos a intentarlo.
      if (
        (status === 503 || status === 429) &&
        attempt < 2
      ) {
        const delay = 3000 * attempt;

        console.log(
          `Esperando ${delay / 1000} segundos antes de reintentar...`
        );

        await new Promise(resolve =>
          setTimeout(resolve, delay)
        );
      } else {
        break;
      }
    }
  }

  if (response) {
    break;
  }

  console.log(
    `El modelo ${model} no ha podido responder. Probando el siguiente...`
  );
}

if (!response) {
  throw lastError;
}

const result = JSON.parse(response.text);
console.log("TASK ACHIEVEMENT RECIBIDO:", result.taskAchievement);

    res.json(result);

  } catch (error) {
    console.error("Gemini error:", error);

    res.status(500).json({
      error: "No se ha podido corregir el email. Inténtalo de nuevo."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
});