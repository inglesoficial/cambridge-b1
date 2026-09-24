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

  // Errores temporales que sí merece la pena reintentar
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

  // Solo 3 intentos en total:
  // 1º intento
  // espera
  // 2º intento
  // espera
  // 3º intento
  const maxAttempts = 3;

  // Esperas base:
  // 8 segundos
  // 20 segundos
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

      console.log("Gemini: respuesta recibida correctamente.");

      return response;

    } catch (error) {

      console.error(
        `Error Gemini en intento ${attempt}:`,
        JSON.stringify(error?.message || error)
      );

      // Si no es un error temporal, no tiene sentido reintentar
      if (!isRetryableError(error)) {
        console.error(
          "Error no recuperable. No se realizará otro intento."
        );

        throw error;
      }

      // Si ya hemos llegado al último intento, terminar
      if (attempt === maxAttempts) {

        console.error(
          "Gemini sigue sin responder después de los intentos permitidos."
        );

        throw error;
      }

      // Jitter aleatorio de 0-3 segundos
      const jitter = Math.floor(Math.random() * 3000);

      const waitTime = delays[attempt - 1] + jitter;

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

    const taskFrom = task.from || "";
    const taskSubject = task.subject || "";
    const taskBody = task.body || "";
    const taskPoints = task.points || "";

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
  "task_completion": "",
  "word_count": "",
  "grammar": "",
  "vocabulary": "",
  "organisation": "",
  "general_feedback": "",
  "improved_version": ""
}

REQUIREMENTS FOR EACH FIELD:

task_completion:
Explain in Spanish whether the student has covered the points requested in the task.

word_count:
Give the approximate number of words and comment in Spanish on whether it is appropriate for Cambridge B1.

grammar:
Explain the main grammatical strengths and errors in Spanish. Include short English examples where useful.

vocabulary:
Comment in Spanish on the vocabulary used and suggest improvements where appropriate. English examples may be included.

organisation:
Comment in Spanish on paragraphs, linking words, coherence and overall organisation.

general_feedback:
Give concise overall feedback in Spanish suitable for a B1 student.

improved_version:
Write a natural improved version of the student's email in English at approximately B1 level. Keep the original task requirements. Do not make it unnecessarily advanced.

Return ONLY valid JSON.
Do not use Markdown.
Do not add text before or after the JSON.
`;

    // -------------------------------
    // LLAMADA A GEMINI
    // -------------------------------

    const response = await generateWithRetry(prompt);

    const text = response?.text;

    if (!text) {

      console.error(
        "Gemini respondió sin texto."
      );

      return res.status(502).json({
        error: "Gemini no devolvió una respuesta válida."
      });
    }

    // -------------------------------
    // LIMPIAR POSIBLE MARKDOWN
    // -------------------------------

    let cleanText = text.trim();

    if (cleanText.startsWith("```json")) {
      cleanText = cleanText
        .replace(/^```json\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    if (cleanText.startsWith("```")) {
      cleanText = cleanText
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    // -------------------------------
    // PARSEAR JSON
    // -------------------------------

    let correction;

    try {

      correction = JSON.parse(cleanText);

    } catch (parseError) {

      console.error(
        "No se pudo interpretar el JSON de Gemini:",
        cleanText
      );

      return res.status(502).json({
        error: "Gemini devolvió una respuesta que no tiene el formato esperado."
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

    // Error temporal de Gemini
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

    // Error general
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
