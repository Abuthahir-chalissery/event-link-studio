// Face-matching edge function using Lovable AI (Gemini vision).
// Two actions:
//  - "describe": given a photo URL, return a structured face description per person
//  - "match":    given a selfie URL + a list of photo descriptions, return matching IDs
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Use the strongest vision model for description; balanced model for matching.
const VISION_MODEL = "google/gemini-2.5-pro";
const MATCH_MODEL = "google/gemini-2.5-flash";

interface DescribeBody {
  action: "describe";
  imageUrl: string;
}
interface MatchBody {
  action: "match";
  selfieUrl: string;
  candidates: { id: string; description: string }[];
}
type Body = DescribeBody | MatchBody;

async function callGemini(model: string, messages: unknown[], tools?: unknown[], toolChoice?: unknown) {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      ...(tools ? { tools, tool_choice: toolChoice } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway ${res.status}: ${text}`);
  }
  return await res.json();
}

const FACE_ATTRIBUTES_PROMPT =
  "For each visible human face (even partially visible, side profile, or in the background), extract these attributes precisely. Be thorough — do NOT skip background people. " +
  "Attributes: gender_impression, age_range (e.g. '20-30'), skin_tone (very_light/light/medium/tan/brown/dark), hair_color, hair_length (bald/short/medium/long), hair_style (straight/wavy/curly/coily/tied/braided), facial_hair (none/stubble/mustache/beard/goatee), glasses (none/clear/sunglasses), distinguishing_features (scars, moles, makeup, tattoos, piercings — short list), accessories (hat/headband/earrings/necklace), clothing_color, clothing_type, pose (front/side/back/three_quarter). " +
  "Also include a short free_text summary that captures what makes this person visually unique.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "AI not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const body = (await req.json()) as Body;

    if (body.action === "describe") {
      const data = await callGemini(
        VISION_MODEL,
        [
          {
            role: "system",
            content:
              "You are a meticulous face cataloguer for a photo gallery. You extract visual attributes for EVERY face you can see, including small/background faces. Never invent details — only report what is visible. If no human face is visible, return an empty list.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: FACE_ATTRIBUTES_PROMPT },
              { type: "image_url", image_url: { url: body.imageUrl } },
            ],
          },
        ],
        [
          {
            type: "function",
            function: {
              name: "report_faces",
              description: "Report every visible face in the photo with structured attributes",
              parameters: {
                type: "object",
                properties: {
                  faces: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        gender_impression: { type: "string" },
                        age_range: { type: "string" },
                        skin_tone: { type: "string" },
                        hair_color: { type: "string" },
                        hair_length: { type: "string" },
                        hair_style: { type: "string" },
                        facial_hair: { type: "string" },
                        glasses: { type: "string" },
                        distinguishing_features: { type: "string" },
                        accessories: { type: "string" },
                        clothing_color: { type: "string" },
                        clothing_type: { type: "string" },
                        pose: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["description"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["faces"],
                additionalProperties: false,
              },
            },
          },
        ],
        { type: "function", function: { name: "report_faces" } }
      );
      const args = JSON.parse(
        data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? '{"faces":[]}'
      );
      // Build a single composite description per face (used for matching)
      const faces = (args.faces ?? []).map((f: Record<string, string>) => ({
        ...f,
        description: [
          f.gender_impression && `${f.gender_impression}`,
          f.age_range && `age ${f.age_range}`,
          f.skin_tone && `${f.skin_tone} skin`,
          f.hair_length && f.hair_color && `${f.hair_length} ${f.hair_color} hair`,
          f.hair_style && `${f.hair_style}`,
          f.facial_hair && f.facial_hair !== "none" && `${f.facial_hair}`,
          f.glasses && f.glasses !== "none" && `${f.glasses}`,
          f.distinguishing_features && `features: ${f.distinguishing_features}`,
          f.accessories && `accessories: ${f.accessories}`,
          f.clothing_color && f.clothing_type && `wearing ${f.clothing_color} ${f.clothing_type}`,
          f.description && `— ${f.description}`,
        ]
          .filter(Boolean)
          .join(", "),
      }));
      return new Response(JSON.stringify({ faces }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "match") {
      // 1. Extract structured attributes from the selfie
      const selfie = await callGemini(
        VISION_MODEL,
        [
          {
            role: "system",
            content:
              "You extract face attributes from a selfie for visual matching. Be precise and only describe what is clearly visible.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: FACE_ATTRIBUTES_PROMPT + " Focus on the primary (largest/closest) face only." },
              { type: "image_url", image_url: { url: body.selfieUrl } },
            ],
          },
        ],
        [
          {
            type: "function",
            function: {
              name: "report_faces",
              description: "Report the primary face in the selfie",
              parameters: {
                type: "object",
                properties: {
                  faces: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        gender_impression: { type: "string" },
                        age_range: { type: "string" },
                        skin_tone: { type: "string" },
                        hair_color: { type: "string" },
                        hair_length: { type: "string" },
                        hair_style: { type: "string" },
                        facial_hair: { type: "string" },
                        glasses: { type: "string" },
                        distinguishing_features: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["description"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["faces"],
                additionalProperties: false,
              },
            },
          },
        ],
        { type: "function", function: { name: "report_faces" } }
      );
      const selfieArgs = JSON.parse(
        selfie.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? '{"faces":[]}'
      );
      const selfieFace = selfieArgs.faces?.[0] ?? {};
      const selfieDesc = [
        selfieFace.gender_impression,
        selfieFace.age_range && `age ${selfieFace.age_range}`,
        selfieFace.skin_tone && `${selfieFace.skin_tone} skin`,
        selfieFace.hair_length && selfieFace.hair_color && `${selfieFace.hair_length} ${selfieFace.hair_color} hair`,
        selfieFace.hair_style,
        selfieFace.facial_hair && selfieFace.facial_hair !== "none" && selfieFace.facial_hair,
        selfieFace.glasses && selfieFace.glasses !== "none" && selfieFace.glasses,
        selfieFace.distinguishing_features && `features: ${selfieFace.distinguishing_features}`,
        selfieFace.description,
      ]
        .filter(Boolean)
        .join(", ") || "person";

      // 2. Ask the model which candidates plausibly contain the same person.
      // Be INCLUSIVE — clothing changes, lighting changes, partial views are all fine.
      // Match on stable attributes: gender, age range, skin tone, hair, facial hair, glasses, distinguishing features.
      const match = await callGemini(
        MATCH_MODEL,
        [
          {
            role: "system",
            content:
              "You match a target person against candidate photo descriptions. " +
              "Each candidate may contain MULTIPLE people — match if ANY described face plausibly matches the target. " +
              "Match on STABLE attributes (gender, approximate age, skin tone, hair color/length/style, facial hair, glasses, distinguishing features). " +
              "IGNORE clothing changes, pose differences, and lighting. " +
              "BE INCLUSIVE: when in doubt, INCLUDE the candidate — clients prefer a few extra photos over missing ones. " +
              "Only EXCLUDE candidates with clearly conflicting stable attributes (e.g. very different age range, different gender impression, drastically different hair, glasses vs no glasses when both clearly visible).",
          },
          {
            role: "user",
            content:
              `Target person attributes: ${selfieDesc}\n\n` +
              `Candidate photos (JSON list, each candidate's "description" can describe MULTIPLE faces separated by " || "):\n${JSON.stringify(body.candidates)}\n\n` +
              `Return the IDs of every candidate that could plausibly contain the target person.`,
          },
        ],
        [
          {
            type: "function",
            function: {
              name: "report_matches",
              description: "Return candidate IDs that plausibly match the target person",
              parameters: {
                type: "object",
                properties: {
                  matches: { type: "array", items: { type: "string" } },
                },
                required: ["matches"],
                additionalProperties: false,
              },
            },
          },
        ],
        { type: "function", function: { name: "report_matches" } }
      );
      const args = JSON.parse(
        match.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? '{"matches":[]}'
      );
      return new Response(JSON.stringify({ matches: args.matches, selfieDesc }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("face-match error", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
