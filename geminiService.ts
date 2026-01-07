
import { GoogleGenAI } from "@google/genai";
import { Evaluation, Employee } from "./types.ts";

console.log("--> [geminiService.ts] Módulo cargado");

// Always use the process.env.API_KEY directly as a required parameter
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeEvaluations = async (evaluations: Evaluation[], employee: Employee) => {
  console.log("--> [geminiService.ts] Analizando evaluaciones para:", employee.name);
  const relevantEvals = evaluations.filter(e => e.evaluatedId === employee.id);
  
  if (relevantEvals.length === 0) return "No hay suficientes datos para un análisis.";

  const prompt = `
    Analiza los resultados de evaluación para el empleado ${employee.name} (${employee.role}).
    Recibió ${relevantEvals.length} evaluaciones.
    Los datos están en formato JSON: ${JSON.stringify(relevantEvals)}.
    
    Por favor, proporciona un resumen ejecutivo en español que incluya:
    1. Fortalezas principales (basadas en los puntajes más altos).
    2. Áreas de mejora (basadas en los puntajes más bajos).
    3. Una recomendación general para su desarrollo este año.
    
    Sé profesional, constructivo y directo.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error analyzing evaluations:", error);
    return "No se pudo generar el análisis de IA en este momento.";
  }
};
