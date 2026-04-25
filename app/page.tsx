import { Header } from "@/components/header";
import { SwapCard } from "@/features/swap/components/swapCard";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,#312e81_0%,#09090b_45%)] px-4">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center py-8 md:py-12">
          <SwapCard />
        </div>
      </main>
    </div>
  );
}
