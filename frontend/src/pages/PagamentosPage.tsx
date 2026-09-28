import { aoVivo, api } from "@/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, Loader2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Pag = {
  id: number; test_id: number; plano: string; valor: number; email: string | null; paid_at: number;
  liberacao: "aguardando" | "liberado"; liberado_at: number | null; usuario: string | null; teste: string | null; cliente: string | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quando = (ms: number) => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const muted = "text-[rgba(84,5,45,0.5)] dark:text-muted-foreground";
const strong = "text-[#54052D] dark:text-white";

export function PagamentosPage() {
  const [rows, setRows] = useState<Pag[] | null>(null);
  const [salvando, setSalvando] = useState<number | null>(null);

  const load = () => api<Pag[]>("/admin/pagamentos").then(setRows).catch((e) => toast.error(e.message));
  useEffect(() => {
    load();
    return aoVivo((ev) => { if (ev.tipo !== "teste") load(); });
  }, []);

  async function mudar(p: Pag, liberacao: Pag["liberacao"]) {
    setSalvando(p.id);
    try {
      await api(`/admin/pagamentos/${p.id}`, "PUT", { liberacao });
      toast.success(liberacao === "liberado" ? `${p.usuario} liberado` : `${p.usuario} voltou para aguardando`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  if (!rows)
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const aguardando = rows.filter((r) => r.liberacao === "aguardando").length;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className={`text-sm ${muted}`}>Testes pagos. Ative no painelblackbr e marque como liberado.</p>
        <p className={`text-sm ${muted}`}>
          <span className="font-semibold text-amber-500">{aguardando}</span> aguardando ·{" "}
          <span className="font-semibold text-success">{rows.length - aguardando}</span> liberados
        </p>
      </div>

      {rows.length === 0 && <p className={`py-10 text-center ${muted}`}>Nenhum pagamento ainda.</p>}

      <div className="space-y-3">
        {rows.map((p) => {
          const ok = p.liberacao === "liberado";
          return (
            <div key={p.id} className="dark-card flex flex-col gap-4 rounded-2xl border border-border/30 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-mono text-lg font-bold ${strong}`}>{p.usuario ?? `teste #${p.test_id}`}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                    <CheckCircle2 size={12} /> Pago · {brl(p.valor)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                      ok ? "bg-success/15 text-success" : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {ok ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {ok ? `Liberado · ${quando(p.liberado_at!)}` : "Aguardando liberação do servidor"}
                  </span>
                </div>
                <p className={`truncate text-sm ${muted}`}>{p.teste}</p>
                <p className={`text-sm ${muted}`}>
                  <b className={strong}>{brl(p.valor)}</b> · pago {quando(p.paid_at)} · {p.cliente ?? "—"}
                  {p.email && <> · {p.email}</>}
                </p>
              </div>
              {ok ? (
                <Button onClick={() => mudar(p, "aguardando")} disabled={salvando === p.id} variant="outline" className="shrink-0 rounded-xl font-bold">
                  {salvando === p.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
                  Voltar p/ aguardando
                </Button>
              ) : (
                <Button onClick={() => mudar(p, "liberado")} disabled={salvando === p.id} className="shrink-0 rounded-xl bg-success font-bold text-white hover:bg-success/90">
                  {salvando === p.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Marcar como liberado
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
