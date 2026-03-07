import { Link } from "@tanstack/react-router";
import { seoConstants } from "@/lib/seo";
import { CONTACT_FORM } from "@/utils/constant";

const Footer = () => {
  return (
    <footer className="py-6 mt-auto">
      <div className="container flex justify-between mx-auto px-4 px-4">
        <p className="text-sm mb-4">
          &copy; {new Date().getFullYear()} {seoConstants.SITE_NAME}. All rights
          reserved.
        </p>
        <div className="flex justify-center space-x-6 text-sm">
          <Link
            className="hover:text-blue-600 transition-colors duration-300"
            to="/about"
          >
            About
          </Link>
          <Link
            className="hover:text-blue-600 transition-colors duration-300"
            to="/privacy"
          >
            Privacy
          </Link>
          <Link
            className="hover:text-blue-600 transition-colors duration-300"
            to="/terms"
          >
            Terms
          </Link>
          <a
            className="hover:text-blue-600 transition-colors duration-300"
            href={CONTACT_FORM}
            rel="noopener noreferrer"
            target="_blank"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
