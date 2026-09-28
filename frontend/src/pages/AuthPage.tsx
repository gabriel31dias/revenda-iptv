import { api, saveSession } from "@/api";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { applyTheme } from "@/theme";

const inputCls =
  "h-12 rounded-xl border-[#E5E7EB] bg-[#FBFBFC] px-4 text-sm font-medium text-[#1F1F24] placeholder:text-[#8C8C96] focus-visible:ring-[#9B5BF8]";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isLogin = mode === "login";
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // tela de login é clara, como na loja
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    return () => applyTheme();
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const s = await api(isLogin ? "/login" : "/register", "POST", form);
      saveSession(s);
      navigate(s.user.role === "admin" ? "/dashboard" : "/teste");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-[#1F1F24] lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
      <div className="relative hidden min-h-screen overflow-hidden lg:block">
        <img src="/login-wallpaper-black.png" alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(16,12,28,0.2)_0%,rgba(16,12,28,0)_54%,rgba(16,12,28,0.22)_100%)]" />
        <div className="absolute left-12 top-10"><Logo light /></div>
        <div className="absolute bottom-12 left-12 max-w-[520px]">
          <h1 className="text-5xl font-bold leading-tight text-white">Seu painel de TV</h1>
          <p className="mt-5 max-w-[440px] text-base font-medium leading-7 text-white/70">
            Gere testes na hora e copie os dados de acesso com um clique.
          </p>
        </div>
      </div>

      <div className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[460px] animate-fade-in">
          <div className="mb-10 lg:hidden"><Logo /></div>
          <div className="mb-9">
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{isLogin ? "Faça login" : "Criar conta"}</h1>
            <p className="mt-3 text-sm font-medium leading-6 text-[#73737D]">
              {isLogin ? "Acesse sua conta para continuar." : "Cadastre-se para gerar seus testes."}
            </p>
          </div>

          <form
            onSubmit={submit}
            className="space-y-6 rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_18px_60px_rgba(31,31,36,0.08)] sm:p-8"
          >
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-semibold">Nome</Label>
                <Input id="name" required placeholder="Seu nome" className={inputCls} value={form.name} onChange={set("name")} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">E-mail</Label>
              <Input id="email" type="email" required placeholder="exemplo@gmail.com" className={inputCls} value={form.email} onChange={set("email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  required
                  minLength={6}
                  placeholder="Digite sua senha"
                  className={inputCls + " pr-12"}
                  value={form.password}
                  onChange={set("password")}
                />
                <button
                  type="button"
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShow(!show)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9B5BF8] hover:text-[#884BE0]"
                >
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                <p className="text-center text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[#9B5BF8] text-base font-bold text-white shadow-sm shadow-[#9B5BF8]/25 hover:bg-[#884BE0]"
            >
              {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Aguarde...</> : isLogin ? "Entrar" : "Cadastrar"}
            </Button>

            <p className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-[#73737D]">
              {isLogin ? "Não tem uma conta?" : "Já tem uma conta?"}
              <Link to={isLogin ? "/cadastro" : "/login"} className="font-semibold text-[#9B5BF8] underline hover:text-[#884BE0]">
                {isLogin ? "Criar conta" : "Entrar"}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
