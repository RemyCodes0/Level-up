import { Zap, Twitter, Linkedin, MessageCircle } from "lucide-react";


const links = {
  Product: ["How It Works", "Features", "Showcase", "Pricing", "Changelog"],
  Company: ["About", "Blog", "Careers", "Press"],
  "Legal & Support": ["Privacy", "Terms", "Accessibility", "Contact"],
};

export default function Footer() {
  return (
    <footer
      className="border-t"
      style={{
        background: "#0A0916",
        borderColor: "rgba(139,92,246,0.18)",
      }}
    >
      <div className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-lg tracking-tight">
                <span className="text-[hsl(var(--text-default))]">Level Up</span>
                <span className="gradient-text-static"> AI</span>
              </span>
            </div>
            <p
              className="text-[hsl(var(--text-subtle))] mb-5 leading-relaxed"
              style={{ fontSize: "13px" }}
            >
              Turn any topic into a personalized visual course. Your AI teacher
              for any subject, anywhere, anytime.
            </p>
            {/* Social icons */}
            <div className="flex gap-3">
              {[
                { Icon: Twitter, label: "Twitter" },
                { Icon: Linkedin, label: "LinkedIn" },
                { Icon: MessageCircle, label: "Discord" },
              ].map(({ Icon, label }) => (
                <button
                  key={label}
                  aria-label={label}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[hsl(var(--text-subtle))] hover:text-[hsl(var(--text-default))] transition-colors duration-150"
                  style={{ background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.18)" }}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4
                className="font-semibold text-[hsl(var(--text-default))] mb-4"
                style={{ fontSize: "13px" }}
              >
                {category}
              </h4>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-[hsl(var(--text-subtle))] hover:text-[hsl(var(--text-default))] transition-colors duration-150"
                      style={{ fontSize: "13px" }}
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderColor: "rgba(139,92,246,0.15)" }}
        >
          <span
            className="text-[hsl(var(--text-subtle))]"
            style={{ fontSize: "12px" }}
          >
            © 2025 Level Up AI, Inc. All rights reserved.
          </span>
          <span
            className="text-[hsl(var(--text-subtle))]"
            style={{ fontSize: "12px" }}
          >
            Made with care for curious minds.
          </span>
        </div>
      </div>
    </footer>
  );
}
