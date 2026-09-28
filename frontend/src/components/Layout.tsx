import { getUser, logout } from "@/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme";
import { ChevronDown, FlaskConical, Grid2X2, ListPlus, LogOut, Menu, Moon, Sun, Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Logo } from "./Logo";

const ICON = "#9B5BF8";

const PAGES = {
  "/dashboard": { icon: Grid2X2, label: "Dashboard" },
  "/admin": { icon: ListPlus, label: "Testes gerados" },
  "/pagamentos": { icon: Wallet, label: "Pagamentos" },
  "/teste": { icon: FlaskConical, label: "Teste" },
} as const;

type Path = keyof typeof PAGES;

export function Layout({ children }: { children: React.ReactNode }) {
  const user = getUser()!;
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const sections: { label: string; items: Path[] }[] =
    user.role === "admin"
      ? [
          { label: "Visão geral", items: ["/dashboard"] },
          { label: "Administração", items: ["/pagamentos", "/admin", "/teste"] },
        ]
      : [{ label: "Menu", items: ["/teste"] }];
  const page = PAGES[pathname as Path] ?? PAGES["/teste"];
  // celular/tablet: menu vira gaveta; fecha ao navegar ou com Esc
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[268px_minmax(0,1fr)]">
      {/* barra do topo no celular/tablet */}
      <div className="dark sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#222532] bg-[#0C0E19] px-4 lg:hidden">
        <Logo light />
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open} className="text-[#9B5BF8] hover:bg-primary/10 [&_svg]:size-6">
          <Menu className="h-6 w-6" />
        </Button>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      {/* sidebar fica escura nos dois temas, como na loja */}
      <aside
        className={cn(
          "dark fixed inset-y-0 left-0 z-50 flex w-[268px] max-w-[85vw] flex-col overflow-y-auto border-r border-sidebar-border bg-[#0C0E19] transition-transform duration-300",
          "lg:sticky lg:top-0 lg:h-screen lg:max-w-none lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo light />
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Fechar menu" className="text-[#9B5BF8] hover:bg-primary/10 lg:hidden">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex-1 px-3 py-2">
          {sections.map((section, i) => (
            <div key={section.label} className={cn("space-y-2 pb-4", i > 0 && "border-t border-[#222532] pt-4")}>
              <div className="px-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9B5BF8]">{section.label}</span>
              </div>
              <div className="space-y-1">
                {section.items.map((path) => {
                  const item = PAGES[path];
                  const active = pathname === path;
                  return (
                    <Link
                      key={path}
                      to={path}
                      className={cn(
                        "relative flex h-9 items-center gap-[10px] overflow-hidden rounded-lg px-3 transition-all hover:bg-primary/10",
                        active && "border border-[#222532] bg-[#151822] shadow-[0_0_18px_rgba(155,91,248,0.12)]",
                      )}
                    >
                      {active && (
                        <span className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#9B5BF8] via-[#9B5BF8]/25 to-transparent" />
                      )}
                      <item.icon size={20} color={ICON} className="relative z-10 shrink-0" />
                      <span className={cn("relative z-10 text-[13px] font-medium", active ? "text-white" : "text-[#A2A5B3]")}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-muted-foreground transition-colors hover:bg-destructive/10"
          >
            <LogOut size={22} color={ICON} />
            <span className="text-lg font-medium">Sair</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-6 p-4 sm:p-6 lg:gap-8 lg:p-8">
        <header className="flex min-h-12 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <page.icon color={ICON} className="shrink-0" />
            <span className="truncate text-xl font-bold leading-tight text-[#54052D] dark:text-white sm:text-2xl">{page.label}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Menu do usuário" className="flex items-center gap-2 rounded-full bg-white px-1.5 py-2 sm:px-3 hover:bg-white focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-base font-medium text-[#54052D] dark:text-white">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden max-w-[160px] truncate text-primary dark:text-white sm:inline">{user.name}</span>
                  <ChevronDown className="hidden h-4 w-4 text-[#9B5BF8] sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-[220px] rounded-[15px] border-0 bg-white p-4 shadow-[0px_4px_55px_rgba(0,0,0,0.08)] dark:bg-[#0C0E19] dark:shadow-[0px_4px_55px_rgba(0,0,0,0.5)]"
              >
                <div className="px-4 pb-3">
                  <p className="truncate text-sm font-semibold text-[#54052D] dark:text-white">{user.name}</p>
                  <p className="truncate text-xs text-[rgba(84,5,45,0.5)] dark:text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuItem
                  onClick={logout}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-[16px] text-[rgba(84,5,45,0.6)] focus:bg-[rgba(204,8,84,0.05)] focus:text-[rgba(84,5,45,0.6)] dark:text-white/60 dark:focus:bg-[rgba(204,8,84,0.15)] dark:focus:text-white/60"
                >
                  <LogOut size={20} color={ICON} />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={toggle} className="hover:bg-primary/10" aria-label="Alternar tema">
              {theme === "dark" ? <Sun className="h-5 w-5 text-[#9B5BF8]" /> : <Moon className="h-5 w-5 text-[#9B5BF8]" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 pb-6">{children}</main>
      </div>
    </div>
  );
}
