import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { store, useStore } from "@/lib/store";
import { NGN } from "@/lib/format";
import { format } from "date-fns";
import { ShieldAlert, ClipboardPlus, FileDown, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function Poisons() {
  const products = useStore((s) => s.products);
  const dispenses = useStore((s) => s.controlledDispense);
  const settings = useStore((s) => s.settings);
  const controlled = products.filter((p) => p.controlled);

  // Running balances per product (current quantity is already net of dispenses)
  const balances = useMemo(() => {
    const m = new Map<string, number>();
    controlled.forEach((p) => m.set(p.id, p.quantity));
    return m;
  }, [controlled]);

  const exportCsv = () => {
    const rows = [
      ["Date","Drug","Batch","Qty","Amount","Patient","Phone","Prescriber","Reg No","Rx Ref","Cashier"].join(","),
      ...dispenses.map((d) => [
        format(new Date(d.at), "yyyy-MM-dd HH:mm"), d.productName, d.batch, d.quantity, d.amount,
        d.patientName, d.patientPhone || "", d.prescriber, d.prescriberRegNo || "", d.prescriptionRef, d.cashier,
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `controlled-register-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const exportInspectionPdf = () => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(settings.name, pageW / 2, 16, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(settings.address || "", pageW / 2, 22, { align: "center" });
    doc.text(`Tel: ${settings.phone || "—"}  ·  PCN Premise License: ${settings.premiseLicense || "—"}`, pageW / 2, 27, { align: "center" });

    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("POISONS REGISTER / CONTROLLED DRUGS LOG", pageW / 2, 36, { align: "center" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text("Statutory record per Pharmacists Council of Nigeria (PCN) & NDLEA requirements", pageW / 2, 41, { align: "center" });
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}  ·  Total entries: ${dispenses.length}  ·  Controlled SKUs: ${controlled.length}`, pageW / 2, 46, { align: "center" });

    let y = 54;
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("1. Controlled substances on hand", 14, y); y += 2;
    autoTable(doc, {
      startY: y, styles: { fontSize: 8 }, headStyles: { fillColor: [180, 50, 50] },
      head: [["Drug", "NAFDAC", "Batch", "Balance", "Reorder", "Expiry"]],
      body: controlled.length === 0 ? [["—", "—", "—", "—", "—", "—"]] :
        controlled.map((p) => [p.name, p.nafdac, p.batch, String(p.quantity), String(p.reorderLevel), p.expiry]),
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("2. Statutory dispensing log", 14, y); y += 2;
    autoTable(doc, {
      startY: y, styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [180, 50, 50] },
      head: [["Date", "Drug", "Batch", "Qty", "Amount", "Patient", "Phone", "Prescriber", "Reg No", "Rx Ref"]],
      body: dispenses.length === 0 ? [["—","—","—","—","—","—","—","—","—","—"]] :
        dispenses.map((d) => [
          format(new Date(d.at), "dd-MM-yy HH:mm"), d.productName, d.batch, String(d.quantity),
          NGN(d.amount), d.patientName, d.patientPhone || "—",
          d.prescriber, d.prescriberRegNo || "—", d.prescriptionRef,
        ]),
    });
    y = (doc as any).lastAutoTable.finalY + 14;

    if (y > 250) { doc.addPage(); y = 30; }
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("Certified true record of controlled drugs dispensed at the above premise.", 14, y); y += 14;
    doc.text("Superintendent Pharmacist: _______________________________", 14, y); y += 8;
    doc.text("PCN Reg No: _______________________   Signature: _______________________   Date: ____________", 14, y);

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(120);
      doc.text(`${settings.name} — Poisons Register — Page ${i} of ${pages}`, pageW / 2, pageH - 8, { align: "center" });
    }
    doc.save(`poisons-register-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("Inspection-ready PDF generated");
  };



  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Poisons / Controlled Register</h1>
            <p className="text-sm text-muted-foreground">Statutory record per Pharmacists Council of Nigeria & NDLEA requirements</p>
            <p className="mt-1 text-xs text-muted-foreground">Premise: <span className="font-medium">{settings.name}</span> · License: {settings.premiseLicense || "—"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><FileDown className="mr-1.5 h-4 w-4" />Export CSV</Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={exportInspectionPdf}><ShieldCheck className="mr-1.5 h-4 w-4" />Inspection-ready PDF</Button>
          <DispenseDialog products={controlled} />
        </div>
      </div>

      <Card className="shadow-card border-l-4 border-l-destructive">
        <CardHeader className="pb-2"><CardTitle className="text-base">Controlled substances on hand — running balance</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Drug</TableHead><TableHead>NAFDAC</TableHead><TableHead>Batch</TableHead>
              <TableHead className="text-right">Balance</TableHead><TableHead>Reorder Lvl</TableHead><TableHead>Expiry</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {controlled.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No controlled substances on file</TableCell></TableRow>}
              {controlled.map((p) => {
                const bal = balances.get(p.id) ?? 0;
                const low = bal <= p.reorderLevel;
                return (
                  <TableRow key={p.id} className={low ? "bg-destructive/5" : ""}>
                    <TableCell className="font-medium">{p.name} <span className="text-xs text-muted-foreground">{p.packSize}</span></TableCell>
                    <TableCell className="text-xs">{p.nafdac}</TableCell>
                    <TableCell className="text-xs">{p.batch}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-bold ${low ? "text-destructive" : ""}`}>{bal}</span>
                    </TableCell>
                    <TableCell className="text-xs">{p.reorderLevel}</TableCell>
                    <TableCell className="text-xs">{format(new Date(p.expiry), "dd MMM yyyy")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-2"><CardTitle className="text-base">Statutory dispensing log ({dispenses.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Drug</TableHead><TableHead>Batch</TableHead>
                <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Amount</TableHead>
                <TableHead>Patient</TableHead><TableHead>Prescriber</TableHead>
                <TableHead>Rx Ref</TableHead><TableHead>Cashier</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {dispenses.length === 0 && <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">No controlled dispensings recorded yet</TableCell></TableRow>}
                {dispenses.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs">{format(new Date(d.at), "dd MMM yyyy HH:mm")}</TableCell>
                    <TableCell><Badge variant="outline" className="border-destructive text-destructive">{d.productName}</Badge></TableCell>
                    <TableCell className="text-xs font-mono">{d.batch}</TableCell>
                    <TableCell className="text-right font-medium">{d.quantity}</TableCell>
                    <TableCell className="text-right">{NGN(d.amount)}</TableCell>
                    <TableCell className="text-xs"><div className="font-medium">{d.patientName}</div><div className="text-muted-foreground">{d.patientPhone}</div></TableCell>
                    <TableCell className="text-xs"><div>{d.prescriber}</div><div className="text-muted-foreground">{d.prescriberRegNo}</div></TableCell>
                    <TableCell className="text-xs font-mono">{d.prescriptionRef}</TableCell>
                    <TableCell className="text-xs">{d.cashier}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DispenseDialog({ products }: { products: ReturnType<typeof useStore<any>> }) {
  const list = products as Array<{ id: string; name: string; batch: string; sellingPrice: number; quantity: number }>;
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [prescriber, setPrescriber] = useState("");
  const [prescriberRegNo, setPrescriberRegNo] = useState("");
  const [prescriptionRef, setPrescriptionRef] = useState("");
  const product = list.find((p) => p.id === productId);
  const amount = (product?.sellingPrice || 0) * qty;

  const reset = () => {
    setProductId(""); setQty(1); setPatientName(""); setPatientPhone("");
    setPrescriber(""); setPrescriberRegNo(""); setPrescriptionRef("");
  };

  const submit = () => {
    if (!product) { toast.error("Select a drug"); return; }
    if (!patientName.trim()) { toast.error("Patient name required"); return; }
    if (!prescriber.trim()) { toast.error("Prescriber name required"); return; }
    if (!prescriptionRef.trim()) { toast.error("Prescription reference required"); return; }
    if (qty <= 0 || qty > product.quantity) { toast.error("Invalid quantity"); return; }
    store.recordControlledDispense({
      productId: product.id, productName: product.name, batch: product.batch,
      quantity: qty, amount, patientName: patientName.trim(), patientPhone: patientPhone.trim(),
      prescriber: prescriber.trim(), prescriberRegNo: prescriberRegNo.trim(), prescriptionRef: prescriptionRef.trim(),
    });
    toast.success("Controlled dispense recorded");
    reset(); setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
          <ClipboardPlus className="mr-1.5 h-4 w-4" />Record dispensing
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Controlled Drug Dispensing Form</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="md:col-span-2">
            <Label>Drug</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select controlled drug" /></SelectTrigger>
              <SelectContent>
                {list.map((p) => (
                  <SelectItem key={p.id} value={p.id} disabled={p.quantity <= 0}>
                    {p.name} (Batch {p.batch}) — Bal: {p.quantity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantity</Label>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <Label>Amount</Label>
            <Input value={NGN(amount)} disabled />
          </div>
          <div>
            <Label>Patient name *</Label>
            <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} />
          </div>
          <div>
            <Label>Patient phone</Label>
            <Input value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} />
          </div>
          <div>
            <Label>Prescriber (Doctor) *</Label>
            <Input value={prescriber} onChange={(e) => setPrescriber(e.target.value)} />
          </div>
          <div>
            <Label>MDCN / Reg No</Label>
            <Input value={prescriberRegNo} onChange={(e) => setPrescriberRegNo(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Prescription Ref *</Label>
            <Input value={prescriptionRef} onChange={(e) => setPrescriptionRef(e.target.value)} placeholder="e.g. RX-2026-00123" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} className="bg-destructive hover:bg-destructive/90">Record dispensing</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
