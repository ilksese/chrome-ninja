import { SplashCursor } from "@/components/reactbits/splash-cursor"
import { Nav } from "@/sections/nav"
import { Hero } from "@/sections/hero"
import { Features, FeaturesMarquee } from "@/sections/features"
import { Install } from "@/sections/install"
import { Footer } from "@/sections/footer"

export function App() {
  return (
    <div className="relative min-h-screen">
      <SplashCursor />
      <Nav />
      <main className="relative">
        <Hero />
        <FeaturesMarquee />
        <Features />
        <Install />
      </main>
      <Footer />
    </div>
  )
}
