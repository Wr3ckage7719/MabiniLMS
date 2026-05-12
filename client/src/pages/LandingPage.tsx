import { useEffect, useMemo, useState } from "react";
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
  Apple,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  GraduationCap,
  Layers,
  LogIn,
  Loader2,
  MonitorSmartphone,
  Share,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useToast } from "@/hooks/use-toast";
import { bugReportsService } from "@/services/bug-reports.service";

type Platform = "android" | "ios" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

const featureHighlights = [
  {
    icon: BookOpen,
    title: "Lessons and Materials",
    description:
      "Organize subjects, sections, and learning resources so every student finds what they need quickly.",
  },
  {
    icon: ClipboardCheck,
    title: "Assignments and Quizzes",
    description:
      "Create tasks, set deadlines, and track submissions in a clean, distraction-free workspace.",
  },
  {
    icon: BarChart3,
    title: "Grades and Progress",
    description:
      "Monitor performance, give feedback, and keep guardians aligned through a transparent gradebook.",
  },
  {
    icon: Bell,
    title: "Announcements and Alerts",
    description:
      "Reach the entire class instantly with notices, reminders, and important school updates.",
  },
  {
    icon: Users,
    title: "Roles for Every User",
    description:
      "Tailored views for students, teachers, and administrators — each one focused on what matters.",
  },
  {
    icon: ShieldCheck,
    title: "Secure and Reliable",
    description:
      "Built for schools with secure authentication, audit logs, and dependable performance.",
  },
];

const audienceCards = [
  {
    icon: UserRound,
    title: "For Students",
    points: [
      "Open lessons and read materials anytime",
      "Submit assignments and quizzes with ease",
      "Track grades and upcoming deadlines",
    ],
    accent: "from-sky-500/15 to-blue-500/10 border-sky-400/30",
    iconBg: "bg-sky-500/15 text-sky-500",
  },
  {
    icon: GraduationCap,
    title: "For Teachers",
    points: [
      "Build classes, lessons, and modules in minutes",
      "Post assignments and auto-organize submissions",
      "Track every learner with a clear gradebook",
    ],
    accent: "from-emerald-500/15 to-teal-500/10 border-emerald-400/30",
    iconBg: "bg-emerald-500/15 text-emerald-500",
  },
  {
    icon: ShieldCheck,
    title: "For Administrators",
    points: [
      "Manage teachers, students, and accounts",
      "Review audit logs and system activity",
      "Configure settings for the whole school",
    ],
    accent: "from-violet-500/15 to-purple-500/10 border-violet-400/30",
    iconBg: "bg-violet-500/15 text-violet-500",
  },
];

const pwaBenefits = [
  {
    icon: Zap,
    title: "Fast and lightweight",
    description: "Loads instantly from your home screen with no app-store wait.",
  },
  {
    icon: Wifi,
    title: "Works on weak networks",
    description: "Cached lessons and a stable interface even when WiFi flickers.",
  },
  {
    icon: MonitorSmartphone,
    title: "Phone, tablet, or desktop",
    description: "One install, one account, every device your school already uses.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const { toast } = useToast();
  const [isBugDialogOpen, setIsBugDialogOpen] = useState(false);
  const [isSubmittingBugReport, setIsSubmittingBugReport] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [isIosHelpOpen, setIsIosHelpOpen] = useState(false);
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
    setPlatform(detectPlatform());
  }, []);

  const installLabel = useMemo(() => {
    if (isInstalled) return "App Installed";
    if (isInstallable) return "Install the App";
    if (platform === "ios") return "Add to Home Screen";
    return "Install the App";
  }, [isInstallable, isInstalled, platform]);

  const handleInstallClick = () => {
    if (isInstalled) return;
    if (isInstallable) {
      void install();
      return;
    }
    if (platform === "ios") {
      setIsIosHelpOpen(true);
      return;
    }
    toast({
      title: "Install from your browser menu",
      description:
        "Open this page in Chrome or Edge, tap the menu, and choose Install Mabini Classroom.",
    });
  };

  const scrollToFeatures = () => {
    const target = document.getElementById("features");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: { message?: string }; message?: string } }; message?: string };
      const message =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
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

  const installDisabled = isInstalled;

  return (
    <div className="relative w-full overflow-hidden bg-gradient-to-b from-background via-background to-primary/[0.04] text-foreground">
      {/* Decorative background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-1/3 -right-20 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute top-[120%] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? "bg-background/85 backdrop-blur-xl border-b border-border/40 shadow-sm"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 cursor-pointer">
            <AppLogo className="h-8 w-8" />
            <span className="font-bold text-lg sm:text-xl bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Mabini Classroom
            </span>
          </button>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/login")}
              className="hidden sm:inline-flex"
            >
              <LogIn className="h-4 w-4 mr-1.5" />
              Sign In
            </Button>
            <Button
              size="sm"
              onClick={handleInstallClick}
              disabled={installDisabled}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90 disabled:opacity-70 h-9 px-3 sm:px-4"
            >
              <Download className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{isInstalled ? "Installed" : "Install"}</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* HERO — mobile-first: PWA install is the very first thing users see */}
      <section className="relative pt-24 pb-12 px-4 sm:px-6 lg:px-8 sm:pt-32 sm:pb-20">
        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-12 items-center">
          {/* Left column — primary content on desktop, second on mobile (visual is on top below) */}
          <div className="order-2 lg:order-1 space-y-6 sm:space-y-7 animate-fade-in">
            <div className="space-y-3 sm:space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs sm:text-sm font-semibold">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Mabini National High School LMS
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight">
                Your classroom,
                <span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                  one tap away.
                </span>
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-xl">
                Install Mabini Classroom on your phone or laptop and access lessons,
                assignments, grades, and announcements — all in a fast, app-like experience.
              </p>
            </div>

            {/* Primary CTAs — mobile prioritizes Install at top */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
              <Button
                size="lg"
                onClick={handleInstallClick}
                disabled={installDisabled}
                className="h-14 sm:h-12 text-base font-semibold gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90 disabled:opacity-70 shadow-lg shadow-primary/25 w-full sm:w-auto"
              >
                <Download className="h-5 w-5" />
                {installLabel}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate("/login")}
                className="h-12 text-base gap-2 w-full sm:w-auto"
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </Button>
            </div>

            {/* Reassurance line */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Free to install
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Works offline
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                No app store needed
              </span>
            </div>

            {!isInstallable && !isInstalled && (
              <p className="text-xs text-muted-foreground/90 max-w-md">
                {platform === "ios"
                  ? "On iPhone or iPad: tap the Share icon, then choose Add to Home Screen."
                  : "Tip: open this page in Chrome or Edge, then choose Install from your browser menu."}
              </p>
            )}
          </div>

          {/* Right column — phone mockup. Sits ABOVE the text on mobile so the install button is just under the device. */}
          <div className="order-1 lg:order-2 relative flex justify-center lg:justify-end">
            <PhoneMockup />
          </div>
        </div>

        {/* Scroll cue */}
        <button
          type="button"
          onClick={scrollToFeatures}
          className="hidden lg:flex absolute left-1/2 -translate-x-1/2 bottom-2 items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          Learn more
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </button>
      </section>

      {/* PWA install benefits — quick scannable strip */}
      <section className="relative px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {pwaBenefits.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group rounded-2xl border border-border/50 bg-card/60 backdrop-blur p-4 sm:p-5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 text-primary p-2.5 group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm sm:text-base text-foreground">{title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="relative px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 text-accent px-3 py-1.5 text-xs sm:text-sm font-semibold">
              <Layers className="h-4 w-4" />
              Everything you need
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              A complete LMS, designed for the way schools really work
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              From posting lessons to tracking submissions and grades — Mabini Classroom keeps your
              entire school aligned in one calm, organized place.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {featureHighlights.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/70 backdrop-blur p-5 sm:p-6 transition-all hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="absolute -top-12 -right-12 h-24 w-24 rounded-full bg-primary/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative space-y-3">
                  <div className="inline-flex rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 text-primary p-2.5">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-base sm:text-lg">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience / role cards */}
      <section className="relative px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1.5 text-xs sm:text-sm font-semibold">
              <Users className="h-4 w-4" />
              Built for the whole school
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              One platform, three focused experiences
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            {audienceCards.map(({ icon: Icon, title, points, accent, iconBg }) => (
              <div
                key={title}
                className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${accent} p-5 sm:p-6 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-xl`}
              >
                <div className={`inline-flex rounded-xl p-2.5 ${iconBg}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-semibold text-lg">{title}</h3>
                <ul className="mt-3 space-y-2">
                  {points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-sm text-foreground/85">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How to install — clear steps */}
      <section className="relative px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent p-6 sm:p-10 overflow-hidden relative">
            <div aria-hidden className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
            <div aria-hidden className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />

            <div className="relative grid lg:grid-cols-[1fr_1.2fr] gap-8 items-center">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 text-primary px-3 py-1.5 text-xs sm:text-sm font-semibold">
                  <Smartphone className="h-4 w-4" />
                  Install in seconds
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  Add Mabini Classroom to your home screen
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground">
                  No app store, no waiting. Install directly from your browser and Mabini Classroom
                  behaves just like a native app.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <Button
                    size="lg"
                    onClick={handleInstallClick}
                    disabled={installDisabled}
                    className="h-12 gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90 disabled:opacity-70 shadow-lg shadow-primary/25"
                  >
                    <Download className="h-5 w-5" />
                    {installLabel}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => navigate("/login")}
                    className="h-12 gap-2"
                  >
                    Or continue in browser
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <InstallStep
                  index={1}
                  icon={Smartphone}
                  title="Open in browser"
                  description="Visit Mabini Classroom in Chrome, Edge, or Safari on any device."
                />
                <InstallStep
                  index={2}
                  icon={platform === "ios" ? Share : Download}
                  title={platform === "ios" ? "Tap Share" : "Tap Install"}
                  description={
                    platform === "ios"
                      ? "On iPhone, use Share → Add to Home Screen."
                      : "Use the Install button above or your browser menu."
                  }
                />
                <InstallStep
                  index={3}
                  icon={Apple}
                  title="Done — sign in"
                  description="Open Mabini from your home screen and sign in with your school account."
                />
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
          <div className="absolute inset-0 bg-slate-900/70 dark:bg-slate-950/75"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-900/60 to-emerald-900/45 dark:from-slate-950/85 dark:via-slate-950/70 dark:to-emerald-950/60"></div>
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="mb-8 max-w-2xl space-y-4 rounded-xl border border-white/15 bg-black/25 px-5 py-4 text-sm text-slate-100/90 backdrop-blur-[2px]">
            <h2 className="text-base font-semibold text-white">School Contact Information</h2>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-300/90">Primary school support contact</p>
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
              <p className="text-xs uppercase tracking-wide text-slate-300/90">Secondary administrative contact</p>
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
              <span className="font-medium text-white">System concerns and bug reports:</span>{" "}
              <button
                type="button"
                onClick={() => setIsBugDialogOpen(true)}
                className="text-primary hover:text-accent transition-colors underline underline-offset-4"
              >
                Submit a report to the administration
              </button>
            </p>
          </div>

          <div className="border-t border-white/20 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-slate-200/90">
            <p>&copy; {new Date().getFullYear()} Mabini Classroom Learning Management System. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 justify-center">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Use</a>
              <a href="#" className="hover:text-white transition-colors">Cookie Policy</a>
              <button
                type="button"
                onClick={() => setIsBugDialogOpen(true)}
                className="hover:text-primary transition-colors"
              >
                Report a System Issue
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Sticky mobile install bar — visible only on small screens so users always have the CTA */}
      {!isInstalled && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-2 bg-gradient-to-t from-background via-background/95 to-transparent">
          <Button
            size="lg"
            onClick={handleInstallClick}
            className="w-full h-12 gap-2 text-base font-semibold bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-xl shadow-primary/30"
          >
            <Download className="h-5 w-5" />
            {installLabel}
          </Button>
        </div>
      )}

      {/* iOS install help */}
      <Dialog open={isIosHelpOpen} onOpenChange={setIsIosHelpOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Install on iPhone or iPad</DialogTitle>
            <DialogDescription>
              Safari supports installing Mabini Classroom directly to your home screen.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">1</span>
              <span>
                Open this page in <strong>Safari</strong> on your iPhone or iPad.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">2</span>
              <span>
                Tap the <strong>Share</strong> icon (the square with the arrow pointing up) in the bottom toolbar.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">3</span>
              <span>
                Scroll down and choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
              </span>
            </li>
          </ol>

          <DialogFooter>
            <Button onClick={() => setIsIosHelpOpen(false)} className="w-full sm:w-auto">
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function InstallStep({
  index,
  icon: Icon,
  title,
  description,
}: {
  index: number;
  icon: typeof Smartphone;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/70 backdrop-blur p-4 sm:p-5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="rounded-lg bg-primary/10 text-primary p-2">
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-semibold text-muted-foreground">Step {index}</span>
      </div>
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="relative w-full max-w-[280px] sm:max-w-[320px] mx-auto">
      {/* Glow */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-x-8 -top-10 h-24 bg-primary/30 blur-3xl" />
        <div className="absolute inset-x-0 -bottom-10 h-24 bg-accent/30 blur-3xl" />
      </div>

      {/* Device frame */}
      <div className="relative rounded-[2.4rem] border-[10px] border-slate-900/95 dark:border-slate-800 bg-slate-900 shadow-2xl shadow-primary/30 overflow-hidden">
        {/* Notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 h-4 w-20 rounded-full bg-slate-950 z-10" />

        <div className="relative h-[480px] sm:h-[540px] bg-gradient-to-br from-slate-50 via-white to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pt-4 pb-1.5 text-[10px] font-semibold text-foreground/80">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
              <div className="h-1.5 w-3 rounded-sm bg-foreground/60" />
            </div>
          </div>

          {/* App header */}
          <div className="px-4 pt-3 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-accent" />
              <span className="text-sm font-bold">Mabini</span>
            </div>
            <div className="h-7 w-7 rounded-full bg-foreground/10" />
          </div>

          {/* Greeting */}
          <div className="px-4 pb-3">
            <p className="text-[11px] text-muted-foreground">Good morning,</p>
            <p className="text-base font-semibold">Welcome back</p>
          </div>

          {/* Class cards */}
          <div className="px-4 space-y-2.5">
            <div className="rounded-2xl border border-border/40 bg-card/80 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-sky-500" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold">English 10</p>
                    <p className="text-[10px] text-muted-foreground">Ms. Reyes</p>
                  </div>
                </div>
                <div className="text-[9px] font-semibold rounded-full bg-emerald-500/15 text-emerald-600 px-2 py-0.5">
                  3 new
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/40 bg-card/80 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
                    <ClipboardCheck className="h-4 w-4 text-violet-500" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold">Math 9 — Quiz</p>
                    <p className="text-[10px] text-muted-foreground">Due tomorrow</p>
                  </div>
                </div>
                <div className="text-[9px] font-semibold rounded-full bg-amber-500/15 text-amber-600 px-2 py-0.5">
                  Pending
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/40 bg-card/80 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold">Grades updated</p>
                    <p className="text-[10px] text-muted-foreground">Science 8</p>
                  </div>
                </div>
                <div className="text-[9px] font-semibold rounded-full bg-primary/15 text-primary px-2 py-0.5">
                  View
                </div>
              </div>
            </div>
          </div>

          {/* Floating install pill */}
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1.5 text-[10px] font-semibold shadow-lg animate-float">
            <Download className="h-3 w-3" />
            Installed to home screen
          </div>

          {/* Bottom nav */}
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-around rounded-2xl border border-border/40 bg-card/90 backdrop-blur px-3 py-2 shadow-lg">
            <div className="h-1.5 w-6 rounded-full bg-primary" />
            <div className="h-1.5 w-4 rounded-full bg-foreground/20" />
            <div className="h-1.5 w-4 rounded-full bg-foreground/20" />
            <div className="h-1.5 w-4 rounded-full bg-foreground/20" />
          </div>
        </div>
      </div>
    </div>
  );
}
