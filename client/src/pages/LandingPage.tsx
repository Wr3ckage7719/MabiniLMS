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
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  GraduationCap,
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
    description: "View class schedules, school announcements, and assignment deadlines in a mobile-ready layout.",
  },
  {
    id: "tablet",
    label: "Tablet View",
    description: "Review lesson materials while monitoring class progress in a balanced workspace.",
  },
  {
    id: "desktop",
    label: "Desktop View",
    description: "Use a complete dashboard for instruction management, grading, and administrative oversight.",
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
    <div className="w-full overflow-hidden bg-gradient-to-b from-background via-background to-primary/[0.03] text-foreground dark:to-background">
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
                Learning Management System (LMS)
              </div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight">
                One Platform for
                <span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                  Teaching and Learning
                </span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl">
                Mabini Classroom is a complete LMS where teachers can create classes, share materials,
                post assignments and quizzes, and track student progress, while students can access
                lessons, submit work, and view grades in one place.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl">
                <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-foreground/85 dark:text-slate-100 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Class content and modules
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-foreground/85 dark:text-slate-100 flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  Assignments and quizzes
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-foreground/85 dark:text-slate-100 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Grade and performance tracking
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-foreground/85 dark:text-slate-100 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  Announcements and updates
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={() => navigate("/login")} size="lg" className="bg-gradient-to-r from-primary to-accent hover:opacity-90 h-12 text-base">
                Start Here <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>


          </div>

          {/* Right - Hero Visual */}
          <div className="relative min-h-[340px] sm:min-h-[390px]">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl blur-3xl transform -rotate-12"></div>
            <div className="relative bg-gradient-to-br from-primary/5 to-accent/5 rounded-3xl border border-primary/20 p-5 sm:p-7 backdrop-blur-sm overflow-hidden group">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary/10 to-transparent rounded-3xl animate-pulse"></div>
              </div>
              <div className="relative space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/80 p-3.5">
                  <div>
                    <p className="text-sm font-semibold text-foreground dark:text-white">Today in your LMS</p>
                    <p className="text-xs text-muted-foreground dark:text-slate-300/90">Classes, tasks, grades, and updates in one dashboard</p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-300 animate-pulse"></span>
                    Live
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-card rounded-xl p-3.5 border border-border/40 space-y-2.5">
                    <div className="flex items-center gap-2 text-foreground dark:text-slate-200">
                      <GraduationCap className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Classes and Sections</span>
                    </div>
                    <p className="text-xs text-muted-foreground dark:text-slate-300/90 leading-relaxed">Organize subjects, sections, and schedules for every learner.</p>
                  </div>

                  <div className="bg-card rounded-xl p-3.5 border border-border/40 space-y-2.5">
                    <div className="flex items-center gap-2 text-foreground dark:text-slate-200">
                      <ClipboardCheck className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Assignments and Quizzes</span>
                    </div>
                    <p className="text-xs text-muted-foreground dark:text-slate-300/90 leading-relaxed">Create tasks, set deadlines, and monitor submissions easily.</p>
                  </div>

                  <div className="bg-card rounded-xl p-3.5 border border-border/40 space-y-2.5">
                    <div className="flex items-center gap-2 text-foreground dark:text-slate-200">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Gradebook and Progress</span>
                    </div>
                    <p className="text-xs text-muted-foreground dark:text-slate-300/90 leading-relaxed">Track performance with clear grading and progress visibility.</p>
                  </div>

                  <div className="bg-card rounded-xl p-3.5 border border-border/40 space-y-2.5">
                    <div className="flex items-center gap-2 text-foreground dark:text-slate-200">
                      <Bell className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Announcements and Alerts</span>
                    </div>
                    <p className="text-xs text-muted-foreground dark:text-slate-300/90 leading-relaxed">Keep classes aligned with instant notices and reminders.</p>
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

        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center rounded-3xl border border-primary/20 bg-gradient-to-br from-sky-50 via-white to-blue-100 dark:from-slate-950/80 dark:via-slate-900/70 dark:to-sky-950/60 p-6 sm:p-8 lg:p-10 overflow-hidden">
          <div className="absolute -right-16 -bottom-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl pointer-events-none"></div>
          <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-accent/20 blur-2xl pointer-events-none"></div>

          <div className="relative space-y-5 order-2 lg:order-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 text-primary px-3 py-1.5 text-sm font-semibold">
              <Smartphone className="h-4 w-4" />
              Institutional Mobile Access
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              Access Mabini Classroom
              <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">on any school-approved device</span>
            </h2>

            <p className="text-sm sm:text-base text-muted-foreground dark:text-slate-200/85 max-w-xl">
              Install the Mabini Classroom progressive web application (PWA) to access the LMS
              from your home screen with reliable performance. Students can review lessons,
              teachers can post coursework, and administrators can monitor activity in one secure platform.
            </p>

            <div className="space-y-2 text-sm text-foreground/85 dark:text-slate-200/90">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" />
                <span>Open directly from your home screen with a reliable app-like experience.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" />
                <span>Optimized for classroom workflows so lessons, submissions, and grades remain easy to review.</span>
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
                {isInstalled ? "Application Installed" : isInstallable ? "Install Mabini Classroom App" : "Install option unavailable"}
              </Button>
              <p className="text-xs text-muted-foreground dark:text-slate-300/90">
                {!isInstallable && !isInstalled
                  ? "Installation tip: open this page in Chrome or Edge, then select Install from your browser menu."
                  : "Installation is completed in only a few seconds."}
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
              <div className="relative h-[340px] sm:h-[380px] overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border border-slate-200/80 bg-white/80 dark:border-white/20 dark:bg-slate-950/80 p-2.5 sm:p-3 shadow-2xl shadow-primary/20">
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
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/70 dark:border-white/15 dark:bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-100">
                          <DeviceIcon className="h-3.5 w-3.5" />
                          {slide.label}
                        </div>
                        <span className="text-[11px] text-slate-600 dark:text-slate-200/85">{index + 1} / {deviceShowcaseSlides.length}</span>
                      </div>

                      <p className="mt-2.5 text-[11px] sm:text-xs text-slate-700 dark:text-slate-200/90 leading-relaxed">{slide.description}</p>

                      <div className="mt-3 sm:mt-4 h-[205px] sm:h-[245px] rounded-2xl border border-slate-300/70 bg-slate-100/90 dark:border-white/15 dark:bg-slate-900/80 p-2.5 sm:p-4 flex items-center justify-center overflow-hidden">
                        <div className="origin-center scale-[0.86] sm:scale-100 transition-transform duration-500">
                          {renderDevicePreview(slide.id)}
                        </div>
                      </div>
                    </article>
                  );
                })}

                <div className="absolute inset-x-3 sm:inset-x-4 bottom-3 sm:bottom-4 z-20 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/70 dark:bg-black/35 px-2 py-1 backdrop-blur-sm">
                    {deviceShowcaseSlides.map((slide, index) => (
                      <button
                        key={slide.id}
                        type="button"
                        aria-label={`Show ${slide.label}`}
                        onClick={() => goToSlide(index)}
                        className={`h-2.5 rounded-full transition-all duration-300 ${
                          index === activeDeviceSlide
                            ? "w-6 bg-slate-900 dark:bg-white"
                            : "w-2.5 bg-slate-500/50 hover:bg-slate-700/70 dark:bg-white/40 dark:hover:bg-white/70"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-black/35 p-1 backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={goToPreviousSlide}
                      aria-label="Previous device view"
                      className="h-8 w-8 rounded-full text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 dark:text-white/90 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4 mx-auto" />
                    </button>
                    <button
                      type="button"
                      onClick={goToNextSlide}
                      aria-label="Next device view"
                      className="h-8 w-8 rounded-full text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 dark:text-white/90 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
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
          <div className="absolute inset-0 bg-slate-900/65 dark:bg-slate-950/72"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/75 via-slate-900/60 to-emerald-900/45 dark:from-slate-950/85 dark:via-slate-950/70 dark:to-emerald-950/60"></div>
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="mb-8 max-w-2xl space-y-4 rounded-xl border border-white/15 bg-black/20 px-5 py-4 text-sm text-slate-100/90 backdrop-blur-[2px]">
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
            <div className="flex gap-6">
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
