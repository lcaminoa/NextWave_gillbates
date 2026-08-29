import { LandingHero } from "./landing-hero";
import { LandingSections } from "./landing-sections";

export function LandingPage() {
  return (
    <div className="landing-page">
      <LandingHero />
      <LandingSections />
    </div>
  );
}
