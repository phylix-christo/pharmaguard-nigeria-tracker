import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Package, ShoppingCart, FileBarChart2, ShieldAlert, History, LogOut, Pill, Moon, Sun, Truck, ReceiptText, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { store, useStore } from "@/lib/store";
import { useTheme } from "next-themes";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "POS / Sales", url: "/pos", icon: ShoppingCart },
  { title: "Sales History", url: "/sales", icon: ReceiptText },
  { title: "Suppliers", url: "/suppliers", icon: Truck },
  { title: "Reports", url: "/reports", icon: FileBarChart2 },
  { title: "AI Forecast", url: "/forecast", icon: Sparkles },
  { title: "Poisons Register", url: "/poisons", icon: ShieldAlert },
  { title: "Audit Trail", url: "/audit", icon: History },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
];

function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const settings = useStore((s) => s.settings);
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          {settings.logo ? (
            <img src={settings.logo} alt="logo" className="h-9 w-9 rounded-lg object-cover border bg-white shadow-elevated" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-elevated">
              <Pill className="h-5 w-5" />
            </div>
          )}
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="font-semibold text-sidebar-foreground truncate">{settings.name || "PharmaGuard NG"}</div>
              <div className="text-[11px] text-sidebar-foreground/70">Nigeria Pharma Tracker</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className={({ isActive }) =>
                        `flex items-center gap-2 ${isActive ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""}`
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <UserBadge collapsed={collapsed} />
      </SidebarFooter>
    </Sidebar>
  );
}

function UserBadge({ collapsed }: { collapsed: boolean }) {
  const user = useStore((s) => s.user);
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="flex items-center justify-between p-2">
      {!collapsed && (
        <div className="text-xs">
          <div className="font-medium text-sidebar-foreground">{user.username}</div>
          <div className="text-sidebar-foreground/60">{user.role}</div>
        </div>
      )}
      <Button
        variant="ghost" size="icon"
        className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
        onClick={async () => {
          const { supabase } = await import("@/integrations/supabase/client");
          await supabase.auth.signOut();
          store.logout();
          navigate("/login");
        }}
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
    </Button>
  );
}

export default function AppLayout() {
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/80 px-4 backdrop-blur">

            {/* Left — sidebar trigger + owner photo */}
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              {user && (
                settings.ownerPhoto ? (
                  <img
                    src={settings.ownerPhoto}
                    alt="Owner"
                    className="h-8 w-8 rounded-full object-cover border shadow-sm"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted border flex items-center justify-center text-xs font-medium text-muted-foreground">
                    {user.username?.charAt(0).toUpperCase() || "U"}
                  </div>
                )
              )}
              <div className="hidden text-sm text-muted-foreground sm:block">
                Retail Pharmacy Operations
              </div>
            </div>

            {/* Right — theme toggle + pharmacy logo */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {settings.logo ? (
                <img
                  src={settings.logo}
                  alt="Pharmacy Logo"
                  className="h-8 w-8 rounded-lg object-cover border bg-white shadow-sm"
                />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-[#16a36e] flex items-center justify-center shadow-sm">
                  <svg viewBox="0 0 100 100" className="h-5 w-5">
                    <rect x="38" y="15" width="24" height="70" rx="6" fill="white"/>
                    <rect x="15" y="38" width="70" height="24" rx="6" fill="white"/>
                  </svg>
                </div>
              )}
            </div>

          </header>
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
