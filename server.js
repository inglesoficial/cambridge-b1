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
// DIAGNÓSTICO DE MODELOS
// ===============================

app.get("/api/models", async (req, res) => {

  try {

    console.log("=================================");
    console.log("INICIANDO DIAGNÓSTICO DE MODELOS");
    console.log("=================================");

    const models = [];

    // Consultamos los modelos disponibles
    const response = await ai.models.list();

    for await (const model of response) {

      const supportedActions =
        model.supportedActions || [];

      const supportsGenerateContent =
        supportedActions.includes("generateContent");

      models.push({
        name: model.name || null,
        displayName: model.displayName || null,
        baseModelId: model.baseModelId || null,
        supportedActions: supportedActions,
        supportsGenerateContent: supportsGenerateContent,
        inputTokenLimit:
          model.inputTokenLimit || null,
        outputTokenLimit:
          model.outputTokenLimit || null
      });
    }

    console.log(
      `Modelos encontrados: ${models.length}`
    );

    // Solo mostramos en el log los modelos que pueden generar contenido
    console.log(
      "MODELOS CON generateContent:"
    );

    models
      .filter(model => model.supportsGenerateContent)
      .forEach(model => {
        console.log(
          `${model.name} | ${model.displayName || ""}`
        );
      });

    console.log(
      "================================="
    );

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
      "ERROR AL CONSULTAR LOS MODELOS:"
    );

    console.error(error);

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
// COMPROBAR MODELOS CONCRETOS
// ===============================

app.get("/api/check-model/:model", async (req, res) => {

  const modelName = req.params.model;

  try {

    console.log(
      `Comprobando disponibilidad de: ${modelName}`
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
// BLOQUEAMOS /api/correct
// ===============================
//
// No queremos hacer ninguna llamada
// de generación durante el diagnóstico.
//

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
    "No se realizarán llamadas de generación."
  );

});
