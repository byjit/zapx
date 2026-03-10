import { Link } from "@tanstack/react-router";
import { seoConstants } from "@/lib/seo";

const Footer = () => {
  return (
    <footer className="border-t border-border py-8 mt-12">
      <div className="flex flex-col sm:flex-row justify-between gap-4 text-xs text-muted-foreground">
        <p>
          &copy; {new Date().getFullYear()} {seoConstants.SITE_NAME}
        </p>
        <div className="flex gap-6">
          <Link className="hover:text-foreground transition-colors" to="/terms">
            Terms
          </Link>
          <Link
            className="hover:text-foreground transition-colors"
            to="/privacy"
          >
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
