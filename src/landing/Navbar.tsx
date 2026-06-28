import { useState, useEffect } from "react";
import { Menu, X, Zap } from "lucide-react";




const navLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Showcase", href: "#showcase" },
  { label: "Pricing", href: "#pricing" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "nav-scrolled" : "bg-transparent border-b border-transparent"
      }`}
    >
      <nav
        className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 group" aria-label="Level Up AI home">
              <div className="bg-gradient-to-br from-blue-600 to-purple-600 p-2 rounded-xl">
                <img src="/logo.png" alt="Level Up Logo" className="h-8 w-8 object-cover rounded-lg" />
              </div>
           
          <span className="font-bold text-lg tracking-tight">
            <span className="text-[hsl(var(--text-default))]">Level Up</span>
            <span className="gradient-text-static"> AI</span>
          </span>
        </a>

        {/* Desktop nav */}
        <ul className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                className="text-sm font-medium text-[hsl(var(--text-subtle))] hover:text-[hsl(var(--text-default))] transition-colors duration-150"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <button className="text-sm font-medium text-[hsl(var(--text-subtle))] hover:text-[hsl(var(--text-default))] transition-colors duration-150 px-4 py-2">
            Sign In
          </button>
          <button className="gradient-bg text-white text-sm font-semibold px-5 py-2 rounded-lg glow-violet hover:-translate-y-0.5 transition-transform duration-150">
            Start Free
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-[hsl(var(--text-default))] p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 top-16 bg-surface z-40 flex flex-col p-6 gap-6 animate-fade-in-up">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="text-lg font-medium text-[hsl(var(--text-default))] border-b border-[rgba(139,92,246,0.15)] pb-4"
            >
              {link.label}
            </a>
          ))}
          <div className="flex flex-col gap-3 mt-4">
            <button className="text-base font-medium text-[hsl(var(--text-subtle))] py-3 border border-[rgba(139,92,246,0.20)] rounded-lg">
              Sign In
            </button>
            <button className="gradient-bg text-white text-base font-semibold py-3 rounded-lg">
              Start Learning Free
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
