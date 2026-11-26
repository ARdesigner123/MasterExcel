/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // pdfjs-dist optionally requires "canvas" in Node; not needed in the browser.
    config.resolve.alias.canvas = false;
    return config;
  },
};
export default nextConfig;
