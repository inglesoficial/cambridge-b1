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

const MODEL = "gemini-3.1-flash-lite";

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());
app.use(express.json());

// ===============================
// HEALTH CHECK
// ===============================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "cambridge-b1-diagnostic"
  });
});

// ===============================
// LISTAR MODELOS
// ===============================

app.get("/api/models", async (req, res) => {

  try {

    console.log("Consultando modelos disponibles...");

    const models = [];

    const response = await ai.models.list();

    for await (const model of response) {

      const supportedActions =
        model.supportedActions || [];

      models.push({
        name: model.name || null,
        displayName: model.displayName || null,
        baseModelId: model.baseModelId || null,
        supportedActions: supportedActions,
        supportsGenerateContent:
          supportedActions.includes("generateContent"),
        inputTokenLimit:
          model.inputTokenLimit || null,
        outputTokenLimit:
          model.outputTokenLimit || null
      });
    }

    return res.json({
      ok: true,
      totalModels: models.length,
      generateContentModels: models.filter(
        model => model.supportsGenerateContent
      ),
      allModels: models
    });

  } catch (error) {

    console.error(
      "ERROR AL CONSULTAR LOS MODELOS:",
      error
    );

    return res.status(
      error?.status || 500
    ).json({
      ok: false,
      error: String(
        error?.message || error
      ),
      status:
        error?.status ||
        error?.code ||
        null
    });
  }
});

// ===============================
// COMPROBAR MODELO CONCRETO
// ===============================

app.get("/api/check-model/:model", async (req, res) => {

  const modelName = req.params.model;

  try {

    console.log(
      `Comprobando modelo: ${modelName}`
    );

    const modelInfo =
      await ai.models.get({
        model: modelName
      });

    return res.json({
      ok: true,
      model: modelName,
      name: modelInfo.name || null,
      displayName:
        modelInfo.displayName || null,
      baseModelId:
        modelInfo.baseModelId || null,
      supportedActions:
        modelInfo.supportedActions || [],
      supportsGenerateContent:
        (
          modelInfo.supportedActions || []
        ).includes("generateContent"),
      inputTokenLimit:
        modelInfo.inputTokenLimit || null,
      outputTokenLimit:
        modelInfo.outputTokenLimit || null
    });

  } catch (error) {

    console.error(
      `Error comprobando ${modelName}:`,
      error
    );

    return res.status(
      error?.status || 500
    ).json({
      ok: false,
      model: modelName,
      error: String(
        error?.message || error
      ),
      status:
        error?.status ||
        error?.code ||
        null
    });
  }
});

// ===============================
// PRUEBA REAL DE GEMINI
// ===============================

app.get("/api/test-gemini", async (req, res) => {

  console.log("=================================");
  console.log("PRUEBA REAL DE GEMINI");
  console.log(`Modelo: ${MODEL}`);
  console.log("Prompt: Say OK");
  console.log("=================================");

  try {

    const startTime = Date.now();

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: "Say OK"
    });

    const elapsed =
      Date.now() - startTime;

    const text =
      response?.text || "";

    console.log(
      `Gemini respondió correctamente en ${elapsed} ms`
    );

    console.log(
      `Respuesta: ${text}`
    );

    return res.json({
      ok: true,
      model: MODEL,
      response: text,
      elapsedMs: elapsed
    });

  } catch (error) {

    console.error(
      "================================="
    );

    console.error(
      "ERROR EN PRUEBA REAL DE GEMINI"
    );

    console.error(
      error
    );

    console.error(
      "================================="
    );

    return res.status(
      error?.status || 500
    ).json({
      ok: false,
      model: MODEL,
      error: String(
        error?.message || error
      ),
      status:
        error?.status ||
        error?.code ||
        null
    });
  }
});

// ===============================
// CORRECCIÓN DESACTIVADA
// ===============================

app.post("/api/correct", (req, res) => {

  return res.status(503).json({
    error:
      "Servidor en modo diagnóstico. " +
      "La corrección está temporalmente desactivada."
  });
});

// ===============================
// ARRANQUE
// ===============================

app.listen(PORT, () => {

  console.log(
    `Cambridge B1 DIAGNOSTIC API escuchando en el puerto ${PORT}`
  );

  console.log(
    `Modelo de prueba: ${MODEL}`
  );

  console.log(
    "Endpoint de prueba: /api/test-gemini"
  );

});
