const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// GOOGLE GEMINI
// ===============================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Modelo actual
const MODEL = "gemini-3.1-flash-lite";

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());

app.use(express.json({ limit: "1mb" }));

// ===============================
// HEALTH CHECK
// ===============================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "cambridge-b1"
  });
});

// ===============================
// FUNCIONES AUXILIARES
// ===============================

function isRetryableError(error) {
  const status = error?.status || error?.code;

  const message = String(
    error?.message || error || ""
  ).toLowerCase();

  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("unavailable") ||
    message.includes("overloaded") ||
    message.includes("resource exhausted") ||
    message.includes("high demand")
  );
}

// ===============================
// LLAMADA A GEMINI CON RETRY
// ===============================

async function generateWithRetry(prompt) {

  const maxAttempts = 3;

  const delays = [8000, 20000];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {

    try {

      console.log(
        `Gemini: intento ${attempt} de ${maxAttempts}`
      );

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          maxOutputTokens: 1800
        }
      });

      console.log(
        "Gemini: respuesta recibida correctamente."
      );

      return response;

    } catch (error) {

      console.error(
        `Error Gemini en intento ${attempt}:`,
        JSON.stringify(error?.message || error)
      );

      if (!isRetryableError(error)) {

        console.error(
          "Error no recuperable. No se realizará otro intento."
        );

        throw error;
      }

      if (attempt === maxAttempts) {

        console.error(
          "Gemini sigue sin responder después de los intentos permitidos."
        );

        throw error;
      }

      const jitter =
        Math.floor(Math.random() * 3000);

      const waitTime =
        delays[attempt - 1] + jitter;

      console.log(
        `Gemini está temporalmente ocupado. ` +
        `Esperando ${Math.round(waitTime / 1000)} segundos antes de reintentar...`
      );

      await new Promise(resolve =>
        setTimeout(resolve, waitTime)
      );
    }
  }
}

// ===============================
// CORRECCIÓN DEL EMAIL
// ===============================

app.post("/api/correct", async (req, res) => {

  try {

    const { email, task } = req.body;

    // -------------------------------
    // VALIDACIÓN
    // -------------------------------

    if (!email || typeof email !== "string") {

      return res.status(400).json({
        error: "Falta el texto del email."
      });

    }

    if (!task || typeof task !== "object") {

      return res.status(400).json({
        error: "Falta la información de la tarea."
      });

    }

    // -------------------------------
    // INFORMACIÓN DE LA TAREA
    // -------------------------------

    const taskFrom =
      task.from || "";

    const taskSubject =
      task.subject || "";

    const taskBody =
      task.body || "";

    const taskPoints =
      task.points || "";

    // -------------------------------
    // PROMPT
    // -------------------------------

    const prompt = `
You are an experienced Cambridge B1 Preliminary English examiner.

Correct the student's email according to Cambridge B1 Preliminary Writing Part 1 criteria.

IMPORTANT LANGUAGE RULES:

- Write ALL explanations and feedback in Spanish.
- Keep all English examples, corrections and the improved version in English.
- Do not translate the student's English into Spanish.
- Be clear and helpful.
- Do not be excessively strict for a B1 learner.
- Focus on the task requirements, communicative achievement, organisation, grammar and vocabulary.
- Identify important mistakes, but do not invent mistakes that are not present.

TASK:

From: ${taskFrom}

Subject: ${taskSubject}

Task:
${taskBody}

Points:
${taskPoints}

STUDENT EMAIL:

${email}

Return the correction using EXACTLY this structure:

{
  "taskAchievement": [],
  "wordCount": 0,
  "grammar": [],
  "vocabulary": [],
  "organisation": "",
  "generalFeedback": "",
  "improvedVersion": ""
}

REQUIREMENTS:

taskAchievement:
Return an array with one object for each task point.

Each object must have:

{
  "completed": true,
  "label": "",
  "comment": ""
}

Write the label and comment in Spanish.

wordCount:
Give the approximate number of words as a number.

grammar:
Return an array of objects.

Each object must have:

{
  "original": "",
  "correction": "",
  "explanation": ""
}

The original and correction must be in English.
The explanation must be in Spanish.

If there are no important grammatical errors, return an empty array.

vocabulary:
Return an array of objects.

Each object must have:

{
  "original": "",
  "suggestion": "",
  "explanation": ""
}

The original and suggestion must be in English.
The explanation must be in Spanish.

If there are no important vocabulary improvements, return an empty array.

organisation:
Explain in Spanish the use of paragraphs, linking words, coherence and overall organisation.

generalFeedback:
Give concise overall feedback in Spanish suitable for a B1 student.

improvedVersion:
Write a natural improved version of the student's email in English at approximately B1 level.

Keep the original task requirements.
Do not make it unnecessarily advanced.

Return ONLY valid JSON.
Do not use Markdown.
Do not add text before or after the JSON.
`;

    // -------------------------------
    // LLAMADA A GEMINI
    // -------------------------------

    const response =
      await generateWithRetry(prompt);

    const text =
      response?.text;

    if (!text) {

      console.error(
        "Gemini respondió sin texto."
      );

      return res.status(502).json({
        error:
          "Gemini no devolvió una respuesta válida."
      });
    }

    // -------------------------------
    // LIMPIAR POSIBLE MARKDOWN
    // -------------------------------

    let cleanText =
      text.trim();

    if (cleanText.startsWith("```json")) {

      cleanText =
        cleanText
          .replace(/^```json\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
    }

    if (cleanText.startsWith("```")) {

      cleanText =
        cleanText
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
    }

    // -------------------------------
    // PARSEAR JSON
    // -------------------------------

    let correction;

    try {

      correction =
        JSON.parse(cleanText);

    } catch (parseError) {

      console.error(
        "No se pudo interpretar el JSON de Gemini:",
        cleanText
      );

      return res.status(502).json({
        error:
          "Gemini devolvió una respuesta que no tiene el formato esperado."
      });
    }

    // -------------------------------
    // RESPUESTA FINAL
    // -------------------------------

    return res.json(correction);

  } catch (error) {

    console.error(
      "ERROR EN /api/correct:",
      error
    );

    const status =
      error?.status ||
      error?.code ||
      500;

    if (
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    ) {

      return res.status(503).json({
        error:
          "El servicio de corrección está temporalmente ocupado. " +
          "Espera unos segundos y vuelve a intentarlo."
      });
    }

    return res.status(500).json({
      error:
        "Se ha producido un error al corregir el email."
    });
  }
});

// ===============================
// ARRANQUE DEL SERVIDOR
// ===============================

app.listen(PORT, () => {

  console.log(
    `Cambridge B1 API escuchando en el puerto ${PORT}`
  );

  console.log(
    `Modelo Gemini utilizado: ${MODEL}`
  );

});
