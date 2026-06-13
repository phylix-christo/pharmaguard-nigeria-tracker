import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { store, useStore } from "@/lib/store";
import { toast } from "sonner";
import { Building2, Upload, ImageIcon, User, Shield, FileCheck2, KeyRound, LogOut, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";

async function fileToDataUrl(file: File, max = 400): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  return await new Promise<string>((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

type CompliancePrefs = {
  expiryAlertDays: number;
  lowStockAlerts: boolean;
  controlledRequirePrescriber: boolean;
  receiptFooter: string;
  vatEnabled: boolean;
  vatRate: number;
};
const PREF_KEY = "pharmaguard_prefs";
const loadPrefs = (): CompliancePrefs => {
  try {
    return {
      expiryAlertDays: 30,
      lowStockAlerts: true,
      controlledRequirePrescriber: true,
      receiptFooter: "Thank you for your patronage. Goods sold are not returnable except defective.",
      vatEnabled: false,
      vatRate: 0,
      ...(JSON.parse(localStorage.getItem(PREF_KEY) || "{}")),
    };
  } catch {
    return { expiryAlertDays: 30, lowStockAlerts: true, controlledRequirePrescriber: true, receiptFooter: "Thank you for your patronage.", vatEnabled: false, vatRate: 0 };
  }
};

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  const loginActivity = useStore((s) => s.loginActivity);
  // Normalize settings so draft fields are never undefined — prevents a
  // stale undefined field from clobbering a freshly-uploaded image on save.
  const normalize = (s: typeof settings) => ({
    ...s,
    logo: s.logo ?? "",
    ownerPhoto: s.ownerPhoto ?? "",
    ownerName: s.ownerName ?? "",
    email: s.email ?? "",
    premiseLicense: s.premiseLicense ?? "",
  });

  const [draft, setDraft] = useState(() => normalize(settings));
  const [prefs, setPrefs] = useState<CompliancePrefs>(loadPrefs());
  const logoRef = useRef<HTMLInputElement>(null);
  const ownerRef = useRef<HTMLInputElement>(null);

  // Resync draft when Supabase hydration lands (settings reference changes)
  useEffect(() => {
    setDraft(normalize(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // ── Upload handler: "logo" → draft.logo | "ownerPhoto" → draft.ownerPhoto ──
  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    const url = await fileToDataUrl(file, 400);
    setDraft((d) => ({ ...d, logo: url }));
  };

  const uploadOwnerPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    const url = await fileToDataUrl(file, 400);
    setDraft((d) => ({ ...d, ownerPhoto: url }));
  };

  // ── Save branding — explicitly passes both fields to updateSettings ──
  const saveBranding = () => {
    const payload = {
      ...draft,
      logo: draft.logo ?? "",
      ownerPhoto: draft.ownerPhoto ?? "",
    };
    console.debug("[Settings] saveBranding payload →", {
      logo: payload.logo ? payload.logo.slice(0, 40) + "…" : "(empty)",
      ownerPhoto: payload.ownerPhoto ? payload.ownerPhoto.slice(0, 40) + "…" : "(empty)",
    });
    store.updateSettings(payload);
    toast.success("Branding saved");
  };

  const savePrefs = () => { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); toast.success("Preferences saved"); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Pharmacy Settings</h1>
        <p className="text-sm text-muted-foreground">Manage pharmacy details, branding, security and compliance preferences</p>
      </div>

      <Tabs defaultValue="details">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="details"><Building2 className="mr-1.5 h-4 w-4" />Pharmacy Details</TabsTrigger>
          <TabsTrigger value="branding"><ImageIcon className="mr-1.5 h-4 w-4" />Branding & Logo</TabsTrigger>
          <TabsTrigger value="security"><Shield className="mr-1.5 h-4 w-4" />Security & Account</TabsTrigger>
          <TabsTrigger value="compliance"><FileCheck2 className="mr-1.5 h-4 w-4" />Reports & Compliance</TabsTrigger>
        </TabsList>

        {/* ── PHARMACY DETAILS ── */}
        <TabsContent value="details">
          <Card className="shadow-card">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2 pb-2 text-sm font-medium"><Building2 className="h-4 w-4 text-primary" /> Pharmacy Details</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2"><Label>Pharmacy name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                <div className="md:col-span-2"><Label>Address</Label><Textarea rows={2} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
                <div className="md:col-span-2"><Label>Premise / PCN License</Label><Input value={draft.premiseLicense || ""} onChange={(e) => setDraft({ ...draft, premiseLicense: e.target.value })} /></div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => { store.updateSettings(draft); toast.success("Pharmacy details saved"); }}>Save changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BRANDING ── */}
        <TabsContent value="branding">
          <div className="grid gap-4 md:grid-cols-2">

            {/* Pharmacy Logo → saves to settings.logo */}
            <Card className="shadow-card">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2 pb-1 text-sm font-medium">
                  <ImageIcon className="h-4 w-4 text-primary" /> Pharmacy Logo
                </div>
                <p className="text-xs text-muted-foreground">
                  Square image. Shown in sidebar, dashboard header, and printed receipts.
                </p>
                <div className="flex items-center gap-4">
                  {draft.logo
                    ? <img src={draft.logo} alt="logo" className="h-24 w-24 rounded-lg object-cover border bg-white" />
                    : <div className="flex h-24 w-24 items-center justify-center rounded-lg border bg-muted text-muted-foreground"><ImageIcon className="h-8 w-8" /></div>
                  }
                  <div className="space-y-2">
                    <input
                      ref={logoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => uploadLogo(e.target.files?.[0])}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => logoRef.current?.click()}>
                      <Upload className="mr-1.5 h-3.5 w-3.5" />Upload logo
                    </Button>
                    {draft.logo && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...draft, logo: "" })}>
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Owner Photo → saves to settings.ownerPhoto */}
            <Card className="shadow-card">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2 pb-1 text-sm font-medium">
                  <User className="h-4 w-4 text-primary" /> Pharmacist-in-Charge
                </div>
                <p className="text-xs text-muted-foreground">
                  Photo of the pharmacy owner / superintendent pharmacist. Appears top-right of the app header.
                </p>
                <div className="flex items-center gap-4">
                  {draft.ownerPhoto
                    ? <img src={draft.ownerPhoto} alt="owner" className="h-24 w-24 rounded-full object-cover border" />
                    : <div className="flex h-24 w-24 items-center justify-center rounded-full border bg-muted text-muted-foreground"><User className="h-8 w-8" /></div>
                  }
                  <div className="space-y-2 flex-1">
                    <Input
                      placeholder="Pharmacist name"
                      value={draft.ownerName || ""}
                      onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })}
                    />
                    <input
                      ref={ownerRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => uploadOwnerPhoto(e.target.files?.[0])}
                    />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => ownerRef.current?.click()}>
                        <Upload className="mr-1.5 h-3.5 w-3.5" />Upload photo
                      </Button>
                      {draft.ownerPhoto && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...draft, ownerPhoto: "" })}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={saveBranding}>Save branding</Button>
          </div>
        </TabsContent>

        {/* ── SECURITY ── */}
        <TabsContent value="security">
          <SecurityTab username={user?.username ?? ""} loginActivity={loginActivity} />
        </TabsContent>

        {/* ── COMPLIANCE ── */}
        <TabsContent value="compliance">
          <Card className="shadow-card">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center gap-2 text-sm font-medium"><FileCheck2 className="h-4 w-4 text-primary" /> Reports & Compliance Preferences</div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Expiry alert window (days)</Label>
                  <Input type="number" min={1} max={365} value={prefs.expiryAlertDays} onChange={(e) => setPrefs({ ...prefs, expiryAlertDays: parseInt(e.target.value) || 30 })} />
                  <p className="text-xs text-muted-foreground">Drugs expiring within this many days are flagged red.</p>
                </div>
                <div className="space-y-2">
                  <Label>Receipt footer message</Label>
                  <Textarea rows={3} value={prefs.receiptFooter} onChange={(e) => setPrefs({ ...prefs, receiptFooter: e.target.value })} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">Low-stock alerts</div>
                    <div className="text-xs text-muted-foreground">Highlight items at or below reorder level</div>
                  </div>
                  <Switch checked={prefs.lowStockAlerts} onCheckedChange={(v) => setPrefs({ ...prefs, lowStockAlerts: v })} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">Require prescriber for controlled drugs</div>
                    <div className="text-xs text-muted-foreground">Enforce doctor name + Rx ref at dispensing</div>
                  </div>
                  <Switch checked={prefs.controlledRequirePrescriber} onCheckedChange={(v) => setPrefs({ ...prefs, controlledRequirePrescriber: v })} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">Charge VAT at checkout</div>
                    <div className="text-xs text-muted-foreground">FIRS requires VAT only if turnover ≥ ₦25M/year. Off by default.</div>
                  </div>
                  <Switch checked={prefs.vatEnabled} onCheckedChange={(v) => setPrefs({ ...prefs, vatEnabled: v })} />
                </div>
                <div className="space-y-2">
                  <Label>VAT rate (%)</Label>
                  <Input type="number" min={0} max={100} step={0.5} disabled={!prefs.vatEnabled}
                    value={prefs.vatRate}
                    onChange={(e) => setPrefs({ ...prefs, vatRate: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })} />
                  <p className="text-xs text-muted-foreground">Nigeria standard rate is 7.5%. Applied at checkout and shown as a line on receipts.</p>
                </div>
              </div>
              <div className="flex justify-end"><Button onClick={savePrefs}>Save preferences</Button></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SecurityTab({ username, loginActivity }: { username: string; loginActivity: ReturnType<typeof useStore<any>> }) {
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [show, setShow] = useState(false);

  const checks = useMemo(() => ({
    length: newPwd.length >= 8,
    upper: /[A-Z]/.test(newPwd),
    number: /[0-9]/.test(newPwd),
    symbol: /[^A-Za-z0-9]/.test(newPwd),
  }), [newPwd]);
  const score = Object.values(checks).filter(Boolean).length;
  const strengthLabel = ["Too weak", "Weak", "Fair", "Good", "Strong"][score];
  const strengthColor = ["bg-destructive", "bg-destructive", "bg-warning", "bg-info", "bg-success"][score];

  const submit = () => {
    if (!oldPwd || !newPwd) { toast.error("Fill all fields"); return; }
    if (newPwd !== confirmPwd) { toast.error("Passwords do not match"); return; }
    if (score < 4) { toast.error("Password does not meet all requirements"); return; }
    const r = store.changePassword(username, oldPwd, newPwd);
    if (!r.ok) { toast.error(r.error || "Failed"); return; }
    toast.success("Password changed successfully");
    setOldPwd(""); setNewPwd(""); setConfirmPwd("");
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="shadow-card">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4 text-primary" /> Change Password</div>
          <p className="text-xs text-muted-foreground">Signed in as <span className="font-medium">{username || "—"}</span></p>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Current password</Label>
              <Input type={show ? "text" : "password"} value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">New password</Label>
              <div className="relative">
                <Input type={show ? "text" : "password"} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShow((s) => !s)}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Confirm new password</Label>
              <Input type={show ? "text" : "password"} value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Strength</span>
              <span className="font-medium">{newPwd ? strengthLabel : "—"}</span>
            </div>
            <div className="flex h-1.5 gap-1">
              {[0,1,2,3].map((i) => (
                <div key={i} className={`h-full flex-1 rounded ${i < score ? strengthColor : "bg-muted"}`} />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-1 pt-1 text-xs">
              <Req ok={checks.length}>At least 8 characters</Req>
              <Req ok={checks.upper}>One uppercase letter</Req>
              <Req ok={checks.number}>One number</Req>
              <Req ok={checks.symbol}>One symbol</Req>
            </ul>
          </div>

          <Button className="w-full" onClick={submit}>Update password</Button>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium"><Shield className="h-4 w-4 text-primary" /> Recent Login Activity</div>
            <Button size="sm" variant="outline" onClick={() => { store.clearLoginActivity(true); toast.success("Other sessions cleared"); }}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" />Logout other devices
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-xs">When</TableHead>
                <TableHead className="text-xs">User</TableHead>
                <TableHead className="text-xs">Device</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(loginActivity as any[]).length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">No login activity yet</TableCell></TableRow>
                )}
                {(loginActivity as any[]).slice(0, 15).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{format(new Date(l.at), "dd MMM HH:mm")}</TableCell>
                    <TableCell className="text-xs font-medium">{l.username}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">{l.device}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={l.status === "success" ? "border-success text-success" : "border-destructive text-destructive"}>{l.status}</Badge>
                    </TableCell>
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

function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? "text-success" : "text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {children}
    </li>
  );
}
