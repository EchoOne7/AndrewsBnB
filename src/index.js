export default {
  async fetch(request, env) {
    // Serve files from /public automatically
    return env.ASSETS.fetch(request);
  },
};
