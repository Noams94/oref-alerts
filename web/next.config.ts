import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["xlsx"],
  async rewrites() {
    return [
      {
        source: "/oref-proxy/history",
        destination:
          "https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=he&mode=1",
      },
    ];
  },
};

export default nextConfig;
