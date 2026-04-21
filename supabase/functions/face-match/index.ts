// Face-matching edge function using Lovable AI (Gemini vision).
// Two actions:
//  - "describe": given a photo URL, return a short structured face description
//  - "match":    given a selfie URL + a list of photo descriptions, return matching IDs
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

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

async function callGemini(messages: unknown[], tools?: unknown[], toolChoice?: unknown) {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
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
        [
          {
            role: "system",
            content:
              "You analyse photos. For every visible human face, write a short, distinctive description: gender impression, approximate age range, skin tone, hair (length/color/style), facial hair, glasses, notable accessories, and visible clothing color. If no face, say 'no_face'.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Describe each face in this photo as a JSON array under key 'faces'. Each item: {description: string}. If no face: {faces: []}." },
              { type: "image_url", image_url: { url: body.imageUrl } },
            ],
          },
        ],
        [
          {
            type: "function",
            function: {
              name: "report_faces",
              description: "Report the faces visible in the photo",
              parameters: {
                type: "object",
                properties: {
                  faces: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { description: { type: "string" } },
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
      return new Response(JSON.stringify(args), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "match") {
      // Describe the selfie first
      const selfie = await callGemini(
        [
          {
            role: "system",
            content:
              "Describe the single primary face in this selfie with the same attributes a search needs: gender impression, approximate age, skin tone, hair, facial hair, glasses, accessories.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this person briefly." },
              { type: "image_url", image_url: { url: body.selfieUrl } },
            ],
          },
        ]
      );
      const selfieDesc: string = selfie.choices?.[0]?.message?.content ?? "";

      // Ask Gemini which candidates match
      const match = await callGemini(
        [
          {
            role: "system",
            content:
              "You decide which photos contain the same person. Be inclusive but not reckless: include only candidates whose descriptions plausibly match the target person's distinctive features.",
          },
          {
            role: "user",
            content: `Target person: ${selfieDesc}\n\nCandidate photos (JSON):\n${JSON.stringify(
              body.candidates
            )}\n\nReturn the IDs of matching candidates.`,
          },
        ],
        [
          {
            type: "function",
            function: {
              name: "report_matches",
              description: "Return candidate IDs that match the target person",
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
