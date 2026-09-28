import { api } from "@/api";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { applyTheme } from "@/theme";
import { Check, CheckCircle2, Copy, Loader2, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

type Plano = { id: string; nome: string; valor: number };
type Pag = { id: number; plano: string; valor: number; status: string; qr: string | null; qr64: string | null; expira: number; liberacao?: string };
type Info = { usuario: string | null; adultos: boolean; planos: Plano[]; pagamento: Pag | null };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const card = "rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm sm:p-6";
const muted = "text-sm text-[#8C8C96]";

export function CheckoutPage() {
  const { code = "" } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState("");
  const [plano, setPlano] = useState("");
  const [email, setEmail] = useState("");
  const [pag, setPag] = useState<Pag | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // página pública, sempre clara
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    return () => applyTheme();
  }, []);

  useEffect(() => {
    api<Info>(`/checkout/${code}`)
      .then((i) => {
        setInfo(i);
        setPlano(i.pagamento?.plano ?? i.planos[0]?.id ?? "");
        const p = i.pagamento;
        if (p && (p.status === "approved" || (p.status === "pending" && p.expira > Date.now()))) setPag(p);
      })
      .catch((e) => setErro(e.message));
  }, [code]);

  // PIX pendente: confere a cada 5s. Pago e aguardando liberação: confere a cada 15s.
  useEffect(() => {
    const aguardando = pag?.status === "approved" && pag.liberacao !== "liberado";
    if (pag?.status !== "pending" && !aguardando) return;
    if (aguardando) {
      const t = setInterval(() => api<Info>(`/checkout/${code}`).then((i) => i.pagamento && setPag(i.pagamento)).catch(() => {}), 15000);
      return () => clearInterval(t);
    }
    const t = setInterval(() => {
      api<Pag>(`/checkout/${code}/status`).then((p) => p && setPag(p)).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [code, pag?.status, pag?.liberacao]);

  async function gerarPix(e: React.FormEvent) {
    e.preventDefault();
    setGerando(true);
    try {
      setPag(await api<Pag>(`/checkout/${code}/pix`, "POST", { plano, email }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGerando(false);
    }
  }

  async function copiar() {
    await navigator.clipboard.writeText(pag?.qr ?? "");
    setCopiado(true);
    toast.success("Código PIX copiado!");
    setTimeout(() => setCopiado(false), 2000);
  }

  const nomePlano = (id: string) => info?.planos.find((p) => p.id === id)?.nome ?? id;

  return (
    <div className="min-h-screen bg-[#F7F7FA] px-4 py-8 text-[#1F1F24] sm:py-12">
      <div className="mx-auto w-full max-w-[480px] space-y-5 animate-fade-in">
        <div className="flex justify-center"><Logo /></div>

        {erro && <div className={cn(card, "text-center")}>{erro}</div>}
        {!info && !erro && (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#9B5BF8]" /></div>
        )}

        {info && pag?.status === "approved" && (
          <div className={cn(card, "flex flex-col items-center gap-3 py-10 text-center")}>
            <CheckCircle2 className="h-14 w-14 text-success" />
            <h1 className="text-xl font-bold">Pagamento aprovado!</h1>
            <p className={muted}>
              Plano <b className="text-[#1F1F24]">{nomePlano(pag.plano)}</b> · {brl(pag.valor)}
              {info.usuario && <> · usuário <b className="text-[#1F1F24]">{info.usuario}</b></>}
            </p>
            {pag.liberacao === "liberado" ? (
              <p className="rounded-full bg-success/15 px-4 py-1.5 text-sm font-semibold text-success">✓ Servidor liberado — aproveite!</p>
            ) : (
              <p className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-4 py-1.5 text-sm font-semibold text-amber-600" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> Aguardando liberação do servidor
              </p>
            )}
          </div>
        )}

        {info && pag?.status === "pending" && (
          <div className={cn(card, "space-y-5")}>
            <div className="text-center">
              <h1 className="text-lg font-bold">Pague com PIX</h1>
              <p className={muted}>{nomePlano(pag.plano)} · <b className="text-[#1F1F24]">{brl(pag.valor)}</b></p>
            </div>
            {pag.qr64 && (
              <img src={`data:image/png;base64,${pag.qr64}`} alt="QR Code PIX" className="mx-auto aspect-square w-full max-w-[260px] rounded-xl border border-[#E5E7EB]" />
            )}
            <div className="space-y-2">
              <p className="text-sm font-semibold">PIX copia e cola</p>
              <p className="break-all rounded-xl border border-[#E5E7EB] bg-[#FBFBFC] p-3 font-mono text-xs leading-5">{pag.qr}</p>
              <Button onClick={copiar} className="h-12 w-full rounded-xl bg-[#9B5BF8] font-bold text-white hover:bg-[#884BE0]">
                {copiado ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copiado ? "Copiado" : "Copiar código"}
              </Button>
            </div>
            <p className={cn(muted, "flex items-center justify-center gap-2")} role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> Aguardando pagamento… a confirmação é automática
            </p>
            <button onClick={() => setPag(null)} className="w-full text-center text-sm text-[#9B5BF8] hover:underline">Trocar plano</button>
          </div>
        )}

        {info && !pag && (
          <form onSubmit={gerarPix} className={cn(card, "space-y-5")}>
            <div>
              <h1 className="text-lg font-bold">Assinar plano</h1>
              {info.usuario && <p className={muted}>Usuário do teste: <b className="text-[#1F1F24]">{info.usuario}</b></p>}
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">Escolha o plano</legend>
              {info.planos.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-colors",
                    plano === p.id ? "border-[#9B5BF8] bg-[#9B5BF8]/5" : "border-[#E5E7EB] hover:border-[#9B5BF8]/50",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <input type="radio" name="plano" value={p.id} checked={plano === p.id} onChange={() => setPlano(p.id)} className="accent-[#9B5BF8]" />
                    <span className="font-semibold">{p.nome} {info.adultos ? "com adultos" : "sem adultos"}</span>
                  </span>
                  <span className="font-bold text-[#9B5BF8]">{brl(p.valor)}</span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-semibold">Seu e-mail</label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="h-12 rounded-xl border-[#E5E7EB] bg-[#FBFBFC] px-4 text-[#1F1F24] focus-visible:ring-[#9B5BF8]"
              />
            </div>

            <Button type="submit" disabled={gerando || !plano} className="h-12 w-full rounded-xl bg-[#9B5BF8] text-base font-bold text-white hover:bg-[#884BE0]">
              {gerando ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <QrCode className="mr-2 h-5 w-5" />}
              Gerar PIX
            </Button>
            <p className={cn(muted, "text-center text-xs")}>Pagamento processado pelo Mercado Pago</p>
          </form>
        )}
      </div>
    </div>
  );
}
