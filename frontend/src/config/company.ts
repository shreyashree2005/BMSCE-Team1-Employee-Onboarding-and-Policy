/**
 * The company the onboarding portal welcomes new hires to. The introduction video is an official video from the
 * Dayforce YouTube channel (verified with YouTube's oEmbed endpoint: "Do the Work You're Meant to Do", author Dayforce).
 */
export const COMPANY = {
  name: "Dayforce",
  tagline: "Makes work life better™",
  about: [
    "Dayforce is a global human capital management (HCM) technology company.",
    "Its platform brings HR, payroll, talent, workforce management and benefits together in one place, helping organisations and their people work better.",
  ],
  video: {
    id: "4-JGpxcI0aI",
    title: "Do the Work You're Meant to Do",
  },
  channelUrl: "https://www.youtube.com/@Dayforce",
} as const;

export const videoWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const videoEmbedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
export const videoThumbnailUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
