import { z } from "zod";
import { env } from "../config/env.js";

export type DecisionInsight = { title: string; description: string; recommendation: string; urgency: "HIGH" | "MEDIUM" | "LOW" };

const responseSchema = z.object({
  insights: z.array(z.object({
    title: z.string().min(1).max(100),
    description: z.string().min(1).max(400),
    recommendation: z.string().min(1).max(300),
    urgency: z.enum(["HIGH", "MEDIUM", "LOW"]),
  })).min(1).max(4),
});

export async function generateGeminiInsights(findings: unknown): Promise<DecisionInsight[] | null> {
  if (!env.GEMINI_API_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `You are a decision-support analyst for a multi-branch cafe. Explain only patterns supported by the supplied aggregate findings. Forecast values and MAE are official backend-generated results: do not recalculate, replace, or alter them. Do not invent values, claim certainty, determine whether the model passed, or issue automatic purchasing instructions. Return concise management insights and explicitly frame forecasts as estimates.\n\nFindings: ${JSON.stringify(findings)}` }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              insights: { type: "ARRAY", minItems: 1, maxItems: 4, items: { type: "OBJECT", properties: {
                title: { type: "STRING" }, description: { type: "STRING" }, recommendation: { type: "STRING" }, urgency: { type: "STRING", enum: ["HIGH", "MEDIUM", "LOW"] },
              }, required: ["title", "description", "recommendation", "urgency"] } },
            }, required: ["insights"],
          },
        },
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = responseSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.insights : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
