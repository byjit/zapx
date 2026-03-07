import { CONTACT_FORM } from "@/utils/constant";
import { Logo } from "../logo";

export function Nav() {
  const navLinks: {
    label: string;
    href: string;
    external?: boolean;
  }[] = [
    {
      href: "/login",
      label: "Login",
    },
    {
      label: "Contact",
      href: CONTACT_FORM,
      external: true,
    },
  ];
  return (
    <nav className="flex py-6 justify-between">
      <Logo showText />
      <div className="flex gap-6 items-center">
        {navLinks.map((link) => (
          <a
            className="text-sm font-medium hover:underline"
            href={link.href}
            key={link.href}
            rel={link.external ? "noreferrer" : undefined}
            target={link.external ? "_blank" : undefined}
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
