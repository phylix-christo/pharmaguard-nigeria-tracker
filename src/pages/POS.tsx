import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Minus, Trash2, ShoppingCart, Printer, Zap } from "lucide-react";
import { store, useStore, SaleItem } from "@/lib/store";
import { NGN, expiryStatus } from "@/lib/format";
import { toast } from "sonner";
import { format } from "date-fns";

type CartLine = SaleItem & { stock: number; cost: number };

export default function POS() {
  const products = useStore((s) => s.products);
  const user = useStore((s) => s.user);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<"Cash" | "POS" | "Bank Transfer" | "Mobile Money">("Cash");
  const [customer, setCustomer] = useState("");
  const [tendered, setTendered] = useState(0);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [quickMode, setQuickMode] = useState(false);
  const settings = useStore((s) => s.settings);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products.slice(0, 8);
    return products.filter((p) =>
      p.name.toLowerCase().includes(term) ||
      p.generic.toLowerCase().includes(term) ||
      p.barcode === term ||
      p.nafdac.toLowerCase().includes(term)
    ).slice(0, 12);
  }, [q, products]);

  const add = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    if (p.quantity <= 0) { toast.error("Out of stock"); return; }
    setCart((c) => {
      const ex = c.find((l) => l.productId === id);
      if (ex) {
        if (ex.qty + 1 > p.quantity) { toast.error("Insufficient stock"); return c; }
        return c.map((l) => l.productId === id ? { ...l, qty: l.qty + 1 } : l);
      }
      return [...c, { productId: id, name: p.name, qty: 1, price: p.sellingPrice, stock: p.quantity, cost: p.costPrice }];
    });
    if (quickMode) setQ("");
  };
  const setQty = (id: string, qty: number) => setCart((c) => c.map((l) => l.productId === id ? { ...l, qty: Math.max(1, Math.min(l.stock, qty)) } : l));
  const remove = (id: string) => setCart((c) => c.filter((l) => l.productId !== id));

  const total = cart.reduce((a, l) => a + l.qty * l.price, 0);
  const profit = cart.reduce((a, l) => a + l.qty * (l.price - l.cost), 0);
  const change = payment === "Cash" ? Math.max(0, tendered - total) : 0;

  const checkout = () => {
    if (cart.length === 0) return;
    const sale = store.recordSale({
      items: cart.map(({ productId, name, qty, price, cost }) => ({ productId, name, qty, price, cost })),
      total, profit, payment, cashier: user?.username || "user", customer: customer || undefined,
    });
    setLastReceipt({ ...sale, customer, tendered, change });
    setCart([]); setCustomer(""); setTendered(0);
    toast.success("Sale recorded");
  };

  const printReceipt = () => {
    if (!lastReceipt) { toast.error("No receipt to print"); return; }
    setTimeout(() => window.print(), 100);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Sales Counter</h1>
          <p className="text-sm text-muted-foreground">Fast point-of-sale for the pharmacy counter</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setQuickMode((v) => {
              const next = !v;
              if (next) { setPayment("Cash"); setCustomer(""); setTendered(0); }
              return next;
            });
          }}
          className={quickMode ? "bg-success text-success-foreground hover:bg-success/90" : ""}
          variant={quickMode ? "default" : "outline"}
        >
          <Zap className="mr-2 h-4 w-4" /> Quick Sale {quickMode ? "ON" : "OFF"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search product / scan barcode..."
                  className="h-11 pl-9 text-base"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && results[0]) add(results[0].id); }}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {results.map((p) => {
                  const s = expiryStatus(p.expiry);
                  return (
                    <button key={p.id} onClick={() => add(p.id)} disabled={p.quantity <= 0 || s === "expired"}
                      className="rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-card disabled:opacity-50">
                      <div className="line-clamp-1 text-sm font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">{p.generic}</div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-semibold text-primary">{NGN(p.sellingPrice)}</span>
                        <Badge variant="outline" className={
                          s === "expired" ? "border-destructive text-destructive" :
                          s === "critical" ? "border-destructive text-destructive" :
                          s === "warning" ? "border-warning text-warning" :
                          "border-success text-success"
                        }>{p.quantity}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-2 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-4 w-4" /> Cart ({cart.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-[280px] space-y-2 overflow-auto">
              {cart.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No items yet</div>}
              {cart.map((l) => (
                <div key={l.productId} className="flex items-center gap-2 rounded-md border p-2">
                  <div className="flex-1">
                    <div className="line-clamp-1 text-sm font-medium">{l.name}</div>
                    <div className="text-[11px] text-muted-foreground">{NGN(l.price)} × {l.qty}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.productId, l.qty - 1)}><Minus className="h-3 w-3" /></Button>
                    <Input className="h-7 w-12 text-center" value={l.qty} onChange={(e) => setQty(l.productId, +e.target.value || 1)} />
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.productId, l.qty + 1)}><Plus className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(l.productId)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex justify-between text-sm"><span>Subtotal</span><span>{NGN(total)}</span></div>
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total</span><span className="text-primary">{NGN(total)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <Label className="text-xs">Payment method</Label>
                <Select value={payment} onValueChange={(v: any) => setPayment(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="POS">POS (Card)</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!quickMode && payment === "Cash" && (
                <div>
                  <Label className="text-xs">Cash tendered</Label>
                  <Input type="number" value={tendered} onChange={(e) => setTendered(+e.target.value)} />
                  {tendered > 0 && <div className="mt-1 text-xs text-muted-foreground">Change: <span className="font-semibold text-success">{NGN(change)}</span></div>}
                </div>
              )}
              {!quickMode && (
                <div>
                  <Label className="text-xs">Customer (optional)</Label>
                  <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Walk-in" />
                </div>
              )}
            </div>

            <Button className="w-full" size="lg" onClick={checkout} disabled={cart.length === 0}>
              Complete Sale · {NGN(total)}
            </Button>
            <Button variant="outline" className="w-full" size="sm" onClick={printReceipt} disabled={!lastReceipt}>
              <Printer className="mr-2 h-4 w-4" /> Print receipt
            </Button>
          </CardContent>
        </Card>
      </div>

      {lastReceipt && <Receipt sale={lastReceipt} settings={settings} />}
    </div>
  );
}

function Receipt({ sale, settings }: { sale: any; settings: any }) {
  return (
    <div className="receipt-print hidden print:block">
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        {settings.logo && (
          <div style={{ marginBottom: 4 }}>
            <img src={settings.logo} alt="logo" style={{ height: 50, width: 50, objectFit: "contain", display: "inline-block" }} />
          </div>
        )}
        <div style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase" }}>{settings.name}</div>
        <div style={{ fontSize: 10 }}>{settings.address}</div>
        <div style={{ fontSize: 10 }}>Tel: {settings.phone}</div>
        {settings.email && <div style={{ fontSize: 10 }}>{settings.email}</div>}
        {settings.premiseLicense && <div style={{ fontSize: 10 }}>Lic: {settings.premiseLicense}</div>}
      </div>
      <div style={{ borderTop: "1px dashed #000", borderBottom: "1px dashed #000", padding: "4px 0", fontSize: 11 }}>
        <div>Receipt: {sale.id.slice(0, 8).toUpperCase()}</div>
        <div>Date: {format(new Date(sale.createdAt), "dd MMM yyyy HH:mm")}</div>
        <div>Cashier: {sale.cashier}</div>
        {sale.customer && <div>Customer: {sale.customer}</div>}
      </div>
      <table style={{ width: "100%", fontSize: 11, marginTop: 4 }}>
        <thead><tr><th style={{ textAlign: "left" }}>Item</th><th>Qty</th><th style={{ textAlign: "right" }}>Amt</th></tr></thead>
        <tbody>
          {sale.items.map((it: SaleItem, i: number) => (
            <tr key={i}>
              <td>{it.name}</td>
              <td style={{ textAlign: "center" }}>{it.qty}</td>
              <td style={{ textAlign: "right" }}>{(it.qty * it.price).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ borderTop: "1px dashed #000", marginTop: 4, paddingTop: 4, fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>TOTAL</span><span>NGN {sale.total.toFixed(2)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>Payment</span><span>{sale.payment}</span></div>
        {sale.payment === "Cash" && (<>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tendered</span><span>{Number(sale.tendered).toFixed(2)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Change</span><span>{Number(sale.change).toFixed(2)}</span></div>
        </>)}
      </div>
      <div style={{ textAlign: "center", marginTop: 8, fontSize: 10 }}>
        Thank you for your patronage<br />Goods sold are not returnable
      </div>
    </div>
  );
}
