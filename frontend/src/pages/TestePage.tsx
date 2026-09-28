import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Clock, Copy, CreditCard, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Teste = { id: number; content: string; used_at: number; checkout: string | null; pago_em?: number | null; liberacao?: "aguardando" | "liberado" | null };

// o link de pagamento vai no botão "Pagar", não no texto mostrado (o "Copiar" continua levando o texto completo)
const semLink = (txt: string) => txt.replace(/^.*Assinar\/Renovar Plano.*(\r?\n)?/m, "");

function PagarButton({ checkout, primary, pagoEm, liberacao }: { checkout: string | null; primary?: boolean; pagoEm?: number | null; liberacao?: string | null }) {
  if (pagoEm)
    return liberacao === "liberado" ? (
      <span className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-success/15 px-3 py-1.5 text-sm font-bold text-success" title={`Pago em ${quando(pagoEm)}`}>
        <Check className="h-4 w-4" /> Pago · Liberado
      </span>
    ) : (
      <span className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/15 px-3 py-1.5 text-sm font-bold text-amber-600 dark:text-amber-400" title={`Pago em ${quando(pagoEm)}`}>
        <Clock className="h-4 w-4" /> Pago · Aguardando liberação do servidor
      </span>
    );
  if (!checkout) return null;
  return (
    <Button
      asChild
      variant={primary ? "default" : "outline"}
      size={primary ? "default" : "sm"}
      className={cn("rounded-xl font-bold", primary ? "bg-success text-white hover:bg-success/90" : "border-success/40 text-success hover:bg-success/10 hover:text-success")}
    >
      <a href={`/checkout/${checkout}`} target="_blank" rel="noopener noreferrer">
        <CreditCard className="mr-2 h-4 w-4" /> Pagar
      </a>
    </Button>
  );
}
type Tipo = { id: string; nome: string };

const muted = "text-[rgba(84,5,45,0.5)] dark:text-muted-foreground";
const strong = "text-[#54052D] dark:text-white";
const pre = "whitespace-pre-wrap break-words rounded-xl border border-border bg-[#FBFBFC] p-4 font-mono text-sm leading-6 text-[#1F1F24] dark:bg-[#151822] dark:text-white";

function CopyButton({ text, primary }: { text: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copiar() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Teste copiado!");
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button
      onClick={copiar}
      variant={primary ? "default" : "outline"}
      size={primary ? "default" : "sm"}
      className={cn("rounded-xl font-bold", primary ? "bg-[#9B5BF8] text-white hover:bg-[#884BE0]" : "border-[#9B5BF8]/30 text-[#9B5BF8] hover:bg-[#9B5BF8]/10 hover:text-[#9B5BF8]")}
    >
      {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
      {copied ? "Copiado" : "Copiar"}
    </Button>
  );
}

const quando = (ms: number) => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function TestePage() {
  const [meus, setMeus] = useState<Teste[]>([]);
  const [novo, setNovo] = useState<Teste | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // id do tipo sendo gerado
  const [tipos, setTipos] = useState<Tipo[]>([]);

  useEffect(() => {
    const carregar = () =>
      api<Teste[]>("/tests/mine")
        .then((l) => { setMeus(l); setNovo((n) => (n && l.find((x) => x.id === n.id)) || n); })
        .catch(() => {});
    carregar();
    api<Tipo[]>("/tests/tipos").then(setTipos).catch(() => {});
    const t = setInterval(carregar, 15_000); // vira "Pago" sozinho quando o PIX cai
    return () => clearInterval(t);
  }, []);

  async function gerar(tipo: string) {
    setLoading(tipo);
    try {
      const t = await api<Teste>("/tests/generate", "POST", { tipo });
      setNovo(t);
      setMeus((m) => [t, ...m]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  const botoes = (compacto?: boolean) =>
    tipos.map((t) => (
      <Button
        key={t.id}
        onClick={() => gerar(t.id)}
        disabled={!!loading}
        variant={compacto ? "outline" : "default"}
        className={cn(
          "rounded-xl font-bold",
          compacto
            ? "border-[#9B5BF8]/30 text-[#9B5BF8] hover:bg-[#9B5BF8]/10 hover:text-[#9B5BF8]"
            : "h-12 w-full px-8 text-base text-white shadow-[0_0_20px_rgba(155,91,248,0.35)] bg-[#9B5BF8] hover:bg-[#884BE0] sm:w-auto",
        )}
      >
        {loading === t.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {compacto ? `Outro ${t.nome}` : `Gerar teste ${t.nome}`}
      </Button>
    ));

  const anteriores = meus.filter((t) => t.id !== novo?.id);

  return (
    <div className="max-w-3xl space-y-8">
      <div className="dark-card rounded-2xl border border-border/30 p-4 shadow-sm sm:p-8">
        {novo ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success">
                <Check size={14} /> Teste gerado
              </span>
              <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                <PagarButton checkout={novo.checkout} pagoEm={novo.pago_em} liberacao={novo.liberacao} primary />
                <CopyButton text={novo.content} primary />
                {botoes(true)}
              </div>
            </div>
            <pre className={cn(pre, "max-h-[60vh] overflow-auto sm:p-5")}>{semLink(novo.content)}</pre>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 py-10 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#9B5BF8]/15">
              <Sparkles className="h-8 w-8 text-[#9B5BF8]" />
            </span>
            <p className={cn("max-w-sm", muted)}>Escolha o tipo de teste. Pode levar alguns segundos.</p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">{botoes()}</div>
          </div>
        )}
      </div>

      {anteriores.length > 0 && (
        <div className="space-y-3">
          <p className={cn("font-semibold", strong)}>Meus testes gerados</p>
          {anteriores.map((t) => (
            <div key={t.id} className="dark-card space-y-3 rounded-2xl border border-border/30 p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <span className={cn("text-xs", muted)}>{quando(t.used_at)}</span>
                <div className="flex gap-2">
                  <PagarButton checkout={t.checkout} pagoEm={t.pago_em} liberacao={t.liberacao} />
                  <CopyButton text={t.content} />
                </div>
              </div>
              <pre className={pre}>{semLink(t.content)}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
