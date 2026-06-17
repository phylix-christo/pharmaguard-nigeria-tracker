// AI demand forecast for pharmacy inventory
// Uses Lovable AI Gateway (no API key from user required)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProductInput = {
  id: string;
  name: string;
  generic?: string;
  quantity: number;
  reorderLevel: number;
  reorderQuantity: number;
  daily: number[]; // last 30 days, oldest -> newest
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { products } = (await req.json()) as { products: ProductInput[] };
    if (!Array.isArray(products) || products.length === 0) {
      return new Response(JSON.stringify({ error: "No products provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap to keep tokens reasonable
    const trimmed = products.slice(0, 80).map((p) => ({
      id: p.id,
      name: p.name,
      generic: p.generic || "",
      stock: p.quantity,
      reorderLevel: p.reorderLevel,
      reorderQuantity: p.reorderQuantity,
      daily: (p.daily || []).slice(-30),
    }));

    const systemPrompt = `You are a pharmacy inventory forecasting assistant for a Nigerian retail pharmacy.
For each product you receive, analyze the last 30 days of daily consumption units and:
1. Predict total expected demand over the NEXT 14 days (integer units).
2. Estimate days of stock remaining at the predicted rate.
3. Recommend whether to reorder ("urgent", "soon", or "ok") and a suggested reorder quantity (integer).
4. Provide a brief one-line reason.

Consider trend (rising/falling), volatility, and current stock vs reorder level.
Return STRICT JSON only, no prose, no markdown fences.`;

    const userPayload = {
      generated_at: new Date().toISOString(),
      products: trimmed,
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_forecast",
              description: "Submit the 14-day demand forecast for all products",
              parameters: {
                type: "object",
                properties: {
                  forecasts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        predictedUnits14d: { type: "number" },
                        avgDailyDemand: { type: "number" },
                        trend: { type: "string", enum: ["rising", "stable", "falling"] },
                        daysOfStock: { type: "number" },
                        urgency: { type: "string", enum: ["urgent", "soon", "ok"] },
                        suggestedReorderQty: { type: "number" },
                        reason: { type: "string" },
                      },
                      required: ["id", "name", "predictedUnits14d", "avgDailyDemand", "trend", "daysOfStock", "urgency", "suggestedReorderQty", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["forecasts"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_forecast" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in your workspace billing." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `AI gateway error: ${errText}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    let parsed: any = null;
    try {
      parsed = typeof args === "string" ? JSON.parse(args) : args;
    } catch (_) {
      parsed = null;
    }

    if (!parsed?.forecasts) {
      return new Response(JSON.stringify({ error: "AI returned no forecast", raw: data }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ forecasts: parsed.forecasts, generatedAt: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
