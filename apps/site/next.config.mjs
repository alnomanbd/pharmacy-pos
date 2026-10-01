/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * A static site. `next build` writes plain HTML into `out/`, which is what a
   * shared host or an nginx `root` takes, with no Node process left running.
   *
   * The pharmacy app itself is served separately from its own origin, and the
   * forms here talk to the API from the browser — so nothing on this site needs
   * a server of its own.
   */
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // The floating "N" badge in development sits over the page's own corner
  // buttons and gets mistaken for part of the design in phone reviews.
  devIndicators: false,

  turbopack: {
    /*
     * Pinned to this folder. This app is a workspace inside a repo whose root
     * has its own lockfile, and Turbopack otherwise infers the workspace root
     * from the nearest lockfiles — picks the repository root — and then fails
     * to resolve a single page.
     */
    root: import.meta.dirname,
  },
};

export default nextConfig;
