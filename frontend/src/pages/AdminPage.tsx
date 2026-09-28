import { aoVivo, api } from "@/api";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Row = { id: number; content: string; created_at: number; used_at: number | null; used_by_name: string | null; pago: string | null };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function AdminPage() {
  const [rows, setRows] = useState<Row[]>([]);

  const load = () => api<Row[]>("/admin/tests").then(setRows).catch((e) => toast.error(e.message));
  useEffect(() => {
    load();
    return aoVivo((ev) => {
      if (ev.tipo === "pagamento") toast.success(`💰 Pagamento aprovado: ${ev.plano} · ${brl(ev.valor ?? 0)} (teste #${ev.id})`, { duration: 10000 });
      else toast.success(`Novo teste criado por ${ev.name ?? "cliente"}`);
      load();
    });
  }, []);

  async function remove(id: number) {
    if (!confirm("Remover este teste da lista? (continua ativo no painelblackbr)")) return;
    await api(`/admin/tests/${id}`, "DELETE").catch((e) => toast.error(e.message));
    load();
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-[rgba(84,5,45,0.5)] dark:text-muted-foreground">Testes gerados pelos clientes, atualizados em tempo real</p>
        <p className="text-sm text-[rgba(84,5,45,0.5)] dark:text-muted-foreground">
          <span className="font-semibold text-[#9B5BF8]">{rows.length}</span> testes
        </p>
      </div>

      <div className="space-y-3">
        {rows.length === 0 && <p className="text-center text-[rgba(84,5,45,0.5)] dark:text-muted-foreground">Nenhum teste gerado ainda.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-col-reverse gap-3 dark-card rounded-2xl border border-border/30 shadow-sm p-4 sm:flex-row sm:gap-4 sm:p-5">
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-sm text-[#1F1F24] dark:text-white/90">{r.content.replace(/^.*Assinar\/Renovar Plano.*(\r?\n)?/m, "")}</pre>
            <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
              {r.pago && (
                <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                  ✓ Pago · {brl(Number(r.pago.split("|")[1]))}
                </span>
              )}
              {r.pago && (
                <span className={r.pago.split("|")[2] === "liberado"
                  ? "rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success"
                  : "rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400"}>
                  {r.pago.split("|")[2] === "liberado" ? "Liberado" : "Aguardando liberação do servidor"}
                </span>
              )}
              <span className="rounded-full bg-[#9B5BF8]/15 px-3 py-1 text-xs font-semibold text-[#9B5BF8]">
                {r.used_by_name ?? "usuário removido"} ·{" "}
                {new Date(r.used_at ?? r.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <button onClick={() => remove(r.id)} aria-label="Remover" className="text-[rgba(84,5,45,0.5)] dark:text-muted-foreground hover:text-destructive">
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
