import { GoogleGenAI, Type } from "@google/genai";
import type { DoserInput } from './doserService';
import type { Language, Phase, StageAnalysisResult, NutrientProfile, JournalEntry } from '../types';
import { I18N } from '../constants';

export interface AnalysisIssue {
    issue: string;
    confidence: 'High' | 'Medium' | 'Low';
    explanation: string;
}

export interface AnalysisResult {
    potentialIssues: AnalysisIssue[];
    recommendedActions: string[];
    disclaimer: string;
}

// Function to convert a file to a base64 string
const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

// Define the expected JSON response structure for the AI model
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    potentialIssues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          issue: { type: Type.STRING, description: "Name of the potential issue, e.g., 'Magnesium Deficiency'." },
          confidence: { type: Type.STRING, description: "Confidence level: High, Medium, or Low." },
          explanation: { type: Type.STRING, description: "Reasoning based on visual cues from the image." }
        },
        required: ["issue", "confidence", "explanation"]
      }
    },
    recommendedActions: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING
      },
      description: "Specific, actionable advice related to the app's input controls."
    },
    disclaimer: {
        type: Type.STRING,
        description: "A standard disclaimer about the AI's limitations."
    }
  },
  required: ["potentialIssues", "recommendedActions", "disclaimer"]
};

const getPrompt = (fullPhaseName: string, substrate: string, userNotes: string, lang: Language, trendContext: string, phDriftContext: string, observationContext: string, ppmContext: string, historicalContext: string): string => {
  const en_prompt = `
    You are a world-class expert cannabis cultivation diagnostician. Your knowledge of pests, diseases, nutrient deficiencies, and environmental stressors is unparalleled.
    Your task is to analyze the provided images and context to deliver a precise, actionable diagnosis. The final response MUST be in English and formatted as a valid JSON object matching the schema.

    **Critical Instructions:**
    1.  **Holistic Analysis:** Synthesize information from ALL provided images and the user's notes. The user's notes are vital; if they describe something not visible (like symptom progression, texture, or location), you MUST prioritize that information in your diagnosis.
    2.  **JSON Only:** Your entire response must be a single JSON object. Do not include any text, markdown, or commentary before or after the JSON.

    **Context for Analysis:**
    - Growth Phase: ${fullPhaseName}
    - Substrate: ${substrate}
    - Current Nutrient Levels (PPM): ${ppmContext}
    - EC Trend (24h): ${trendContext}
    - pH Drift (24h): ${phDriftContext}
    - User's Pre-selected Observations: ${observationContext} (These are toggles the user has already activated in the UI).
    - User Notes: "${userNotes || 'No notes provided.'}"
    - Historical Context: "${historicalContext}"

    **Diagnostic Procedure:**
    1.  **Identify Primary Issues:** Identify up to two of the most likely health issues. Be extremely specific.
        * **Nutrient Issues:** Go beyond simple names. Specify deficiency or toxicity (e.g., 'Calcium Deficiency', 'Nitrogen Toxicity').
        * **Pests:** Look for direct or indirect evidence of common cannabis pests. Check for Spider Mites (fine webbing, leaf stippling), Thrips (silvery patches, tiny black specks), Aphids (clusters of small insects, sticky honeydew), or Fungus Gnats (small flies near soil).
        * **Diseases:** Look for signs of Powdery Mildew (white, flour-like spots), Bud Rot/Botrytis (grey, fuzzy mold inside buds), or Leaf Septoria (distinct circular spots with yellow borders).
        * **Environmental Stress:** Consider light burn (bleaching at the top), heat stress (leaf edges curling up), or watering issues.

    2.  **Provide Confidence Level:** For each issue, assign a confidence level: 'High', 'Medium', or 'Low'.

    3.  **Deliver Expert Explanation:** For each diagnosis, provide a detailed, evidence-based explanation. Quote specific visual cues from the images or the user's notes. Explain *why* these signs are indicative of the problem. For example: "The user notes mention 'crispy' leaf tips and the images show dark green, clawing leaves, which strongly suggests Nitrogen Toxicity (High Confidence)."

    4.  **Recommend Actionable Solutions Tied to the App:** This is the most critical step. Your recommendations MUST prioritize actions the user can take *directly within the calculator app*.
        * **Primary Action:** Directly reference the app's controls using their exact UI labels: \`${I18N.en.trend}\`, \`${I18N.en.tipburn}\`, \`${I18N.en.claw}\`, \`${I18N.en.camg_need}\`, \`${I18N.en.very_pale}\`, \`${I18N.en.ph_drift}\`.
        * **Example:** If you diagnose tipburn, your first and foremost recommendation must be a direct instruction like: "Activate the \`${I18N.en.tipburn}\` setting. This will automatically adjust the nutrient ratios to mitigate the issue."
        * **Secondary Advice:** After providing the app-specific action, you can then offer supplementary advice, such as target PPM ranges for specific nutrients (e.g., "Aim for a Potassium level around 200-220 ppm.") or IPM strategies for pests/diseases (e.g., "Introduce predatory mites or apply a neem oil solution.").
  `;

  const de_prompt = `
    Sie sind ein erstklassiger Experte für die Diagnose im Cannabisanbau. Ihr Wissen über Schädlinge, Krankheiten, Nährstoffmängel und Umweltstressoren ist unübertroffen.
    Ihre Aufgabe ist es, die bereitgestellten Bilder und den Kontext zu analysieren, um eine präzise, umsetzbare Diagnose zu liefern. Die endgültige Antwort MUSS auf Deutsch und als gültiges JSON-Objekt, das dem Schema entspricht, formatiert sein.

    **Wichtige Anweisungen:**
    1.  **Ganzheitliche Analyse:** Synthetisieren Sie Informationen aus ALLEN bereitgestellten Bildern und den Notizen des Benutzers. Die Notizen des Benutzers sind entscheidend; wenn sie etwas beschreiben, das nicht sichtbar ist (wie Symptomverlauf, Textur oder Ort), MÜSSEN Sie diese Informationen bei Ihrer Diagnose priorisieren.
    2.  **Nur JSON:** Ihre gesamte Antwort muss ein einziges JSON-Objekt sein. Fügen Sie keinen Text, Markdown oder Kommentare vor oder nach dem JSON ein.

    **Kontext für die Analyse:**
    - Wachstumsphase: ${fullPhaseName}
    - Substrat: ${substrate}
    - Aktuelle Nährstoffwerte (PPM): ${ppmContext}
    - EC-Trend (24h): ${trendContext}
    - pH-Drift (24h): ${phDriftContext}
    - Vorausgewählte Beobachtungen des Benutzers: ${observationContext} (Dies sind Schalter, die der Benutzer bereits in der Benutzeroberfläche aktiviert hat).
    - Benutzerhinweise: "${userNotes || 'Keine Hinweise gegeben.'}"
    - Historischer Kontext: "${historicalContext}"

    **Diagnoseverfahren:**
    1.  **Primäre Probleme identifizieren:** Identifizieren Sie bis zu zwei der wahrscheinlichsten Gesundheitsprobleme. Seien Sie extrem spezifisch.
        * **Nährstoffprobleme:** Gehen Sie über einfache Namen hinaus. Spezifizieren Sie Mangel oder Überschuss (z.B. 'Kalziummangel', 'Stickstofftoxizität').
        * **Schädlinge:** Suchen Sie nach direkten oder indirekten Beweisen für häufige Cannabis-Schädlinge. Prüfen Sie auf Spinnmilben (feine Gespinste, Blattsprenkelung), Thripse (silbrige Flecken, winzige schwarze Punkte), Blattläuse (Ansammlungen kleiner Insekten, klebriger Honigtau) oder Trauermücken (kleine Fliegen in Bodennähe).
        * **Krankheiten:** Suchen Sie nach Anzeichen von Echtem Mehltau (weiße, mehlartige Flecken), Knospenfäule/Botrytis (grauer, flauschiger Schimmel in den Knospen) oder Blattseptoria (scharf abgegrenzte runde Flecken mit gelbem Rand).
        * **Umweltstress:** Berücksichtigen Sie Lichtverbrennung (Ausbleichen an der Spitze), Hitzestress (Blattränder kräuseln sich nach oben) oder Bewässerungsprobleme.

    2.  **Konfidenzniveau angeben:** Weisen Sie jedem Problem ein Konfidenzniveau zu: 'High' (Hoch), 'Medium' (Mittel) oder 'Low' (Niedrig).

    3.  **Experten-Erklärung liefern:** Geben Sie für jede Diagnose eine detaillierte, evidenzbasierte Erklärung. Zitieren Sie spezifische visuelle Hinweise aus den Bildern oder den Notizen des Benutzers. Erklären Sie, *warum* diese Anzeichen auf das Problem hindeuten. Zum Beispiel: "Die Benutzernotizen erwähnen 'knusprige' Blattspitzen und die Bilder zeigen dunkelgrüne, krallenförmige Blätter, was stark auf eine Stickstofftoxizität (Hohe Konfidenz) hindeutet."

    4.  **Umsetzbare, auf die App bezogene Lösungen empfehlen:** Dies ist der wichtigste Schritt. Ihre Empfehlungen MÜSSEN Aktionen priorisieren, die der Benutzer *direkt in der Rechner-App* durchführen kann.
        * **Primäre Aktion:** Beziehen Sie sich direkt auf die Steuerelemente der App und verwenden Sie deren exakte UI-Bezeichnungen: \`${I18N.de.trend}\`, \`${I18N.de.tipburn}\`, \`${I18N.de.claw}\`, \`${I18N.de.camg_need}\`, \`${I18N.de.very_pale}\`, \`${I18N.de.ph_drift}\`.
        * **Beispiel:** Wenn Sie Spitzenbrand diagnostizieren, muss Ihre allererste Empfehlung eine direkte Anweisung sein wie: "Aktivieren Sie die Einstellung \`${I18N.de.tipburn}\`. Dadurch werden die Nährstoffverhältnisse automatisch angepasst, um das Problem zu beheben."
        * **Sekundäre Ratschläge:** Nachdem Sie die App-spezifische Aktion angegeben haben, können Sie ergänzende Ratschläge geben, wie z.B. Ziel-PPM-Bereiche für bestimmte Nährstoffe (z.B. "Streben Sie einen Kaliumgehalt von etwa 200-220 ppm an.") oder IPM-Strategien für Schädlinge/Krankheiten (z.B. "Führen Sie Raubmilben ein oder wenden Sie eine Neemöl-Lösung an.").
  `;

  return lang === 'de' ? de_prompt : en_prompt;
};


/**
 * Analyzes plant images using the Gemini API.
 * @param imageFiles - An array of image files to analyze.
 * @param inputs - The current settings from the doser calculator.
 * @param fullPhaseName - The full, descriptive name of the current growth phase.
 * @param userNotes - Any additional notes from the user.
 * @returns A structured analysis of the plant's health.
 */
export const analyzePlantImage = async (
  imageFiles: File[],
  inputs: DoserInput,
  fullPhaseName: string,
  userNotes: string | undefined,
  lang: Language,
  ppm?: Required<NutrientProfile>,
  journalHistory?: JournalEntry[]
): Promise<AnalysisResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const t = (key: string, fallback?: string): string => (I18N[lang] as Record<string, any>)[key] || fallback || key;
  const trendContext = t(inputs.trend);
  const phDriftContext = t(inputs.phDrift === 'normal' ? 'normal' : inputs.phDrift === 'high' ? 'too_high' : 'too_low');
  
  const observationContext = {
      [t('tipburn')]: inputs.tipburn,
      [t('very_pale')]: inputs.pale,
      [t('camg_need')]: inputs.caMgDeficiency,
      [t('claw')]: inputs.claw,
  };
  const observationContextString = Object.entries(observationContext)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  const ppmContextString = ppm 
    ? Object.entries(ppm)
        .map(([key, value]) => `${key}: ${value.toFixed(1)}`)
        .join(', ')
    : 'Not available.';

  const historicalContext = journalHistory && journalHistory.length > 0
    ? "Recent journal entries:\n" + journalHistory.slice(0, 3).map(entry => 
        `- ${entry.date}: ${entry.entryType} - ${entry.notes}`
      ).join("\n")
    : "No recent journal entries.";

  const imageParts = await Promise.all(imageFiles.map(file => fileToGenerativePart(file)));
  const sanitizedNotes = typeof userNotes === 'string' ? userNotes.trim() : '';
  const prompt = getPrompt(fullPhaseName, inputs.substrate, sanitizedNotes, lang, trendContext, phDriftContext, observationContextString, ppmContextString, historicalContext);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [...imageParts, { text: prompt }] },
    config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
    }
  });

  try {
    const jsonText = response.text.trim();
    return JSON.parse(jsonText) as AnalysisResult;
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    throw new Error("The AI returned an invalid response. Please try again.");
  }
};

const stageResponseSchema = {
  type: Type.OBJECT,
  properties: {
    stage: { type: Type.STRING, description: "The physiological stage: Vegetative, Flowering, or Ripening." },
    confidence: { type: Type.STRING, description: "Confidence level: High, Medium, or Low." },
    reasoning: { type: Type.STRING, description: "Brief reasoning based on the provided phase and day count." },
  },
  required: ["stage", "confidence", "reasoning"],
};

const getStagePrompt = (phase: string, daysSinceStart: number, lang: Language): string => {
  const t = (key: string, fallback?: string): string => (I18N[lang] as Record<string, any>)[key] || fallback || key;
  const promptLang = lang === 'de' ? 'German' : 'English';

  return `
    As a cannabis cultivation expert, analyze the growth stage.
    Current plan phase: "${phase}"
    Days since grow started: ${daysSinceStart}

    Based on this data for a typical photoperiod cannabis plant, determine its primary physiological stage. The possible stages are "Vegetative", "Flowering", or "Ripening".
    
    For context:
    - "Vegetative" refers to the initial growth period focused on developing leaves and stems.
    - "Flowering" refers to the main period of bud development.
    - "Ripening" refers to the final weeks of flowering where buds mature and swell.

    Provide your answer in ${promptLang} as a single, valid JSON object matching the required schema. Do not include any text before or after the JSON.
    Example: Week 1 of flower ("W1") is still early Flowering, not Ripening. Late Veg is still Vegetative. Week 9 ("W9") is Ripening.
  `;
};

export const analyzeGrowthStage = async (
  phase: Phase,
  daysSinceStart: number,
  lang: Language
): Promise<StageAnalysisResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const fullPhaseName = I18N[lang].phases[phase] || phase;
  const prompt = getStagePrompt(fullPhaseName, daysSinceStart, lang);
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: stageResponseSchema,
    }
  });

  try {
    const jsonText = response.text.trim();
    return JSON.parse(jsonText) as StageAnalysisResult;
  } catch (e) {
    console.error("Failed to parse stage analysis response:", e);
    throw new Error("The AI returned an invalid response for stage analysis.");
  }
};