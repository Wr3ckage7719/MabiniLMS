import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Download, Smartphone, Zap } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export default function LandingPage() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const { isInstallable, isInstalled, install } = usePWAInstall();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="w-full bg-background text-foreground overflow-hidden">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${isScrolled ? "bg-background/80 backdrop-blur-xl border-b border-border/40" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 cursor-pointer">
            <AppLogo className="h-8 w-8" />
            <span className="font-bold text-xl bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Mabini Classroom
            </span>
          </button>
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate("/login")}>Sign In</Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-accent/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }}></div>
        </div>

        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8 animate-fade-in">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold">
                <Zap className="w-4 h-4" />
                Modern classroom management
              </div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight">
                Where Learning <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">Comes Alive</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl">
                A next-generation classroom platform that makes teaching elegant and learning effortless. Beautiful, fast, and built for how education works today.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={() => navigate("/login")} size="lg" className="bg-gradient-to-r from-primary to-accent hover:opacity-90 h-12 text-base">
                Start for Free <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>


          </div>

          {/* Right - Hero Visual */}
          <div className="relative h-96 sm:h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl blur-3xl transform -rotate-12"></div>
            <div className="relative bg-gradient-to-br from-primary/5 to-accent/5 rounded-3xl border border-primary/20 p-8 backdrop-blur-sm overflow-hidden group">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary/10 to-transparent rounded-3xl animate-pulse"></div>
              </div>
              <div className="relative space-y-4">
                {/* Classroom interface preview */}
                <div className="bg-card rounded-xl p-4 border border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-3 bg-primary/40 rounded w-32"></div>
                    <div className="flex gap-2">
                      <div className="w-2 h-2 rounded-full bg-success"></div>
                      <div className="w-2 h-2 rounded-full bg-success/60"></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-2 bg-muted rounded w-full"></div>
                    <div className="h-2 bg-muted rounded w-5/6"></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-card rounded-xl p-3 border border-border/40 space-y-2">
                    <div className="w-8 h-8 bg-primary/60 rounded-lg"></div>
                    <div className="h-2 bg-muted rounded w-3/4"></div>
                  </div>
                  <div className="bg-card rounded-xl p-3 border border-border/40 space-y-2">
                    <div className="w-8 h-8 bg-accent/60 rounded-lg"></div>
                    <div className="h-2 bg-muted rounded w-2/3"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PWA Download Section */}
      <section className="relative px-4 sm:px-6 lg:px-8 pb-20">
        <div className="absolute inset-x-0 -top-20 h-40 bg-gradient-to-b from-primary/10 to-transparent blur-2xl pointer-events-none"></div>

        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center rounded-3xl border border-primary/20 bg-gradient-to-br from-slate-950/80 via-slate-900/70 to-sky-950/60 p-6 sm:p-8 lg:p-10 overflow-hidden">
          <div className="absolute -right-16 -bottom-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl pointer-events-none"></div>
          <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-accent/20 blur-2xl pointer-events-none"></div>

          <div className="relative space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 text-primary px-3 py-1.5 text-sm font-semibold">
              <Smartphone className="h-4 w-4" />
              Download the mobile app
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              Bring Mabini Classroom
              <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">to your home screen</span>
            </h2>

            <p className="text-sm sm:text-base text-slate-200/85 max-w-xl">
              Install the PWA to open Mabini Classroom like a real app, receive faster updates,
              and keep learning tools one tap away. Students can check classes quickly,
              while teachers can post updates and track classroom activity on the go.
            </p>

            <div className="space-y-2 text-sm text-slate-200/90">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" />
                <span>Quick launch from your phone home screen with an app-like experience.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" />
                <span>Optimized for mobile browsing so classes, tasks, and grades stay easy to read.</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
              <Button
                size="lg"
                onClick={() => {
                  void install();
                }}
                disabled={!isInstallable || isInstalled}
                className="h-11 gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90 disabled:opacity-70"
              >
                <Download className="h-4 w-4" />
                {isInstalled ? "App Installed" : isInstallable ? "Download PWA App" : "Install option unavailable"}
              </Button>
              <p className="text-xs text-slate-300/90">
                {!isInstallable && !isInstalled
                  ? "Tip: open this page in Chrome or Edge on mobile/desktop and tap Install in your browser menu."
                  : "Installation only takes a few seconds."}
              </p>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="relative w-[240px] sm:w-[280px] rounded-[2rem] border border-white/20 bg-slate-950/80 p-3 shadow-2xl shadow-primary/20 animate-pulse">
              <div className="rounded-[1.5rem] border border-primary/30 bg-slate-900/95 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-2.5 w-20 rounded-full bg-primary/50"></div>
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                    <span className="h-2 w-2 rounded-full bg-sky-400"></span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-slate-700/80"></div>
                  <div className="h-2 rounded-full bg-slate-700/70 w-5/6"></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-primary/25 bg-primary/10 p-2.5 space-y-2">
                    <div className="h-6 w-6 rounded-lg bg-primary/60"></div>
                    <div className="h-1.5 rounded-full bg-slate-600"></div>
                  </div>
                  <div className="rounded-xl border border-accent/25 bg-accent/10 p-2.5 space-y-2">
                    <div className="h-6 w-6 rounded-lg bg-accent/60"></div>
                    <div className="h-1.5 rounded-full bg-slate-600"></div>
                  </div>
                </div>
              </div>
              <div className="pointer-events-none absolute -top-3 -right-3 h-6 w-6 rounded-full bg-primary/50 blur-sm animate-ping"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative overflow-hidden border-t border-border/30 py-12 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0" aria-hidden="true">
          <img
            src="/backgroundlms.jpg"
            alt=""
            className="h-full w-full object-cover object-center sm:object-[center_35%]"
          />
          <div className="absolute inset-0 bg-slate-950/72"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/70 to-emerald-950/60"></div>
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="mb-8 max-w-2xl space-y-3 rounded-xl border border-white/15 bg-black/20 px-5 py-4 text-sm text-slate-100/90 backdrop-blur-[2px]">
            <h2 className="text-base font-semibold text-white">Contact us</h2>
            <p>
              <span className="font-medium text-white">Phone:</span>{" "}
              <a href="tel:+639480205567" className="text-slate-100 hover:text-white transition-colors">+6394 8020 5567</a>
            </p>
            <p>
              <span className="font-medium text-white">Email:</span>{" "}
              <a href="mailto:balonniccolo@gmail.com" className="text-slate-100 hover:text-white transition-colors">balonniccolo@gmail.com</a>
            </p>
            <p>
              <span className="font-medium text-white">Address:</span>{" "}
              Vinzons, Camarines Norte
            </p>
            <p>
              <span className="font-medium text-white">Bug reports:</span>{" "}
              <a
                href="mailto:balonniccolo@gmail.com?subject=Mabini%20Classroom%20Bug%20Report&body=Name%3A%0AUser%20Role%3A%0ABrowser%2FDevice%3A%0APage%20URL%3A%0ASteps%20to%20reproduce%3A%0AExpected%20result%3A%0AActual%20result%3A%0AScreenshot%20or%20screen%20recording%3A"
                className="text-primary hover:text-accent transition-colors underline underline-offset-4"
              >
                Report a bug to the admin
              </a>
            </p>
          </div>

          <div className="border-t border-white/20 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-slate-200/90">
          <p>&copy; {new Date().getFullYear()} Mabini Classroom. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Cookies</a>
              <a
                href="mailto:balonniccolo@gmail.com?subject=Mabini%20Classroom%20Bug%20Report"
                className="hover:text-primary transition-colors"
              >
                Report Bug
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

const stats = [
  { value: "50K+", label: "Active Teachers" },
  { value: "500K+", label: "Learning Students" },
  { value: "10M+", label: "Assignments Submitted" },
  { value: "99.9%", label: "Uptime SLA" }
];
