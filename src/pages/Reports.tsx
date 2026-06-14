import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { NGN, expiryStatus, daysUntil } from "@/lib/format";
import { format, startOfDay } from "date-fns";
import { FileDown, FileText, ShieldCheck } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export default function Reports() {
  const sales = useStore((s) => s.sales);
  const products = useStore((s) => s.products);
  const settings = useStore((s) => s.settings);
  const dispenses = useStore((s) => s.controlledDispense);
  const audit = useStore((s) => s.audit);
  const [from, setFrom] = useState(format(new Date(Date.now() - 6 * 86400000), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const inRange = useMemo(() => {
    const f = startOfDay(new Date(from)).getTime();
    const t = startOfDay(new Date(to)).getTime() + 86400000;
    return sales.filter((s) => { const x = new Date(s.createdAt).getTime(); return x >= f && x < t; });
  }, [sales, from, to]);

  const totals = inRange.reduce((a, s) => ({ rev: a.rev + s.total, profit: a.profit + s.profit, count: a.count + 1 }), { rev: 0, profit: 0, count: 0 });

  const expiryRows = products.map((p) => ({ ...p, status: expiryStatus(p.expiry), days: daysUntil(p.expiry) }))
    .sort((a, b) => a.days - b.days);

  const stockCostValue = products.reduce((a, p) => a + p.quantity * p.costPrice, 0);
  const stockSellValue = products.reduce((a, p) => a + p.quantity * p.sellingPrice, 0);

  // Profit by product within range
  const profitMap = new Map<string, { name: string; units: number; revenue: number; profit: number }>();
  for (const s of inRange) {
    for (const it of s.items) {
      const cur = profitMap.get(it.productId) || { name: it.name, units: 0, revenue: 0, profit: 0 };
      const cost = it.cost ?? products.find((p) => p.id === it.productId)?.costPrice ?? 0;
      cur.units += it.qty; cur.revenue += it.qty * it.price; cur.profit += it.qty * (it.price - cost);
      profitMap.set(it.productId, cur);
    }
  }
  const profitRows = [...profitMap.values()].sort((a, b) => b.profit - a.profit);

  // Stock Movement: units sold per product within range
  const movementMap = new Map<string, { name: string; sold: number; revenue: number }>();
  for (const s of inRange) {
    for (const it of s.items) {
      const cur = movementMap.get(it.productId) || { name: it.name, sold: 0, revenue: 0 };
      cur.sold += it.qty; cur.revenue += it.qty * it.price;
      movementMap.set(it.productId, cur);
    }
  }
  const movementRows = products.map((p) => {
    const m = movementMap.get(p.id);
    return { id: p.id, name: p.name, batch: p.batch, opening: p.quantity + (m?.sold || 0), sold: m?.sold || 0, closing: p.quantity, revenue: m?.revenue || 0 };
  }).sort((a, b) => b.sold - a.sold);

  const inspectionReadyPdf = () => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(settings.name, pageW / 2, 16, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(settings.address, pageW / 2, 22, { align: "center" });
    doc.text(`Tel: ${settings.phone}  ·  PCN License: ${settings.premiseLicense || "—"}`, pageW / 2, 27, { align: "center" });
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("INSPECTION-READY COMPLIANCE REPORT", pageW / 2, 36, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Period: ${from} to ${to}  ·  Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, pageW / 2, 41, { align: "center" });

    let y = 48;
    const section = (title: string) => {
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text(title, 14, y); y += 3;
    };

    section("1. Sales Summary");
    autoTable(doc, {
      startY: y, styles: { fontSize: 8 }, headStyles: { fillColor: [22, 160, 110] },
      head: [["Metric", "Value"]],
      body: [["Transactions", String(totals.count)], ["Revenue", NGN(totals.rev)], ["Profit", NGN(totals.profit)]],
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    section("2. Stock On Hand");
    autoTable(doc, {
      startY: y, styles: { fontSize: 7 }, headStyles: { fillColor: [22, 160, 110] },
      head: [["Drug", "NAFDAC", "Batch", "Expiry", "Qty", "Value (cost)"]],
      body: products.map((p) => [p.name, p.nafdac, p.batch, p.expiry, p.quantity, NGN(p.quantity * p.costPrice)]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    if (y > 240) { doc.addPage(); y = 20; }
    section("3. Expiry Watch (sorted by days left)");
    autoTable(doc, {
      startY: y, styles: { fontSize: 7 }, headStyles: { fillColor: [200, 60, 60] },
      head: [["Drug", "Batch", "Expiry", "Days", "Status", "Qty"]],
      body: expiryRows.slice(0, 50).map((p) => [p.name, p.batch, p.expiry, String(p.days), p.status, String(p.quantity)]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    if (y > 220) { doc.addPage(); y = 20; }
    section("4. Controlled Substances Register");
    autoTable(doc, {
      startY: y, styles: { fontSize: 7 }, headStyles: { fillColor: [180, 50, 50] },
      head: [["Date", "Drug", "Batch", "Qty", "Patient", "Prescriber", "Rx Ref"]],
      body: dispenses.map((d) => [
        format(new Date(d.at), "dd-MM-yyyy"), d.productName, d.batch, String(d.quantity),
        d.patientName, `${d.prescriber}${d.prescriberRegNo ? " / "+d.prescriberRegNo : ""}`, d.prescriptionRef,
      ]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    if (y > 240) { doc.addPage(); y = 20; }
    section("5. Audit Trail (recent 50 entries)");
    autoTable(doc, {
      startY: y, styles: { fontSize: 7 }, headStyles: { fillColor: [22, 100, 160] },
      head: [["When", "User", "Action", "Target", "Detail"]],
      body: audit.slice(0, 50).map((a) => [
        format(new Date(a.at), "dd-MM HH:mm"), a.user, a.action, a.target, a.detail || "",
      ]),
    });

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`${settings.name} — Inspection Report — Page ${i} of ${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    }

    doc.save(`inspection-ready-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };



  const exportPDF = (title: string, head: string[], body: any[][]) => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("PharmaGuard NG", 14, 14);
    doc.setFontSize(10); doc.text(title, 14, 21);
    doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 27);
    autoTable(doc, { head: [head], body, startY: 32, styles: { fontSize: 9 }, headStyles: { fillColor: [22, 160, 110] } });
    doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };
  const exportXLSX = (name: string, rows: any[]) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, name);
    XLSX.writeFile(wb, `${name.toLowerCase().replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Reports & Compliance</h1>
          <p className="text-sm text-muted-foreground">Generate sales, stock, expiry, movement and statutory inspection reports</p>
        </div>
        <Button size="sm" variant="outline" onClick={inspectionReadyPdf}>
          <ShieldCheck className="mr-1 h-4 w-4" />Inspection Ready PDF
        </Button>
      </div>

      <Card className="shadow-card">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="ml-auto grid grid-cols-3 gap-3 text-sm">
            <Stat label="Revenue" v={NGN(totals.rev)} />
            <Stat label="Profit" v={NGN(totals.profit)} />
            <Stat label="Transactions" v={String(totals.count)} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="sales">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="profit">Profit</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="expiry">Expiry</TabsTrigger>
          <TabsTrigger value="movement">Stock Movement</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Sales report</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportXLSX("Sales", inRange.map((s) => ({
                  Date: format(new Date(s.createdAt), "yyyy-MM-dd HH:mm"), Receipt: s.id.slice(0,8).toUpperCase(),
                  Items: s.items.length, Total: s.total, Profit: s.profit, Payment: s.payment, Cashier: s.cashier,
                })))}><FileDown className="mr-1 h-4 w-4" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF("Sales Report",
                  ["Date","Receipt","Items","Total","Profit","Payment"],
                  inRange.map((s) => [format(new Date(s.createdAt), "dd MMM HH:mm"), s.id.slice(0,8).toUpperCase(), s.items.length, s.total.toFixed(2), s.profit.toFixed(2), s.payment])
                )}><FileText className="mr-1 h-4 w-4" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Receipt</TableHead><TableHead>Items</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Profit</TableHead>
                    <TableHead>Payment</TableHead><TableHead>Cashier</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {inRange.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No sales in range</TableCell></TableRow>}
                    {inRange.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs">{format(new Date(s.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                        <TableCell className="text-xs font-mono">{s.id.slice(0,8).toUpperCase()}</TableCell>
                        <TableCell>{s.items.length}</TableCell>
                        <TableCell className="text-right font-medium">{NGN(s.total)}</TableCell>
                        <TableCell className="text-right text-success">{NGN(s.profit)}</TableCell>
                        <TableCell><Badge variant="outline">{s.payment}</Badge></TableCell>
                        <TableCell className="text-xs">{s.cashier}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Profit by product</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportXLSX("Profit", profitRows.map((r) => ({
                  Product: r.name, UnitsSold: r.units, Revenue: r.revenue, Profit: r.profit,
                })))}><FileDown className="mr-1 h-4 w-4" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF("Profit by Product",
                  ["Product","Units","Revenue","Profit"],
                  profitRows.map((r) => [r.name, r.units, r.revenue.toFixed(2), r.profit.toFixed(2)])
                )}><FileText className="mr-1 h-4 w-4" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {profitRows.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No sales in range</TableCell></TableRow>}
                    {profitRows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right">{r.units}</TableCell>
                        <TableCell className="text-right">{NGN(r.revenue)}</TableCell>
                        <TableCell className="text-right text-success">{NGN(r.profit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="border-info text-info">Stock value (cost): {NGN(stockCostValue)}</Badge>
            <Badge variant="outline" className="border-success text-success">Stock value (retail): {NGN(stockSellValue)}</Badge>
            <Badge variant="outline">Potential margin: {NGN(stockSellValue - stockCostValue)}</Badge>
          </div>
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Stock report</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportXLSX("Stock", products.map((p) => ({
                  Name: p.name, Generic: p.generic, NAFDAC: p.nafdac, Batch: p.batch, Expiry: p.expiry,
                  Quantity: p.quantity, Cost: p.costPrice, Price: p.sellingPrice, Value: p.quantity * p.costPrice, Supplier: p.supplier,
                })))}><FileDown className="mr-1 h-4 w-4" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF("Stock Report",
                  ["Name","NAFDAC","Batch","Expiry","Qty","Cost","Price"],
                  products.map((p) => [p.name, p.nafdac, p.batch, p.expiry, p.quantity, p.costPrice, p.sellingPrice])
                )}><FileText className="mr-1 h-4 w-4" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>NAFDAC</TableHead><TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Value</TableHead><TableHead>Supplier</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.generic}</div></TableCell>
                        <TableCell className="text-xs">{p.nafdac}</TableCell>
                        <TableCell className="text-right">{p.quantity}</TableCell>
                        <TableCell className="text-right">{NGN(p.quantity * p.costPrice)}</TableCell>
                        <TableCell className="text-xs">{p.supplier}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiry">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Expiry report</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportXLSX("Expiry", expiryRows.map((p) => ({
                  Name: p.name, Batch: p.batch, Expiry: p.expiry, DaysLeft: p.days, Status: p.status, Quantity: p.quantity,
                })))}><FileDown className="mr-1 h-4 w-4" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF("Expiry Report",
                  ["Name","Batch","Expiry","Days","Status","Qty"],
                  expiryRows.map((p) => [p.name, p.batch, p.expiry, p.days, p.status, p.quantity])
                )}><FileText className="mr-1 h-4 w-4" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Batch</TableHead><TableHead>Expiry</TableHead>
                    <TableHead>Status</TableHead><TableHead className="text-right">Qty</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {expiryRows.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-xs">{p.batch}</TableCell>
                        <TableCell className="text-xs">{format(new Date(p.expiry), "dd MMM yyyy")} <span className="text-muted-foreground">({p.days < 0 ? `${-p.days}d ago` : `${p.days}d`})</span></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            p.status === "expired" || p.status === "critical" ? "border-destructive text-destructive" :
                            p.status === "warning" ? "border-warning text-warning" :
                            "border-success text-success"
                          }>{p.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{p.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movement">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Stock movement ({from} → {to})</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportXLSX("Stock-Movement", movementRows.map((r) => ({
                  Product: r.name, Batch: r.batch, OpeningStock: r.opening, UnitsSold: r.sold, ClosingStock: r.closing, Revenue: r.revenue,
                })))}><FileDown className="mr-1 h-4 w-4" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF("Stock Movement",
                  ["Product","Batch","Opening","Sold","Closing","Revenue"],
                  movementRows.map((r) => [r.name, r.batch, r.opening, r.sold, r.closing, r.revenue.toFixed(2)])
                )}><FileText className="mr-1 h-4 w-4" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Product</TableHead><TableHead>Batch</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {movementRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-xs">{r.batch}</TableCell>
                        <TableCell className="text-right">{r.opening}</TableCell>
                        <TableCell className="text-right font-medium">{r.sold}</TableCell>
                        <TableCell className="text-right">{r.closing}</TableCell>
                        <TableCell className="text-right">{NGN(r.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold">{v}</div>
    </div>
  );
}
