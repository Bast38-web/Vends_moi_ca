/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      // L'application HTML (public/index.html) est servie à la racine du site.
      beforeFiles: [{ source: '/', destination: '/index.html' }],
    };
  },
};

export default nextConfig;
