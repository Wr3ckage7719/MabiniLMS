import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  Zap,
} from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useToast } from "@/hooks/use-toast";
import { bugReportsService } from "@/services/bug-reports.service";

type DeviceShowcaseType = "phone" | "tablet" | "desktop";

const deviceShowcaseSlides: Array<{
  id: DeviceShowcaseType;
  label: string;
  description: string;
}> = [
  {
    id: "phone",
    label: "Phone View",
    description: "Check classes, announcements, and deadlines in a pocket-first layout.",
  },
  {
    id: "tablet",
    label: "Tablet View",
    description: "Split workspace for reading lessons while monitoring class activity.",
  },
  {
    id: "desktop",
    label: "Desktop View",
    description: "Full dashboard with wider controls for teachers and admins.",
  },
];

const deviceIconMap = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
} as const;

const getSlideAccentClass = (device: DeviceShowcaseType): string => {
  switch (device) {
    case "phone":
      return "from-sky-500/25 via-sky-400/10 to-transparent border-sky-400/30";
    case "tablet":
      return "from-indigo-500/25 via-blue-400/10 to-transparent border-indigo-400/30";
    case "desktop":
      return "from-emerald-500/25 via-teal-400/10 to-transparent border-emerald-400/30";
    default:
      return "from-primary/20 via-primary/5 to-transparent border-primary/30";
  }
};

const renderDevicePreview = (device: DeviceShowcaseType) => {
  if (device === "phone") {
    return (
      <div className="h-[196px] w-[108px] rounded-[1.4rem] border border-slate-600/70 bg-slate-900 p-2.5 shadow-lg shadow-black/30">
        <div className="h-full rounded-[1rem] border border-slate-700/80 bg-slate-950/80 p-2.5 space-y-2.5">
          <div className="h-2 w-12 rounded-full bg-sky-400/70"></div>
          <div className="space-y-1.5">
            <div className="h-1.5 rounded-full bg-slate-700"></div>
            <div className="h-1.5 w-4/5 rounded-full bg-slate-700/80"></div>
          </div>
          <div className="space-y-2.5 pt-1">
            <div className="rounded-lg border border-slate-700/80 bg-slate-800/80 p-2">
              <div className="h-1.5 w-8 rounded-full bg-sky-300/80"></div>
            </div>
            <div className="rounded-lg border border-slate-700/80 bg-slate-800/80 p-2">
              <div className="h-1.5 w-10 rounded-full bg-slate-500"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (device === "tablet") {
    return (
      <div className="h-[192px] w-[238px] rounded-[1.6rem] border border-slate-600/70 bg-slate-900 p-3 shadow-lg shadow-black/30">
        <div className="h-full rounded-[1.2rem] border border-slate-700/80 bg-slate-950/80 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-2.5 w-16 rounded-full bg-indigo-400/70"></div>
            <div className="h-2.5 w-8 rounded-full bg-slate-700"></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-2.5 space-y-1.5">
              <div className="h-6 w-6 rounded-lg bg-indigo-400/70"></div>
              <div className="h-1.5 rounded-full bg-slate-600"></div>
            </div>
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-2.5 space-y-1.5">
              <div className="h-6 w-6 rounded-lg bg-blue-300/70"></div>
              <div className="h-1.5 rounded-full bg-slate-600"></div>
            </div>
          </div>
          <div className="h-1.5 w-3/4 rounded-full bg-slate-700"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[188px] w-[262px] rounded-[1.1rem] border border-slate-600/70 bg-slate-900 p-2.5 shadow-lg shadow-black/30">
      <div className="h-full rounded-[0.8rem] border border-slate-700/80 bg-slate-950/80 overflow-hidden">
        <div className="h-full grid grid-cols-[60px_1fr]">
          <div className="border-r border-slate-700/70 bg-slate-900/80 p-2 space-y-2">
            <div className="h-2 w-8 rounded-full bg-emerald-400/70"></div>
            <div className="h-1.5 w-7 rounded-full bg-slate-600"></div>
            <div className="h-1.5 w-9 rounded-full bg-slate-600"></div>
            <div className="h-1.5 w-6 rounded-full bg-slate-600"></div>
          </div>
          <div className="p-3 space-y-2.5">
            <div className="h-2.5 w-20 rounded-full bg-emerald-300/70"></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-16 rounded-lg border border-slate-700/70 bg-slate-800/80"></div>
              <div className="h-16 rounded-lg border border-slate-700/70 bg-slate-800/80"></div>
            </div>
            <div className="h-2 w-4/5 rounded-full bg-slate-700"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function LandingPage() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const { toast } = useToast();
  const [isBugDialogOpen, setIsBugDialogOpen] = useState(false);
  const [isSubmittingBugReport, setIsSubmittingBugReport] = useState(false);
  const [activeDeviceSlide, setActiveDeviceSlide] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const [bugReportForm, setBugReportForm] = useState({
    reporter_name: "",
    reporter_email: "",
    reporter_role: "guest",
    title: "",
    description: "",
    steps_to_reproduce: "",
    expected_result: "",
    actual_result: "",
    severity: "medium",
  });

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isCarouselPaused) {
      return;
    }

    const rotateTimer = window.setInterval(() => {
      setActiveDeviceSlide((previous) => (previous + 1) % deviceShowcaseSlides.length);
    }, 3600);

    return () => window.clearInterval(rotateTimer);
  }, [isCarouselPaused]);

  const goToSlide = (index: number) => {
    setActiveDeviceSlide(index);
  };

  const goToPreviousSlide = () => {
    setActiveDeviceSlide((previous) =>
      previous === 0 ? deviceShowcaseSlides.length - 1 : previous - 1
    );
  };

  const goToNextSlide = () => {
    setActiveDeviceSlide((previous) => (previous + 1) % deviceShowcaseSlides.length);
  };

  const updateBugReportField = (field: keyof typeof bugReportForm, value: string) => {
    setBugReportForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const resetBugReportForm = () => {
    setBugReportForm({
      reporter_name: "",
      reporter_email: "",
      reporter_role: "guest",
      title: "",
      description: "",
      steps_to_reproduce: "",
      expected_result: "",
      actual_result: "",
      severity: "medium",
    });
  };

  const handleSubmitBugReport = async () => {
    const requiredFields = [
      bugReportForm.reporter_name.trim(),
      bugReportForm.reporter_email.trim(),
      bugReportForm.title.trim(),
      bugReportForm.description.trim(),
    ];

    if (requiredFields.some((value) => value.length === 0)) {
      toast({
        title: "Missing required fields",
        description: "Please provide your name, email, bug title, and description.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingBugReport(true);

    try {
      await bugReportsService.submit({
        reporter_name: bugReportForm.reporter_name.trim(),
        reporter_email: bugReportForm.reporter_email.trim(),
        reporter_role: bugReportForm.reporter_role as "student" | "teacher" | "admin" | "parent" | "guest" | "other",
        title: bugReportForm.title.trim(),
        description: bugReportForm.description.trim(),
        steps_to_reproduce: bugReportForm.steps_to_reproduce.trim() || undefined,
        expected_result: bugReportForm.expected_result.trim() || undefined,
        actual_result: bugReportForm.actual_result.trim() || undefined,
        page_url: typeof window !== "undefined" ? window.location.href : "https://mabinilms.vercel.app",
        browser_info: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        severity: bugReportForm.severity as "low" | "medium" | "high" | "critical",
      });

      toast({
        title: "Bug report sent",
        description: "Thank you. The admin can now review your report in the dashboard.",
      });

      resetBugReportForm();
      setIsBugDialogOpen(false);
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        "Failed to submit bug report. Please try again.";

      toast({
        title: "Submission failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmittingBugReport(false);
    }
  };

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

          <div className="relative space-y-5 order-2 lg:order-1">
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

          <div className="relative flex justify-center lg:justify-end order-1 lg:order-2">
            <div
              className="relative w-full max-w-[320px] sm:max-w-[360px]"
              onMouseEnter={() => setIsCarouselPaused(true)}
              onMouseLeave={() => setIsCarouselPaused(false)}
              onFocusCapture={() => setIsCarouselPaused(true)}
              onBlurCapture={() => setIsCarouselPaused(false)}
            >
              <div className="relative h-[340px] sm:h-[380px] overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border border-white/20 bg-slate-950/80 p-2.5 sm:p-3 shadow-2xl shadow-primary/20">
                <div className="absolute inset-x-8 top-0 h-20 bg-primary/20 blur-2xl pointer-events-none"></div>

                {deviceShowcaseSlides.map((slide, index) => {
                  const isActive = index === activeDeviceSlide;
                  const DeviceIcon = deviceIconMap[slide.id];

                  return (
                    <article
                      key={slide.id}
                      aria-hidden={!isActive}
                      className={`absolute inset-2.5 sm:inset-3 rounded-[1.2rem] sm:rounded-[1.5rem] border bg-gradient-to-br p-3 sm:p-4 transition-all duration-700 ease-out ${getSlideAccentClass(slide.id)} ${
                        isActive
                          ? "opacity-100 translate-y-0 scale-100"
                          : "pointer-events-none opacity-0 translate-y-4 scale-95"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-100">
                          <DeviceIcon className="h-3.5 w-3.5" />
                          {slide.label}
                        </div>
                        <span className="text-[11px] text-slate-200/85">{index + 1} / {deviceShowcaseSlides.length}</span>
                      </div>

                      <p className="mt-2.5 text-[11px] sm:text-xs text-slate-200/90 leading-relaxed">{slide.description}</p>

                      <div className="mt-3 sm:mt-4 h-[205px] sm:h-[245px] rounded-2xl border border-white/15 bg-slate-900/80 p-2.5 sm:p-4 flex items-center justify-center overflow-hidden">
                        <div className="origin-center scale-[0.86] sm:scale-100 transition-transform duration-500">
                          {renderDevicePreview(slide.id)}
                        </div>
                      </div>
                    </article>
                  );
                })}

                <div className="absolute inset-x-3 sm:inset-x-4 bottom-3 sm:bottom-4 z-20 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2 py-1 backdrop-blur-sm">
                    {deviceShowcaseSlides.map((slide, index) => (
                      <button
                        key={slide.id}
                        type="button"
                        aria-label={`Show ${slide.label}`}
                        onClick={() => goToSlide(index)}
                        className={`h-2.5 rounded-full transition-all duration-300 ${
                          index === activeDeviceSlide
                            ? "w-6 bg-white"
                            : "w-2.5 bg-white/40 hover:bg-white/70"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="inline-flex items-center gap-1 rounded-full bg-black/35 p-1 backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={goToPreviousSlide}
                      aria-label="Previous device view"
                      className="h-8 w-8 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4 mx-auto" />
                    </button>
                    <button
                      type="button"
                      onClick={goToNextSlide}
                      aria-label="Next device view"
                      className="h-8 w-8 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4 mx-auto" />
                    </button>
                  </div>
                </div>
              </div>
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
          <div className="mb-8 max-w-2xl space-y-4 rounded-xl border border-white/15 bg-black/20 px-5 py-4 text-sm text-slate-100/90 backdrop-blur-[2px]">
            <h2 className="text-base font-semibold text-white">Contact us</h2>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-300/90">Current support contact</p>
              <p>
                <span className="font-medium text-white">Phone:</span>{" "}
                <a href="tel:+639394920476" className="text-slate-100 hover:text-white transition-colors">+63 939 492 0476</a>
              </p>
              <p>
                <span className="font-medium text-white">Email:</span>{" "}
                <a href="mailto:MarkAngloImportante@mabini.edu.ph" className="text-slate-100 hover:text-white transition-colors">MarkAngloImportante@mabini.edu.ph</a>
              </p>
              <p>
                <span className="font-medium text-white">Address:</span>{" "}
                Purok-9, Brgy. Alawihao, Daet, Camarines Norte, Philippines
              </p>
            </div>

            <div className="border-t border-white/20 pt-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-300/90">Additional admin contact</p>
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
            </div>

            <p>
              <span className="font-medium text-white">Bug reports:</span>{" "}
              <button
                type="button"
                onClick={() => setIsBugDialogOpen(true)}
                className="text-primary hover:text-accent transition-colors underline underline-offset-4"
              >
                Report a bug to the admin
              </button>
            </p>
          </div>

          <div className="border-t border-white/20 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-slate-200/90">
          <p>&copy; {new Date().getFullYear()} Mabini Classroom. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Cookies</a>
              <button
                type="button"
                onClick={() => setIsBugDialogOpen(true)}
                className="hover:text-primary transition-colors"
              >
                Report Bug
              </button>
            </div>
          </div>
        </div>
      </footer>

      <Dialog open={isBugDialogOpen} onOpenChange={setIsBugDialogOpen}>
        <DialogContent className="sm:max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Report a bug</DialogTitle>
            <DialogDescription>
              Send a quick report so the admin team can investigate and fix the issue.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bug-reporter-name">Name</Label>
              <Input
                id="bug-reporter-name"
                value={bugReportForm.reporter_name}
                onChange={(event) => updateBugReportField("reporter_name", event.target.value)}
                placeholder="Your full name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bug-reporter-email">Email</Label>
              <Input
                id="bug-reporter-email"
                type="email"
                value={bugReportForm.reporter_email}
                onChange={(event) => updateBugReportField("reporter_email", event.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bug-reporter-role">Role</Label>
              <select
                id="bug-reporter-role"
                value={bugReportForm.reporter_role}
                onChange={(event) => updateBugReportField("reporter_role", event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="guest">Guest</option>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
                <option value="parent">Parent</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bug-severity">Severity</Label>
              <select
                id="bug-severity"
                value={bugReportForm.severity}
                onChange={(event) => updateBugReportField("severity", event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bug-title">Bug title</Label>
            <Input
              id="bug-title"
              value={bugReportForm.title}
              onChange={(event) => updateBugReportField("title", event.target.value)}
              placeholder="Short title of the issue"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bug-description">What happened?</Label>
            <Textarea
              id="bug-description"
              rows={4}
              value={bugReportForm.description}
              onChange={(event) => updateBugReportField("description", event.target.value)}
              placeholder="Describe the issue in detail"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bug-steps">Steps to reproduce (optional)</Label>
            <Textarea
              id="bug-steps"
              rows={3}
              value={bugReportForm.steps_to_reproduce}
              onChange={(event) => updateBugReportField("steps_to_reproduce", event.target.value)}
              placeholder="1. Go to ... 2. Click ... 3. Observe ..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bug-expected">Expected result (optional)</Label>
              <Textarea
                id="bug-expected"
                rows={2}
                value={bugReportForm.expected_result}
                onChange={(event) => updateBugReportField("expected_result", event.target.value)}
                placeholder="What should happen"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bug-actual">Actual result (optional)</Label>
              <Textarea
                id="bug-actual"
                rows={2}
                value={bugReportForm.actual_result}
                onChange={(event) => updateBugReportField("actual_result", event.target.value)}
                placeholder="What actually happened"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBugDialogOpen(false)}
              disabled={isSubmittingBugReport}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleSubmitBugReport();
              }}
              disabled={isSubmittingBugReport}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
            >
              {isSubmittingBugReport ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Submit Bug Report'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const stats = [
  { value: "50K+", label: "Active Teachers" },
  { value: "500K+", label: "Learning Students" },
  { value: "10M+", label: "Assignments Submitted" },
  { value: "99.9%", label: "Uptime SLA" }
];
