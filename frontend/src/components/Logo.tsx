import { Tv } from "lucide-react";

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#9B5BF8] shadow-[0_0_18px_rgba(155,91,248,0.35)]">
        <Tv className="h-5 w-5 text-white" />
      </span>
      <span className={`text-xl font-bold ${light ? "text-white" : "text-[#1F1F24] dark:text-white"}`}>
        Painel<span className="text-[#9B5BF8]">TV</span>
      </span>
    </div>
  );
}
