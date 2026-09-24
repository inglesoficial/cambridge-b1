const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;


/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);

app.use(
  express.json({
    limit: "100kb"
  })
);


const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


/* =========================================================
   FUNCIONES AUXILIARES
   ========================================================= */

function countWords(text) {

  if (!text || typeof text !== "string") {
    return 0;
  }

  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}


function stripHtml(html) {

  if (!html || typeof html !== "string") {
    return "";
  }

  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}


/* =========================================================
   LIMPIAR RESPUESTA JSON DE GEMINI
   ========================================================= */

function cleanJson(text) {

  if (!text || typeof text !== "string") {
    throw new Error("Gemini no ha devuelto ningún contenido.");
  }

  let cleaned = text.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {

    cleaned = cleaned.substring(
      firstBrace,
      lastBrace + 1
    );

  }

  return JSON.parse(cleaned);
}


/* =========================================================
   ESPERA
   ========================================================= */

function wait(ms) {

  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });

}


/* =========================================================
   LLAMADA A GEMINI CON REINTENTOS
   ========================================================= */

async function generateWithRetry(prompt) {

  const maxAttempts = 4;

  const delays = [
    3000,
    6000,
    12000
  ];

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {

    try {

      console.log(
        `Gemini: intento ${attempt} de ${maxAttempts}`
      );

      const response =
        await ai.models.generateContent({

          model: "gemini-3.6-flash",

          contents: prompt,

          config: {
            responseMimeType: "application/json"
          }

        });


      return response;


    } catch (error) {

      const status =
        error &&
        (
          error.status ||
          error.code
        );


      const message =
        error &&
        error.message
          ? error.message
          : "";


      const is503 =
        String(status) === "503" ||
        message.includes("503") ||
        message.toLowerCase().includes("high demand") ||
        message.toLowerCase().includes("unavailable");


      console.error(
        `Error Gemini en intento ${attempt}:`,
        message
      );


      if (
        !is503 ||
        attempt >= maxAttempts
      ) {

        throw error;

      }


      console.log(
        `Gemini está temporalmente saturado. Esperando ${delays[attempt - 1] / 1000} segundos antes de reintentar...`
      );


      await wait(
        delays[attempt - 1]
      );

    }

  }

}


/* =========================================================
   RUTA PRINCIPAL
   ========================================================= */

app.get("/", function (req, res) {

  res.json({
    ok: true,
    message: "Cambridge B1 Writing API funcionando correctamente."
  });

});


/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/api/health", function (req, res) {

  res.json({
    ok: true,
    service: "cambridge-b1"
  });

});


/* =========================================================
   CORRECCIÓN DEL EMAIL
   ========================================================= */

app.post("/api/correct", async function (req, res) {

  try {

    const email =
      req.body && req.body.email;

    const task =
      req.body && req.body.task;


    /* -------------------------------------------------------
       VALIDACIÓN
       ------------------------------------------------------- */

    if (
      !email ||
      typeof email !== "string"
    ) {

      return res.status(400).json({
        error: "No se ha recibido el email del alumno."
      });

    }


    if (
      !task ||
      typeof task !== "object"
    ) {

      return res.status(400).json({
        error: "No se ha recibido la información de la tarea."
      });

    }


    if (
      !Array.isArray(task.points) ||
      task.points.length === 0
    ) {

      return res.status(400).json({
        error: "La tarea no contiene los puntos que deben responderse."
      });

    }


    /* -------------------------------------------------------
       DATOS DE LA TAREA
       ------------------------------------------------------- */

    const taskBody =
      stripHtml(task.body || "");

    const taskPoints =
      task.points
        .map(function (point, index) {

          return (
            (index + 1) +
            ". " +
            point
          );

        })
        .join("\n");


    const wordCount =
      countWords(email);


    /* =======================================================
       PROMPT PARA GEMINI
       ======================================================= */

    const prompt = `

You are an experienced Cambridge B1 Preliminary English teacher.

You are correcting a Cambridge B1 Preliminary Writing Part 1 email.

Your job is to give useful, realistic feedback at approximately B1 level.

IMPORTANT:
The student's email must be evaluated against the EXACT task supplied below.

=========================================================
TASK
=========================================================

From: ${task.from || ""}

Subject: ${task.subject || ""}

EMAIL TASK:

${taskBody}

=========================================================
TASK POINTS
=========================================================

${taskPoints}

=========================================================
STUDENT'S EMAIL
=========================================================

${email}

=========================================================
WORD COUNT
=========================================================

The student's email contains approximately ${wordCount} words.

The recommended Cambridge B1 Preliminary Part 1 length is approximately 100–120 words.

=========================================================
LANGUAGE RULE
=========================================================

This rule is VERY IMPORTANT.

ALL explanations and feedback intended to explain the student's performance MUST BE IN SPANISH.

Therefore:

- taskAchievement comments MUST be in Spanish.
- grammar explanations MUST be in Spanish.
- vocabulary explanations MUST be in Spanish.
- organisation MUST be in Spanish.
- generalFeedback MUST be in Spanish.

However:

- original sentences MUST remain exactly as written by the student, in English.
- corrected sentences MUST be in English.
- vocabulary suggestions MUST be in English.
- improvedVersion MUST be entirely in English.

Do NOT translate the student's English sentences into Spanish.

Do NOT write explanations in English.

=========================================================
TASK ACHIEVEMENT
=========================================================

Check every task point separately.

Do not give credit merely because the student mentions a related word.

The student must communicate an appropriate answer to the point.

For every task point provide:

- label: a short description in Spanish.
- completed: true or false.
- comment: a concise explanation IN SPANISH.

=========================================================
GRAMMAR
=========================================================

Identify the most relevant grammar errors.

Do not invent errors.

Do not correct perfectly acceptable B1 English merely because another formulation is possible.

For every genuine grammar problem provide:

- original: the exact problematic English text.
- correction: the corrected English text.
- explanation: why it is wrong and how to improve it, IN SPANISH.

Focus on useful errors rather than producing a very long list.

If there are no relevant grammar errors, return an empty array.

=========================================================
VOCABULARY
=========================================================

Identify relevant vocabulary problems or opportunities for improvement.

Do not replace correct B1 vocabulary simply because a more advanced word exists.

For each useful vocabulary improvement provide:

- original: student's English.
- suggestion: improved English.
- explanation: explanation IN SPANISH.

If there are no relevant vocabulary improvements, return an empty array.

=========================================================
ORGANISATION
=========================================================

Evaluate:

- paragraphing
- logical order
- linking
- opening
- closing
- overall clarity

Give the explanation IN SPANISH.

=========================================================
GENERAL FEEDBACK
=========================================================

Give concise, useful feedback IN SPANISH.

Mention what the student did well and the main things they should improve.

Do not give a numerical score.

Do not pretend to provide an official Cambridge mark.

=========================================================
IMPROVED VERSION
=========================================================

Write a possible improved version of the student's email.

IMPORTANT:

The improved version must:

- be entirely IN ENGLISH.
- answer all task points.
- sound natural for B1 level.
- use approximately 100–120 words when reasonably possible.
- preserve the student's original ideas where possible.
- improve grammar, vocabulary and organisation.
- include an appropriate greeting and closing.
- NOT introduce completely unrelated ideas.

=========================================================
OUTPUT FORMAT
=========================================================

Return ONLY valid JSON.

Do not use Markdown.

Do not write anything before or after the JSON.

Use exactly this structure:

{
  "taskAchievement": [
    {
      "label": "string in Spanish",
      "completed": true,
      "comment": "string in Spanish"
    }
  ],
  "wordCount": ${wordCount},
  "grammar": [
    {
      "original": "English",
      "correction": "English",
      "explanation": "Spanish"
    }
  ],
  "vocabulary": [
    {
      "original": "English",
      "suggestion": "English",
      "explanation": "Spanish"
    }
  ],
  "organisation": "Spanish",
  "generalFeedback": "Spanish",
  "improvedVersion": "English"
}

`;


    /* =======================================================
       LLAMADA A GEMINI CON REINTENTOS
       ======================================================= */

    const response =
      await generateWithRetry(prompt);


    /* =======================================================
       OBTENER TEXTO
       ======================================================= */

    let responseText = "";

    if (
      response &&
      typeof response.text === "string"
    ) {

      responseText =
        response.text;

    } else if (
      response &&
      response.text
    ) {

      responseText =
        String(response.text);

    } else if (
      response &&
      response.candidates &&
      response.candidates[0] &&
      response.candidates[0].content &&
      response.candidates[0].content.parts
    ) {

      responseText =
        response.candidates[0]
          .content
          .parts
          .map(function (part) {
            return part.text || "";
          })
          .join("");

    }


    /* =======================================================
       PARSEAR JSON
       ======================================================= */

    const data =
      cleanJson(responseText);


    /* =======================================================
       ASEGURAR ESTRUCTURA
       ======================================================= */

    if (
      !Array.isArray(
        data.taskAchievement
      )
    ) {

      data.taskAchievement = [];

    }


    if (
      !Array.isArray(
        data.grammar
      )
    ) {

      data.grammar = [];

    }


    if (
      !Array.isArray(
        data.vocabulary
      )
    ) {

      data.vocabulary = [];

    }


    if (
      typeof data.organisation !== "string"
    ) {

      data.organisation = "";

    }


    if (
      typeof data.generalFeedback !== "string"
    ) {

      data.generalFeedback = "";

    }


    if (
      typeof data.improvedVersion !== "string"
    ) {

      data.improvedVersion = "";

    }


    /*
       El contador real lo calcula nuestro servidor,
       no Gemini.
    */

    data.wordCount =
      wordCount;


    /* =======================================================
       RESPUESTA
       ======================================================= */

    return res.json(data);


  } catch (error) {

    console.error(
      "ERROR EN /api/correct:",
      error
    );


    return res.status(500).json({

      error:
        error &&
        error.message
          ? error.message
          : "Error interno del servidor."

    });

  }

});


/* =========================================================
   INICIAR SERVIDOR
   ========================================================= */

app.listen(
  PORT,
  function () {

    console.log(
      `Cambridge B1 API escuchando en el puerto ${PORT}`
    );

  }
);
