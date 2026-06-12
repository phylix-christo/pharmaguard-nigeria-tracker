import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, Minus, Trash2, ShoppingCart, Printer, Zap, ShieldAlert } from "lucide-react";
import { store, useStore, SaleItem } from "@/lib/store";
import { NGN, expiryStatus } from "@/lib/format";
import { toast } from "sonner";
import { format } from "date-fns";

type CartLine = SaleItem & { stock: number; cost: number };

export default function POS() {
  const products = useStore((s) => s.products);
  const user = useStore((s) => s.user);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "controlled" | "low">("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<"Cash" | "POS" | "Bank Transfer" | "Mobile Money">("Cash");
  const [customer, setCustomer] = useState("");
  const [tendered, setTendered] = useState(0);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [quickMode, setQuickMode] = useState(false);
  const [controlledOpen, setControlledOpen] = useState(false);
  const settings = useStore((s) => s.settings);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = products;
    if (filter === "controlled") list = list.filter((p) => p.controlled);
    else if (filter === "low") list = list.filter((p) => p.quantity <= p.reorderLevel);
    if (term) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(term) ||
        p.generic.toLowerCase().includes(term) ||
        p.barcode === term ||
        p.nafdac.toLowerCase().includes(term)
      );
    }
    return list;
  }, [q, products, filter]);

  const counts = useMemo(() => ({
    all: products.length,
    controlled: products.filter((p) => p.controlled).length,
    low: products.filter((p) => p.quantity <= p.reorderLevel).length,
  }), [products]);

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

  const controlledInCart = cart.filter((l) => products.find((p) => p.id === l.productId)?.controlled);

  const finalizeSale = (controlledForms?: Record<string, { patientName: string; patientPhone: string; prescriber: string; prescriberRegNo: string; prescriptionRef: string }>) => {
    const sale = store.recordSale({
      items: cart.map(({ productId, name, qty, price, cost }) => ({ productId, name, qty, price, cost })),
      total, profit, payment, cashier: user?.username || "user", customer: customer || undefined,
    });
    if (controlledForms) {
      for (const l of controlledInCart) {
        const f = controlledForms[l.productId];
        if (!f) continue;
        const p = products.find((x) => x.id === l.productId);
        store.recordControlledDispense({
          productId: l.productId, productName: l.name, batch: p?.batch || "",
          quantity: l.qty, amount: l.qty * l.price,
          patientName: f.patientName, patientPhone: f.patientPhone,
          prescriber: f.prescriber, prescriberRegNo: f.prescriberRegNo,
          prescriptionRef: f.prescriptionRef,
        });
      }
    }
    setLastReceipt({ ...sale, customer, tendered, change });
    setCart([]); setCustomer(""); setTendered(0); setControlledOpen(false);
    toast.success("Sale recorded");
  };

  const checkout = () => {
    if (cart.length === 0) return;
    if (controlledInCart.length > 0) { setControlledOpen(true); return; }
    finalizeSale();
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
            <CardHeader className="pb-3 space-y-3">
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
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
                  All <Badge variant="secondary" className="ml-2">{counts.all}</Badge>
                </Button>
                <Button size="sm" variant={filter === "controlled" ? "default" : "outline"} onClick={() => setFilter("controlled")}
                  className={filter === "controlled" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}>
                  <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Controlled <Badge variant="secondary" className="ml-2">{counts.controlled}</Badge>
                </Button>
                <Button size="sm" variant={filter === "low" ? "default" : "outline"} onClick={() => setFilter("low")}
                  className={filter === "low" ? "bg-warning hover:bg-warning/90 text-warning-foreground" : ""}>
                  Low stock <Badge variant="secondary" className="ml-2">{counts.low}</Badge>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[60vh] overflow-auto pr-1">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {results.length === 0 && <div className="col-span-full py-8 text-center text-sm text-muted-foreground">No products match</div>}
                  {results.map((p) => {
                    const s = expiryStatus(p.expiry);
                    return (
                      <button key={p.id} onClick={() => add(p.id)} disabled={p.quantity <= 0 || s === "expired"}
                        className={`rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-card disabled:opacity-50 ${p.controlled ? "border-l-4 border-l-destructive" : ""}`}>
                        <div className="line-clamp-1 text-sm font-medium">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground line-clamp-1">{p.generic}</div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-sm font-semibold text-primary">{NGN(p.sellingPrice)}</span>
                          <Badge variant="outline" className={
                            s === "expired" || s === "critical" ? "border-destructive text-destructive" :
                            s === "warning" ? "border-warning text-warning" :
                            "border-success text-success"
                          }>{p.quantity}</Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
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

      <ControlledDispenseDialog
        open={controlledOpen}
        onOpenChange={setControlledOpen}
        items={controlledInCart}
        onConfirm={finalizeSale}
      />
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

function ControlledDispenseDialog({
  open, onOpenChange, items, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: CartLine[];
  onConfirm: (forms: Record<string, { patientName: string; patientPhone: string; prescriber: string; prescriberRegNo: string; prescriptionRef: string }>) => void;
}) {
  const [forms, setForms] = useState<Record<string, any>>({});
  const update = (id: string, field: string, value: string) =>
    setForms((f) => ({ ...f, [id]: { ...(f[id] || {}), [field]: value } }));

  const submit = () => {
    for (const it of items) {
      const f = forms[it.productId] || {};
      if (!f.patientName?.trim() || !f.prescriber?.trim() || !f.prescriptionRef?.trim()) {
        toast.error(`Fill required fields for ${it.name}`);
        return;
      }
    }
    const clean: any = {};
    for (const it of items) {
      const f = forms[it.productId] || {};
      clean[it.productId] = {
        patientName: (f.patientName || "").trim(),
        patientPhone: (f.patientPhone || "").trim(),
        prescriber: (f.prescriber || "").trim(),
        prescriberRegNo: (f.prescriberRegNo || "").trim(),
        prescriptionRef: (f.prescriptionRef || "").trim(),
      };
    }
    onConfirm(clean);
    setForms({});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" /> Controlled Drug Dispensing Form
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Statutory record required (PCN / NDLEA). Complete one form per controlled item. Entry will be saved to the Poisons Register.
        </p>
        <div className="space-y-4">
          {items.map((it) => (
            <div key={it.productId} className="rounded-md border border-destructive/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{it.name}</div>
                <Badge variant="outline" className="border-destructive text-destructive">Qty {it.qty}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div>
                  <Label className="text-xs">Patient name *</Label>
                  <Input value={forms[it.productId]?.patientName || ""} onChange={(e) => update(it.productId, "patientName", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Patient phone</Label>
                  <Input value={forms[it.productId]?.patientPhone || ""} onChange={(e) => update(it.productId, "patientPhone", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Prescriber (Doctor) *</Label>
                  <Input value={forms[it.productId]?.prescriber || ""} onChange={(e) => update(it.productId, "prescriber", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">MDCN / Reg No</Label>
                  <Input value={forms[it.productId]?.prescriberRegNo || ""} onChange={(e) => update(it.productId, "prescriberRegNo", e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Prescription Ref *</Label>
                  <Input value={forms[it.productId]?.prescriptionRef || ""} onChange={(e) => update(it.productId, "prescriptionRef", e.target.value)} placeholder="e.g. RX-2026-00123" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            Save & complete sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
