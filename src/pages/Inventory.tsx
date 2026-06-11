import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, PackagePlus, Search, Upload, Download, ImageIcon, AlertTriangle } from "lucide-react";
import { store, useStore, Product, salesVelocityMap, movementSpeed } from "@/lib/store";
import { NGN, expiryTier, expiryBadgeClass, daysUntil, movementBadgeClass } from "@/lib/format";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const DEFAULT_CATEGORIES = ["Analgesics","Antibiotics","Antimalarials","Antihypertensives","Antiretrovirals","Antidiabetics","Cardiovascular","Vitamins","Supplements","Contraceptives","Controlled Substances"];
const DEFAULT_PACK_SIZES = ["10 Tablets","20 Tablets","30 Capsules","Bottle","Sachet","Box","Vial","Tube","5ml","10ml","100ml","Pack of 6","Pack of 10"];
const CAT_KEY = "pg_custom_categories";
const PACK_KEY = "pg_custom_pack_sizes";
const loadCustom = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const saveCustom = (k: string, v: string[]) => localStorage.setItem(k, JSON.stringify(v));

const empty: Omit<Product, "id"> = {
  name: "", generic: "", nafdac: "", batch: "", expiry: "", quantity: 0,
  reorderLevel: 10, reorderQuantity: 30, packSize: "10 Tablets",
  costPrice: 0, sellingPrice: 0, supplier: "", category: "Analgesics", description: "",
  image: "",
};

async function fileToDataUrl(file: File, max = 400): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  // resize via canvas
  return await new Promise<string>((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

export default function Inventory() {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const suppliers = useStore((s) => s.suppliers);
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "all";
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [supFilter, setSupFilter] = useState("all");
  const [expFilter, setExpFilter] = useState("all");
  const [moveFilter, setMoveFilter] = useState("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Omit<Product, "id">>(empty);
  const [open, setOpen] = useState(false);
  const [receiveFor, setReceiveFor] = useState<Product | null>(null);
  const [receiveQty, setReceiveQty] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [dupWarn, setDupWarn] = useState<Product[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [customCats, setCustomCats] = useState<string[]>(() => loadCustom(CAT_KEY));
  const [customPacks, setCustomPacks] = useState<string[]>(() => loadCustom(PACK_KEY));
  const [newCat, setNewCat] = useState("");
  const [newPack, setNewPack] = useState("");
  const CATEGORIES = useMemo(() => [...DEFAULT_CATEGORIES, ...customCats, "Others"], [customCats]);
  const PACK_SIZES = useMemo(() => [...DEFAULT_PACK_SIZES, ...customPacks, "Others"], [customPacks]);

  const velocity = useMemo(() => salesVelocityMap(sales, 30), [sales]);

  const list = useMemo(() => {
    return products.filter((p) => {
      const t = expiryTier(p.expiry);
      const sold30 = velocity.get(p.id) || 0;
      const speed = movementSpeed(sold30);
      if (filter === "low" && p.quantity > p.reorderLevel) return false;
      if (filter === "near" && t !== "red" && t !== "yellow") return false;
      if (filter === "expired" && daysUntil(p.expiry) >= 0) return false;
      if (cat !== "all" && p.category !== cat) return false;
      if (supFilter !== "all" && p.supplierId !== supFilter && p.supplier !== supFilter) return false;
      if (expFilter !== "all" && t !== expFilter) return false;
      if (moveFilter !== "all" && speed !== moveFilter) return false;
      const term = q.trim().toLowerCase();
      if (!term) return true;
      return p.name.toLowerCase().includes(term)
        || p.generic.toLowerCase().includes(term)
        || p.nafdac.toLowerCase().includes(term)
        || p.batch.toLowerCase().includes(term);
    });
  }, [products, q, cat, filter, supFilter, expFilter, moveFilter, velocity]);

  const openNew = () => { setEditing(null); setDraft(empty); setOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setDraft({ ...p }); setOpen(true); };
  const performSave = () => {
    const final = { ...draft };
    if (final.supplierId) {
      const s = suppliers.find((x) => x.id === final.supplierId);
      if (s) final.supplier = s.name;
    }
    if (editing) { store.updateProduct(editing.id, final); toast.success("Product updated"); }
    else { store.addProduct(final); toast.success("Product added"); }
    setOpen(false);
    setDupWarn(null);
  };
  const save = () => {
    if (!draft.name || !draft.expiry) { toast.error("Name and expiry are required"); return; }
    if (!editing) {
      const name = draft.name.trim().toLowerCase();
      const dups = products.filter((p) => p.name.trim().toLowerCase() === name);
      if (dups.length > 0) { setDupWarn(dups); return; }
    }
    performSave();
  };

  const onImageChange = async (file?: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    const url = await fileToDataUrl(file, 400);
    setDraft((d) => ({ ...d, image: url }));
  };

  const exportCSV = () => {
    const headers = ["name","generic","nafdac","batch","expiry","quantity","reorderLevel","reorderQuantity","packSize","lastRestocked","costPrice","sellingPrice","supplier","category","barcode"];
    const rows = products.map((p) => headers.map((h) => JSON.stringify((p as any)[h] ?? "")).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `inventory-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
  };
  const importCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
      const headers = head.split(",").map((s) => s.replace(/(^"|"$)/g, ""));
      const rows = lines.map((ln) => {
        const cols = ln.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/,"").replace(/^"|"$/g,"").replace(/""/g,'"')) || [];
        const obj: any = { ...empty };
        headers.forEach((h, i) => obj[h] = cols[i] ?? "");
        ["quantity","reorderLevel","reorderQuantity","costPrice","sellingPrice"].forEach((k) => obj[k] = Number(obj[k]) || 0);
        return obj as Omit<Product, "id">;
      });
      store.importProducts(rows);
      toast.success(`Imported ${rows.length} products`);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Inventory</h1>
          <p className="text-sm text-muted-foreground">Manage products, batches, stock and expiry</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files && importCSV(e.target.files[0])} />
            <Button variant="outline" size="sm" asChild><span><Upload className="mr-2 h-4 w-4" />Import CSV</span></Button>
          </label>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
          <Button size="sm" onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add Product</Button>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name, generic, NAFDAC, batch..." className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={supFilter} onValueChange={setSupFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Supplier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={expFilter} onValueChange={setExpFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Expiry" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All expiry</SelectItem>
                <SelectItem value="green">Safe (&gt;6mo)</SelectItem>
                <SelectItem value="yellow">1–6 months</SelectItem>
                <SelectItem value="red">≤30 days / Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={moveFilter} onValueChange={setMoveFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Movement" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All movement</SelectItem>
                <SelectItem value="Fast">Fast</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Slow">Slow</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filter} onValueChange={(v) => setParams(v === "all" ? {} : { filter: v })}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="near">Near expiry</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Image</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Generic</TableHead>
                  <TableHead>NAFDAC</TableHead>
                  <TableHead>Pack</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Reorder</TableHead>
                  <TableHead className="text-right">Reorder Qty</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.length === 0 && (
                  <TableRow><TableCell colSpan={16} className="py-8 text-center text-sm text-muted-foreground">No products found</TableCell></TableRow>
                )}
                {list.map((p) => {
                  const tier = expiryTier(p.expiry);
                  const days = daysUntil(p.expiry);
                  const low = p.quantity <= p.reorderLevel;
                  const sold30 = velocity.get(p.id) || 0;
                  const speed = movementSpeed(sold30);
                  const tierLabel = tier === "red" ? (days < 0 ? "Expired" : "Critical") : tier === "yellow" ? "Warning" : "Safe";
                  return (
                    <TableRow key={p.id} className={cn(low && "bg-destructive/5 hover:bg-destructive/10")}>
                      <TableCell>
                        {p.image ? (
                          <img src={p.image} alt={p.name} className="h-10 w-10 rounded-md object-cover border" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground"><ImageIcon className="h-4 w-4" /></div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium flex items-center gap-1.5">
                          {p.name}
                          {low && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                        </div>
                        <div className="text-xs text-muted-foreground">{p.category}</div>
                      </TableCell>
                      <TableCell className="text-xs">{p.generic}</TableCell>
                      <TableCell className="text-xs">{p.nafdac}</TableCell>
                      <TableCell className="text-xs">{p.packSize}</TableCell>
                      <TableCell className="text-xs">{p.batch}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <div>{format(new Date(p.expiry), "dd MMM yyyy")}</div>
                        <div className="text-[11px] text-muted-foreground">{days < 0 ? `${-days}d ago` : `${days}d left`}</div>
                      </TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", expiryBadgeClass(tier))}>
                          <span className={cn("h-2 w-2 rounded-full", tier === "red" ? "bg-destructive" : tier === "yellow" ? "bg-warning" : "bg-success")} />
                          {tierLabel}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn("font-semibold", low && "text-destructive")}>{p.quantity}</span>
                        {low && <div className="text-[10px] text-destructive">LOW STOCK</div>}
                      </TableCell>
                      <TableCell className="text-right text-xs">{p.reorderLevel}</TableCell>
                      <TableCell className="text-right text-xs">{p.reorderQuantity}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={movementBadgeClass(speed)}>{speed}</Badge>
                        <div className="text-[10px] text-muted-foreground">{sold30}/30d</div>
                      </TableCell>
                      <TableCell className="text-right text-xs">{NGN(p.costPrice)}</TableCell>
                      <TableCell className="text-right font-medium">{NGN(p.sellingPrice)}</TableCell>
                      <TableCell className="text-xs">{p.supplier}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Receive stock" onClick={() => { setReceiveFor(p); setReceiveQty(p.reorderQuantity || 0); }}><PackagePlus className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="Delete" onClick={() => setConfirmDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>

          <div className="mb-3 flex items-center gap-4 rounded-lg border bg-muted/30 p-3">
            {draft.image ? (
              <img src={draft.image} alt="preview" className="h-20 w-20 rounded-md object-cover border" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-md bg-muted text-muted-foreground"><ImageIcon className="h-6 w-6" /></div>
            )}
            <div className="flex-1">
              <Label className="text-xs">Product Image</Label>
              <div className="flex gap-2 mt-1">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImageChange(e.target.files?.[0])} />
                <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />Upload image
                </Button>
                {draft.image && <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...draft, image: "" })}>Remove</Button>}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">JPG/PNG, under 5MB. Auto-resized.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Product name *" v={draft.name} on={(v) => setDraft({ ...draft, name: v })} />
            <Field label="Generic name" v={draft.generic} on={(v) => setDraft({ ...draft, generic: v })} />
            <Field label="NAFDAC Registration No." v={draft.nafdac} on={(v) => setDraft({ ...draft, nafdac: v })} />
            <Field label="Batch / Lot No." v={draft.batch} on={(v) => setDraft({ ...draft, batch: v })} />
            <Field label="Expiry date *" type="date" v={draft.expiry} on={(v) => setDraft({ ...draft, expiry: v })} />
            <Field label="Last restocked" type="date" v={draft.lastRestocked || ""} on={(v) => setDraft({ ...draft, lastRestocked: v })} />
            <div>
              <Label>Therapeutic Category</Label>
              <Select
                value={CATEGORIES.includes(draft.category) ? draft.category : "Others"}
                onValueChange={(v) => {
                  if (v === "Others") { setDraft({ ...draft, category: "" }); setNewCat(""); }
                  else setDraft({ ...draft, category: v, controlled: v === "Controlled Substances" });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              {(!CATEGORIES.includes(draft.category) || (draft.category === "" )) && (
                <div className="mt-2 flex gap-2">
                  <Input placeholder="Enter custom category" value={newCat || draft.category} onChange={(e) => { setNewCat(e.target.value); setDraft({ ...draft, category: e.target.value }); }} />
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    const v = (newCat || draft.category).trim();
                    if (!v) return;
                    if (!customCats.includes(v) && !DEFAULT_CATEGORIES.includes(v)) {
                      const next = [...customCats, v]; setCustomCats(next); saveCustom(CAT_KEY, next);
                    }
                    setDraft({ ...draft, category: v }); setNewCat("");
                    toast.success("Category saved");
                  }}>Save</Button>
                </div>
              )}
            </div>
            <div>
              <Label>Pack Size / Unit</Label>
              <Select
                value={PACK_SIZES.includes(draft.packSize) ? draft.packSize : "Others"}
                onValueChange={(v) => {
                  if (v === "Others") { setDraft({ ...draft, packSize: "" }); setNewPack(""); }
                  else setDraft({ ...draft, packSize: v });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PACK_SIZES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              {(!PACK_SIZES.includes(draft.packSize) || draft.packSize === "") && (
                <div className="mt-2 flex gap-2">
                  <Input placeholder="Enter custom pack size" value={newPack || draft.packSize} onChange={(e) => { setNewPack(e.target.value); setDraft({ ...draft, packSize: e.target.value }); }} />
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    const v = (newPack || draft.packSize).trim();
                    if (!v) return;
                    if (!customPacks.includes(v) && !DEFAULT_PACK_SIZES.includes(v)) {
                      const next = [...customPacks, v]; setCustomPacks(next); saveCustom(PACK_KEY, next);
                    }
                    setDraft({ ...draft, packSize: v }); setNewPack("");
                    toast.success("Pack size saved");
                  }}>Save</Button>
                </div>
              )}
            </div>
            <Field label="Quantity in stock" type="number" v={String(draft.quantity)} on={(v) => setDraft({ ...draft, quantity: +v })} />
            <Field label="Reorder Level" type="number" v={String(draft.reorderLevel)} on={(v) => setDraft({ ...draft, reorderLevel: +v })} />
            <Field label="Reorder Quantity" type="number" v={String(draft.reorderQuantity)} on={(v) => setDraft({ ...draft, reorderQuantity: +v })} />
            <Field label="Cost price (₦)" type="number" v={String(draft.costPrice)} on={(v) => setDraft({ ...draft, costPrice: +v })} />
            <Field label="Selling price (₦)" type="number" v={String(draft.sellingPrice)} on={(v) => setDraft({ ...draft, sellingPrice: +v })} />
            <div>
              <Label>Supplier</Label>
              <Select value={draft.supplierId || ""} onValueChange={(v) => setDraft({ ...draft, supplierId: v })}>
                <SelectTrigger><SelectValue placeholder={draft.supplier || "Select supplier"} /></SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Add suppliers first</div>}
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Barcode (optional)" v={draft.barcode || ""} on={(v) => setDraft({ ...draft, barcode: v })} />
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea rows={2} value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save changes" : "Add product"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiveFor} onOpenChange={(o) => !o && setReceiveFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Receive stock — {receiveFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Quantity received</Label>
            <Input type="number" value={receiveQty} onChange={(e) => setReceiveQty(+e.target.value)} />
            <div className="text-xs text-muted-foreground">Current: {receiveFor?.quantity} · New total: {(receiveFor?.quantity || 0) + receiveQty}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveFor(null)}>Cancel</Button>
            <Button onClick={() => { if (receiveFor && receiveQty > 0) { store.receiveStock(receiveFor.id, receiveQty); toast.success("Stock received"); setReceiveFor(null); } }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <span className="font-semibold">{confirmDelete?.name}</span> (Batch {confirmDelete?.batch})? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDelete) { store.deleteProduct(confirmDelete.id); toast.success("Product deleted"); setConfirmDelete(null); } }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!dupWarn} onOpenChange={(o) => !o && setDupWarn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" />Possible duplicate product</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>A product named <span className="font-semibold">{draft.name}</span> already exists:</p>
                <div className="rounded-md border bg-muted/40 p-2 text-xs space-y-1">
                  {dupWarn?.map((p) => (
                    <div key={p.id} className="flex flex-wrap gap-x-3">
                      <span>Batch: <span className="font-medium">{p.batch || "—"}</span></span>
                      <span>Expiry: <span className="font-medium">{p.expiry || "—"}</span></span>
                      <span>Stock: <span className="font-medium">{p.quantity}</span></span>
                    </div>
                  ))}
                </div>
                <p className="text-xs">If this is the same drug, use <span className="font-medium">Receive Stock</span> instead of creating a new entry.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={performSave}>Add anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, v, on, type = "text" }: { label: string; v: string; on: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
