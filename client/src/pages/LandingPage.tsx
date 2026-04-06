import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, BookOpen, BarChart3, Users, Zap, CheckCircle2, Star } from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);

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
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Mabini Classroom
            </span>
          </button>
          <div className="flex items-center gap-4">
            <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' })}>Features</Button>
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
                {/* Mock classroom interface */}
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

      {/* Features Section */}
      <section id="features-section" className="py-24 px-4 sm:px-6 lg:px-8 bg-card/50 relative">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl sm:text-5xl font-bold">Everything you need to teach & learn</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed to make education more engaging, interactive, and effective.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div
                key={i}
                className="group relative p-8 rounded-2xl border border-border/40 bg-card/80 backdrop-blur hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 cursor-pointer transform hover:scale-105"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* Testimonials Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-card/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl sm:text-5xl font-bold">Loved by educators worldwide</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Join thousands of teachers transforming their classrooms.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, i) => (
              <div key={i} className="p-8 rounded-2xl border border-border/40 bg-card/80 backdrop-blur space-y-4 hover:border-primary/40 transition-colors duration-300">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-foreground">{testimonial.quote}</p>
                <div className="flex items-center gap-4 pt-4 border-t border-border/40">
                  <div className="w-10 h-10 rounded-full bg-primary/20"></div>
                  <div>
                    <p className="font-semibold text-sm">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* Footer */}
      <footer className="border-t border-border/40 py-16 px-4 sm:px-6 lg:px-8 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
              <span className="font-bold text-lg">Mabini Classroom</span>
              </div>
              <p className="text-sm text-muted-foreground">The modern platform for teaching and learning.</p>
            </div>
            {footerLinks.map((group, i) => (
              <div key={i} className="space-y-4">
                <h4 className="font-semibold">{group.title}</h4>
                <ul className="space-y-2">
                  {group.links.map((link, j) => (
                    <li key={j}>
                      <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-border/40 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>&copy; 2026 Mabini Classroom. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: <Users className="w-6 h-6" />,
    title: "Smart Classrooms",
    description: "Create and manage classes with a beautiful, intuitive interface that makes teaching effortless."
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: "Grade Analytics",
    description: "Track performance with beautiful charts. Students see only their own grades privately."
  },
  {
    icon: <CheckCircle2 className="w-6 h-6" />,
    title: "Instant Submissions",
    description: "Submit assignments with one click. Full submission history and teacher feedback."
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Live Discussions",
    description: "Post announcements, spark conversations, and keep everyone engaged with threaded comments."
  },
  {
    icon: <BookOpen className="w-6 h-6" />,
    title: "Deadline Tracker",
    description: "Never miss a due date. Smart calendar views with upcoming deadline widgets."
  },
  {
    icon: <Star className="w-6 h-6" />,
    title: "Role-Based Access",
    description: "Teachers control content while students focus on learning. Grades stay private, always."
  }
];

const stats = [
  { value: "50K+", label: "Active Teachers" },
  { value: "500K+", label: "Learning Students" },
  { value: "10M+", label: "Assignments Submitted" },
  { value: "99.9%", label: "Uptime SLA" }
];

const testimonials = [
  {
    quote: "LearnFlow has completely transformed how I teach. The interface is so intuitive that my students adapted immediately.",
    name: "Sarah Johnson",
    role: "High School Teacher"
  },
  {
    quote: "Finally a platform designed by educators, for educators. The features actually match how we work in real classrooms.",
    name: "Michael Chen",
    role: "University Professor"
  },
  {
    quote: "Our students are more engaged than ever. The interactive features and clean design make learning enjoyable.",
    name: "Emma Rodriguez",
    role: "Middle School Teacher"
  }
];

const footerLinks = [
  {
    title: "Product",
    links: ["Features", "Pricing", "Security", "Enterprise"]
  },
  {
    title: "Company",
    links: ["About", "Blog", "Careers", "Contact"]
  },
  {
    title: "Resources",
    links: ["Documentation", "Community", "Training", "Status"]
  }
];
