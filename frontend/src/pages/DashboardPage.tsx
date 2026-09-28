import { aoVivo, api } from "@/api";
import { CheckCircle2, FlaskConical, Loader2, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Stats = {
  total: number;
  clientes: number;
  hoje: number;
  dias: { dia: number; total: number }[];
  recentes: { at: number; name: string | null; content: string | null }[];
};

const muted = "text-[rgba(84,5,45,0.5)] dark:text-muted-foreground";
const strong = "text-[#54052D] dark:text-foreground";

function StatCard({ title, value, icon, caption }: { title: string; value: number; icon: React.ReactNode; caption?: string }) {
  return (
    <div className="dark-card flex flex-col justify-between rounded-2xl border border-border/30 p-5 shadow-sm sm:p-6">
      <p className={`mb-4 text-sm ${muted}`}>{title}</p>
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-bold ${strong}`}>{value.toLocaleString("pt-BR")}</span>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(155,91,248,0.08)]">{icon}</div>
      </div>
      {caption && <p className={`mt-3 text-xs ${muted}`}>{caption}</p>}
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<Stats | null>(null);

  useEffect(() => {
    const load = () => api<Stats>("/admin/stats").then(setData).catch((e) => toast.error(e.message));
    load();
    const t = setInterval(load, 30_000); // atualiza sozinho, como o dashboard da loja
    const fechar = aoVivo(load); // e na hora quando alguém gera um teste
    return () => { clearInterval(t); fechar(); };
  }, []);

  if (!data)
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  const max = Math.max(1, ...data.dias.map((d) => d.total));
  const icon = "h-6 w-6 text-[#9B5BF8]";

  return (
    <div className="animate-fade-in space-y-6">
      <p className={`text-sm ${muted}`}>Acompanhe seus testes e clientes</p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Testes gerados" value={data.total} icon={<FlaskConical className={icon} />} caption="Criados no painelblackbr" />
        <StatCard title="Gerados hoje" value={data.hoje} icon={<TrendingUp className={icon} />} caption="Testes entregues a clientes" />
        <StatCard title="Clientes" value={data.clientes} icon={<Users className={icon} />} caption="Contas cadastradas" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="dark-card rounded-2xl border border-border/30 p-5 shadow-sm sm:p-6">
          <p className={`font-semibold ${strong}`}>Testes gerados</p>
          <p className={`text-xs ${muted}`}>Últimos 7 dias</p>
          <div className="mt-6 flex h-48 items-end gap-1.5 sm:gap-3">
            {data.dias.map((d) => (
              <div key={d.dia} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className={`text-xs font-semibold ${strong}`}>{d.total}</span>
                <div
                  className={`w-full max-w-10 rounded-t-lg ${d.total ? "bg-gradient-to-t from-[#9B5BF8] to-[#C29BFF]" : "bg-muted"}`}
                  style={{ height: `${Math.max(4, (d.total / max) * 100)}%` }}
                  title={`${d.total} testes`}
                />
                <span className={`text-[11px] ${muted}`}>
                  {new Date(d.dia).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="dark-card rounded-2xl border border-border/30 p-5 shadow-sm sm:p-6">
          <p className={`font-semibold ${strong}`}>Atividade recente</p>
          <p className={`text-xs ${muted}`}>Últimos testes gerados</p>
          <ul className="mt-4 divide-y divide-border/40">
            {data.recentes.length === 0 && <li className={`py-6 text-center text-sm ${muted}`}>Nenhum teste gerado ainda.</li>}
            {data.recentes.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${strong}`}>{r.name ?? "Usuário removido"}</p>
                  <p className={`truncate text-xs ${muted}`}>{r.content?.split("\n")[0] ?? "Teste excluído"}</p>
                </div>
                <span className={`shrink-0 text-xs ${muted}`}>
                  {new Date(r.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
