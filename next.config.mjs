/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [{ source: "/sim-monitor", destination: "/", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  }
};

export default nextConfig;
