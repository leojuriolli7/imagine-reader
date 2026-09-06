import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@workspace/ui", "@imagine/server"],
  serverExternalPackages: ["pdfjs-dist", "postgres", "nodemailer"],
};

export default config;
