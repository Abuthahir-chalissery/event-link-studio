import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Camera, Lock, Share2, Sparkles, Zap } from "lucide-react";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen">
      <AppHeader />

      {/* Hero */}
      <section className="relative bg-hero grain overflow-hidden">
        <div className="container relative py-28 md:py-40 text-center">
          <p className="text-xs md:text-sm tracking-[0.3em] uppercase text-primary mb-6 animate-fade-up">
            Photo & Video delivery
          </p>
          <h1
            className="font-display text-6xl md:text-8xl leading-[1.05] tracking-tight max-w-4xl mx-auto animate-fade-up"
            style={{ animationDelay: "80ms" }}
          >
            Cinematic galleries,{" "}
            <span className="italic text-gradient-gold">delivered beautifully.</span>
          </h1>
          <p
            className="mt-6 text-base md:text-lg text-muted-foreground max-w-xl mx-auto animate-fade-up"
            style={{ animationDelay: "160ms" }}
          >
            Lumen is the premium delivery platform for photographers. Upload an event, share
            one elegant link, and let your work speak for itself.
          </p>
          <div
            className="mt-10 flex items-center justify-center gap-3 animate-fade-up"
            style={{ animationDelay: "240ms" }}
          >
            <Link to="/auth?mode=signup">
              <Button size="lg" className="h-12 px-7 gap-2">
                Start free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="ghost" className="h-12 px-7">
                Sign in
              </Button>
            </Link>
          </div>
        </div>

        {/* decorative bottom fade */}
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-b from-transparent to-background pointer-events-none" />
      </section>

      {/* Features */}
      <section className="container py-24">
        <div className="text-center mb-16">
          <p className="text-sm tracking-widest uppercase text-primary mb-3">Built for craft</p>
          <h2 className="font-display text-4xl md:text-5xl">A delivery experience your clients will remember.</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Camera,
              title: "Event-based galleries",
              body: "One event, one link. Perfect for weddings, portraits, and editorials.",
            },
            {
              icon: Lock,
              title: "Optional password gate",
              body: "Keep galleries private with a single password — no client accounts needed.",
            },
            {
              icon: Share2,
              title: "Beautiful share links",
              body: "Send a single elegant URL. Opens instantly on any device, no app required.",
            },
            {
              icon: Zap,
              title: "Built for speed",
              body: "Lazy loading, low-quality previews, and CDN delivery — even on huge galleries.",
            },
            {
              icon: Sparkles,
              title: "Client favorites",
              body: "Clients can mark favorites — perfect for selections and album builds.",
            },
            {
              icon: ArrowRight,
              title: "Bulk download",
              body: "One-click ZIP of full-resolution photos — favorites or the entire set.",
            },
          ].map((f, i) => (
            <div
              key={f.title}
              className="bg-card border border-border rounded-lg p-6 hover:border-primary/40 transition-colors animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <f.icon className="h-5 w-5 text-primary mb-4" />
              <h3 className="font-display text-2xl mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-hero relative grain">
        <div className="container py-24 text-center">
          <h2 className="font-display text-5xl md:text-6xl mb-4">
            Your next gallery is <span className="italic text-gradient-gold">one click away.</span>
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Free to start. No credit card. Set up your studio in under a minute.
          </p>
          <Link to="/auth?mode=signup">
            <Button size="lg" className="h-12 px-8 gap-2">
              Create your studio <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Lumen — crafted for photographers.
      </footer>
    </div>
  );
};

export default Index;
