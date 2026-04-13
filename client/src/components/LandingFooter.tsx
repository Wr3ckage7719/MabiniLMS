import { AppLogo } from "@/components/AppLogo";

export const LandingFooter = () => {
  return (
    <footer className="border-t border-border/40 py-16 px-4 sm:px-6 lg:px-8 bg-card/30">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AppLogo className="h-8 w-8" />
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
  );
};

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
