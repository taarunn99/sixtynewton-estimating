import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer runs server side; pdfkit's font data files must be
  // traced into the serverless bundle or the PDF route fails on Vercel.
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: {
    "/quotes/[id]/pdf": ["./node_modules/pdfkit/js/**"],
  },
};

export default nextConfig;
