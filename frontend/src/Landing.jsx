import { useEffect } from "react";
import { LandingHeader } from "./components/LandingHeader";
import { NetworkHero } from "./components/NetworkHero";
import { Stats } from "./components/Hero";
import { WhyThicket, Capabilities } from "./components/Features";
import { HowItWorks } from "./components/HowItWorks";
import { Roadmap } from "./components/Roadmap";
import { Participate } from "./components/Participate";
import { Footer } from "./components/Footer";

// Marketing landing page. No wallet — everything interactive lives in the portal (/app).
export default function Landing() {
  useEffect(() => { document.documentElement.setAttribute("data-theme", "light"); }, []);
  return (
    <>
      <LandingHeader />
      <NetworkHero />
      <Stats />
      <WhyThicket />
      <HowItWorks />
      <Capabilities />
      <Roadmap />
      <Participate />
      <Footer />
    </>
  );
}
