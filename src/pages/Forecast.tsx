import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { num } from "@/lib/format";
import { startOfDay, format } from "date-fns";

type Forecast = {
  id: string;
  name: string;
  predictedUnits14d: number;
  avgDailyDemand: number;
  trend: "rising" | "stable" | "falling";
  daysOfStock: number;
  urgency: "urgent" | "soon" | "ok";
  suggestedReorderQty: number;
  reason: string;
};

export default function Forecast() {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const [loading, setLoading] = useState(false);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const payload = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    const dayKeys: string[] = Array.from({ length: 30 }).map((_, i) => {
      const d = new Date(today - (29 - i) * 86400000);
      return format(d, "yyyy-MM-dd");
    });

    // build per-product per-day units
    const perProduct = new Map<string, Map<string, number>>();
    for (const s of sales) {
      const t = new Date(s.createdAt).getTime();
      if (t < today - 29 * 86400000) continue;
      const k = format(new Date(s.createdAt), "yyyy-MM-dd");
      for (const it of s.items) {
        if (!perProduct.has(it.productId)) perProduct.set(it.productId, new Map());
        const m = perProduct.get(it.productId)!;
        m.set(k, (m.get(k) || 0) + it.qty);
      }
    }

    return products
      .map((p) => {
        const m = perProduct.get(p.id);
        const daily = dayKeys.map((k) => m?.get(k) || 0);
        const total = daily.reduce((a, b) => a + b, 0);
        return {
          id: p.id,
          name: p.name,
          generic: p.generic,
          quantity: p.quantity,
          reorderLevel: p.reorderLevel,
          reorderQuantity: p.reorderQuantity,
          daily,
          _total: total,
        };
      })
      .filter((p) => p._total > 0) // only products with consumption history
      .sort((a, b) => b._total - a._total)
      .slice(0, 60)
      .map(({ _total, ...rest }) => rest);
  }, [products, sales]);

  const runForecast = async () => {
    if (payload.length === 0) {
      toast.error("No sales history found in the last 30 days");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("forecast-demand", {
        body: { products: payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setForecasts(data.forecasts || []);
      setGeneratedAt(data.generatedAt);
      toast.success(`Forecast generated for ${data.forecasts?.length || 0} products`);
    } catch (e: any) {
      console.error("Forecast failed:", e);
      toast.error(e?.message || "Forecast failed");
    } finally {
      setLoading(false);
    }
  };

  const urgentCount = forecasts.filter((f) => f.urgency === "urgent").length;
  const soonCount = forecasts.filter((f) => f.urgency === "soon").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <Sparkles className="h-6 w-6 text-primary" /> AI Demand Forecast
          </h1>
          <p className="text-sm text-muted-foreground">
            Predicts the next 14 days of demand from the last 30 days of sales and suggests reorder quantities.
          </p>
        </div>
        <Button onClick={runForecast} disabled={loading} size="lg">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {loading ? "Analyzing..." : "Generate Forecast"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Products with sales history</div>
          <div className="text-2xl font-bold">{num(payload.length)}</div>
        </CardContent></Card>
        <Card className={urgentCount > 0 ? "border-destructive/50 bg-destructive/5" : ""}><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Urgent reorders</div>
          <div className="text-2xl font-bold text-destructive">{urgentCount}</div>
        </CardContent></Card>
        <Card className={soonCount > 0 ? "border-warning/50 bg-warning/5" : ""}><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Reorder soon</div>
          <div className="text-2xl font-bold text-warning">{soonCount}</div>
        </CardContent></Card>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">
            14-Day Forecast & Reorder Suggestions
            {generatedAt && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Generated {format(new Date(generatedAt), "PPp")}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {forecasts.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {loading ? "Analyzing sales patterns..." : "Click \"Generate Forecast\" to predict demand for the next 14 days."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Avg/Day</TableHead>
                    <TableHead className="text-right">Next 14d</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead className="text-right">Days Left</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead className="text-right">Reorder Qty</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecasts
                    .slice()
                    .sort((a, b) => (a.urgency === b.urgency ? b.predictedUnits14d - a.predictedUnits14d : urgencyRank(a.urgency) - urgencyRank(b.urgency)))
                    .map((f) => {
                      const product = products.find((p) => p.id === f.id);
                      return (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{f.name}</TableCell>
                          <TableCell className="text-right">{num(product?.quantity ?? 0)}</TableCell>
                          <TableCell className="text-right">{f.avgDailyDemand.toFixed(1)}</TableCell>
                          <TableCell className="text-right font-semibold">{num(Math.round(f.predictedUnits14d))}</TableCell>
                          <TableCell><TrendBadge trend={f.trend} /></TableCell>
                          <TableCell className="text-right">{Math.round(f.daysOfStock)}d</TableCell>
                          <TableCell><UrgencyBadge urgency={f.urgency} /></TableCell>
                          <TableCell className="text-right font-semibold">
                            {f.suggestedReorderQty > 0 ? num(Math.round(f.suggestedReorderQty)) : "—"}
                          </TableCell>
                          <TableCell className="max-w-[280px] text-xs text-muted-foreground">{f.reason}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Forecasts are AI estimates based on historical sales. Always review against your knowledge of seasonality, promotions, and supplier lead times.
      </p>
    </div>
  );
}

function urgencyRank(u: string) {
  return u === "urgent" ? 0 : u === "soon" ? 1 : 2;
}

function TrendBadge({ trend }: { trend: string }) {
  if (trend === "rising") return <Badge variant="outline" className="border-success bg-success/10 text-success gap-1"><TrendingUp className="h-3 w-3" />Rising</Badge>;
  if (trend === "falling") return <Badge variant="outline" className="border-muted-foreground/40 bg-muted text-muted-foreground gap-1"><TrendingDown className="h-3 w-3" />Falling</Badge>;
  return <Badge variant="outline" className="gap-1"><Minus className="h-3 w-3" />Stable</Badge>;
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  if (urgency === "urgent") return <Badge variant="outline" className="border-destructive bg-destructive/10 text-destructive gap-1"><AlertTriangle className="h-3 w-3" />Urgent</Badge>;
  if (urgency === "soon") return <Badge variant="outline" className="border-warning bg-warning/10 text-warning">Soon</Badge>;
  return <Badge variant="outline" className="border-success bg-success/10 text-success">OK</Badge>;
}
