const express = require("express");
const path = require("path");
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


/* =========================================================
   CORS
   Permite que inglesoficial.com pueda llamar a Render
   ========================================================= */

const allowedOrigins = [
  "https://www.inglesoficial.com",
  "https://inglesoficial.com"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  // Responder a la petición previa de CORS
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});


/* =========================================================
   MIDDLEWARE
   ========================================================= */

app.use(express.json({ limit: "20kb" }));

app.use(express.static(path.join(__dirname)));


/* =========================================================
   API: CORREGIR EMAIL
   ========================================================= */

app.post("/api/correct", async (req, res) => {

  try {

    const email = req.body.email;


    /* -----------------------------------------------------
       Comprobar que se ha recibido texto
       ----------------------------------------------------- */

    if (!email || typeof email !== "string") {

      return res.status(400).json({
        error: "No se ha recibido ningún email."
      });

    }


    /* -----------------------------------------------------
       Comprobar longitud mínima
       ----------------------------------------------------- */

    if (email.trim().length < 40) {

      return res.status(400).json({
        error: "El email es demasiado corto."
      });

    }


    /* =====================================================
       PROMPT PARA GEMINI
       ===================================================== */

    const prompt = `

You are an experienced Cambridge English teacher.

You are correcting a Cambridge B1 Preliminary Writing Part 1 email.

The student is a B1 English learner.

Your job is to give useful, accurate and encouraging feedback that helps the student improve.

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

I’m writing because, as you know, our team is training hard and the coming season is starting in a couple of weeks.

I thought we could organise a friendly match against the St Peter’s High School team in London.

Do you think it’s a good idea? (Give your opinion.)

If so, can you think of a good place to hold the match? (Suggest a place.)

Would it be best to hold it on a weekday or at the weekend? (Choose one and say why.)

Also, I’m thinking of having lunch in London after the game.

What kind of restaurant do you think our teammates would like to go to? (Give your opinion and a reason.)

Email me soon!

Charles


STUDENT'S EMAIL:

${email}


=========================================================
TASK ACHIEVEMENT
=========================================================

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


=========================================================
GRAMMAR
=========================================================

Identify only genuine grammar, punctuation or sentence-structure errors.

For every genuine error return:

- "original"
- "correction"
- "explanation"

If there are no important grammar errors, return an empty array.


=========================================================
VOCABULARY
=========================================================

Suggest improvements only when they genuinely help natural, precise or appropriate B1 English.

Do not criticise correct simple vocabulary.

Do not praise vocabulary simply because it is advanced.

If there are no useful improvements, return an empty array.

Each vocabulary object must contain:

- "original"
- "suggestion"
- "explanation"


=========================================================
ORGANISATION
=========================================================

Comment briefly on:

- paragraphing
- logical order
- linking words
- clarity

Only mention things that are actually relevant to the student's email.


=========================================================
WORD COUNT
=========================================================

Count the number of words in the student's original email.

Useful target:

100–120 words.

If the answer is below 100 words, clearly tell the student to develop their ideas.

Do not treat word count as the only measure of quality.


=========================================================
GENERAL FEEDBACK
=========================================================

Give a short, encouraging and useful summary.

Mention:

- missed task points
- excessive shortness if relevant
- one or two practical suggestions for improvement


=========================================================
IMPROVED VERSION
=========================================================

Correct the student's email while keeping their ideas and style whenever possible.

Do not completely rewrite it.

If a task point is missing, add a short natural sentence covering that point.

Aim for approximately 100–120 words.

Keep the language appropriate for a B1 learner.


=========================================================
RETURN FORMAT
=========================================================

Return ONLY valid JSON.

Use exactly this structure:

{
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
      "completed": true
    }
  ],
  "grammar": [],
  "vocabulary": [],
  "organisation": "",
  "wordCount": 0,
  "generalFeedback": "",
  "improvedVersion": ""
}

For grammar objects use:

{
  "original": "",
  "correction": "",
  "explanation": ""
}

For vocabulary objects use:

{
  "original": "",
  "suggestion": "",
  "explanation": ""
}

No markdown.

No comments.

No text outside the JSON.

taskAchievement MUST always contain exactly four objects.

completed MUST always be either true or false.

wordCount MUST be a number.

grammar MUST be an array.

vocabulary MUST be an array.

organisation MUST be a string.

generalFeedback MUST be a string.

improvedVersion MUST be a string.

`;


/* =========================================================
   MODELOS GEMINI
   ========================================================= */

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


    /* =====================================================
       INTENTAR LOS MODELOS
       ===================================================== */

    for (const model of models) {

      console.log(`Probando modelo: ${model}`);


      for (let attempt = 1; attempt <= 2; attempt++) {

        try {

          console.log(
            `Intento ${attempt} con ${model}`
          );


          response = await ai.models.generateContent({

            model: model,

            contents: prompt,

            config: {
              responseMimeType: "application/json"
            }

          });


          console.log(
            `Respuesta recibida de: ${model}`
          );


          break;


        } catch (error) {

          lastError = error;

          const status =
            error.status || error.code;


          console.log(
            `Error con ${model} (intento ${attempt}): ${status}`
          );


          if (
            (status === 503 || status === 429) &&
            attempt < 2
          ) {

            const delay = 3000 * attempt;

            console.log(
              `Esperando ${delay / 1000} segundos antes de reintentar...`
            );


            await new Promise(
              resolve => setTimeout(resolve, delay)
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


    /* =====================================================
       SI NINGÚN MODELO RESPONDE
       ===================================================== */

    if (!response) {
      throw lastError;
    }


    /* =====================================================
       PROCESAR RESPUESTA
       ===================================================== */

    const result = JSON.parse(response.text);


    console.log(
      "TASK ACHIEVEMENT RECIBIDO:",
      result.taskAchievement
    );


    /* =====================================================
       ENVIAR RESULTADO A BLOGGER
       ===================================================== */

    res.json(result);


  } catch (error) {

    console.error(
      "Gemini error:",
      error
    );


    res.status(500).json({

      error:
        "No se ha podido corregir el email. Inténtalo de nuevo."

    });

  }

});


/* =========================================================
   INICIAR SERVIDOR
   ========================================================= */

app.listen(PORT, () => {

  console.log(
    `Servidor funcionando en http://localhost:${PORT}`
  );

});
